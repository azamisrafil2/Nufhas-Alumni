/* ------------------------------------------------------------------
   Smart Talent Search — rule-based "AI-like" matching (runs in the browser,
   no external AI service). It reads a plain-English hiring brief such as
     "audit senior with 3+ years experience, IFRS, advanced level, O+"
   turns it into requirements, filters members and ranks them by match score.
------------------------------------------------------------------- */

const DAY_MS = 86400000;

function expYears(m, now = new Date()) {
  if (!m.articleshipStart) return null;
  const y = (now - new Date(m.articleshipStart + "T00:00:00")) / (365.25 * DAY_MS);
  return Math.max(0, y);
}

const STOP = new Set(("a an the and or with for who is are in at of to on from by as need needs needed looking look want wants find " +
  "me us someone candidate candidates person people having has have year years yr yrs experience experienced exp minimum min " +
  "least than more over above plus level hire hiring please show give list any good best strong skilled expert professional " +
  "member members alumni staff team background knowledge").split(" "));

const esc_re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (q, w) => new RegExp("(^|[^a-z0-9])" + esc_re(w) + "($|[^a-z0-9])").test(q);
const cut = (q, w) => q.replace(new RegExp("(^|[^a-z0-9])" + esc_re(w) + "(?=$|[^a-z0-9])", "g"), " ");

function emptyReq() {
  return { minExp: null, maxExp: null, ca: [], minSubjects: null, blood: [], designations: [],
           departments: [], locations: [], skills: [], terms: [], chips: [] };
}

