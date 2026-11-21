(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = new Date();
  const PALETTE = ["#000000", "#046A38", "#26890D", "#53565A", "#0D8390", "#2b2b2b"];
  const BLOODS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
  const JOB_TYPES = ["Full-time", "Part-time", "Internship", "Contract"];

  const S = { sb: null, demo: true, session: null, uid: null, email: "", me: null, isAdmin: false, isMember: false,
              members: [], jobs: [], stats: null, ctx: { designations: [], departments: [], locations: [], skills: [] } };

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
    linkedin: r.linkedin || "", photoPath: r.photo_path || "", cvPath: r.cv_path || "", approved: r.approved });
  const toJob = (r) => ({ id: r.id, title: r.title, company: r.company, location: r.location || "", jobType: r.job_type || "Full-time",
    expMin: r.exp_min, expMax: r.exp_max, caStatus: r.ca_status || "", skills: r.skills || "", description: r.description || "",
    applyContact: r.apply_contact, deadline: r.deadline || "", postedBy: r.posted_by, postedByName: r.posted_by_name || "", createdAt: r.created_at });

  /* ---------------- data loading ---------------- */
  async function loadAll() {
    Object.assign(S, { members: [], jobs: [], me: null, isAdmin: false, isMember: false, email: "" });
    if (S.demo) { S.members = EXAMPLE_MEMBERS; S.jobs = EXAMPLE_JOBS.slice(); S.isMember = true; buildCtx(); return; }
    try {
      const st = await S.sb.rpc("public_stats"); S.stats = st.data;
      if (S.session) {
        S.email = (S.session.user.email || "").toLowerCase();
        const [a, m] = await Promise.all([S.sb.rpc("is_admin"), S.sb.rpc("is_member")]);
        S.isAdmin = !!a.data; S.isMember = !!m.data;
        const mine = await S.sb.from("profiles").select("*").eq("email", S.email).maybeSingle();
        S.me = mine.data ? toMember(mine.data) : null;
        if (S.isMember) {
          const [pm, jb] = await Promise.all([
            S.sb.from("profiles").select("*").order("articleship_start", { ascending: true, nullsFirst: false }).limit(2000),
            S.sb.from("jobs").select("*").order("created_at", { ascending: false }).limit(500)]);
          if (pm.error) throw pm.error; if (jb.error) throw jb.error;
          S.members = pm.data.map(toMember); S.jobs = jb.data.map(toJob);
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
    const r = h.startsWith("#/jobs") ? "jobs" : h.startsWith("#/profile") ? "profile" : h.startsWith("#/admin") ? "admin" : "home";
    $$(".view").forEach((v) => (v.hidden = v.id !== "view-" + r));
    $$("#menu a").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
    $("#menu").classList.remove("open");
    if (r === "home" && !h.startsWith("#directory")) window.scrollTo(0, 0);
    if (r !== "home") window.scrollTo(0, 0);
  }

  /* ---------------- render: nav / gate / stats ---------------- */
  function renderNav() {
    $("#authBtn").textContent = S.session ? "Sign out" : "Sign in";
    $("#navAdmin").hidden = !S.isAdmin;
    $("#foot-mode").textContent = S.demo ? "Demo mode — connect Supabase (see README)" : (S.session ? "Signed in as " + S.email : "");
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
    Object.assign(els, { q: $("#smart"), s: $("#fStatus"), b: $("#fBlood"), d: $("#fDesig"), e: $("#fExp"), o: $("#fSort") });
    CA_STATUSES.forEach((v) => els.s.insertAdjacentHTML("beforeend", `<option>${esc(v)}</option>`));
    BLOODS.forEach((v) => els.b.insertAdjacentHTML("beforeend", `<option>${v}</option>`));
    els.o.innerHTML = `<option value="seniority">Seniority (earliest articleship first)</option><option value="name">Name (A–Z)</option><option value="exp">Experience (most first)</option>`;
    [els.q, els.s, els.b, els.d, els.e, els.o].forEach((e) => e.addEventListener("input", renderDirectory));
    $("#reset").addEventListener("click", () => { els.q.value = ""; [els.s, els.b, els.d, els.e].forEach((s) => (s.value = "")); els.o.selectedIndex = 0; renderDirectory(); });
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

    $("#bloodChips").innerHTML = BLOODS.map((b) => `<button type="button" class="bchip${els.b.value === b ? " on" : ""}" data-b="${b}">${b}<small>${ap.filter((m) => m.bloodGroup === b).length}</small></button>`).join("");

    const req = parseQuery(els.q.value, S.ctx);
    const hasQ = els.q.value.trim().length > 0;
    $("#parsed").innerHTML = !hasQ ? "" : req.chips.length
      ? `Understood: ${req.chips.map((c) => `<span class="pchip">${esc(c)}</span>`).join("")}${req.terms.length ? ` <span class="muted">+ words: ${esc(req.terms.join(", "))}</span>` : ""}`
      : `<span class="muted">Plain text search</span>`;

    let list = ap.map((m) => ({ m, r: matchMember(req, m) })).filter((x) => x.r.pass)
      .filter((x) => !els.s.value || x.m.caStatus === els.s.value)
      .filter((x) => !els.b.value || x.m.bloodGroup === els.b.value)
      .filter((x) => !els.d.value || x.m.designation === els.d.value)
      .filter((x) => !els.e.value || (expYears(x.m) ?? -1) >= +els.e.value);

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
    const exp = expYears(m);
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
        ${row("Phone", m.phone ? `<button class="link-btn" id="reveal">Click to reveal number</button>` : "")}
        ${row("Email", m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : "")}
      </dl>
      <div class="row">
        ${m.cvPath ? `<button class="btn btn-dark btn-sm" data-cv="${esc(m.cvPath)}">View CV</button><button class="btn btn-line btn-sm" data-cv="${esc(m.cvPath)}" data-dl="1">Download CV</button>` : `<span class="cvpending">CV not uploaded yet</span>`}
        ${m.linkedin ? `<a class="btn btn-line btn-sm" href="${esc(m.linkedin)}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}
        ${m.email ? `<a class="btn btn-brand btn-sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("NUFHAS Alumni — hiring enquiry")}">Contact</a>` : ""}
      </div>`);
    const rv = $("#reveal", $("#sheet"));
    if (rv) rv.addEventListener("click", (ev) => { ev.target.outerHTML = `<a href="tel:${esc(tel(m.phone))}">${esc(m.phone)}</a>`; });
  }

  async function openCv(path, download) {
    if (S.demo || !S.sb) return banner("CV storage works after Supabase is connected.", "info");
    const w = window.open("", "_blank");
    const { data, error } = await S.sb.storage.from("cvs").createSignedUrl(path, 300, download ? { download: true } : undefined);
    if (error || !data) { if (w) w.close(); return banner("Could not open the CV: " + (error?.message || "unknown error"), "error"); }
    if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
  }

  /* ---------------- jobs ---------------- */
  function initJobs() {
    ["#jSearch", "#jType", "#jExp"].forEach((s) => $(s).addEventListener("input", renderJobs));
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
      (!t || j.jobType === t) && (e === "" || (e === "0" ? (+j.expMin || 0) <= 1 : (+j.expMin || 0) >= +e)));
    list.sort((a, b) => (isClosed(a) - isClosed(b)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    $("#jCount").textContent = `${list.length} job${list.length === 1 ? "" : "s"}`;
    $("#jEmpty").style.display = list.length ? "none" : "block";
    const mine = S.me || (S.demo ? S.members[0] : null);
    $("#jobsList").innerHTML = list.map((j) => {
      const fit = mine ? jobFit(j, mine) : null;
      const href = applyHref(j.applyContact);
      const owner = S.isAdmin || (S.email && j.postedBy.toLowerCase() === S.email);
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
          ${owner ? `<button class="btn btn-line btn-sm" data-find="${esc(j.id)}">Find candidates</button><button class="btn btn-line btn-sm" data-del="${esc(j.id)}">Delete</button>` : ""}
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
        <button class="btn btn-brand full" type="submit">Publish job</button>
        <div class="formmsg full" id="jobMsg"></div>
      </form>`);
    $("#jobForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      const row = { title: f.title.trim(), company: f.company.trim(), location: f.location.trim() || null, job_type: f.job_type, ca_status: f.ca_status || null,
        exp_min: f.exp_min === "" ? 0 : +f.exp_min, exp_max: f.exp_max === "" ? null : +f.exp_max, skills: f.skills.trim() || null,
        description: f.description.trim() || null, apply_contact: f.apply_contact.trim(), deadline: f.deadline || null,
        posted_by: S.email, posted_by_name: S.me?.name || S.email };
      if (row.exp_max != null && row.exp_max < row.exp_min) return ($("#jobMsg").textContent = "Max experience must be ≥ min.");
      const { error } = await S.sb.from("jobs").insert(row);
      if (error) return ($("#jobMsg").textContent = error.message);
      closeSheet(); await loadAll(); renderAll(); banner("Job published.", "ok");
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
      </div>`;
    const toggle = () => { $("#subjWrap").hidden = !LEVEL_STATUSES.includes($("#pStatus").value); };
    $("#pStatus").addEventListener("input", toggle); toggle();
    $("#profForm").addEventListener("submit", saveProfile);
    if (S.me) { $("#photoFile").addEventListener("change", uploadPhoto); $("#cvFile").addEventListener("change", uploadCv); }
  }

  async function saveProfile(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries()), msg = $("#profMsg");
    if (f.start && f.end && f.end < f.start) return (msg.textContent = "Articleship end date cannot be before the start date.");
    const lvl = LEVEL_STATUSES.includes(f.ca_status);
    const row = { name: f.name.trim(), company: f.company.trim() || null, department: f.department.trim() || null, designation: f.designation.trim() || null,
      location: f.location.trim() || null, phone: f.phone.trim() || null, blood_group: f.blood_group || null, ca_status: f.ca_status || null,
      subjects_cleared: lvl && f.subjects !== "" ? +f.subjects : null, articleship_start: f.start || null, articleship_end: f.end || null,
      skills: f.skills.trim() || null, linkedin: f.linkedin.trim() || null, about: f.about.trim() || null };
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

  /* ---------------- admin ---------------- */
  function renderAdmin() {
    const w = $("#adminWrap");
    if (!S.isAdmin) { w.innerHTML = `<div class="card gate"><h3>Admins only</h3><p>You do not have access to this page.</p></div>`; return; }
    const pending = S.members.filter((m) => !m.approved);
    w.innerHTML = `
      <div class="card"><h3>Pending members (${pending.length})</h3>
        ${pending.length ? pending.map((m) => `<div class="arow"><div><b>${esc(m.name)}</b> <span class="muted">${esc(m.email)}</span><div class="muted">${esc(m.designation || "—")} · ${esc(statusLabel(m))} · ${esc(m.company || "")}</div></div>
          <div class="row"><button class="btn btn-brand btn-sm" data-ap="${m.id}">Approve</button><button class="btn btn-line btn-sm" data-rj="${m.id}">Reject</button></div></div>`).join("") : `<p class="muted">No pending requests.</p>`}
      </div>
      <div class="card" style="margin-top:16px"><h3>Jobs (${S.jobs.length})</h3>
        ${S.jobs.length ? S.jobs.map((j) => `<div class="arow"><div><b>${esc(j.title)}</b> <span class="muted">${esc(j.company)} · by ${esc(j.postedBy)}</span></div>
          <button class="btn btn-line btn-sm" data-dj="${j.id}">Delete</button></div>`).join("") : `<p class="muted">No jobs.</p>`}
      </div>
      <p class="muted" style="margin-top:14px">Bulk edits (import, delete, export) are done in the Supabase Table Editor.</p>`;
  }
  async function adminAction(e) {
    const a = e.target.closest("[data-ap],[data-rj],[data-dj]"); if (!a) return;
    let r;
    if (a.dataset.ap) r = await S.sb.from("profiles").update({ approved: true }).eq("id", a.dataset.ap);
    else if (a.dataset.rj) { if (!confirm("Reject and delete this profile?")) return; r = await S.sb.from("profiles").delete().eq("id", a.dataset.rj); }
    else { if (!confirm("Delete this job?")) return; r = await S.sb.from("jobs").delete().eq("id", a.dataset.dj); }
    if (r.error) return banner(r.error.message, "error");
    await loadAll(); renderAll(); banner("Done.", "ok");
  }

  /* ---------------- auth ---------------- */
  function openAuth() {
    if (S.demo) return banner("Login is available after you connect Supabase (see README).", "info");
    openSheet(`<h2 style="font-size:1.4rem">Sign in</h2>
      <p class="muted" id="authHelp">Enter your email. We will send a one-time code (the email also contains a sign-in link).</p>
      <form class="pf" id="authForm"><label class="full">Email<input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>
        <button class="btn btn-brand full" type="submit">Send code</button><div class="formmsg full" id="authMsg"></div></form>`);
    $("#authForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = new FormData(e.target).get("email").trim().toLowerCase(), msg = $("#authMsg");
      msg.textContent = "Sending…";
      const { error } = await S.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
      if (error) return (msg.textContent = error.message);
      $("#authHelp").textContent = `We sent a code to ${email}. Enter it below (check spam too).`;
      $("#authForm").innerHTML = `<label class="full">Code<input name="token" inputmode="numeric" autocomplete="one-time-code" required maxlength="10" placeholder="123456"></label>
        <button class="btn btn-brand full" type="submit">Verify &amp; sign in</button><div class="formmsg full" id="authMsg"></div>`;
      $("#authForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const token = new FormData(ev.target).get("token").trim(), m2 = $("#authMsg");
        m2.textContent = "Verifying…";
        const r = await S.sb.auth.verifyOtp({ email, token, type: "email" });
        if (r.error) return (m2.textContent = r.error.message);
        closeSheet();
      });
    });
  }

  /* ---------------- misc render ---------------- */
  function renderAll() { renderNav(); renderStats(); populateFilters(); renderDirectory(); renderJobs(); renderProfile(); renderAdmin(); route(); }

  async function boot() {
    S.demo = !(typeof SUPABASE_URL === "string" && SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
    initDirectory(); initJobs();
    $("#events").innerHTML = EVENTS.map((ev) => {
      const d = new Date(ev.date + "T00:00:00");
      return `<div class="event"><div class="date"><b>${d.getDate()}</b><span>${d.toLocaleDateString("en-GB", { month: "short" })}</span></div><div><h3>${esc(ev.title)}</h3><p>${esc(ev.place)} · ${esc(ev.tag)}</p></div></div>`;
    }).join("");
    $("#resources").innerHTML = RESOURCES.map((r) => `<a href="${esc(r.link)}"><b>${esc(r.title)} →</b><span>${esc(r.text)}</span></a>`).join("");
    $("#year").textContent = today.getFullYear();

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-act=signin]")) openAuth();
      const c = e.target.closest("[data-cv]"); if (c && $("#modal").contains(c)) openCv(c.dataset.cv, !!c.dataset.dl);
      if (e.target === $("#modal") || e.target.closest(".close")) closeSheet();
    });
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheet());
    $("#adminWrap").addEventListener("click", adminAction);
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
  boot();
})();
