/* NUFHAS Alumni — community features: news wall, Q&A, private messages, reports, job saves.
   Loaded before app.js; uses the helpers app.js publishes as window.NUF. */
(function () {
  "use strict";
  const X = (window.NUFX = {});
  const N = () => window.NUF;
  const $ = (s, el = document) => el.querySelector(s);
  const TAGS = ["Exams", "Articleship", "Career", "Tax & VAT", "Audit", "Other"];
  let warned = false, inboxTab = "in", newsAll = false;

  const dateOf = (iso) => (iso ? N().fmt(String(iso).slice(0, 10)) : "");
  const mine = (email) => !!(N().S.email && String(email || "").toLowerCase() === N().S.email);
  const memberByEmail = (e) => N().S.members.find((m) => (m.email || "").toLowerCase() === String(e || "").toLowerCase());
  const demoNote = (what) => `<div class="card gate"><h3>Demo mode</h3><p>${what} work after you connect Supabase.</p></div>`;

  /* ---------------- data ---------------- */
  X.load = async function () {
    const { S, banner } = N();
    if (S.demo || !S.sb) return;
    const sb = S.sb;
    const q = async (p) => {
      try {
        const r = await p;
        if (r.error) {
          if ((r.error.code === "42P01" || /does not exist|schema cache/i.test(r.error.message || "")) && !warned) {
            warned = true; banner("New features need the updated schema.sql to be run once in Supabase (see the update guide).", "error", 0);
          }
          return [];
        }
        return r.data || [];
      } catch (e) { return []; }
    };
    const [news, qs, ans, inbox, marks, reports, mods] = await Promise.all([
      q(sb.from("news").select("*").order("created_at", { ascending: false }).limit(200)),
      q(sb.from("questions").select("*").order("created_at", { ascending: false }).limit(300)),
      q(sb.from("answers").select("*").order("created_at", { ascending: true }).limit(2000)),
      q(sb.from("contact_requests").select("*").order("created_at", { ascending: false }).limit(300)),
      q(sb.from("job_marks").select("*").limit(2000)),
      S.isStaff ? q(sb.from("reports").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(200)) : Promise.resolve([]),
      S.isAdmin ? q(sb.from("moderators").select("*")) : Promise.resolve([])]);
    S.news = news; S.questions = qs; S.answers = ans; S.inbox = inbox; S.marks = marks; S.reports = reports; S.mods = mods;
  };
  X.refresh = async function () { await X.load(); X.render(); if (window.ADM) ADM.render(); N().renderJobs && N().renderJobs(); };

  /* ---------------- job marks (save / interested) ---------------- */
  X.marked = (jobId, kind) => N().S.marks.some((m) => m.job_id === jobId && m.kind === kind && String(m.email).toLowerCase() === N().S.email);
  X.interested = (jobId) => N().S.marks.filter((m) => m.job_id === jobId && m.kind === "interested");
  X.toggleMark = async function (jobId, kind) {
    const { S, banner } = N(); if (!S.sb || !S.email) return;
    const has = X.marked(jobId, kind);
    const r = has ? await S.sb.from("job_marks").delete().eq("job_id", jobId).eq("email", S.email).eq("kind", kind)
                  : await S.sb.from("job_marks").insert({ job_id: jobId, email: S.email, kind });
    if (r.error) return banner(r.error.message, "error");
    if (has) S.marks = S.marks.filter((m) => !(m.job_id === jobId && m.kind === kind && String(m.email).toLowerCase() === S.email));
    else S.marks.push({ job_id: jobId, email: S.email, kind });
    N().renderJobs();
    if (!has && kind === "interested") banner("Marked as interested. The person who posted the job can see this.", "ok");
  };
  X.showInterested = function (jobId) {
    const { S, esc, openSheet } = N();
    const job = S.jobs.find((j) => j.id === jobId);
    const rows = X.interested(jobId).map((m) => {
      const p = memberByEmail(m.email);
      return `<div class="arow"><div><b>${esc(p ? p.name : m.email)}</b><div class="muted">${esc(p ? [p.designation, N().statusLabel(p)].filter(Boolean).join(" · ") : "")}</div></div>
        <div class="row">${p ? `<button class="btn btn-line btn-sm" data-vp="${esc(p.id)}">View profile</button><button class="btn btn-brand btn-sm" data-msg="${esc(p.id)}">Message</button>` : ""}</div></div>`;
    }).join("");
    openSheet(`<h2 style="font-size:1.3rem;margin-bottom:6px">Interested in: ${esc(job ? job.title : "this job")}</h2>${rows || `<p class="muted">Nobody has marked interest yet.</p>`}`);
  };

  /* ---------------- reports ---------------- */
  X.report = function (kind, id, label) {
    const { S, esc, openSheet, closeSheet, banner } = N();
    if (S.demo) return;
    openSheet(`<h2 style="font-size:1.3rem;margin-bottom:6px">Report this post</h2><p class="muted" style="margin:0 0 10px">${esc(label || "")}</p>
      <form class="pf" id="repForm"><label class="full">What is wrong? (optional)<textarea name="reason" rows="3" maxlength="500" placeholder="Spam, wrong information, inappropriate, copyright…"></textarea></label>
      <button class="btn btn-brand full" type="submit">Send to moderators</button><div class="formmsg full" id="repMsg"></div></form>`);
    $("#repForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const reason = new FormData(e.target).get("reason").trim();
      const r = await S.sb.from("reports").insert({ kind, target_id: id, target_label: String(label || "").slice(0, 140), reason: reason || null, reported_by: S.email });
      if (r.error) return ($("#repMsg").textContent = r.error.code === "23505" ? "You have already reported this post." : r.error.message);
      closeSheet(); banner("Thank you. A moderator will review it.", "ok");
    });
  };

  /* ---------------- private messages ---------------- */
  X.compose = function (memberId, kind) {
    const m = N().S.members.find((x) => String(x.id) === String(memberId));
    if (m) composeTo(m, kind || "message");
  };
  function composeTo(m, kind) {
    const { S, esc, openSheet, closeSheet, banner } = N();
    if (S.demo) return banner("Messaging works after Supabase is connected.", "info");
    const title = kind === "mentorship" ? "Request mentorship" : "Send a message";
    openSheet(`<h2 style="font-size:1.3rem;margin-bottom:4px">${title}</h2><p class="muted" style="margin:0 0 10px">To <b>${esc(m.name)}</b>. They will see it under <b>Messages</b> on this site.</p>
      <form class="pf" id="msgForm"><label class="full">Message<textarea name="message" rows="5" required maxlength="1000" placeholder="${kind === "mentorship" ? "Say a little about yourself and what you would like guidance on." : "Write your message…"}"></textarea></label>
      <button class="btn btn-brand full" type="submit">Send</button><div class="formmsg full" id="msgMsg"></div>
      <p class="muted full" style="margin:0;font-size:.82rem">Messages are private between you and the recipient. Moderators cannot read them. Up to 10 messages per day.</p></form>`);
    $("#msgForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = new FormData(e.target).get("message").trim(); if (!message) return;
      const r = await S.sb.from("contact_requests").insert({ kind, from_email: S.email, from_name: (S.me && S.me.name) || S.email, to_email: m.email, message });
      if (r.error) return ($("#msgMsg").textContent = r.error.message);
      closeSheet(); banner("Message sent.", "ok"); X.refresh();
    });
  }

  function renderInbox() {
    const { S, esc } = N(), w = $("#inboxWrap"); if (!w) return;
    const me = S.email, unread = S.inbox.filter((r) => !r.is_read && String(r.to_email).toLowerCase() === me).length;
    const b = $("#inboxBadge"); if (b) { b.textContent = unread; b.hidden = !unread; }
    if (S.demo) { w.innerHTML = demoNote("Messages"); return; }
    const list = S.inbox.filter((r) => inboxTab === "in" ? String(r.to_email).toLowerCase() === me : String(r.from_email).toLowerCase() === me);
    const kindLabel = { message: "Message", mentorship: "Mentorship request", hiring: "Hiring" };
    w.innerHTML = `<div class="tabs"><button class="tab${inboxTab === "in" ? " on" : ""}" data-tab="in">Received${unread ? ` (${unread} new)` : ""}</button><button class="tab${inboxTab === "out" ? " on" : ""}" data-tab="out">Sent</button></div>
      ${list.length ? list.map((r) => {
        const other = inboxTab === "in" ? { email: r.from_email, name: r.from_name } : { email: r.to_email, name: (memberByEmail(r.to_email) || {}).name };
        const p = memberByEmail(other.email);
        return `<article class="card msg${inboxTab === "in" && !r.is_read ? " unread" : ""}"><div class="row-between"><div><b>${inboxTab === "in" ? "From" : "To"}: ${esc(other.name || other.email)}</b>
            <span class="chip">${esc(kindLabel[r.kind] || "Message")}</span></div><span class="muted">${esc(dateOf(r.created_at))}</span></div>
          <p class="jdesc" style="white-space:pre-wrap">${esc(r.message)}</p>
          <div class="card-actions">${p ? `<button class="btn btn-brand btn-sm" data-reply="${esc(p.id)}">${inboxTab === "in" ? "Reply" : "Message again"}</button><button class="btn btn-line btn-sm" data-vp="${esc(p.id)}">View profile</button>` : `<span class="muted">Member no longer in the directory</span>`}
            <button class="btn btn-line btn-sm" data-mdel="${esc(r.id)}">Delete</button></div></article>`;
      }).join("") : `<div class="empty" style="display:block">${inboxTab === "in" ? "No messages yet." : "You have not sent any messages."}</div>`}`;
    if (location.hash.startsWith("#/inbox") && inboxTab === "in" && unread) markRead();
  }
  async function markRead() {
    const { S } = N();
    const ids = S.inbox.filter((r) => !r.is_read && String(r.to_email).toLowerCase() === S.email).map((r) => r.id);
    if (!ids.length) return;
    S.inbox.forEach((r) => { if (ids.includes(r.id)) r.is_read = true; });
    const b = $("#inboxBadge"); if (b) b.hidden = true;
    await S.sb.from("contact_requests").update({ is_read: true }).in("id", ids);
  }

  /* ---------------- news wall ---------------- */
  function renderNews() {
    const { S, esc, safeUrl } = N(), box = $("#newsList"); if (!box) return;
    $("#addNews").hidden = S.demo;
    if (S.demo) { box.innerHTML = `<p class="muted">News and announcements work after Supabase is connected.</p>`; return; }
    let list = S.news.filter((n) => n.status === "approved" || mine(n.posted_by));
    list.sort((a, b) => (b.pinned - a.pinned) || String(b.created_at).localeCompare(String(a.created_at)));
    const total = list.length; if (!newsAll) list = list.slice(0, 5);
    box.innerHTML = list.length ? list.map((n) => {
      const own = mine(n.posted_by), u = n.link ? safeUrl(n.link) : "";
      return `<article class="card news${n.pinned ? " pinned" : ""}">
        <div class="chips">${n.pinned ? `<span class="chip goldchip">📌 Pinned</span>` : ""}${n.status !== "approved" ? `<span class="chip pending">Waiting for moderator approval</span>` : ""}</div>
        <h3>${esc(n.title)}</h3>${n.body ? `<p class="jdesc" style="white-space:pre-wrap">${esc(n.body)}</p>` : ""}
        <div class="meta">${esc(n.posted_by_name || n.posted_by)} · ${esc(dateOf(n.created_at))}</div>
        <div class="card-actions">${u && u !== "#" ? `<a class="btn btn-line btn-sm" href="${esc(u)}" target="_blank" rel="noopener">Read more ↗</a>` : ""}
          ${own || S.isStaff ? `<button class="btn btn-line btn-sm" data-ndel="${esc(n.id)}">Delete</button>` : ""}
          ${!own && !S.isStaff ? `<button class="link-btn" data-report="news" data-id="${esc(n.id)}" data-label="${esc(n.title)}">Report</button>` : ""}</div></article>`;
    }).join("") + (total > 5 ? `<button class="btn btn-line btn-sm" data-nmore="1">${newsAll ? "Show fewer" : `Show all ${total}`}</button>` : "")
      : `<p class="muted">No news yet. Share a result, an achievement or an announcement.</p>`;
  }

  function openNewsForm() {
    const { S, openSheet, closeSheet, banner, safeUrl } = N();
    openSheet(`<h2 style="font-size:1.4rem;margin-bottom:6px">Share news</h2>
      <p class="muted" style="margin:0 0 10px">${S.isStaff ? "As a moderator or admin, your post appears immediately." : "A moderator will approve your post before other members see it."}</p>
      <form class="pf" id="newsForm"><label class="full">Headline *<input name="title" required maxlength="140" placeholder="e.g. Congratulations to … on becoming a Chartered Accountant"></label>
        <label class="full">Details<textarea name="body" rows="4" maxlength="2000"></textarea></label>
        <label class="full">Link (optional)<input name="link" placeholder="https://"></label>
        ${S.isStaff ? `<label class="consent full"><input type="checkbox" name="pinned"> Pin to the top</label>` : ""}
        <button class="btn btn-brand full" type="submit">Post</button><div class="formmsg full" id="newsMsg"></div></form>`);
    $("#newsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      if (f.link.trim() && safeUrl(f.link.trim()) === "#") return ($("#newsMsg").textContent = "The link must start with https://");
      const r = await S.sb.from("news").insert({ title: f.title.trim(), body: f.body.trim() || null, link: f.link.trim() || null, pinned: !!f.pinned,
        posted_by: S.email, posted_by_name: (S.me && S.me.name) || S.email });
      if (r.error) return ($("#newsMsg").textContent = r.error.message);
      closeSheet(); banner(S.isStaff ? "Posted." : "Submitted. It will appear once a moderator approves it.", "ok"); X.refresh();
    });
  }

  /* ---------------- Q&A ---------------- */
  function renderAsk() {
    const { S, esc } = N(), box = $("#qList"); if (!box) return;
    $("#askBtn").hidden = S.demo;
    if (S.demo) { box.innerHTML = demoNote("Questions and answers"); return; }
    const tagSel = $("#qTag"); if (tagSel.options.length < 2) TAGS.forEach((t) => tagSel.insertAdjacentHTML("beforeend", `<option>${esc(t)}</option>`));
    const qt = $("#qSearch").value.trim().toLowerCase(), tg = tagSel.value;
    const list = S.questions.filter((x) => (!qt || [x.title, x.body].join(" ").toLowerCase().includes(qt)) && (!tg || x.tag === tg));
    $("#qCount").textContent = `${list.length} question${list.length === 1 ? "" : "s"}`;
    box.innerHTML = list.length ? list.map((x) => {
      const n = S.answers.filter((a) => a.question_id === x.id).length;
      return `<article class="card qcard" data-q="${esc(x.id)}" tabindex="0" role="button"><div class="chips">${x.tag ? `<span class="chip ca">${esc(x.tag)}</span>` : ""}<span class="chip ${n ? "exp" : ""}">${n} answer${n === 1 ? "" : "s"}</span></div>
        <h3>${esc(x.title)}</h3>${x.body ? `<p class="jdesc">${esc(x.body.length > 180 ? x.body.slice(0, 177) + "…" : x.body)}</p>` : ""}
        <div class="meta">${esc(x.asked_by_name || x.asked_by)} · ${esc(dateOf(x.created_at))}</div></article>`;
    }).join("") : `<div class="empty" style="display:block">No questions yet. Ask the first one.</div>`;
  }

  function openAskForm() {
    const { S, esc, openSheet, closeSheet, banner } = N();
    openSheet(`<h2 style="font-size:1.4rem;margin-bottom:10px">Ask the community</h2>
      <form class="pf" id="askForm"><label class="full">Question *<input name="title" required minlength="5" maxlength="200" placeholder="e.g. How should I plan my BPTC revision in 6 weeks?"></label>
        <label>Topic<select name="tag"><option value="">—</option>${TAGS.map((t) => `<option>${esc(t)}</option>`).join("")}</select></label><span></span>
        <label class="full">Details<textarea name="body" rows="4" maxlength="3000"></textarea></label>
        <button class="btn btn-brand full" type="submit">Post question</button><div class="formmsg full" id="askMsg"></div></form>`);
    $("#askForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      const r = await S.sb.from("questions").insert({ title: f.title.trim(), body: f.body.trim() || null, tag: f.tag || null, asked_by: S.email, asked_by_name: (S.me && S.me.name) || S.email });
      if (r.error) return ($("#askMsg").textContent = r.error.message);
      closeSheet(); banner("Question posted.", "ok"); X.refresh();
    });
  }

  function openThread(id) {
    const { S, esc, openSheet } = N();
    const x = S.questions.find((q) => q.id === id); if (!x) return;
    const own = mine(x.asked_by), ans = S.answers.filter((a) => a.question_id === id);
    openSheet(`<div class="chips">${x.tag ? `<span class="chip ca">${esc(x.tag)}</span>` : ""}</div>
      <h2 style="font-size:1.4rem;margin:8px 0">${esc(x.title)}</h2>${x.body ? `<p style="white-space:pre-wrap;color:var(--ink-2)">${esc(x.body)}</p>` : ""}
      <div class="meta">${esc(x.asked_by_name || x.asked_by)} · ${esc(dateOf(x.created_at))}
        ${own || S.isStaff ? ` · <button class="link-btn" data-qdel="${esc(x.id)}">Delete question</button>` : ` · <button class="link-btn" data-report="question" data-id="${esc(x.id)}" data-label="${esc(x.title)}">Report</button>`}</div>
      <h3 style="font-size:1.1rem;margin:18px 0 6px">${ans.length} answer${ans.length === 1 ? "" : "s"}</h3>
      ${ans.map((a) => `<div class="answer"><p style="white-space:pre-wrap;margin:0 0 6px">${esc(a.body)}</p>
        <div class="meta">${esc(a.answered_by_name || a.answered_by)} · ${esc(dateOf(a.created_at))}
        ${mine(a.answered_by) || S.isStaff ? ` · <button class="link-btn" data-adel="${esc(a.id)}" data-qid="${esc(id)}">Delete</button>` : ` · <button class="link-btn" data-report="answer" data-id="${esc(a.id)}" data-label="${esc(String(a.body).slice(0, 80))}">Report</button>`}</div></div>`).join("")}
      <form class="pf" id="ansForm" data-qid="${esc(id)}" style="margin-top:14px"><label class="full">Your answer<textarea name="body" rows="3" required maxlength="3000"></textarea></label>
        <button class="btn btn-brand full" type="submit">Post answer</button><div class="formmsg full" id="ansMsg"></div></form>`);
    $("#ansForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = new FormData(e.target).get("body").trim(); if (!body) return;
      const r = await S.sb.from("answers").insert({ question_id: id, body, answered_by: S.email, answered_by_name: (S.me && S.me.name) || S.email });
      if (r.error) return ($("#ansMsg").textContent = r.error.message);
      await X.refresh(); openThread(id);
    });
  }

  /* ---------------- wiring ---------------- */
  X.render = function () { renderNews(); renderAsk(); renderInbox(); };
  X.init = function () {
    $("#addNews").addEventListener("click", openNewsForm);
    $("#askBtn").addEventListener("click", openAskForm);
    $("#qSearch").addEventListener("input", renderAsk); $("#qTag").addEventListener("input", renderAsk);
    $("#qList").addEventListener("click", (e) => { const c = e.target.closest("[data-q]"); if (c) openThread(c.dataset.q); });
    $("#qList").addEventListener("keydown", (e) => { const c = e.target.closest("[data-q]"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openThread(c.dataset.q); } });
    $("#newsList").addEventListener("click", async (e) => {
      if (e.target.closest("[data-nmore]")) { newsAll = !newsAll; return renderNews(); }
      const d = e.target.closest("[data-ndel]"); if (!d || !confirm("Delete this post?")) return;
      const r = await N().S.sb.from("news").delete().eq("id", d.dataset.ndel);
      if (r.error) return N().banner(r.error.message, "error"); N().banner("Deleted.", "ok"); X.refresh();
    });
    $("#inboxWrap").addEventListener("click", async (e) => {
      const t = e.target.closest("[data-tab]"); if (t) { inboxTab = t.dataset.tab; return renderInbox(); }
      const rp = e.target.closest("[data-reply]"); if (rp) return X.compose(rp.dataset.reply);
      const d = e.target.closest("[data-mdel]"); if (!d || !confirm("Delete this message? It is removed for both of you.")) return;
      const r = await N().S.sb.from("contact_requests").delete().eq("id", d.dataset.mdel);
      if (r.error) return N().banner(r.error.message, "error"); X.refresh();
    });
    document.addEventListener("click", async (e) => {
      const vp = e.target.closest("[data-vp]"); if (vp) return N().openProfile(vp.dataset.vp);
      const qd = e.target.closest("[data-qdel]");
      if (qd && confirm("Delete this question and its answers?")) {
        const r = await N().S.sb.from("questions").delete().eq("id", qd.dataset.qdel);
        if (r.error) return N().banner(r.error.message, "error"); N().closeSheet(); N().banner("Deleted.", "ok"); X.refresh();
      }
      const ad = e.target.closest("[data-adel]");
      if (ad && confirm("Delete this answer?")) {
        const r = await N().S.sb.from("answers").delete().eq("id", ad.dataset.adel);
        if (r.error) return N().banner(r.error.message, "error"); await X.refresh(); openThread(ad.dataset.qid);
      }
    });
    window.addEventListener("hashchange", () => { if (location.hash.startsWith("#/inbox")) renderInbox(); });
  };
})();
