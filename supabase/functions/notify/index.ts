// NUFHAS Alumni — "notify" Edge Function
// Fired by a Database Webhook when a row is INSERTED into `jobs` or `events`.
//  - events: always emailed to opted-in members
//  - jobs:   only when the poster ticked "Email members about this job" (jobs.notify = true)
// Emails go out through Brevo (BCC in batches, so members never see each other's addresses).
//
// Secrets (Edge Functions > Secrets):  BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME, WEBHOOK_SECRET, SITE_URL
// Optional: DAILY_CAP (default 250 — keep below Brevo's free 300/day)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const fmtDate = (iso) => { try { return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); } catch { return iso || ""; } };

function buildMail(kind, r, siteUrl) {
  const rows = [];
  let subject, heading, link;
  if (kind === "job") {
    subject = `New job: ${clip(r.title, 80)} — ${clip(r.company, 60)}`;
    heading = "A new job was posted";
    link = siteUrl + "#/jobs";
    rows.push(["Role", r.title], ["Company", r.company], ["Location", r.location], ["Type", r.job_type],
      ["Experience", r.exp_max ? `${r.exp_min || 0}–${r.exp_max} years` : (+r.exp_min ? `${r.exp_min}+ years` : "Fresher OK")],
      ["Required status", r.ca_status], ["Apply by", r.deadline ? fmtDate(r.deadline) : ""]);
  } else {
    subject = `New event: ${clip(r.title, 90)}`;
    heading = "A new event was announced";
    link = siteUrl + "#/";
    rows.push(["Event", r.title], ["Date", fmtDate(r.event_date)], ["Time", r.event_time], ["Place", r.place]);
  }
  const intro = clip(r.description, 300);
  const table = rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#6a6d70">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#111">
    <div style="border-top:4px solid #86BC25;padding:18px 0 6px"><b style="font-size:18px">NUFHAS</b> <span style="color:#6a6d70">Alumni Association</span></div>
    <h2 style="margin:10px 0 8px;font-size:20px">${esc(heading)}</h2>
    <table style="font-size:15px;border-collapse:collapse">${table}</table>
    ${intro ? `<p style="font-size:15px;line-height:1.5;margin:14px 0">${esc(intro)}</p>` : ""}
    <p style="margin:20px 0"><a href="${esc(link)}" style="background:#046A38;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:bold;display:inline-block">Open on the website</a></p>
    <p style="font-size:12px;color:#6a6d70;border-top:1px solid #e2e3e1;padding-top:10px">You get this because you are a NUFHAS Alumni member and have notifications switched on.
      Turn them off any time under <b>My profile</b> on the website.</p></div>`;
  return { subject, html };
}

// Core logic (kept separate from the HTTP wrapper so it can be tested).
export async function run(payload, sb, send, cfg) {
  if (!payload || payload.type !== "INSERT") return { status: 200, body: { skipped: "not an insert" } };
  const kind = payload.table === "jobs" ? "job" : payload.table === "events" ? "event" : null;
  if (!kind) return { status: 200, body: { skipped: "unknown table" } };
  const rec = payload.record || {};
  if (kind === "job" && !rec.notify) return { status: 200, body: { skipped: "poster did not ask to notify" } };

  const log = (status, recipients, note) =>
    sb.from("notify_log").insert({ kind, ref_id: String(rec.id), recipients, status, note: note ? String(note).slice(0, 300) : null });

  const dup = await sb.from("notify_log").select("id").eq("kind", kind).eq("ref_id", String(rec.id)).eq("status", "sent").limit(1);
  if (dup.data && dup.data.length) return { status: 200, body: { skipped: "already sent" } };

  const ppl = await sb.from("profiles").select("email").eq("approved", true).eq("notify_email", true);
  if (ppl.error) { await log("failed", 0, ppl.error.message); return { status: 500, body: { error: ppl.error.message } }; }
  const poster = String(rec.posted_by || "").toLowerCase();
  let list = [...new Set((ppl.data || []).map((p) => String(p.email).toLowerCase()).filter((e) => e && e !== poster))];
  if (!list.length) { await log("skipped", 0, "no opted-in recipients"); return { status: 200, body: { skipped: "no recipients" } }; }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const used = await sb.from("notify_log").select("recipients").eq("status", "sent").gte("created_at", since);
  const spent = (used.data || []).reduce((a, r) => a + (r.recipients || 0), 0);
  const room = Math.max(0, cfg.cap - spent);
  if (room <= 0) { await log("skipped", 0, `daily cap ${cfg.cap} reached`); return { status: 200, body: { skipped: "daily cap reached" } }; }
  const capped = list.length > room;
  if (capped) list = list.slice(0, room);

  const { subject, html } = buildMail(kind, rec, cfg.siteUrl);
  let sent = 0;
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const res = await send({ sender: { name: cfg.senderName, email: cfg.senderEmail }, to: [{ email: cfg.senderEmail }],
      bcc: batch.map((email) => ({ email })), subject, htmlContent: html });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      await log(sent ? "sent" : "failed", sent, `Brevo ${res.status}: ${t}`);
      return { status: 502, body: { error: "Brevo rejected the request", sent } };
    }
    sent += batch.length;
  }
  await log("sent", sent, capped ? `capped at ${room} by daily limit` : null);
  return { status: 200, body: { sent, capped } };
}

// --- entry ---
Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_SECRET") || "";
  if (req.method !== "POST" || !secret || req.headers.get("x-webhook-secret") !== secret)
    return new Response("Unauthorized", { status: 401 });
  const cfg = { cap: +(Deno.env.get("DAILY_CAP") || 250), senderEmail: Deno.env.get("SENDER_EMAIL") || "", senderName: Deno.env.get("SENDER_NAME") || "NUFHAS Alumni Association",
    siteUrl: (Deno.env.get("SITE_URL") || "").replace(/\/?$/, "/") };
  const key = Deno.env.get("BREVO_API_KEY") || "";
  if (!key || !cfg.senderEmail || !cfg.siteUrl.startsWith("http")) return new Response("Function is not configured (BREVO_API_KEY, SENDER_EMAIL, SITE_URL)", { status: 500 });
  const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY"));
  const send = (body) => fetch("https://api.brevo.com/v3/smtp/email", { method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  let payload; try { payload = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const out = await run(payload, sb, send, cfg);
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json" } });
});
