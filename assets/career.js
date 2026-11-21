/* NUFHAS Alumni — career progression + import from CV / LinkedIn.
   - Members keep a list of positions (like LinkedIn). The directory card shows the CURRENT role;
     "View profile" shows the full progression.
   - Import reads a CV PDF, a LinkedIn "Save to PDF" file, or LinkedIn data-export CSV files
     in the browser (nothing is uploaded), then shows what it found so the member can review before saving. */
(function () {
  "use strict";
  const C = (window.CAR = {});
  const N = () => window.NUF;
  const $ = (s, el = document) => el.querySelector(s);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
  const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  /* ---------------- date helpers ---------------- */
  const fmtMonth = (iso) => (iso ? `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : "");
  const toMonthInput = (iso) => (iso ? iso.slice(0, 7) : "");
  const fromMonthInput = (v) => (v ? v + "-01" : null);
  function duration(start, end) {
    if (!start) return "";
    const s = new Date(start + "T00:00:00"), e = end ? new Date(end + "T00:00:00") : new Date();
    let m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
    if (m < 1) m = 1;
    const y = Math.floor(m / 12), r = m % 12;
    return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", r ? `${r} mo${r > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ");
  }

  /* ---------------- data ---------------- */
  C.load = async function () {
    const { S } = N(); S.experiences = [];
    if (S.demo || !S.sb || !S.isMember) return;
    try {
      const r = await S.sb.from("experiences").select("*").order("start_date", { ascending: false }).limit(5000);
      if (!r.error) S.experiences = r.data || [];
    } catch (e) {}
  };
  const sortExp = (a, b) => ((b.end_date == null) - (a.end_date == null)) || String(b.start_date).localeCompare(String(a.start_date));
  C.forProfile = (id) => (N().S.experiences || []).filter((x) => x.profile_id === id).sort(sortExp);

  // Make the profile's designation/company follow the newest current role.
  async function syncCurrent() {
    const { S } = N(); if (!S.me) return;
    const cur = C.forProfile(S.me.id).find((x) => x.end_date == null); if (!cur) return;
    if (S.me.designation === cur.title && S.me.company === cur.company) return;
    await S.sb.from("profiles").update({ designation: cur.title, company: cur.company }).eq("id", S.me.id);
  }

  /* ---------------- timeline (shown in "View profile") ---------------- */
  C.timelineHtml = function (m) {
    const { esc } = N();
    const items = C.forProfile(m.id).map((x) => ({ title: x.title, company: x.company, location: x.location, start: x.start_date, end: x.end_date, description: x.description }));
    if (m.articleshipStart) items.push({ title: "Articleship trainee", company: "NUFHAS", location: "", start: m.articleshipStart, end: m.articleshipEnd || null, description: "", art: true });
    if (!items.length) return "";
    items.sort(sortExp);
    return `<div class="timeline"><h3>Career progression</h3><ol>${items.map((x, i) => `
      <li class="tl-item${x.end == null && !x.art ? " current" : ""}"><span class="tl-dot"></span>
        <div><b>${esc(x.title)}</b>${x.end == null && !x.art && i === 0 ? ` <span class="chip ca">Current</span>` : ""}${x.art ? ` <span class="chip">Articleship</span>` : ""}
          <div>${esc(x.company)}${x.location ? " · " + esc(x.location) : ""}</div>
          <div class="muted">${esc(fmtMonth(x.start))} – ${x.end ? esc(fmtMonth(x.end)) : "Present"} · ${esc(duration(x.start, x.end))}</div>
          ${x.description ? `<p class="tl-desc">${esc(x.description)}</p>` : ""}</div></li>`).join("")}</ol></div>`;
  };

  /* ---------------- editor on "My profile" ---------------- */
  C.mount = function (wrap) {
    const { S, esc } = N(); if (!S.me) return;
    const list = C.forProfile(S.me.id);
    wrap.insertAdjacentHTML("beforeend", `
      <div class="card uploads" id="careerCard" style="margin-top:16px"><div class="row-between"><h3>Career progression</h3><button class="btn btn-brand btn-sm" type="button" data-addexp="1">+ Add position</button></div>
        <p class="muted" style="margin:6px 0 10px">Add your jobs over time. Members see your <b>current</b> role on the directory and the full history when they open your profile. Your current position also updates the <b>Designation</b> and <b>Current organization</b> fields above.</p>
        ${list.length ? list.map((x) => `<div class="arow"><div><b>${esc(x.title)}</b> ${x.end_date == null ? `<span class="chip ca">Current</span>` : ""}
          <div class="muted">${esc(x.company)} · ${esc(fmtMonth(x.start_date))} – ${x.end_date ? esc(fmtMonth(x.end_date)) : "Present"}</div></div>
          <div class="row"><button class="btn btn-line btn-sm" data-editexp="${esc(x.id)}">Edit</button><button class="btn btn-line btn-sm" data-delexp="${esc(x.id)}">Delete</button></div></div>`).join("") : `<p class="muted">No positions added yet.</p>`}
      </div>
      <div class="card uploads" id="importCard" style="margin-top:16px"><h3>Import from CV or LinkedIn</h3>
        <p class="muted" style="margin:6px 0 10px">Choose your <b>CV (PDF)</b>, your <b>LinkedIn profile saved as PDF</b>, or LinkedIn export files (<b>Positions.csv</b>, <b>Skills.csv</b>, <b>Profile.csv</b>).
          The file is read inside your browser and is not uploaded. You will see what was found and choose what to keep before anything is saved.</p>
        <input type="file" id="impFile" accept=".pdf,.csv,application/pdf,text/csv" multiple>
        <details style="margin-top:10px"><summary class="muted" style="cursor:pointer">How do I get my LinkedIn file?</summary>
          <p class="muted" style="margin:8px 0 0"><b>Easiest:</b> open your LinkedIn profile on a computer, click <b>More</b> → <b>Save to PDF</b>, then choose that PDF here.<br>
          <b>More complete:</b> LinkedIn → Settings &amp; Privacy → Data privacy → <b>Get a copy of your data</b>. Download the ZIP and choose <b>Positions.csv</b> (and optionally Skills.csv, Profile.csv).</p></details>
        <div class="formmsg" id="impMsg"></div>
      </div>`);
    $("#impFile").addEventListener("change", onImportFiles);
  };

  function openExpForm(x) {
    const { S, esc, openSheet, closeSheet, banner } = N();
    openSheet(`<h2 style="font-size:1.4rem;margin-bottom:10px">${x ? "Edit position" : "Add position"}</h2>
      <form class="pf" id="expForm"><label class="full">Job title *<input name="title" required maxlength="120" value="${esc(x ? x.title : "")}"></label>
        <label class="full">Company / organization *<input name="company" required maxlength="120" value="${esc(x ? x.company : "")}"></label>
        <label class="full">Location<input name="location" maxlength="120" value="${esc(x ? x.location || "" : "")}"></label>
        <label>Start *<input name="start" type="month" required value="${esc(x ? toMonthInput(x.start_date) : "")}"></label>
        <label>End<input name="end" type="month" id="expEnd" value="${esc(x ? toMonthInput(x.end_date) : "")}"></label>
        <label class="consent full"><input type="checkbox" name="current" id="expCur"${!x || x.end_date == null ? " checked" : ""}> I currently work here</label>
        <label class="full">Description (optional)<textarea name="description" rows="3" maxlength="1000">${esc(x ? x.description || "" : "")}</textarea></label>
        <button class="btn btn-brand full" type="submit">${x ? "Save changes" : "Add position"}</button><div class="formmsg full" id="expMsg"></div></form>`);
    const sync = () => { $("#expEnd").disabled = $("#expCur").checked; if ($("#expCur").checked) $("#expEnd").value = ""; };
    $("#expCur").addEventListener("input", sync); sync();
    $("#expForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries()), cur = f.current === "on";
      const row = { title: f.title.trim(), company: f.company.trim(), location: (f.location || "").trim() || null, start_date: fromMonthInput(f.start),
        end_date: cur ? null : fromMonthInput(f.end), description: (f.description || "").trim() || null };
      if (!cur && !row.end_date) return ($("#expMsg").textContent = "Choose an end month, or tick “I currently work here”.");
      if (row.end_date && row.end_date < row.start_date) return ($("#expMsg").textContent = "The end month cannot be before the start month.");
      const r = x ? await S.sb.from("experiences").update(row).eq("id", x.id).select() : await S.sb.from("experiences").insert({ ...row, profile_id: S.me.id }).select();
      if (r.error || !r.data || !r.data.length) return ($("#expMsg").textContent = r.error ? r.error.message : "The change was not accepted. Reload the page and try again.");
      closeSheet(); await C.load(); await syncCurrent(); await N().reload(); banner("Position saved.", "ok");
    });
  }

  /* ---------------- CV / LinkedIn parsing ---------------- */
  const monthRe = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const dateTok = `(?:${monthRe}\\.?,?\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
  const rangeRe = new RegExp(`(${dateTok})\\s*(?:-|–|—|to)\\s*(${dateTok}|present|current|now|till date|ongoing)`, "i");
  const NEXT_HEAD = /^(education|skills|top skills|key skills|technical skills|languages|certifications?|licenses?\s*(?:&|and)\s*certifications?|honou?rs[- ]awards|publications|projects|references|volunteer(?:ing)?(?:\s+experience)?|courses|interests|contact|summary|about(?:\s+me)?|profile|professional summary)$/i;
  const EXP_HEAD = /^(experience|work experience|professional experience|employment(?: history)?|career history)$/i;

  function parseDate(tok) {
    tok = String(tok || "").trim();
    let m = tok.match(new RegExp(`^(${monthRe})\\.?,?\\s+(\\d{4})$`, "i"));
    if (m) return `${m[2]}-${String(MON[m[1].slice(0, 3).toLowerCase()]).padStart(2, "0")}-01`;
    m = tok.match(/^(\d{1,2})\/(\d{4})$/); if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${String(+m[1]).padStart(2, "0")}-01`;
    m = tok.match(/^(\d{4})$/); if (m) return `${m[1]}-01-01`;
    return null;
  }
  const endDate = (tok) => (/^(present|current|now|till date|ongoing)$/i.test(String(tok).trim()) ? null : parseDate(tok));
  const isDuration = (l) => /^\d+\s+(?:years?|yrs?|months?|mos?)(?:\s+\d+\s+(?:months?|mos?))?$/i.test(l.trim());
  const isMeta = (l) => !l || rangeRe.test(l) || /^[•\-*·▪●]/.test(l.trim()) || /[.;:]$/.test(l.trim()) || l.length > 70 ||
    /,|\b(area|region|remote|hybrid|on-site)\b|^(bangladesh|dhaka|chattogram|chittagong|sylhet|khulna|rajshahi|india|singapore|united kingdom|united states|uae|dubai|london)$/i.test(l.trim());

  function splitTitleCompany(text) {
    text = text.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim().replace(/^[-–—|,•·\s]+|[-–—|,•·\s]+$/g, "");
    let m = text.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i); if (m) return { title: m[1].trim(), company: m[2].trim() };
    m = text.match(/^(.+?)\s*(?:\||–|—| - |,)\s*(.+)$/); if (m) return { title: m[1].trim(), company: m[2].trim() };
    return { title: text, company: "" };
  }

  C.parseCvLines = function (rawLines) {
    const lines = rawLines.map((l) => String(l).replace(/\s+/g, " ").trim()).filter(Boolean);
    const out = { phone: "", linkedin: "", skills: [], about: "", positions: [] };
    const all = lines.join("\n");

    // phone
    for (const l of lines) {
      const m = l.match(/(?:\+?880[\s-]?)?0?1[3-9][\d\s-]{8,11}\d/) || l.match(/\+?\d[\d\s().-]{8,16}\d/);
      if (m) { const d = m[0].replace(/\D/g, ""); if (d.length >= 10 && d.length <= 14) { out.phone = m[0].replace(/[\s().-]/g, ""); break; } }
    }
    // linkedin (the PDF often wraps the address over two lines)
    const li = lines.findIndex((l) => /linkedin\.com\/in\//i.test(l));
    if (li >= 0) {
      let u = lines[li].replace(/\s*\(LinkedIn\)\s*$/i, "").trim();
      if (/-$/.test(u) && lines[li + 1]) u += lines[li + 1].replace(/\s*\(LinkedIn\)\s*$/i, "").trim();
      const m = u.match(/linkedin\.com\/in\/([\w\-%]+)/i); if (m) out.linkedin = "https://www.linkedin.com/in/" + m[1].replace(/-+$/, "");
    }
    // sections
    const secAfter = (re) => {
      const i = lines.findIndex((l) => re.test(l)); if (i < 0) return [];
      const res = []; for (let j = i + 1; j < lines.length; j++) { if (NEXT_HEAD.test(lines[j]) || EXP_HEAD.test(lines[j])) break; res.push(lines[j]); }
      return res;
    };
    const sk = secAfter(/^(top skills|key skills|technical skills|skills)$/i);
    sk.slice(0, 14).forEach((l) => l.split(/[,•·|;]/).forEach((x) => { x = x.trim(); if (x && x.length <= 40 && !isDuration(x)) out.skills.push(x); }));
    const inline = all.match(/^skills\s*[:\-]\s*(.+)$/im); if (inline) inline[1].split(/[,;|•·]/).forEach((x) => { x = x.trim(); if (x && x.length <= 40) out.skills.push(x); });
    out.skills = [...new Set(out.skills)].slice(0, 15);
    const ab = secAfter(/^(summary|about|about me|profile|professional summary)$/i);
    out.about = ab.join(" ").slice(0, 500);

    // experience
    let from = lines.findIndex((l) => EXP_HEAD.test(l)), to = lines.length;
    if (from >= 0) { for (let j = from + 1; j < lines.length; j++) { if (NEXT_HEAD.test(lines[j]) && !/^(summary|about|profile)$/i.test(lines[j])) { to = j; break; } } from += 1; } else from = 0;
    let lastCompany = "";
    for (let i = from; i < to; i++) {
      const l = lines[i], m = l.match(rangeRe); if (!m) continue;
      const rest = l.replace(rangeRe, "").replace(/\(.*?\)/g, "").replace(/[-–—|,•·\s]+/g, " ").trim();
      let title = "", company = "";
      if (rest.length > 3) { const sp = splitTitleCompany(l.replace(rangeRe, "")); title = sp.title; company = sp.company || lastCompany; if (sp.company) lastCompany = sp.company; }
      else {
        title = (lines[i - 1] || "").trim();
        if (!title || rangeRe.test(title) || EXP_HEAD.test(title) || i - 1 < from) continue;
        const prev = i - 2 >= from ? lines[i - 2] : "";
        if (isDuration(prev) && i - 3 >= from) { company = lines[i - 3]; lastCompany = company; }
        else if (isMeta(prev)) company = lastCompany;
        else { company = prev; lastCompany = company; }
      }
      const start = parseDate(m[1]); if (!start) continue;
      out.positions.push({ title: title.slice(0, 120), company: (company || "").slice(0, 120), start, end: endDate(m[2]) });
    }
    const seen = new Set();
    out.positions = out.positions.filter((p) => { const k = [p.title, p.company, p.start].join("|").toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 15);
    return out;
  };

  // CSV (LinkedIn data export)
  function parseCsv(text) {
    const rows = []; let row = [], cur = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  C.parseLinkedInCsv = function (text) {
    const out = { phone: "", linkedin: "", skills: [], about: "", positions: [] };
    const rows = parseCsv(text); const hi = rows.findIndex((r) => r.some((c) => /^(company name|title|name|first name|headline)$/i.test(c.trim())));
    if (hi < 0) return out;
    const head = rows[hi].map((c) => c.trim().toLowerCase()), idx = (n) => head.indexOf(n), get = (r, n) => (idx(n) >= 0 ? (r[idx(n)] || "").trim() : "");
    const body = rows.slice(hi + 1);
    if (idx("company name") >= 0 && idx("title") >= 0) {
      body.forEach((r) => {
        const start = parseDate(get(r, "started on")); if (!start) return;
        const fin = get(r, "finished on");
        out.positions.push({ title: get(r, "title").slice(0, 120), company: get(r, "company name").slice(0, 120), location: get(r, "location").slice(0, 120), description: get(r, "description").slice(0, 1000), start, end: fin ? parseDate(fin) : null });
      });
    } else if (idx("name") >= 0 && head.length <= 2) {
      body.forEach((r) => { const n = (r[idx("name")] || "").trim(); if (n && n.length <= 40) out.skills.push(n); });
    } else if (idx("summary") >= 0 || idx("headline") >= 0) {
      const r = body[0] || []; out.about = (get(r, "summary") || get(r, "headline")).slice(0, 500);
    }
    return out;
  };

  function mergeParsed(list) {
    const out = { phone: "", linkedin: "", skills: [], about: "", positions: [] };
    list.forEach((p) => { out.phone = out.phone || p.phone; out.linkedin = out.linkedin || p.linkedin; out.about = out.about || p.about; out.skills.push(...p.skills); out.positions.push(...p.positions); });
    out.skills = [...new Set(out.skills)].slice(0, 20);
    const seen = new Set(); out.positions = out.positions.filter((p) => { const k = [p.title, p.company, p.start].join("|").toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    return out;
  }

  // PDF text via pdf.js (loaded only when needed)
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = PDFJS;
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; res(window.pdfjsLib); };
      s.onerror = () => rej(new Error("Could not load the PDF reader. Check your internet connection and try again."));
      document.head.appendChild(s);
    });
  }
  C.itemsToLines = function (items) {
    const lines = []; let cur = "", lastY = null;
    const push = () => { const t = cur.replace(/\s+/g, " ").trim(); if (t) lines.push(t); cur = ""; };
    items.forEach((it) => {
      const y = it.transform ? it.transform[5] : 0;
      if (lastY !== null && Math.abs(y - lastY) > 2) push();
      cur += it.str; lastY = y;
      if (it.hasEOL) { push(); lastY = null; }
    });
    push(); return lines;
  };
  C.readPdfLines = async function (file) {
    const lib = await loadPdfJs(), pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise, lines = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 8); p++) { const tc = await (await pdf.getPage(p)).getTextContent(); lines.push(...C.itemsToLines(tc.items)); }
    return lines;
  };

  async function onImportFiles(e) {
    const files = [...e.target.files], msg = $("#impMsg"); if (!files.length) return;
    msg.style.color = ""; msg.textContent = "Reading…";
    try {
      const parsed = [];
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) throw new Error(`${f.name} is larger than 15 MB.`);
        if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") parsed.push(C.parseCvLines(await C.readPdfLines(f)));
        else if (/\.csv$/i.test(f.name)) parsed.push(C.parseLinkedInCsv(await f.text()));
        else throw new Error(`${f.name}: choose a PDF or a LinkedIn CSV file.`);
      }
      const res = mergeParsed(parsed);
      if (!res.phone && !res.linkedin && !res.skills.length && !res.about && !res.positions.length) throw new Error("Nothing readable was found. Scanned (image-only) PDFs cannot be read. Try the LinkedIn “Save to PDF” file or add your details by hand.");
      msg.textContent = ""; e.target.value = ""; openReview(res);
    } catch (err) { msg.style.color = "#8a1f17"; msg.textContent = err.message || String(err); }
  }

  function openReview(res) {
    const { S, esc, openSheet, closeSheet, banner } = N(), me = S.me;
    const have = C.forProfile(me.id), dup = (p) => have.some((x) => x.title.toLowerCase() === p.title.toLowerCase() && x.company.toLowerCase() === p.company.toLowerCase() && x.start_date === p.start);
    const curSkills = (me.skills || "").split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    const newSkills = res.skills.filter((s) => !curSkills.some((c) => c.toLowerCase() === s.toLowerCase()));
    const field = (key, label, val, existing, rows) => val ? `<div class="imp-row"><label class="consent"><input type="checkbox" data-f="${key}"${existing ? "" : " checked"}> <b>${label}</b></label>
      ${rows ? `<textarea name="${key}" rows="${rows}" maxlength="500">${esc(val)}</textarea>` : `<input name="${key}" value="${esc(val)}">`}${existing ? `<div class="muted">Currently: ${esc(existing)} (tick to replace)</div>` : ""}</div>` : "";
    openSheet(`<h2 style="font-size:1.4rem;margin-bottom:4px">Review before saving</h2>
      <p class="muted" style="margin:0 0 12px">This is what was found. It is a best guess, so check each line and fix anything wrong. Only ticked items are saved.</p>
      <form id="impForm" class="imp">
        ${field("phone", "Phone", res.phone, me.phone)}${field("linkedin", "LinkedIn", res.linkedin, me.linkedin)}
        ${field("about", "About you", res.about, me.about, 4)}
        ${newSkills.length ? `<div class="imp-row"><label class="consent"><input type="checkbox" data-f="skills" checked> <b>Add skills</b></label><input name="skills" value="${esc(newSkills.join(", "))}"></div>` : ""}
        ${res.positions.length ? `<h3 style="font-size:1.05rem;margin:14px 0 6px">Positions found (${res.positions.length})</h3>` + res.positions.map((p, i) => `
          <div class="imp-pos"><label class="consent"><input type="checkbox" data-p="${i}"${dup(p) ? "" : " checked"}> ${dup(p) ? `<span class="muted">Already in your profile</span>` : "<b>Add this position</b>"}</label>
            <div class="imp-grid"><label>Title<input data-pt="${i}" value="${esc(p.title)}"></label><label>Company<input data-pc="${i}" value="${esc(p.company)}"></label>
              <label>Start<input type="month" data-ps="${i}" value="${esc(toMonthInput(p.start))}"></label><label>End (empty = current)<input type="month" data-pe="${i}" value="${esc(toMonthInput(p.end))}"></label></div></div>`).join("") : ""}
        <button class="btn btn-brand" type="submit" style="margin-top:12px">Save selected</button><div class="formmsg" id="impErr"></div></form>`);
    $("#impForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target, err = $("#impErr"); err.style.color = "#8a1f17";
      const upd = {};
      f.querySelectorAll("[data-f]").forEach((cb) => {
        if (!cb.checked) return; const k = cb.dataset.f, v = f.elements[k].value.trim(); if (!v) return;
        if (k === "skills") upd.skills = [...curSkills, ...v.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)].join(", ");
        else if (k === "linkedin") { if (!/^https?:\/\//i.test(v)) { err.textContent = "The LinkedIn address must start with https://"; upd._bad = 1; } else upd.linkedin = v; }
        else upd[k] = k === "about" ? v.slice(0, 500) : v;
      });
      if (upd._bad) return; delete upd._bad;
      const rows = [];
      for (const cb of f.querySelectorAll("[data-p]")) {
        if (!cb.checked) continue; const i = cb.dataset.p;
        const title = f.querySelector(`[data-pt="${i}"]`).value.trim(), company = f.querySelector(`[data-pc="${i}"]`).value.trim();
        const s = fromMonthInput(f.querySelector(`[data-ps="${i}"]`).value), en = fromMonthInput(f.querySelector(`[data-pe="${i}"]`).value);
        if (!title || !company || !s) { err.textContent = `Position ${+i + 1}: title, company and start month are required (or untick it).`; return; }
        if (en && en < s) { err.textContent = `Position ${+i + 1}: the end month is before the start month.`; return; }
        rows.push({ profile_id: me.id, title, company, start_date: s, end_date: en, location: res.positions[i].location || null, description: res.positions[i].description || null });
      }
      if (!Object.keys(upd).length && !rows.length) { err.textContent = "Nothing is ticked."; return; }
      err.style.color = ""; err.textContent = "Saving…";
      if (Object.keys(upd).length) { const r = await S.sb.from("profiles").update(upd).eq("id", me.id); if (r.error) { err.style.color = "#8a1f17"; return (err.textContent = r.error.message); } }
      if (rows.length) { const r = await S.sb.from("experiences").insert(rows).select(); if (r.error) { err.style.color = "#8a1f17"; return (err.textContent = r.error.message); } }
      closeSheet(); await C.load(); await syncCurrent(); await N().reload(); banner("Imported. Please review your profile.", "ok");
    });
  }

  /* ---------------- wiring ---------------- */
  C.init = function () {
    document.addEventListener("click", async (e) => {
      const { S, banner } = N();
      if (e.target.closest("[data-addexp]")) return openExpForm(null);
      const ed = e.target.closest("[data-editexp]"); if (ed) { const x = (S.experiences || []).find((y) => y.id === ed.dataset.editexp); if (x) openExpForm(x); return; }
      const del = e.target.closest("[data-delexp]");
      if (del && confirm("Delete this position?")) {
        const r = await S.sb.from("experiences").delete().eq("id", del.dataset.delexp);
        if (r.error) return banner(r.error.message, "error");
        await C.load(); await N().reload(); banner("Deleted.", "ok");
      }
    });
  };
})();