function parseQuery(raw, ctx = {}) {
  const req = emptyReq();
  let q = " " + String(raw || "").toLowerCase().replace(/[,;]/g, " , ") + " ";
  if (!q.trim()) return req;
  let m;

  // --- experience ---
  if ((m = q.match(/between\s+(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?/))) {
    req.minExp = +m[1]; req.maxExp = +m[2]; q = q.replace(m[0], " ");
  } else if ((m = q.match(/(?:less than|under|below|max(?:imum)?|up to|upto|within)\s+(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/))) {
    req.maxExp = +m[1]; q = q.replace(m[0], " ");
  } else if ((m = q.match(/(?:at least|atleast|minimum|min|over|more than|above)?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/))) {
    req.minExp = +m[1]; q = q.replace(m[0], " ");
  }
  if (/(^|[^a-z])(fresher|fresh graduate|entry[- ]level)([^a-z]|$)/.test(q)) {
    if (req.maxExp == null) req.maxExp = 2;
    q = q.replace(/(fresher|fresh graduate|entry[- ]level)/g, " ");
  }

  // --- subjects cleared ---
  if ((m = q.match(/(\d+)\s*\+?\s*subjects?(?:\s+cleared)?/))) { req.minSubjects = +m[1]; q = q.replace(m[0], " "); }

  // --- blood group (needs a + / - / positive / negative) ---
  const bre = /(^|[^a-z0-9])(ab|a|b|o)\s*(\+|-|positive|negative|pos|neg)(?![a-z])/g;
  for (const b of [...q.matchAll(bre)]) {
    const g = b[2].toUpperCase() + (/^\+|pos/.test(b[3]) ? "+" : "-");
    if (!req.blood.includes(g)) req.blood.push(g);
  }
  q = q.replace(bre, " ");

  // --- CA status ---
  const ca = (name, re) => { if (re.test(q)) { if (!req.ca.includes(name)) req.ca.push(name); q = q.replace(new RegExp(re.source, "g"), " "); } };
  ca("Chartered Accountant", /(chartered accountants?|ca[- ]qualified|qualified ca|ca passed|qualified|fellow|(^|[^a-z])ca(?=[^a-z]|$))/);
  ca("Advanced Level", /(advanced? level|final level|advanced?)(?=[^a-z]|$)/);
  ca("Professional Level", /(professional level|professional)(?=[^a-z]|$)/);
  ca("Certificate Level", /(certificate level|certificate)(?=[^a-z]|$)/);

  // --- dynamic vocab from the member list ---
  const take = (list, target) => {
    [...new Set(list.filter(Boolean))].sort((a, b) => b.length - a.length).forEach((v) => {
      const lv = v.toLowerCase();
      if (hasWord(q, lv)) { target.push(v); q = cut(q, lv); }
    });
  };
  take(ctx.designations || [], req.designations);
  take(ctx.departments || [], req.departments);
  take(ctx.locations || [], req.locations);
  take(ctx.skills || [], req.skills);

  // --- leftovers ---
  req.terms = q.split(/[^a-z0-9.@_-]+/).filter((t) => t.length > 1 && !STOP.has(t));

  // --- chips (what the engine understood) ---
  const c = req.chips;
  if (req.minExp != null && req.maxExp != null) c.push(`Experience ${req.minExp}–${req.maxExp} yrs`);
  else if (req.minExp != null) c.push(`Experience ≥ ${req.minExp} yrs`);
  else if (req.maxExp != null) c.push(`Experience ≤ ${req.maxExp} yrs`);
  req.ca.forEach((x) => c.push(x));
  if (req.minSubjects != null) c.push(`≥ ${req.minSubjects} subjects`);
  req.blood.forEach((x) => c.push("Blood " + x));
  req.designations.forEach((x) => c.push(x));
  req.departments.forEach((x) => c.push(x));
  req.locations.forEach((x) => c.push("📍 " + x));
  req.skills.forEach((x) => c.push("Skill: " + x));
  return req;
}

const hasStructured = (r) => r.minExp != null || r.maxExp != null || r.ca.length || r.minSubjects != null ||
  r.blood.length || r.designations.length || r.departments.length || r.locations.length || r.skills.length;

/** Returns { pass, score (0-100), why[] } */
function matchMember(req, m, now = new Date()) {
  const why = [];
  let earned = 0, total = 0, hard = false, fail = false;
  const exp = expYears(m, now);
  const lc = (s) => String(s || "").toLowerCase();
  const mskills = lc(m.skills).split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);

  if (req.minExp != null || req.maxExp != null) {
    hard = true; total += 25;
    if (exp == null || (req.minExp != null && exp < req.minExp) || (req.maxExp != null && exp > req.maxExp)) fail = true;
    else { earned += 25; why.push(`${exp.toFixed(1)} yrs experience`); }
  }
  if (req.ca.length) {
    hard = true; total += 20;
    if (!req.ca.includes(m.caStatus)) fail = true; else { earned += 20; why.push(m.caStatus); }
  }
  if (req.blood.length) {
    hard = true; total += 10;
    if (!req.blood.includes(m.bloodGroup)) fail = true; else { earned += 10; why.push("Blood " + m.bloodGroup); }
  }
  if (req.minSubjects != null) {
    hard = true; total += 10;
    const ok = m.caStatus === "Chartered Accountant" || (m.subjects != null && m.subjects >= req.minSubjects);
    if (!ok) fail = true; else { earned += 10; why.push(m.subjects != null ? `${m.subjects} subjects` : "Qualified"); }
  }
  if (req.designations.length) {
    total += 15;
    if (req.designations.some((d) => lc(d) === lc(m.designation))) { earned += 15; why.push(m.designation); }
  }
  if (req.departments.length) {
    total += 10;
    if (req.departments.some((d) => lc(d) === lc(m.department))) { earned += 10; why.push(m.department); }
  }
  if (req.locations.length) {
    total += 5;
    if (req.locations.some((d) => lc(d) === lc(m.location))) { earned += 5; why.push(m.location); }
  }
  if (req.skills.length) {
    total += 20;
    const hit = req.skills.filter((s) => mskills.some((k) => k === lc(s) || k.includes(lc(s)) || lc(s).includes(k)));
    earned += 20 * (hit.length / req.skills.length);
    hit.forEach((s) => why.push(s));
  }
  if (req.terms.length) {
    const hay = lc([m.name, m.email, m.designation, m.department, m.company, m.location, m.skills, m.about, m.caStatus].join(" "));
    const hit = req.terms.filter((t) => hay.includes(t));
    if (hasStructured(req)) { total += 10; earned += 10 * (hit.length / req.terms.length); }
    else if (hit.length < req.terms.length) fail = true;       // plain search: every word must match
    else { total += 10; earned += 10; }
  }

  const score = total ? Math.round((earned / total) * 100) : 0;
  const soft = hasStructured(req) && !hard;
  const pass = !fail && (!soft || score > 0);
  return { pass, score, why };
}

/** Build a plain-English brief from a job so it can be fed to the same engine. */
function jobToQuery(job) {
  const p = [];
  if (job.expMin) p.push(`${job.expMin}+ years`);
  if (job.expMax) p.push(`under ${job.expMax} years`);
  if (job.caStatus) p.push(job.caStatus);
  if (job.skills) p.push(job.skills);
  return p.join(" ");
}

/** How well does one member fit one job? (for the Jobs page) */
function jobFit(job, m, now = new Date()) {
  const req = emptyReq();
  if (job.expMin) req.minExp = +job.expMin;
  if (job.expMax) req.maxExp = +job.expMax;
  if (job.caStatus) req.ca = [job.caStatus];
  req.skills = String(job.skills || "").split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  if (!hasStructured(req)) return null;
  return matchMember(req, m, now);
}

if (typeof module !== "undefined") module.exports = { parseQuery, matchMember, expYears, jobToQuery, jobFit, emptyReq };
