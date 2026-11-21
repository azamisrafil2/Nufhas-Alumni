(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = new Date();
  const PALETTE = ["#000000", "#046A38", "#26890D", "#53565A", "#0D8390", "#2b2b2b"];
  const BLOODS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
  const JOB_TYPES = ["Full-time", "Part-time", "Internship", "Contract"];

  const S = { sb: null, demo: true, session: null, uid: null, email: "", me: null, isAdmin: false, isMember: false, isMod: false, isStaff: false,
              members: [], jobs: [], events: [], links: [], library: [], news: [], questions: [], answers: [], inbox: [], marks: [], reports: [], experiences: [], stats: null, ctx: { designations: [], departments: [], locations: [], skills: [] } };

  /* ---------------- helpers ---------------- */
  const fmt = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
  const initials = (n) => String(n || "?").replace(/^(Md\.?|Mst\.?)\s+/i, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const colour = (s) => PALETTE[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  const tel = (p) => { const d = String(p).replace(/\D/g, ""); return d.startsWith("880") ? "+" + d : d.startsWith("0") ? "+88" + d : "+" + d; };
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const isGold = (m) => m.caStatus === "Chartered Accountant";
  const statusLabel = (m) => !m.caStatus ? "—" : (LEVEL_STATUSES.includes(m.caStatus) && m.subjects != null ? `${m.caStatus} (${m.subjects})` : m.caStatus);
  const artStatus = (m) => !m.articleshipStart ? "" : !m.articleshipEnd ? "end date pending" : (new Date(m.articleshipEnd + "T00:00:00") <= today ? "completed" : "ongoing");
  const artText = (m) => (!m.articleshipStart && !m.articleshipEnd) ? "—" : `${fmt(m.articleshipStart) || "—"} → ${fmt(m.articleshipEnd) || "—"}`;
  const COMPLETE_FIELDS = [["designation", "designation"], ["company", "organization"], ["location", "location"], ["phone", "phone"], ["caStatus", "CA status"], ["bloodGroup", "blood group"],
  ["articleshipStart", "articleship start"], ["articleshipEnd", "articleship end"], ["skills", "skills"], ["about", "about you"], ["linkedin", "LinkedIn"], ["photoPath", "photo"], ["cvPath", "CV"]];
function completeness(m) {
  const missing = COMPLETE_FIELDS.filter(([k]) => !m[k]).map(([, l]) => l);
  return { pct: Math.round(100 * (COMPLETE_FIELDS.length - missing.length) / COMPLETE_FIELDS.length), missing };
}
const byStart = (a, b) => (a.articleshipStart || "9999").localeCompare(b.articleshipStart || "9999") || a.name.localeCompare(b.name);

  let bannerTimer;
  function banner(msg, kind = "info", ms = 6000) {
    const b = $("#banner"); b.className = "banner " + kind; b.textContent = msg; b.hidden = false;
    clearTimeout(bannerTimer); if (ms) bannerTimer = setTimeout(() => (b.hidden = true), ms);
  }

  const photoUrl = (m) => m.photoUrl || (S.sb && m.photoPath ? S.sb.storage.from("avatars").getPublicUrl(m.photoPath).data.publicUrl : "");
  function avatar(m, cls = "avatar") {
    const fb = `<div class="${cls}" style="background:${colour(m.name)}" aria-hidden="true">${esc(initials(m.name))}</div>`;
    const u = photoUrl(m);
    return u ? `<img class="${cls}" src="${esc(u)}" alt="Photo of ${esc(m.name)}" loading="lazy" onerror="this.outerHTML=this.dataset.fb" data-fb="${esc(fb)}">` : fb;
  }

  /* ---------------- row mappers ---------------- */
  const toMember = (r) => ({ id: r.id, name: r.name, email: r.email, company: r.company || "", location: r.location || "", department: r.department || "",
    designation: r.designation || "", phone: r.phone || "", caStatus: r.ca_status || "", subjects: r.subjects_cleared, bloodGroup: r.blood_group || "",
    articleshipStart: r.articleship_start || "", articleshipEnd: r.articleship_end || "", skills: r.skills || "", about: r.about || "",
    linkedin: r.linkedin || "", photoPath: r.photo_path || "", cvPath: r.cv_path || "", approved: r.approved,
    suspended: !!r.suspended, notify: r.notify_email !== false, donor: !!r.blood_donor, mentor: !!r.mentor, mentorTopics: r.mentor_topics || "",
    hidePhone: !!r.hide_phone, hideEmail: !!r.hide_email });
  const toJob = (r) => ({ id: r.id, title: r.title, company: r.company, location: r.location || "", jobType: r.job_type || "Full-time",
    expMin: r.exp_min, expMax: r.exp_max, caStatus: r.ca_status || "", skills: r.skills || "", description: r.description || "",
    applyContact: r.apply_contact, deadline: r.deadline || "", postedBy: r.posted_by, postedByName: r.posted_by_name || "", createdAt: r.created_at, notify: !!r.notify });

  const toLib = (r) => ({ id: r.id, title: r.title, kind: r.kind, level: r.level || "", subject: r.subject, year: r.year, description: r.description || "",
    filePath: r.file_path || "", linkUrl: r.link_url || "", by: r.uploaded_by, byName: r.uploaded_by_name || "", createdAt: r.created_at });
  const toEvent = (r) => ({ id: r.id, title: r.title, date: r.event_date, time: r.event_time || r.time || "", place: r.place || "", tag: r.tag || "", link: r.link || "",
    description: r.description || "", bannerPath: r.banner_path || "" });
  const bannerUrl = (p) => (S.sb && p ? S.sb.storage.from("event-banners").getPublicUrl(p).data.publicUrl : "");
  const toLink = (r) => ({ id: r.id, title: r.title, text: r.description || "", link: r.url, sort: r.sort });
  const safeUrl = (u) => (/^(https?:\/\/|#\/|mailto:)/i.test(u || "") ? u : "#");
  const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  /* ---------------- data loading ---------------- */
  async function loadAll() {
    Object.assign(S, { members: [], jobs: [], library: [], news: [], questions: [], answers: [], inbox: [], marks: [], reports: [], experiences: [], me: null, isAdmin: false, isMember: false, isMod: false, isStaff: false, email: "" });
    if (S.demo) { S.events = EVENTS.map((e, i) => ({ id: "e" + i, ...e })); S.links = RESOURCES.map((r, i) => ({ id: "l" + i, ...r })); S.members = EXAMPLE_MEMBERS; S.library = EXAMPLE_LIBRARY; S.jobs = EXAMPLE_JOBS.slice(); S.isMember = true; buildCtx(); return; }
    try {
      const st = await S.sb.rpc("public_stats"); S.stats = st.data;
      if (S.session) {
        S.email = (S.session.user.email || "").toLowerCase();
        const [a, m, mo] = await Promise.all([S.sb.rpc("is_admin"), S.sb.rpc("is_member"), S.sb.rpc("is_moderator")]);
        S.isAdmin = !!a.data; S.isMember = !!m.data; S.isMod = !!mo.data; S.isStaff = S.isAdmin || S.isMod;
        const mine = await S.sb.from("profiles").select("*").eq("email", S.email).maybeSingle();
        S.me = mine.data ? toMember(mine.data) : null;
        if (S.isMember) {
          const [pm, jb, lb] = await Promise.all([
            S.sb.from("profiles").select("*").order("articleship_start", { ascending: true, nullsFirst: false }).limit(2000),
            S.sb.from("jobs").select("*").order("created_at", { ascending: false }).limit(500),
            S.sb.from("library").select("*").order("created_at", { ascending: false }).limit(1000)]);
          if (pm.error) throw pm.error; if (jb.error) throw jb.error;
          S.members = pm.data.map(toMember); S.jobs = jb.data.map(toJob); S.library = (lb.data || []).map(toLib);
          const [ev, lk] = await Promise.all([
            S.sb.from("events").select("*").order("event_date", { ascending: true }).limit(200),
            S.sb.from("links").select("*").order("sort", { ascending: true }).order("created_at", { ascending: true }).limit(100)]);
          S.events = (ev.data || []).map(toEvent); S.links = (lk.data || []).map(toLink);
          await NUFX.load();
          await CAR.load();
        }
      }
    } catch (e) { console.error(e); banner("Could not load data: " + (e.message || e), "error", 0); }
    buildCtx();
  }
  function buildCtx() {
    const ms = S.members;
    S.ctx = { designations: uniq(ms.map((m) => m.designation)), departments: uniq(ms.map((m) => m.department)), locations: uniq(ms.map((m) => m.location)),
      skills: uniq([...SKILL_VOCAB, ...ms.flatMap((m) => m.skills.split(/[,;]+/).map((s) => s.trim()))]) };
  }

  /* ---------------- router ---------------- */
  function route() {
    const h = location.hash || "#/";
    let r = ["jobs", "library", "ask", "inbox", "profile", "admin"].find((v) => h.startsWith("#/" + v)) || "home";
    if (["jobs", "library", "ask", "inbox"].includes(r) && !S.isMember) r = "home";
    if (r === "profile" && !S.session && !S.demo) r = "home";
    if (r === "admin" && !S.isStaff) r = "home";
    $$(".view").forEach((v) => (v.hidden = v.id !== "view-" + r));
    $$("#menu a").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
    $("#menu").classList.remove("open");
    if (r === "home" && !h.startsWith("#directory")) window.scrollTo(0, 0);
    if (r !== "home") window.scrollTo(0, 0);
  }

  /* ---------------- render: nav / gate / stats ---------------- */
  function renderNav() {
    $("#authBtn").textContent = S.session ? "Sign out" : "Sign in / Sign up";
    $("#navAdmin").hidden = !S.isStaff; $("#navAdmin a").textContent = S.isAdmin ? "Admin" : "Moderation";
    $("#navHome").hidden = !S.isMember; $("#navJobs").hidden = !S.isMember; $("#navLibrary").hidden = !S.isMember;
    $("#navAsk").hidden = !S.isMember; $("#navInbox").hidden = !S.isMember;
    $("#navProfile").hidden = !(S.session || S.demo);
    $(".menu-btn").hidden = !$$("#menu li").some((li) => !li.hidden);
    $("#foot-mode").textContent = (S.demo ? "Demo mode — connect Supabase (see README)" : (S.session ? "Signed in as " + S.email : "")) + " · site v3.2";
  }

  function renderHome() {
    const m = S.isMember;
    $("#directory").hidden = !m; $("#eventsSec").hidden = !m; $("#newsSec").hidden = !m;
    $("#heroCta").innerHTML = m
      ? `<a class="btn btn-primary" href="#directory">Browse the directory</a><a class="btn btn-ghost" href="#/jobs">View jobs</a>`
      : S.session ? `<a class="btn btn-primary" href="#/profile">${S.me ? "My profile" : "Create my profile"}</a>`
      : `<button class="btn btn-primary" data-act="signin" type="button">Sign in / Sign up</button><p class="hint">Members only. Enter your email and we will send you a one-time code. New here? The same button creates your account.</p>`;
    const g = $("#homeGate");
    g.hidden = m || !S.session || S.demo; g.innerHTML = g.hidden ? "" : gateHtml("the directory, jobs and library");
  }

  function gateHtml(what) {
    if (S.demo) return "";
    if (!S.session) return `<h3>Members only</h3><p>Sign in with the email address you use with NUFHAS to view ${what}.</p><button class="btn btn-brand" data-act="signin">Sign in</button>`;
    if (!S.me) return `<h3>Welcome!</h3><p>You are signed in as <b>${esc(S.email)}</b> but there is no profile for this email yet. Create your profile to request access.</p><a class="btn btn-brand" href="#/profile">Create my profile</a>`;
    return `<h3>Awaiting approval</h3><p>Your profile is saved and waiting for an admin to approve it. You will be able to view ${what} once it is approved.</p><a class="btn btn-line" href="#/profile">Edit my profile</a>`;
  }

  function renderStats() {
    const ap = S.members.filter((m) => m.approved);
    const s = [];
    if (S.isMember) {
      s.push([ap.length, "Members"], [ap.filter(isGold).length, "Chartered Accountants", "gold"],
             [ap.filter((m) => m.caStatus === "Advanced Level").length, "Advanced Level students"], [S.jobs.length, "Jobs posted"]);
    } else if (S.stats) s.push([S.stats.members, "Members"], [S.stats.cas, "Chartered Accountants", "gold"]);
    else s.push([0, "Members"]);
    $("#stats").innerHTML = s.map(([n, l, c]) => `<div class="stat ${c || ""}"><b>${n}</b><span>${l}</span></div>`).join("");
    $("#stats").style.gridTemplateColumns = `repeat(${Math.min(4, s.length)},1fr)`;
  }

  /* ---------------- directory ---------------- */
  const els = {};
  function initDirectory() {
    Object.assign(els, { q: $("#smart"), s: $("#fStatus"), b: $("#fBlood"), d: $("#fDesig"), e: $("#fExp"), o: $("#fSort"), mn: $("#fMentor"), dn: $("#fDonor") });
    CA_STATUSES.forEach((v) => els.s.insertAdjacentHTML("beforeend", `<option>${esc(v)}</option>`));
    BLOODS.forEach((v) => els.b.insertAdjacentHTML("beforeend", `<option>${v}</option>`));
    els.o.innerHTML = `<option value="seniority">Seniority (earliest articleship first)</option><option value="name">Name (A–Z)</option><option value="exp">Experience (most first)</option>`;
    [els.q, els.s, els.b, els.d, els.e, els.o, els.mn, els.dn].forEach((e) => e.addEventListener("input", renderDirectory));
    $("#reset").addEventListener("click", () => { els.q.value = ""; [els.s, els.b, els.d, els.e].forEach((s) => (s.value = "")); els.mn.checked = els.dn.checked = false; els.o.selectedIndex = 0; renderDirectory(); });
    $("#bloodChips").addEventListener("click", (e) => {
      const c = e.target.closest(".bchip"); if (!c) return;
      els.b.value = els.b.value === c.dataset.b ? "" : c.dataset.b; renderDirectory();
    });
    $("#grid").addEventListener("click", (e) => {
      const v = e.target.closest("[data-id]"); if (v) return openProfile(v.dataset.id);
      const c = e.target.closest("[data-cv]"); if (c) openCv(c.dataset.cv);
    });
  }

  function populateFilters() {
    const keep = els.d.value;
    els.d.innerHTML = `<option value="">All designations</option>` + S.ctx.designations.sort().map((v) => `<option>${esc(v)}</option>`).join("");
    els.d.value = keep;
  }

  function renderDirectory() {
    const ap = S.members.filter((m) => m.approved);
    const allowed = S.isMember;
    $("#gate").hidden = allowed; $("#gate").innerHTML = allowed ? "" : gateHtml("the member directory");
    $("#dirWrap").hidden = !allowed;
    if (!allowed) return;

    $("#bloodChips").innerHTML = BLOODS.map((b) => `<button type="button" class="bchip${els.b.value === b ? " on" : ""}" data-b="${b}">${b}<small>${ap.filter((m) => m.bloodGroup === b && (!els.dn.checked || m.donor)).length}</small></button>`).join("");

    const req = parseQuery(els.q.value, S.ctx);
    const hasQ = els.q.value.trim().length > 0;
    $("#parsed").innerHTML = !hasQ ? "" : req.chips.length
      ? `Understood: ${req.chips.map((c) => `<span class="pchip">${esc(c)}</span>`).join("")}${req.terms.length ? ` <span class="muted">+ words: ${esc(req.terms.join(", "))}</span>` : ""}`
      : `<span class="muted">Plain text search</span>`;

    let list = ap.map((m) => ({ m, r: matchMember(req, m) })).filter((x) => x.r.pass)
      .filter((x) => !els.s.value || x.m.caStatus === els.s.value)
      .filter((x) => !els.b.value || x.m.bloodGroup === els.b.value)
      .filter((x) => !els.d.value || x.m.designation === els.d.value)
      .filter((x) => !els.e.value || (expYears(x.m) ?? -1) >= +els.e.value)
      .filter((x) => !els.mn.checked || x.m.mentor)
      .filter((x) => !els.dn.checked || x.m.donor);

    const sort = els.o.value;
    list.sort((a, b) => (hasQ && hasStructuredReq(req) ? b.r.score - a.r.score : 0) ||
      (sort === "name" ? a.m.name.localeCompare(b.m.name) : sort === "exp" ? (expYears(b.m) ?? -1) - (expYears(a.m) ?? -1) : byStart(a.m, b.m)));

    $("#count").textContent = `${list.length} of ${ap.length} members`;
    $("#empty").style.display = list.length ? "none" : "block";
    $("#grid").innerHTML = list.map(({ m, r }) => cardHtml(m, r, hasQ && hasStructuredReq(req))).join("");
  }
  const hasStructuredReq = (r) => r.chips.length > 0;

  function cardHtml(m, r, showMatch) {
    const exp = expYears(m);
    return `<article class="card${isGold(m) ? " gold" : ""}">
      ${isGold(m) ? '<span class="ribbon">★ Chartered Accountant</span>' : ""}
      <div class="card-top">${avatar(m)}<div><h3>${esc(m.name)}</h3><div class="desig">${esc(m.designation)}</div></div></div>
      <div class="org">${esc(m.company)}</div>
      <div class="chips">
        <span class="chip ${isGold(m) ? "goldchip" : "ca"}">${isGold(m) ? "★ " : ""}${esc(statusLabel(m))}</span>
        ${m.bloodGroup ? `<span class="chip blood">🩸 ${esc(m.bloodGroup)}</span>` : ""}
        ${exp != null ? `<span class="chip exp">⏱ ${exp.toFixed(1)} yrs</span>` : ""}
        ${m.mentor ? `<span class="chip mentor">🎓 Mentor</span>` : ""}${m.donor ? `<span class="chip donor">❤ Donor</span>` : ""}
      </div>
      <div class="meta">
        <div>Department: <b>${esc(m.department) || "—"}</b></div>
        <div>Articleship: ${esc(artText(m))}${artStatus(m) ? ` <span class="muted">(${artStatus(m)})</span>` : ""}</div>
        ${m.location ? `<div>Location: ${esc(m.location)}</div>` : ""}
      </div>
      ${showMatch ? `<div class="matchline"><span class="match">${r.score}% match</span> ${esc(r.why.slice(0, 4).join(" · "))}</div>` : ""}
      <div class="card-actions">
        <button class="btn btn-dark btn-sm" data-id="${esc(m.id)}">View profile</button>
        ${m.cvPath ? `<button class="btn btn-line btn-sm" data-cv="${esc(m.cvPath)}">CV ↗</button>` : `<span class="cvpending">CV pending</span>`}
      </div></article>`;
  }

  function openSheet(html) { $("#sheet").innerHTML = `<button class="close" aria-label="Close">×</button>` + html; $("#modal").classList.add("open"); }
  const closeSheet = () => $("#modal").classList.remove("open");

  function openProfile(id) {
    const m = S.members.find((x) => String(x.id) === String(id)); if (!m) return;
    const row = (k, v) => `<dt>${k}</dt><dd>${v || "—"}</dd>`;
    const exp = expYears(m), own = !!(S.me && S.me.id === m.id), seeAll = own || S.isAdmin;
    const showPhone = m.phone && (!m.hidePhone || seeAll), showEmail = m.email && (!m.hideEmail || seeAll);
    openSheet(`
      <div class="head ${isGold(m) ? "goldhead" : ""}">${avatar(m)}<div><h2 style="font-size:1.5rem">${esc(m.name)}</h2><div class="desig">${esc(m.designation)}</div>
        ${isGold(m) ? '<span class="chip goldchip" style="margin-top:6px;display:inline-block">★ Chartered Accountant</span>' : ""}</div></div>
      ${m.about ? `<p style="margin:0;color:var(--ink-2)">${esc(m.about)}</p>` : ""}
      <dl>
        ${row("Current organization", esc(m.company))}
        ${row("Department", esc(m.department))}
        ${row("CA status", esc(statusLabel(m)))}
        ${row("Articleship start", esc(fmt(m.articleshipStart)))}
        ${row("Articleship end", esc(fmt(m.articleshipEnd)))}
        ${row("Experience", exp != null ? exp.toFixed(1) + " yrs (since articleship start)" : "")}
        ${row("Skills", esc(m.skills))}
        ${row("Blood group", esc(m.bloodGroup))}
        ${row("Location", esc(m.location))}
        ${row("Blood donor", m.donor ? "Willing to be contacted in emergencies" : "")}
        ${row("Mentoring", m.mentor ? esc(m.mentorTopics || "Available to mentor students") : "")}
        ${row("Phone", showPhone ? `<button class="link-btn" id="reveal">Click to reveal number</button>` : (m.phone ? "Hidden by member" : ""))}
        ${row("Email", showEmail ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : (m.email ? "Hidden — use Send message" : ""))}
      </dl>
      ${CAR.timelineHtml(m)}
      <div class="row">
        ${m.cvPath ? `<button class="btn btn-dark btn-sm" data-cv="${esc(m.cvPath)}">View CV</button><button class="btn btn-line btn-sm" data-cv="${esc(m.cvPath)}" data-dl="1">Download CV</button>` : `<span class="cvpending">CV not uploaded yet</span>`}
        ${m.linkedin ? `<a class="btn btn-line btn-sm" href="${esc(m.linkedin)}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}
        ${!own && !S.demo ? `<button class="btn btn-brand btn-sm" data-msg="${esc(m.id)}">Send message</button>` : ""}
        ${!own && !S.demo && m.mentor ? `<button class="btn btn-line btn-sm" data-msg="${esc(m.id)}" data-kind="mentorship">Request mentorship</button>` : ""}
      </div>`);
    const rv = $("#reveal", $("#sheet"));
    if (rv) rv.addEventListener("click", (ev) => { ev.target.outerHTML = `<a href="tel:${esc(tel(m.phone))}">${esc(m.phone)}</a>`; });
  }

  async function openCv(path, download, bucket = "cvs") {
    if (S.demo || !S.sb) return banner("CV storage works after Supabase is connected.", "info");
    const w = window.open("", "_blank");
    const { data, error } = await S.sb.storage.from(bucket).createSignedUrl(path, 300, download ? { download: true } : undefined);
    if (error || !data) { if (w) w.close(); return banner("Could not open the CV: " + (error?.message || "unknown error"), "error"); }
    if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
  }

  /* ---------------- jobs ---------------- */
  function initJobs() {
    ["#jSearch", "#jType", "#jExp", "#jSaved"].forEach((s) => $(s).addEventListener("input", renderJobs));
    $("#postJob").addEventListener("click", openJobForm);
    $("#jobsList").addEventListener("click", async (e) => {
      const f = e.target.closest("[data-find]"), d = e.target.closest("[data-del]");
      if (f) { const j = S.jobs.find((x) => x.id === f.dataset.find); location.hash = "#/"; els.q.value = jobToQuery(j); renderDirectory(); setTimeout(() => $("#directory").scrollIntoView({ behavior: "smooth" }), 50); }
      if (d && confirm("Delete this job post?")) {
        if (S.demo) return banner("Demo mode: nothing to delete.", "info");
        const { error } = await S.sb.from("jobs").delete().eq("id", d.dataset.del);
        if (error) return banner(error.message, "error");
        await loadAll(); renderAll(); banner("Job deleted.", "ok");
      }
    });
  }

  const expRange = (j) => j.expMax ? `${+j.expMin || 0}–${+j.expMax} yrs` : (+j.expMin ? `${+j.expMin}+ yrs` : "Fresher OK");
  const isClosed = (j) => j.deadline && new Date(j.deadline + "T23:59:59") < today;
  const applyHref = (c) => /^https?:\/\//i.test(c) ? c : c.includes("@") ? "mailto:" + c : "";

  function renderJobs() {
    const ok = S.isMember;
    $("#jobsGate").hidden = ok; $("#jobsGate").innerHTML = ok ? "" : gateHtml("jobs");
    $("#jobsWrap").hidden = !ok; $("#postJob").hidden = !ok;
    if (!ok) return;
    const q = $("#jSearch").value.trim().toLowerCase(), t = $("#jType").value, e = $("#jExp").value;
    let list = S.jobs.filter((j) => (!q || [j.title, j.company, j.skills, j.location, j.description].join(" ").toLowerCase().includes(q)) &&
      (!t || j.jobType === t) && (e === "" || (e === "0" ? (+j.expMin || 0) <= 1 : (+j.expMin || 0) >= +e)) &&
      (!$("#jSaved").checked || NUFX.marked(j.id, "save")));
    list.sort((a, b) => (isClosed(a) - isClosed(b)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    $("#jCount").textContent = `${list.length} job${list.length === 1 ? "" : "s"}`;
    $("#jEmpty").style.display = list.length ? "none" : "block";
    const mine = S.me || (S.demo ? S.members[0] : null);
    $("#jobsList").innerHTML = list.map((j) => {
      const fit = mine ? jobFit(j, mine) : null;
      const href = applyHref(j.applyContact);
      const own = !!(S.email && j.postedBy.toLowerCase() === S.email), owner = S.isStaff || own;
      const nInt = own ? NUFX.interested(j.id).length : 0;
      return `<article class="card job${isClosed(j) ? " closed" : ""}">
        <div class="job-head"><div><h3>${esc(j.title)}</h3><div class="org">${esc(j.company)}${j.location ? " · " + esc(j.location) : ""}</div></div>
          ${fit ? `<span class="match ${fit.pass ? "" : "low"}">${fit.pass ? fit.score + "% fit" : "Below requirement"}</span>` : ""}</div>
        <div class="chips"><span class="chip ca">${esc(j.jobType)}</span><span class="chip exp">⏱ ${expRange(j)}</span>
          ${j.caStatus ? `<span class="chip ${j.caStatus === "Chartered Accountant" ? "goldchip" : "loc"}">${esc(j.caStatus)}</span>` : ""}
          ${j.deadline ? `<span class="chip">${isClosed(j) ? "Closed" : "Apply by " + esc(fmt(j.deadline))}</span>` : ""}</div>
        ${j.skills ? `<div class="chips">${j.skills.split(/[,;]+/).map((s) => `<span class="chip skill">${esc(s.trim())}</span>`).join("")}</div>` : ""}
        <p class="jdesc">${esc(j.description)}</p>
        <div class="meta">Posted by ${esc(j.postedByName || j.postedBy)} · ${esc(fmt((j.createdAt || "").slice(0, 10)))}</div>
        <div class="card-actions">
          ${href ? `<a class="btn btn-dark btn-sm" href="${esc(href)}" target="_blank" rel="noopener">Apply</a>` : `<span class="muted">Apply: ${esc(j.applyContact)}</span>`}
          ${S.demo ? "" : `<button class="btn btn-line btn-sm" data-mark="save" data-job="${esc(j.id)}">${NUFX.marked(j.id, "save") ? "★ Saved" : "☆ Save"}</button>`}
          ${!S.demo && !own ? `<button class="btn btn-line btn-sm" data-mark="interested" data-job="${esc(j.id)}">${NUFX.marked(j.id, "interested") ? "✓ Interested" : "I'm interested"}</button>` : ""}
          ${own ? `<button class="btn btn-line btn-sm" data-int="${esc(j.id)}">Interested (${nInt})</button>` : ""}
          ${owner ? `<button class="btn btn-line btn-sm" data-find="${esc(j.id)}">Find candidates</button><button class="btn btn-line btn-sm" data-del="${esc(j.id)}">Delete</button>` : ""}
          ${!own && !S.demo ? `<button class="link-btn" data-report="job" data-id="${esc(j.id)}" data-label="${esc(j.title)}">Report</button>` : ""}
        </div></article>`;
    }).join("");
  }

  function openJobForm() {
    if (S.demo) return banner("Posting jobs works after Supabase is connected (see README).", "info");
    openSheet(`<h2 style="font-size:1.4rem;margin-bottom:12px">Post a job</h2>
      <form class="pf" id="jobForm">
        <label class="full">Job title *<input name="title" required></label>
        <label>Company *<input name="company" required value="${esc(S.me?.company || "")}"></label>
        <label>Location<input name="location"></label>
        <label>Type<select name="job_type">${JOB_TYPES.map((t) => `<option>${t}</option>`).join("")}</select></label>
        <label>Required status<select name="ca_status"><option value="">Any</option>${CA_STATUSES.map((t) => `<option>${t}</option>`).join("")}</select></label>
        <label>Min experience (yrs)<input name="exp_min" type="number" min="0" step="0.5" value="0"></label>
        <label>Max experience (yrs)<input name="exp_max" type="number" min="0" step="0.5" placeholder="optional"></label>
        <label class="full">Skills (comma-separated)<input name="skills" placeholder="IFRS, Excel, Tax"></label>
        <label class="full">Description<textarea name="description" rows="4"></textarea></label>
        <label>Apply via (email or link) *<input name="apply_contact" required></label>
        <label>Deadline<input name="deadline" type="date"></label>
        <label class="consent full"><input type="checkbox" name="notify"> Email members about this job (use for important openings; the number of emails per day is limited)</label>
        <button class="btn btn-brand full" type="submit">Publish job</button>
        <div class="formmsg full" id="jobMsg"></div>
      </form>`);
    $("#jobForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      const row = { title: f.title.trim(), company: f.company.trim(), location: f.location.trim() || null, job_type: f.job_type, ca_status: f.ca_status || null,
        exp_min: f.exp_min === "" ? 0 : +f.exp_min, exp_max: f.exp_max === "" ? null : +f.exp_max, skills: f.skills.trim() || null,
        description: f.description.trim() || null, apply_contact: f.apply_contact.trim(), deadline: f.deadline || null, notify: f.notify === "on",
        posted_by: S.email, posted_by_name: S.me?.name || S.email };
      if (row.exp_max != null && row.exp_max < row.exp_min) return ($("#jobMsg").textContent = "Max experience must be ≥ min.");
      const { error } = await S.sb.from("jobs").insert(row);
      if (error) return ($("#jobMsg").textContent = error.message);
      closeSheet(); await loadAll(); renderAll(); banner("Job published.", "ok");
    });
  }

  /* ---------------- library (past papers + exam notes) ---------------- */
  const SUBJECT_HINTS = ["Financial Accounting and Reporting (FAR)", "Business Planning: Taxation & Compliance (BPTC)", "Corporate Laws & Practices", "Strategic Business Management & Leadership (SBM&L)"];

  function initLibrary() {
    ["#lSearch", "#lKind", "#lLevel", "#lSubject", "#lYear"].forEach((s) => $(s).addEventListener("input", renderLibrary));
    $("#addLib").addEventListener("click", openLibForm);
    $("#libList").addEventListener("click", async (e) => {
      const o = e.target.closest("[data-open]"), d = e.target.closest("[data-ldel]");
      if (o) return openCv(o.dataset.open, false, "library");
      if (d && confirm("Delete this item?")) {
        if (S.demo) return banner("Demo mode: nothing to delete.", "info");
        const it = S.library.find((x) => x.id === d.dataset.ldel);
        const { error } = await S.sb.from("library").delete().eq("id", d.dataset.ldel);
        if (error) return banner(error.message, "error");
        if (it && it.filePath) S.sb.storage.from("library").remove([it.filePath]);
        await loadAll(); renderAll(); banner("Deleted.", "ok");
      }
    });
  }

  function renderLibrary() {
    const ok = S.isMember;
    $("#libGate").hidden = ok; $("#libGate").innerHTML = ok ? "" : gateHtml("the library");
    $("#libWrap").hidden = !ok; $("#addLib").hidden = !ok;
    if (!ok) return;
    const fillSel = (sel, vals, label) => { const keep = sel.value; sel.innerHTML = `<option value="">${label}</option>` + vals.map((v) => `<option>${esc(v)}</option>`).join(""); sel.value = keep; };
    fillSel($("#lSubject"), uniq(S.library.map((x) => x.subject)).sort(), "All subjects");
    fillSel($("#lYear"), uniq(S.library.map((x) => x.year && String(x.year))).sort().reverse(), "Any year");
    const q = $("#lSearch").value.trim().toLowerCase(), k = $("#lKind").value, lv = $("#lLevel").value, sb = $("#lSubject").value, yr = $("#lYear").value;
    const list = S.library.filter((x) => (!q || [x.title, x.subject, x.description, x.byName].join(" ").toLowerCase().includes(q)) &&
      (!k || x.kind === k) && (!lv || x.level === lv) && (!sb || x.subject === sb) && (!yr || String(x.year) === yr));
    $("#lCount").textContent = `${list.length} item${list.length === 1 ? "" : "s"}`;
    $("#lEmpty").style.display = list.length ? "none" : "block";
    $("#libList").innerHTML = list.map((x) => {
      const mine = !!(S.email && x.by.toLowerCase() === S.email), owner = S.isStaff || mine;
      const open = x.filePath ? `<button class="btn btn-dark btn-sm" data-open="${esc(x.filePath)}">Open PDF</button>`
        : `<a class="btn btn-dark btn-sm" href="${esc(safeUrl(x.linkUrl))}" target="_blank" rel="noopener">Open link ↗</a>`;
      return `<article class="card"><div class="chips"><span class="chip ${x.kind === "Past Paper" ? "ca" : "loc"}">${esc(x.kind)}</span>
          ${x.level ? `<span class="chip">${esc(x.level)}</span>` : ""}${x.year ? `<span class="chip exp">${esc(x.year)}</span>` : ""}</div>
        <h3>${esc(x.title)}</h3><div class="org">${esc(x.subject)}</div>
        ${x.description ? `<p class="jdesc">${esc(x.description)}</p>` : ""}
        <div class="meta">Shared by ${esc(x.byName || x.by)} · ${esc(fmt((x.createdAt || "").slice(0, 10)))}</div>
        <div class="card-actions">${open}${owner ? `<button class="btn btn-line btn-sm" data-ldel="${esc(x.id)}">Delete</button>` : ""}
          ${!mine && !S.demo ? `<button class="link-btn" data-report="library" data-id="${esc(x.id)}" data-label="${esc(x.title)}">Report</button>` : ""}</div></article>`;
    }).join("");
  }

  function openLibForm() {
    if (S.demo) return banner("Uploading works after Supabase is connected (see README).", "info");
    const subs = uniq([...SUBJECT_HINTS, ...S.library.map((x) => x.subject)]);
    openSheet(`<h2 style="font-size:1.4rem;margin-bottom:12px">Add past paper / exam notes</h2>
      <form class="pf" id="libForm">
        <label>Type *<select name="kind"><option>Past Paper</option><option>Exam Notes</option></select></label>
        <label>Level<select name="level"><option value="">—</option><option>Certificate Level</option><option>Professional Level</option><option>Advanced Level</option></select></label>
        <label class="full">Subject *<input name="subject" required list="subjHints" placeholder="e.g. Financial Accounting and Reporting (FAR)"></label>
        <datalist id="subjHints">${subs.map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
        <label>Exam year / session<input name="year" type="number" min="2000" max="2100" placeholder="2025"></label>
        <label>Title (optional)<input name="title" placeholder="Auto: subject + year"></label>
        <label class="full">Description<textarea name="description" rows="2" placeholder="Short note, e.g. solved, chapter list"></textarea></label>
        <label class="full">PDF file (max 50 MB)<input name="file" type="file" accept="application/pdf"></label>
        <label class="full">…or a link (Google Drive etc.) if you are not uploading a file<input name="link" placeholder="https://"></label>
        <label class="consent full"><input type="checkbox" required> I have the right to share this material with NUFHAS Alumni members.</label>
        <button class="btn btn-brand full" type="submit">Add to library</button>
        <div class="formmsg full" id="libMsg"></div>
      </form>`);
    $("#libForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), f = Object.fromEntries(fd.entries()), file = fd.get("file"), msg = $("#libMsg");
      const hasFile = file && file.size > 0, link = f.link.trim();
      if (!hasFile && !/^https?:\/\//i.test(link)) return (msg.textContent = "Choose a PDF file or paste a link starting with https://");
      if (hasFile && file.type !== "application/pdf") return (msg.textContent = "Only PDF files are allowed.");
      if (hasFile && file.size > 50 * 1024 * 1024) return (msg.textContent = "The PDF must be 50 MB or smaller.");
      msg.textContent = "Uploading…";
      let path = null;
      try {
        if (hasFile) {
          const folder = S.me ? S.me.id : "admin", safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(-60);
          path = `${folder}/${Date.now()}-${safe}`;
          const up = await S.sb.storage.from("library").upload(path, file, { contentType: "application/pdf" });
          if (up.error) throw up.error;
        }
        const year = f.year ? +f.year : null;
        const row = { title: f.title.trim() || `${f.subject.trim()}${year ? " " + year : ""} — ${f.kind}`, kind: f.kind, level: f.level || null, subject: f.subject.trim(),
          year, description: f.description.trim() || null, file_path: path, link_url: hasFile ? null : link, uploaded_by: S.email, uploaded_by_name: S.me?.name || S.email };
        const ins = await S.sb.from("library").insert(row);
        if (ins.error) { if (path) S.sb.storage.from("library").remove([path]); throw ins.error; }
        closeSheet(); await loadAll(); renderAll(); banner("Added to the library.", "ok");
      } catch (err) { msg.textContent = err.message || String(err); }
    });
  }

  /* ---------------- my profile ---------------- */
  function renderProfile() {
    const gate = $("#profileGate"), wrap = $("#profileWrap");
    if (S.demo) { gate.hidden = false; gate.innerHTML = `<h3>Demo mode</h3><p>Profiles, photo and CV upload work after you connect Supabase (see README).</p>`; wrap.hidden = true; return; }
    if (!S.session) { gate.hidden = false; gate.innerHTML = gateHtml("your profile"); wrap.hidden = true; return; }
    gate.hidden = true; wrap.hidden = false;
    const m = S.me || { email: S.email, company: "Nurul Faruk Hasan & Co", name: "" };
    const o = (list, v, blank) => (blank ? `<option value="">${blank}</option>` : "") + list.map((x) => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("");
    const state = !S.me ? ["warn", "New profile — fill in your details and save. An admin will approve it before it appears in the directory."]
      : m.approved ? ["ok", "Your profile is approved and visible to members."] : ["warn", "Saved. Waiting for admin approval."];
    wrap.innerHTML = `
      <div class="notice ${state[0]}">${state[1]}</div>
      ${S.me ? (() => { const c = completeness(S.me); return `<div class="card prog"><div class="row-between"><b>Profile completeness</b><b>${c.pct}%</b></div><div class="bar-track"><div class="bar-fill" style="width:${c.pct}%"></div></div>${c.missing.length ? `<p class="muted" style="margin:8px 0 0;font-size:.86rem">Still missing: ${esc(c.missing.join(", "))}</p>` : `<p class="muted" style="margin:8px 0 0;font-size:.86rem">Your profile is complete. Thank you!</p>`}</div>`; })() : ""}
      <form class="pf card" id="profForm">
        <label>Full name *<input name="name" required value="${esc(m.name)}"></label>
        <label>Email (login)<input value="${esc(m.email)}" disabled></label>
        <label>Current organization<input name="company" value="${esc(m.company)}"></label>
        <label>Department<input name="department" value="${esc(m.department || "")}"></label>
        <label>Designation<input name="designation" value="${esc(m.designation || "")}"></label>
        <label>Location<input name="location" value="${esc(m.location || "")}"></label>
        <label>Mobile number<input name="phone" type="tel" value="${esc(m.phone || "")}"></label>
        <label>Blood group<select name="blood_group">${o(BLOODS, m.bloodGroup, "Select")}</select></label>
        <label>CA status<select name="ca_status" id="pStatus">${o(CA_STATUSES, m.caStatus, "Select")}</select></label>
        <label id="subjWrap">Subjects cleared (shown in brackets)<input name="subjects" id="pSubj" type="number" min="0" max="20" value="${m.subjects ?? ""}"></label>
        <label>Articleship start date<input name="start" type="date" value="${esc(m.articleshipStart || "")}"></label>
        <label>Articleship end date<input name="end" type="date" value="${esc(m.articleshipEnd || "")}"></label>
        <label class="full">Skills (comma-separated, used by Smart Talent Search)<input name="skills" placeholder="IFRS, Audit, Excel, Tax" value="${esc(m.skills || "")}"></label>
        <label class="full">LinkedIn URL<input name="linkedin" type="url" placeholder="https://" value="${esc(m.linkedin || "")}"></label>
        <label class="full">About you<textarea name="about" rows="3" maxlength="500">${esc(m.about || "")}</textarea></label>
        <div class="full optbox"><b>Community options</b>
          <label class="consent"><input type="checkbox" name="notify_email"${m.notify !== false ? " checked" : ""}> Email me when a new job or event is posted</label>
          <label class="consent"><input type="checkbox" name="blood_donor"${m.donor ? " checked" : ""}> I am willing to be contacted as a blood donor in emergencies</label>
          <label class="consent"><input type="checkbox" name="mentor" id="pMentor"${m.mentor ? " checked" : ""}> I can mentor current students</label>
          <label id="mtWrap">Mentoring topics (e.g. BPTC, Articleship, Audit career)<input name="mentor_topics" maxlength="120" value="${esc(m.mentorTopics || "")}"></label>
          <label class="consent"><input type="checkbox" name="hide_phone"${m.hidePhone ? " checked" : ""}> Hide my phone number from other members</label>
          <label class="consent"><input type="checkbox" name="hide_email"${m.hideEmail ? " checked" : ""}> Hide my email address (members can still message me through the site)</label>
        </div>
        <label class="consent full"><input type="checkbox" required checked> I consent to my details being shown to approved NUFHAS Alumni members.</label>
        <button class="btn btn-brand full" type="submit">Save profile</button>
        <div class="formmsg full" id="profMsg"></div>
      </form>
      <div class="card uploads">
        <h3>Photo &amp; CV</h3>
        ${S.me ? `
        <div class="up"><div>${avatar(m)}</div><div><b>Profile picture</b><div class="muted">JPG/PNG, resized automatically</div>
          <input type="file" id="photoFile" accept="image/jpeg,image/png,image/webp"></div></div>
        <div class="up"><div class="cvbox">${m.cvPath ? "📄" : "—"}</div><div><b>CV (PDF, max 5 MB)</b>
          <div class="muted">${m.cvPath ? "CV uploaded ✔ — choose a new file to replace it" : "Not uploaded yet"}</div>
          <input type="file" id="cvFile" accept="application/pdf"></div></div>
        <div class="formmsg" id="upMsg"></div>` : `<p class="muted">Save your profile first, then upload your photo and CV here.</p>`}
      </div>
      <div class="card uploads" style="margin-top:16px"><h3>Password</h3>
        <p class="muted">Set or change a password so you can sign in without waiting for a code.</p>
        <form class="pf" id="pwForm"><label>New password (8+ characters)<input type="password" name="pw" required minlength="8" autocomplete="new-password"></label>
          <label>Repeat password<input type="password" name="pw2" required minlength="8" autocomplete="new-password"></label>
          <button class="btn btn-line full" type="submit">Save password</button><div class="formmsg full" id="pwMsg"></div></form>
      </div>`;
    if (S.me) CAR.mount(wrap);
    const toggle = () => { $("#subjWrap").hidden = !LEVEL_STATUSES.includes($("#pStatus").value); };
    $("#pStatus").addEventListener("input", toggle); toggle();
    const mtoggle = () => { $("#mtWrap").hidden = !$("#pMentor").checked; };
    $("#pMentor").addEventListener("input", mtoggle); mtoggle();
    $("#profForm").addEventListener("submit", saveProfile);
    $("#pwForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries()), m = $("#pwMsg");
      if (f.pw !== f.pw2) { m.style.color = "#8a1f17"; return (m.textContent = "The two passwords do not match."); }
      const { error } = await S.sb.auth.updateUser({ password: f.pw });
      m.style.color = error ? "#8a1f17" : "#1f6b2a"; m.textContent = error ? error.message : "Password saved. You can now sign in with it.";
      if (!error) e.target.reset();
    });
    if (S.me) { $("#photoFile").addEventListener("change", uploadPhoto); $("#cvFile").addEventListener("change", uploadCv); }
  }

  async function saveProfile(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries()), msg = $("#profMsg");
    if (f.start && f.end && f.end < f.start) return (msg.textContent = "Articleship end date cannot be before the start date.");
    if (f.blood_donor && !f.blood_group) return (msg.textContent = "Choose your blood group to register as a blood donor.");
    const lvl = LEVEL_STATUSES.includes(f.ca_status);
    const row = { name: f.name.trim(), company: f.company.trim() || null, department: f.department.trim() || null, designation: f.designation.trim() || null,
      location: f.location.trim() || null, phone: f.phone.trim() || null, blood_group: f.blood_group || null, ca_status: f.ca_status || null,
      subjects_cleared: lvl && f.subjects !== "" ? +f.subjects : null, articleship_start: f.start || null, articleship_end: f.end || null,
      skills: f.skills.trim() || null, linkedin: f.linkedin.trim() || null, about: f.about.trim() || null,
      notify_email: f.notify_email === "on", blood_donor: f.blood_donor === "on", mentor: f.mentor === "on",
      mentor_topics: f.mentor === "on" ? (f.mentor_topics || "").trim() || null : null, hide_phone: f.hide_phone === "on", hide_email: f.hide_email === "on" };
    msg.textContent = "Saving…";
    const res = S.me ? await S.sb.from("profiles").update(row).eq("id", S.me.id) : await S.sb.from("profiles").insert({ ...row, email: S.email });
    if (res.error) return (msg.textContent = res.error.message);
    await loadAll(); renderAll(); banner("Profile saved.", "ok");
  }

  function resizeImage(file, max) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => { URL.revokeObjectURL(url); b ? res(b) : rej(new Error("Image conversion failed")); }, "image/jpeg", 0.85);
      };
      img.onerror = () => rej(new Error("That file is not a valid image"));
      img.src = url;
    });
  }

  async function replaceFile(bucket, col, oldPath, newPath, blob, type) {
    const up = await S.sb.storage.from(bucket).upload(newPath, blob, { contentType: type, upsert: true });
    if (up.error) throw up.error;
    const u = await S.sb.from("profiles").update({ [col]: newPath }).eq("id", S.me.id);
    if (u.error) throw u.error;
    if (oldPath) S.sb.storage.from(bucket).remove([oldPath]);
  }

  async function uploadPhoto(e) {
    const file = e.target.files[0]; if (!file) return;
    const msg = $("#upMsg"); msg.textContent = "Uploading photo…";
    try {
      const blob = await resizeImage(file, 600);
      await replaceFile("avatars", "photo_path", S.me.photoPath, `${S.me.id}/photo-${Date.now()}.jpg`, blob, "image/jpeg");
      await loadAll(); renderAll(); banner("Photo updated.", "ok");
    } catch (err) { msg.textContent = err.message || String(err); }
  }

  async function uploadCv(e) {
    const file = e.target.files[0]; if (!file) return;
    const msg = $("#upMsg");
    if (file.type !== "application/pdf") return (msg.textContent = "Please choose a PDF file.");
    if (file.size > 5 * 1024 * 1024) return (msg.textContent = "The CV must be 5 MB or smaller.");
    msg.textContent = "Uploading CV…";
    try {
      await replaceFile("cvs", "cv_path", S.me.cvPath, `${S.me.id}/cv-${Date.now()}.pdf`, file, "application/pdf");
      await loadAll(); renderAll(); banner("CV uploaded.", "ok");
    } catch (err) { msg.textContent = err.message || String(err); }
  }

  /* ---------------- auth ---------------- */
  function openAuth(mode = "signin") {
    if (S.demo) return banner("Login is available after you connect Supabase (see README).", "info");
    const T = { signin: "Sign in", signup: "Create account", code: "Email code" };
    const tabs = `<div class="tabs">${Object.entries(T).map(([k, v]) => `<button type="button" class="tab${k === mode ? " on" : ""}" data-m="${k}">${v}</button>`).join("")}</div>`;
    const em = `<label class="full">Email<input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>`;
    const pw = (n, label, auto) => `<label class="full">${label}<input type="password" name="${n}" required minlength="8" autocomplete="${auto}"></label>`;
    const msg = `<div class="formmsg full" id="authMsg"></div>`;
    const forms = {
      signin: `${em}${pw("password", "Password", "current-password")}<button class="btn btn-brand full" type="submit">Sign in</button>${msg}
        <p class="muted full" style="margin:0;font-size:.85rem">No password yet, or forgot it? Use the <b>Email code</b> tab once, then set a new password under <b>My profile</b>.</p>`,
      signup: `${em}${pw("password", "Choose a password (8+ characters)", "new-password")}${pw("password2", "Repeat password", "new-password")}<button class="btn btn-brand full" type="submit">Create account</button>${msg}
        <p class="muted full" style="margin:0;font-size:.85rem">We will email a code to confirm your address.</p>`,
      code: `${em}<button class="btn btn-brand full" type="submit">Send code</button>${msg}
        <p class="muted full" style="margin:0;font-size:.85rem">We email a one-time code. No password needed.</p>`
    };
    openSheet(`<h2 style="font-size:1.4rem">Welcome</h2>${tabs}<form class="pf" id="authForm">${forms[mode]}</form>`);
    $$("#sheet .tab").forEach((b) => b.addEventListener("click", () => openAuth(b.dataset.m)));
    $("#authForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries()), email = f.email.trim().toLowerCase(), m = $("#authMsg");
      m.textContent = "Please wait…";
      const redirect = location.origin + location.pathname;
      if (mode === "signin") {
        const { error } = await S.sb.auth.signInWithPassword({ email, password: f.password });
        if (error) return (m.textContent = /invalid login/i.test(error.message) ? "Wrong email or password. No password yet? Use the Email code tab." : error.message);
        return closeSheet();
      }
      if (mode === "signup") {
        if (f.password !== f.password2) return (m.textContent = "The two passwords do not match.");
        const { error } = await S.sb.auth.signUp({ email, password: f.password, options: { emailRedirectTo: redirect } });
        if (error) return (m.textContent = error.message);
        return askCode(email, "signup");
      }
      const { error } = await S.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirect } });
      if (error) return (m.textContent = error.message);
      askCode(email, "email");
    });
  }

  function askCode(email, type) {
    $("#sheet").innerHTML = `<button class="close" aria-label="Close">×</button><h2 style="font-size:1.4rem">Enter your code</h2>
      <p class="muted">We sent a code to <b>${esc(email)}</b>. Check your spam folder too.</p>
      <form class="pf" id="codeForm"><label class="full">Code<input name="token" inputmode="numeric" autocomplete="one-time-code" required maxlength="10" placeholder="123456"></label>
        <button class="btn btn-brand full" type="submit">Verify &amp; continue</button><div class="formmsg full" id="codeMsg"></div>
        ${type === "signup" ? `<p class="muted full" style="margin:0;font-size:.85rem">No email after a few minutes? You may already have an account: use the <b>Email code</b> tab to sign in.</p>` : ""}</form>`;
    $("#codeForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const token = new FormData(e.target).get("token").trim(), m = $("#codeMsg");
      m.textContent = "Verifying…";
      const r = await S.sb.auth.verifyOtp({ email, token, type });
      if (r.error) return (m.textContent = r.error.message);
      closeSheet();
      if (type === "signup") banner("Account created. You can now sign in with your password.", "ok");
    });
  }

  /* ---------------- events + quick links ---------------- */
  function renderEvents() {
    const up = S.events.filter((e) => e.date >= todayIso()).slice(0, 8);
    $("#events").innerHTML = up.length ? up.map((ev) => {
      const d = new Date(ev.date + "T00:00:00"), meta = [ev.time, ev.place, ev.tag].filter(Boolean).join(" · ");
      return `<div class="evcard" data-ev="${esc(ev.id)}" role="button" tabindex="0" aria-label="Event details: ${esc(ev.title)}">
        ${ev.bannerPath ? `<img class="ebanner" src="${esc(bannerUrl(ev.bannerPath))}" alt="" loading="lazy">` : ""}
        <div class="event"><div class="date"><b>${d.getDate()}</b><span>${d.toLocaleDateString("en-GB", { month: "short" })}</span></div>
        <div><h3>${esc(ev.title)}</h3><p>${esc(meta)}</p></div><span class="more">Details →</span></div></div>`;
    }).join("") : `<p class="muted">No upcoming events yet.</p>`;
  }
  function openEvent(id) {
    const ev = S.events.find((x) => String(x.id) === String(id)); if (!ev) return;
    openSheet(`${ev.bannerPath ? `<img class="ebanner big" src="${esc(bannerUrl(ev.bannerPath))}" alt="">` : ""}
      <h2 style="font-size:1.5rem;margin:14px 0 8px">${esc(ev.title)}</h2>
      <div class="chips"><span class="chip ca">📅 ${esc(fmt(ev.date))}${ev.time ? " · " + esc(ev.time) : ""}</span>
        ${ev.place ? `<span class="chip loc">📍 ${esc(ev.place)}</span>` : ""}${ev.tag ? `<span class="chip">${esc(ev.tag)}</span>` : ""}</div>
      ${ev.description ? `<p class="edesc">${esc(ev.description)}</p>` : `<p class="muted" style="margin:14px 0">More details coming soon.</p>`}
      ${ev.link ? `<a class="btn btn-brand" href="${esc(safeUrl(ev.link))}" target="_blank" rel="noopener">Register / more info ↗</a>` : ""}`);
  }
  function renderLinks() {
    $("#resources").innerHTML = S.links.length ? S.links.map((r) => {
      const u = safeUrl(r.link), ext = /^https?:/i.test(u);
      return `<a href="${esc(u)}"${ext ? ' target="_blank" rel="noopener"' : ""}><b>${esc(r.title)} →</b><span>${esc(r.text)}</span></a>`;
    }).join("") : `<p class="muted">No links yet.</p>`;
  }

  /* ---------------- misc render ---------------- */
  function renderAll() { renderNav(); renderHome(); renderStats(); populateFilters(); renderDirectory(); renderJobs(); renderProfile(); ADM.render(); NUFX.render(); renderEvents(); renderLinks(); renderLibrary(); route(); }

  async function boot() {
    // Any unexpected script error becomes visible instead of failing silently.
    window.addEventListener("error", (e) => { if (e.filename && /assets\//.test(e.filename)) banner("Script error: " + (e.message || "unknown") + " (" + String(e.filename).split("/").pop() + ":" + e.lineno + ")", "error", 0); });
    window.addEventListener("unhandledrejection", (e) => banner("Error: " + ((e.reason && e.reason.message) || e.reason || "unknown"), "error", 0));
    S.demo = !(typeof SUPABASE_URL === "string" && SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
    initDirectory(); initJobs(); initLibrary(); NUFX.init(); CAR.init(); ADM.init();
    $("#year").textContent = today.getFullYear();

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-act=signin]")) openAuth();
      const c = e.target.closest("[data-cv]"); if (c && $("#modal").contains(c)) openCv(c.dataset.cv, !!c.dataset.dl);
      if (e.target === $("#modal") || e.target.closest(".close")) closeSheet();
      const g = e.target.closest("[data-msg]"); if (g) NUFX.compose(g.dataset.msg, g.dataset.kind);
      const rp = e.target.closest("[data-report]"); if (rp) NUFX.report(rp.dataset.report, rp.dataset.id, rp.dataset.label);
      const mk = e.target.closest("[data-mark]"); if (mk) NUFX.toggleMark(mk.dataset.job, mk.dataset.mark);
      const it = e.target.closest("[data-int]"); if (it) NUFX.showInterested(it.dataset.int);
    });
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheet());
    $("#events").addEventListener("click", (e) => { const c = e.target.closest("[data-ev]"); if (c) openEvent(c.dataset.ev); });
    $("#events").addEventListener("keydown", (e) => { const c = e.target.closest("[data-ev]"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openEvent(c.dataset.ev); } });
    $("#authBtn").addEventListener("click", async () => {
      if (S.session) { await S.sb.auth.signOut(); location.hash = "#/"; } else openAuth();
    });
    $(".menu-btn").addEventListener("click", () => $("#menu").classList.toggle("open"));
    window.addEventListener("hashchange", route);

    if (!S.demo) {
      S.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data } = await S.sb.auth.getSession(); S.session = data.session; S.uid = data.session?.user.id || null;
      S.sb.auth.onAuthStateChange((ev, sess) => {
        const uid = sess?.user.id || null;
        if (ev === "INITIAL_SESSION" || uid === S.uid) return;     // ignore token refreshes
        S.session = sess; S.uid = uid;
        setTimeout(async () => { await loadAll(); renderAll(); }, 0);
      });
    }
    await loadAll(); renderAll();
  }
  window.NUF = { S, $, $$, esc, fmt, banner, openSheet, closeSheet, safeUrl, uniq, statusLabel, todayIso, bannerUrl, resizeImage, avatar, openProfile, completeness, initials, renderJobs,
    reload: async () => { await loadAll(); renderAll(); } };
  boot();
  if ("serviceWorker" in navigator && /^https:/.test(location.protocol)) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
