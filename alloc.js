// Quota Quest shared core: data store + allocator.
// Data model (localStorage, key STORE):
//   { roster:[{name,dept}], sessions:[{id,date,cost,who:[name],
//       locked:false, payers:[{n,pay}]|null, lockedAt:null }],
//     settings:{cap,maxAct,minFund,mode} }
// A locked session is IMMUTABLE: its payers were photographed, so they can never be
// re-solved. Locked reports claim their quota first; unlocked ones plan around them.

const BUILD = "2026-09-01.1";
const STORE = "quotaquest.v2";
const DEFAULTS = { cap: 1200000, maxAct: 3, minFund: 4, mode: "quarter" };

const fmt = n => "IDR " + Math.round(n).toLocaleString("en-US");
const fmtShort = n => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "m" : Math.round(n / 1e3) + "k");
const q = d => d.slice(0, 4) + "-Q" + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1);
const mo = d => d.slice(0, 7);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function blank() {
  return { roster: [], sessions: [], settings: { ...DEFAULTS } };
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE));
    if (!d || !Array.isArray(d.roster)) return blank();
    d.settings = { ...DEFAULTS, ...(d.settings || {}) };
    d.sessions = (d.sessions || []).map(s => ({ locked: false, payers: null, lockedAt: null, ...s }));
    return d;
  } catch (e) { return blank(); }
}
function save(d) {
  try { localStorage.setItem(STORE, JSON.stringify(d)); return true }
  catch (e) { return false }
}
const deptOf = d => Object.fromEntries(d.roster.map(r => [r.name, r.dept]));

// ---- allocator ----------------------------------------------------------
// Pass 1: locked reports claim quota exactly as photographed.
// Pass 2: unlocked sessions solved oldest-first against what is left.
function allocate(data) {
  const { cap, maxAct, minFund, mode } = data.settings;
  const dept = deptOf(data);
  const st = {};                        // name -> quarter -> {spent, reports:[month]}
  const cur = (n, Q) => { st[n] = st[n] || {}; return st[n][Q] = st[n][Q] || { spent: 0, reports: [] } };
  const res = {};                       // session id -> result

  const byDate = [...data.sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const x of byDate.filter(s => s.locked && s.payers && s.payers.length)) {
    for (const p of x.payers) { const s0 = cur(p.n, q(x.date)); s0.spent += p.pay; s0.reports.push(mo(x.date)) }
    const covered = x.payers.reduce((a, p) => a + p.pay, 0);
    res[x.id] = { valid: true, locked: true, flags: [], payers: x.payers, covered, short: x.cost - covered };
  }

  for (const x of byDate.filter(s => !(s.locked && s.payers && s.payers.length))) {
    res[x.id] = solveOne(x, dept, cap, maxAct, minFund, mode, cur);
    const r = res[x.id];
    if (r.valid) for (const p of r.payers) { const s0 = cur(p.n, q(x.date)); s0.spent += p.pay; s0.reports.push(mo(x.date)) }
  }

  const out = byDate.map(x => ({ ...x, Q: q(x.date), M: mo(x.date), ...res[x.id] }));
  return { out, st, dept };
}

function solveOne(x, dept, cap, maxAct, minFund, mode, cur) {
  const bad = f => ({ valid: false, locked: false, flags: f, payers: [], covered: 0, short: x.cost });
  const Q = q(x.date), M = mo(x.date), flags = [];
  if (x.who.length < minFund) flags.push(`only ${x.who.length} attendee(s), report needs ${minFund}`);
  if (new Set(x.who.map(w => dept[w])).size < 2) flags.push("attendees from only 1 department, need 2");
  if (flags.length) return bad(flags);

  const cands = x.who.map(n => {
    const s0 = cur(n, Q);
    return { n, rem: cap - s0.spent, slots: maxAct - s0.reports.length, usedMonth: s0.reports.includes(M) };
  }).filter(c => c.rem > 0.5 && c.slots > 0 && !(mode === "month" && c.usedMonth))
    .sort((a, b) => b.rem - a.rem || a.n.localeCompare(b.n));

  if (cands.length < minFund)
    return bad([`only ${cands.length} funder(s) with quota left, report needs ${minFund}`]);

  let set = cands.slice(0, minFund);
  if (new Set(set.map(c => dept[c.n])).size < 2) {
    const alt = cands.slice(minFund).find(c => dept[c.n] !== dept[set[0].n]);
    if (!alt) return bad(["funders with quota left are all from 1 department, need 2"]);
    set = [...set.slice(0, minFund - 1), alt];
  }
  let split = [], next = cands.filter(c => !set.includes(c));
  for (;;) {
    split = waterfall(set, x.cost);
    if (x.cost - split.reduce((a, p) => a + p.pay, 0) <= 0.5 || !next.length) break;
    set = [...set, next.shift()];
  }
  const payers = split.filter(p => p.pay > 0.5).map(p => ({ n: p.n, pay: p.pay }));
  if (payers.length < minFund)
    return bad([`quota stretches to only ${payers.length} paying funder(s), report needs ${minFund}`]);

  const covered = payers.reduce((a, p) => a + p.pay, 0);
  return { valid: true, locked: false, flags: [], payers, covered, short: x.cost - covered };
}

