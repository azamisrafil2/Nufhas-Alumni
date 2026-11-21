/* NUFHAS Alumni — Admin & Moderator panel.
   Admins: everything. Moderators: approve/reject new members, approve news, handle reports, delete jobs.
   (The database enforces this too, so hiding a button here is never the only protection.) */
(function () {
  "use strict";
  const A = (window.ADM = {});
  const N = () => window.NUF;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let editEv = null, editLk = null;

  const REPORT_TABLE = { job: "jobs", library: "library", news: "news", question: "questions", answer: "answers" };
  const REPORT_LABEL = { job: "Job", library: "Library item", news: "News post", question: "Question", answer: "Answer" };

  A.render = function () {
    const { S, esc, fmt, statusLabel, todayIso, completeness } = N(), w = $("#adminWrap"); if (!w) return;
    const title = $("#admTitle"), sub = $("#admSub");
    if (title) title.textContent = S.isAdmin ? "Admin" : "Moderation";
    if (sub) sub.textContent = S.isAdmin ? "Approve members, manage events, links, moderators and posts." : "Approve new members, review reported posts and approve news.";
    if (!S.isStaff) { w.innerHTML = `<div class="card gate"><h3>Staff only</h3><p>You do not have access to this page.</p></div>`; return; }

    const adm = S.isAdmin;
    const pending = S.members.filter((m) => !m.approved && !m.suspended), active = S.members.filter((m) => m.approved), susp = S.members.filter((m) => m.suspended);
    const pendNews = S.news.filter((n) => n.status === "pending");
    const reports = S.reports || [];
    const avg = active.length ? Math.round(active.reduce((a, m) => a + completeness(m).pct, 0) / active.length) : 0;
    const upcoming = S.events.filter((e) => e.date >= todayIso()).length;
    const tile = (n, l, cls = "") => `<div class="stat ${cls}"><b>${n}</b><span>${l}</span></div>`;
    const ev = editEv ? S.events.find((x) => String(x.id) === String(editEv)) : null;
    const lk = editLk ? S.links.find((x) => String(x.id) === String(editLk)) : null;

    w.innerHTML = `
      <div class="dash">${tile(pending.length, "Members waiting", pending.length ? "alert" : "")}${tile(active.length, "Active members")}${tile(reports.length, "Open reports", reports.length ? "alert" : "")}
        ${tile(pendNews.length, "News to approve", pendNews.length ? "alert" : "")}${tile(S.jobs.length, "Jobs")}${tile(upcoming, "Upcoming events")}${tile(avg + "%", "Avg profile completeness")}${tile(active.filter((m) => m.caStatus === "Chartered Accountant").length, "Chartered Accountants", "gold")}</div>

      <div class="card"><h3>Pending members (${pending.length})</h3>
        ${pending.length ? pending.map((m) => `<div class="arow"><div><b>${esc(m.name)}</b> <span class="muted">${esc(m.email)}</span><div class="muted">${esc(m.designation || "—")} · ${esc(statusLabel(m))} · ${esc(m.company || "")}</div></div>
          <div class="row"><button class="btn btn-brand btn-sm" data-ap="${m.id}">Approve</button><button class="btn btn-line btn-sm" data-rj="${m.id}">Reject</button></div></div>`).join("") : `<p class="muted">No pending requests.</p>`}
      </div>

      <div class="card" style="margin-top:16px"><h3>News waiting for approval (${pendNews.length})</h3>
        ${pendNews.length ? pendNews.map((n) => `<div class="arow"><div><b>${esc(n.title)}</b> <span class="muted">by ${esc(n.posted_by_name || n.posted_by)}</span><div class="muted">${esc((n.body || "").slice(0, 160))}</div>${n.image_path ? `<img class="newsimg thumb" src="${esc(S.sb.storage.from("news-images").getPublicUrl(n.image_path).data.publicUrl)}" alt="">` : ""}</div>
          <div class="row"><button class="btn btn-brand btn-sm" data-napp="${n.id}">Approve</button><button class="btn btn-line btn-sm" data-nrej="${n.id}">Delete</button></div></div>`).join("") : `<p class="muted">Nothing to approve.</p>`}
      </div>

      <div class="card" style="margin-top:16px"><h3>Reported posts (${reports.length})</h3>
        ${reports.length ? reports.map((r) => `<div class="arow"><div><span class="chip">${esc(REPORT_LABEL[r.kind] || r.kind)}</span> <b>${esc(r.target_label || "(untitled)")}</b>
          <div class="muted">${esc(r.reason || "No reason given")} · reported by ${esc(r.reported_by)} · ${esc(fmt((r.created_at || "").slice(0, 10)))}</div></div>
          <div class="row"><button class="btn btn-brand btn-sm" data-rdel="${r.id}">Delete post</button><button class="btn btn-line btn-sm" data-rdis="${r.id}">Dismiss</button></div></div>`).join("") : `<p class="muted">No open reports.</p>`}
      </div>

      ${adm ? `
      <div class="card" style="margin-top:16px"><h3>Moderators (${(S.mods || []).length})</h3>
        <p class="muted" style="margin:6px 0 10px;font-size:.88rem">Moderators can approve or reject new members, approve news, delete posts and handle reports. They cannot remove approved members, edit events or links, or add other moderators.</p>
        <form class="pf" id="modForm" style="margin-bottom:10px"><label>Email of a member to make moderator<input type="email" name="email" required placeholder="member@example.com"></label>
          <button class="btn btn-brand btn-sm" type="submit" style="align-self:end">Add moderator</button></form>
        ${(S.mods || []).map((m) => { const p = S.members.find((x) => (x.email || "").toLowerCase() === m.email); return `<div class="arow"><div><b>${esc(p ? p.name : m.email)}</b> <span class="muted">${esc(m.email)}</span></div><button class="btn btn-line btn-sm" data-mrm="${esc(m.email)}">Remove</button></div>`; }).join("") || `<p class="muted">No moderators yet.</p>`}
      </div>

      <div class="card" style="margin-top:16px"><h3>Active members (${active.length})</h3>
        <input id="admSearch" type="search" placeholder="Search name or email…" style="width:100%;margin:8px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font:inherit">
        <p class="muted" style="margin:0 0 6px;font-size:.85rem"><b>Suspend</b> removes access but keeps the profile. <b>Remove</b> deletes the profile and files.</p>
        ${active.map((m) => `<div class="arow" data-q="${esc((m.name + " " + m.email).toLowerCase())}"><div><b>${esc(m.name)}</b> <span class="muted">${esc(m.email)}</span><div class="muted">${esc(m.designation || "—")} · ${esc(statusLabel(m))} · profile ${completeness(m).pct}%</div></div>
          ${m.email === S.email ? `<span class="muted">(you)</span>` : `<div class="row"><button class="btn btn-line btn-sm" data-sp="${m.id}">Suspend</button><button class="btn btn-line btn-sm" data-rm="${m.id}">Remove</button></div>`}</div>`).join("") || `<p class="muted">No active members.</p>`}
      </div>

      ${susp.length ? `<div class="card" style="margin-top:16px"><h3>Suspended members (${susp.length})</h3>
        ${susp.map((m) => `<div class="arow"><div><b>${esc(m.name)}</b> <span class="muted">${esc(m.email)}</span></div>
          <div class="row"><button class="btn btn-brand btn-sm" data-ri="${m.id}">Reinstate</button><button class="btn btn-line btn-sm" data-rm="${m.id}">Remove</button></div></div>`).join("")}</div>` : ""}` : ""}

      <div class="card" style="margin-top:16px"><h3>Jobs (${S.jobs.length})</h3>
        ${S.jobs.length ? S.jobs.map((j) => `<div class="arow"><div><b>${esc(j.title)}</b> <span class="muted">${esc(j.company)} · by ${esc(j.postedBy)}</span></div>
          <button class="btn btn-line btn-sm" data-dj="${j.id}">Delete</button></div>`).join("") : `<p class="muted">No jobs.</p>`}
      </div>

      ${adm ? `
      <div class="card" style="margin-top:16px" id="evCard"><h3>Events (${S.events.length})</h3>
        <form class="pf${ev ? " editing" : ""}" id="evForm" style="margin:10px 0 14px">
          ${ev ? `<div class="notice warn full">Editing: <b>${esc(ev.title)}</b></div><input type="hidden" name="id" value="${esc(ev.id)}">` : ""}
          <label class="full">Title *<input name="title" required value="${esc(ev ? ev.title : "")}"></label>
          <label>Date *<input name="date" type="date" required value="${esc(ev ? ev.date : "")}"></label>
          <label>Place<input name="place" placeholder="Dhaka — Venue" value="${esc(ev ? ev.place : "")}"></label>
          <label>Tag<input name="tag" placeholder="Networking / Workshop / Social" value="${esc(ev ? ev.tag : "")}"></label>
          <label>Time<input name="time" placeholder="e.g. 6:30 PM" value="${esc(ev ? ev.time : "")}"></label>
          <label class="full">Registration / info link (optional)<input name="link" placeholder="https://" value="${esc(ev ? ev.link : "")}"></label>
          <label class="full">Details<textarea name="description" rows="4" placeholder="Agenda, venue directions, who can attend…">${esc(ev ? ev.description : "")}</textarea></label>
          <label class="full">Banner picture (wide image, JPG/PNG, e.g. 1600 × 600)${ev && ev.bannerPath ? ` — a banner is already set; choose a file to replace it` : ""}<input name="banner" type="file" accept="image/jpeg,image/png,image/webp"></label>
          ${ev && ev.bannerPath ? `<label class="consent full"><input type="checkbox" name="removeBanner"> Remove the current banner</label>` : ""}
          ${ev ? "" : `<p class="muted full" style="margin:0;font-size:.85rem">New events are emailed automatically to members who have notifications switched on.</p>`}
          <button class="btn btn-brand btn-sm" type="submit">${ev ? "Save changes" : "Add event"}</button>${ev ? `<button class="btn btn-line btn-sm" type="button" data-ecancel="1">Cancel</button>` : ""}
          <div class="formmsg full" id="evMsg"></div>
        </form>
        ${S.events.map((e) => `<div class="arow"><div><b>${esc(e.title)}</b> <span class="muted">${esc(fmt(e.date))} · ${esc(e.place)}</span></div>
          <div class="row"><button class="btn btn-line btn-sm" data-edev="${e.id}">Edit</button><button class="btn btn-line btn-sm" data-dev="${e.id}">Delete</button></div></div>`).join("") || `<p class="muted">No events.</p>`}
      </div>

      <div class="card" style="margin-top:16px" id="lkCard"><h3>Quick links (${S.links.length})</h3>
        <form class="pf${lk ? " editing" : ""}" id="lkForm" style="margin:10px 0 14px">
          ${lk ? `<div class="notice warn full">Editing: <b>${esc(lk.title)}</b></div><input type="hidden" name="id" value="${esc(lk.id)}">` : ""}
          <label>Title *<input name="title" required value="${esc(lk ? lk.title : "")}"></label>
          <label>Link *<input name="url" required placeholder="https:// or #/jobs" value="${esc(lk ? lk.link : "")}"></label>
          <label class="full">Short description<input name="description" value="${esc(lk ? lk.text : "")}"></label>
          <label>Order (1 = first)<input name="sort" type="number" value="${lk ? esc(lk.sort ?? 10) : 10}"></label>
          <div style="align-self:end;display:flex;gap:8px"><button class="btn btn-brand btn-sm" type="submit">${lk ? "Save changes" : "Add link"}</button>${lk ? `<button class="btn btn-line btn-sm" type="button" data-lcancel="1">Cancel</button>` : ""}</div>
          <div class="formmsg full" id="lkMsg"></div>
        </form>
        ${S.links.map((l) => `<div class="arow"><div><b>${esc(l.title)}</b> <span class="muted">${esc(l.link)}</span></div>
          <div class="row"><button class="btn btn-line btn-sm" data-edlk="${l.id}">Edit</button><button class="btn btn-line btn-sm" data-dlk="${l.id}">Delete</button></div></div>`).join("") || `<p class="muted">No links.</p>`}
      </div>
      <p class="muted" style="margin-top:14px">Bulk edits (import, export) are done in the Supabase Table Editor.</p>` : ""}`;
  };

  // Shows a message right under the form (always visible) and as a banner.
  function formFail(msgId, text) {
    const m = $("#" + msgId); if (m) { m.style.color = "#8a1f17"; m.textContent = "Not saved: " + text; m.scrollIntoView({ behavior: "smooth", block: "center" }); }
    N().banner("Not saved: " + text, "error", 12000);
  }
  const busy = (form, on) => { const b = form.querySelector("button[type=submit]"); if (b) { b.disabled = on; b.dataset.t = b.dataset.t || b.textContent; b.textContent = on ? "Saving…" : b.dataset.t; } };
  const noRow = "the database did not accept the change. Make sure you are signed in as an admin, then reload the page and try again.";

  async function saveEvent(form) {
    const { S, banner, resizeImage } = N(), fd = new FormData(form), f = Object.fromEntries(fd.entries());
    const old = f.id ? S.events.find((x) => String(x.id) === String(f.id)) : null;
    if (f.id && !old) return formFail("evMsg", "that event no longer exists. Reload the page.");
    busy(form, true);
    let newPath, changed = false;
    try {
      const file = fd.get("banner");
      if (file && file.size > 0) {
        if (!/^image\//.test(file.type)) return formFail("evMsg", "the banner must be an image (JPG or PNG).");
        const blob = await resizeImage(file, 1600); newPath = `ev-${Date.now()}.jpg`;
        const up = await S.sb.storage.from("event-banners").upload(newPath, blob, { contentType: "image/jpeg" });
        if (up && up.error) return formFail("evMsg", "banner upload failed (" + up.error.message + ")");
        changed = true;
      } else if (f.removeBanner === "on" && old && old.bannerPath) { newPath = null; changed = true; }
      const row = { title: f.title.trim(), event_date: f.date, event_time: (f.time || "").trim() || null, place: (f.place || "").trim() || null, tag: (f.tag || "").trim() || null,
        link: (f.link || "").trim() || null, description: (f.description || "").trim() || null };
      if (changed) row.banner_path = newPath; else if (!old) row.banner_path = null;
      // .select() returns the saved row, so a change the database silently ignored is detected.
      const r = old ? await S.sb.from("events").update(row).eq("id", old.id).select() : await S.sb.from("events").insert(row).select();
      if (r.error || !r.data || !r.data.length) {
        if (changed && newPath) S.sb.storage.from("event-banners").remove([newPath]);
        return formFail("evMsg", r.error ? r.error.message : noRow);
      }
      if (changed && old && old.bannerPath) S.sb.storage.from("event-banners").remove([old.bannerPath]);
      editEv = null; await N().reload(); banner(old ? "Event updated." : "Event added. Members with notifications on will get an email.", "ok");
    } catch (err) { formFail("evMsg", err.message || String(err)); }
    finally { busy(form, false); }
  }

  async function saveLink(form) {
    const { S, banner, safeUrl } = N(), f = Object.fromEntries(new FormData(form).entries());
    if (safeUrl(f.url.trim()) === "#") return formFail("lkMsg", "the link must start with https:// or #/ (for a page on this site).");
    busy(form, true);
    try {
      const row = { title: f.title.trim(), description: (f.description || "").trim() || null, url: f.url.trim(), sort: +f.sort || 0 };
      const r = f.id ? await S.sb.from("links").update(row).eq("id", f.id).select() : await S.sb.from("links").insert(row).select();
      if (r.error || !r.data || !r.data.length) return formFail("lkMsg", r.error ? r.error.message : noRow);
      const was = !!f.id; editLk = null; await N().reload(); banner(was ? "Link updated." : "Link added.", "ok");
    } catch (err) { formFail("lkMsg", err.message || String(err)); }
    finally { busy(form, false); }
  }

  async function addModerator(form) {
    const { S, banner } = N(), email = new FormData(form).get("email").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return banner("Enter a valid email address.", "error");
    const r = await S.sb.from("moderators").insert({ email });
    if (r.error) return banner(r.error.code === "23505" ? "That person is already a moderator." : r.error.message, "error");
    await N().reload(); banner("Moderator added. They will see a Moderation tab next time the page loads.", "ok");
  }

  async function onSubmit(e) {
    e.preventDefault();
    const id = e.target.getAttribute("id");
    if (id === "evForm" && N().S.isAdmin) return saveEvent(e.target);
    if (id === "lkForm" && N().S.isAdmin) return saveLink(e.target);
    if (id === "modForm" && N().S.isAdmin) return addModerator(e.target);
  }

  async function onClick(e) {
    const { S, banner } = N();
    const a = e.target.closest("[data-ap],[data-rj],[data-dj],[data-dev],[data-dlk],[data-sp],[data-rm],[data-ri],[data-edev],[data-edlk],[data-ecancel],[data-lcancel],[data-napp],[data-nrej],[data-rdel],[data-rdis],[data-mrm]");
    if (!a) return;
    const d = a.dataset, adm = S.isAdmin; let r, msg = "Done.";
    const need = (ok) => { if (!ok) banner("Only admins can do that.", "error"); return ok; };

    if (d.ecancel) { editEv = null; return A.render(); }
    if (d.lcancel) { editLk = null; return A.render(); }
    if (d.edev) { if (!need(adm)) return; editEv = d.edev; A.render(); return $("#evCard").scrollIntoView({ behavior: "smooth" }); }
    if (d.edlk) { if (!need(adm)) return; editLk = d.edlk; A.render(); return $("#lkCard").scrollIntoView({ behavior: "smooth" }); }

    if (d.ap) r = await S.sb.from("profiles").update(adm ? { approved: true, suspended: false } : { approved: true }).eq("id", d.ap);
    else if (d.rj) { if (!confirm("Reject and delete this pending profile?")) return; r = await S.sb.from("profiles").delete().eq("id", d.rj); }
    else if (d.ri) { if (!need(adm)) return; r = await S.sb.from("profiles").update({ approved: true, suspended: false }).eq("id", d.ri); }
    else if (d.sp) {
      if (!need(adm)) return; const m = S.members.find((x) => String(x.id) === d.sp);
      if (!confirm(`Suspend ${m ? m.name : "this member"}? They lose access until you reinstate them.`)) return;
      r = await S.sb.from("profiles").update({ approved: false, suspended: true }).eq("id", d.sp);
    } else if (d.rm) {
      if (!need(adm)) return; const m = S.members.find((x) => String(x.id) === d.rm);
      if (!confirm(`Permanently remove ${m ? m.name : "this member"} and their files? This cannot be undone.`)) return;
      if (m && m.photoPath) S.sb.storage.from("avatars").remove([m.photoPath]);
      if (m && m.cvPath) S.sb.storage.from("cvs").remove([m.cvPath]);
      r = await S.sb.from("profiles").delete().eq("id", d.rm);
    } else if (d.dev) {
      if (!need(adm) || !confirm("Delete this event?")) return;
      const ev = S.events.find((x) => String(x.id) === d.dev); r = await S.sb.from("events").delete().eq("id", d.dev);
      if (!r.error && ev && ev.bannerPath) S.sb.storage.from("event-banners").remove([ev.bannerPath]);
      if (editEv === d.dev) editEv = null;
    } else if (d.dlk) { if (!need(adm) || !confirm("Delete this link?")) return; r = await S.sb.from("links").delete().eq("id", d.dlk); if (editLk === d.dlk) editLk = null; }
    else if (d.dj) { if (!confirm("Delete this job?")) return; r = await S.sb.from("jobs").delete().eq("id", d.dj); }
    else if (d.napp) r = await S.sb.from("news").update({ status: "approved" }).eq("id", d.napp);
    else if (d.nrej) { if (!confirm("Delete this news post?")) return; const nn = S.news.find((x) => x.id === d.nrej); r = await S.sb.from("news").delete().eq("id", d.nrej); if (!r.error && nn && nn.image_path) S.sb.storage.from("news-images").remove([nn.image_path]); }
    else if (d.mrm) { if (!need(adm) || !confirm(`Remove ${d.mrm} as moderator?`)) return; r = await S.sb.from("moderators").delete().eq("email", d.mrm); }
    else if (d.rdis) { r = await S.sb.from("reports").delete().eq("id", d.rdis); msg = "Report dismissed."; }
    else if (d.rdel) {
      const rep = S.reports.find((x) => x.id === d.rdel); if (!rep) return;
      if (!confirm("Delete the reported post? This cannot be undone.")) return;
      if (rep.kind === "library") { const it = S.library.find((x) => x.id === rep.target_id); if (it && it.filePath) S.sb.storage.from("library").remove([it.filePath]); }
      r = await S.sb.from(REPORT_TABLE[rep.kind]).delete().eq("id", rep.target_id);
      if (!r.error) { await S.sb.from("reports").delete().eq("kind", rep.kind).eq("target_id", rep.target_id); msg = "Post deleted."; }
    }
    if (!r) return;
    if (r.error) return banner(r.error.message, "error");
    await N().reload(); banner(msg, "ok");
  }

  A.init = function () {
    const w = $("#adminWrap"); if (!w) return;
    w.addEventListener("click", onClick);
    w.addEventListener("submit", onSubmit);
    w.addEventListener("input", (e) => {
      if (e.target.id !== "admSearch") return;
      const t = e.target.value.trim().toLowerCase(); $$("#adminWrap [data-q]").forEach((row) => (row.hidden = !!t && !row.dataset.q.includes(t)));
    });
  };
})();