// Even split capped by each funder's remaining quota; surplus re-spread over the rest.
function waterfall(set, cost) {
  const pool = set.map(c => ({ n: c.n, cap: c.rem, pay: 0 }));
  let left = cost;
  for (;;) {
    const open = pool.filter(p => p.pay < p.cap - 1e-6);
    if (!open.length || left <= 0.5) break;
    const share = left / open.length;
    let moved = 0;
    for (const p of open) { const add = Math.min(share, p.cap - p.pay); p.pay += add; moved += add }
    left -= moved;
    if (moved <= 1e-6) break;
  }
  return pool;
}

// ---- export / import ----------------------------------------------------
const FILE_TAG = "quotaquest";

function exportBlob(data) {
  const payload = { tag: FILE_TAG, version: 2, exportedAt: new Date().toISOString(), ...data };
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

// Returns {data} or {error}. Strict enough to refuse a foreign file, lenient about
// missing optional fields so a hand-edited export still loads.
function parseImport(text) {
  let j;
  try { j = JSON.parse(text) } catch (e) { return { error: "Not valid JSON: " + e.message } }
  if (!j || typeof j !== "object") return { error: "File is not a Quota Quest export." };
  if (j.tag && j.tag !== FILE_TAG) return { error: `Wrong file: tagged "${j.tag}".` };
  if (!Array.isArray(j.roster) || !Array.isArray(j.sessions))
    return { error: "Missing roster or sessions array." };

  const roster = [], seen = new Set();
  for (const r of j.roster) {
    const name = String(r?.name ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    roster.push({ name, dept: String(r?.dept ?? "").trim() || "" });
  }
  if (!roster.length) return { error: "Roster is empty." };

  const sessions = [], ids = new Set();
  for (const s of j.sessions) {
    const date = String(s?.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: `Bad session date "${date}".` };
    const cost = Number(s?.cost);
    if (!(cost > 0)) return { error: `Bad session cost on ${date}.` };
    const who = (Array.isArray(s?.who) ? s.who : []).map(String).filter(n => seen.has(n));
    let id = String(s?.id ?? "") || uid();
    while (ids.has(id)) id = uid();
    ids.add(id);
    const locked = !!s?.locked;
    let payers = Array.isArray(s?.payers)
      ? s.payers.map(p => ({ n: String(p?.n ?? ""), pay: Number(p?.pay) || 0 }))
        .filter(p => seen.has(p.n) && p.pay > 0) : null;
    if (locked && !(payers && payers.length))
      return { error: `Session ${date} is marked done but has no funders.` };
    sessions.push({ id, date, cost, who, locked, payers: locked ? payers : null,
      lockedAt: locked ? (s.lockedAt || null) : null });
  }
  const settings = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    const v = j.settings?.[k];
    if (k === "mode") { if (v === "month" || v === "quarter") settings.mode = v }
    else if (Number(v) > 0) settings[k] = Number(v);
  }
  return { data: { roster, sessions, settings } };
}

// Freeze a session's report. Once locked the payers never change.
function lockSession(data, id, payers) {
  const s = data.sessions.find(s => s.id === id);
  if (!s || s.locked) return false;
  s.payers = payers.map(p => ({ n: p.n, pay: p.pay }));
  s.locked = true;
  s.lockedAt = new Date().toISOString();
  return save(data);
}

// Quarter reset: allowance never carries over, so a closed quarter's sessions are
// dropped and its quota returns to full. Locked reports go too - caller must confirm.
function resetQuarter(data, Q) {
  const before = data.sessions.length;
  data.sessions = data.sessions.filter(s => q(s.date) !== Q);
  save(data);
  return before - data.sessions.length;
}
