// Quota Quest shared core: data store + allocator.
//
// Kept to ES2017 syntax on purpose. Android in-app WebViews (links opened from
// WhatsApp, Slack, Gmail) can be years behind Chrome, and one unsupported operator
// is a parse error that kills the whole script: every button dead, every field blank.
// So: no optional chaining, no nullish coalescing, no object spread, no catch{}.
//
// Data model (localStorage, key STORE):
//   { roster:[{name,dept}], sessions:[{id,date,cost,who:[name],
//       locked:false, payers:[{n,pay}]|null, lockedAt:null }],
//     settings:{cap,maxAct,minFund,mode} }
// A locked session is IMMUTABLE: its payers were photographed, so they can never be
// re-solved. Locked reports claim their quota first; planned ones work around them.

var BUILD = "2026-09-01.2";
var STORE = "quotaquest.v2";
var DEFAULTS = { cap: 1200000, maxAct: 3, minFund: 4, mode: "quarter" };

function fmt(n) { return "IDR " + Math.round(n).toLocaleString("en-US") }
function fmtShort(n) {
  return n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "m" : Math.round(n / 1e3) + "k";
}
function q(d) { return d.slice(0, 4) + "-Q" + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1) }
function mo(d) { return d.slice(0, 7) }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function num(v, dflt) { var n = Number(v); return isFinite(n) && n > 0 ? n : dflt }

function blank() {
  return { roster: [], sessions: [], settings: { cap: DEFAULTS.cap, maxAct: DEFAULTS.maxAct,
    minFund: DEFAULTS.minFund, mode: DEFAULTS.mode } };
}
function load() {
  try {
    var d = JSON.parse(localStorage.getItem(STORE));
    if (!d || !d.roster || !d.roster.length && !d.sessions) return blank();
    var out = blank();
    out.roster = (d.roster || []).map(function (r) {
      return { name: String(r && r.name ? r.name : ""), dept: String(r && r.dept ? r.dept : "") };
    });
    out.sessions = (d.sessions || []).map(function (s) {
      var locked = !!(s && s.locked);
      var payers = s && s.payers && s.payers.length ? s.payers.map(function (p) {
        return { n: String(p.n), pay: Number(p.pay) || 0 };
      }) : null;
      return { id: s && s.id ? String(s.id) : uid(), date: String(s && s.date ? s.date : ""),
        cost: Number(s && s.cost) || 0, who: (s && s.who ? s.who : []).map(String),
        locked: locked && !!payers, payers: payers,
        lockedAt: s && s.lockedAt ? s.lockedAt : null };
    }).filter(function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.cost > 0 });
    var st = d.settings || {};
    out.settings.cap = num(st.cap, DEFAULTS.cap);
    out.settings.maxAct = Math.round(num(st.maxAct, DEFAULTS.maxAct));
    out.settings.minFund = Math.round(num(st.minFund, DEFAULTS.minFund));
    out.settings.mode = st.mode === "month" ? "month" : "quarter";
    return out;
  } catch (e) { return blank() }
}
function save(d) {
  try { localStorage.setItem(STORE, JSON.stringify(d)); return true }
  catch (e) { return false }
}
function deptOf(d) {
  var m = {};
  d.roster.forEach(function (r) { m[r.name] = r.dept });
  return m;
}
function namedRoster(d) { return d.roster.filter(function (r) { return !!r.name }) }
function frozenFunders(d) {
  var set = {};
  d.sessions.forEach(function (s) {
    if (s.locked && s.payers) s.payers.forEach(function (p) { set[p.n] = true });
  });
  return set;
}

// ---- allocator ----------------------------------------------------------
// Pass 1: done reports claim quota exactly as photographed, never re-solved.
// Pass 2: planned sessions solved oldest-first against what is left.
function allocate(data) {
  var cap = data.settings.cap, maxAct = data.settings.maxAct;
  var minFund = data.settings.minFund, mode = data.settings.mode;
  var dept = deptOf(data);
  var st = {};
  function cur(n, Q) {
    if (!st[n]) st[n] = {};
    if (!st[n][Q]) st[n][Q] = { spent: 0, reports: [] };
    return st[n][Q];
  }
  var res = {};
  var byDate = data.sessions.slice().sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });

  byDate.filter(function (s) { return s.locked && s.payers && s.payers.length }).forEach(function (x) {
    var covered = 0;
    x.payers.forEach(function (p) {
      var s0 = cur(p.n, q(x.date));
      s0.spent += p.pay; s0.reports.push(mo(x.date)); covered += p.pay;
    });
    res[x.id] = { valid: true, locked: true, flags: [], payers: x.payers,
      covered: covered, short: x.cost - covered };
  });

  byDate.filter(function (s) { return !(s.locked && s.payers && s.payers.length) }).forEach(function (x) {
    var r = solveOne(x, dept, cap, maxAct, minFund, mode, cur);
    res[x.id] = r;
    if (r.valid) r.payers.forEach(function (p) {
      var s0 = cur(p.n, q(x.date));
      s0.spent += p.pay; s0.reports.push(mo(x.date));
    });
  });

  var out = byDate.map(function (x) {
    var r = res[x.id];
    return { id: x.id, date: x.date, cost: x.cost, who: x.who, lockedAt: x.lockedAt,
      Q: q(x.date), M: mo(x.date), valid: r.valid, locked: r.locked, flags: r.flags,
      payers: r.payers, covered: r.covered, short: r.short };
  });
  return { out: out, st: st, dept: dept };
}

function solveOne(x, dept, cap, maxAct, minFund, mode, cur) {
  function bad(f) { return { valid: false, locked: false, flags: f, payers: [], covered: 0, short: x.cost } }
  var Q = q(x.date), M = mo(x.date), flags = [];
  var depts = {}, nDepts = 0;
  x.who.forEach(function (w) { if (!depts[dept[w]]) { depts[dept[w]] = true; nDepts++ } });
  if (x.who.length < minFund) flags.push("only " + x.who.length + " attendee(s), report needs " + minFund);
  if (nDepts < 2) flags.push("attendees from only 1 department, need 2");
  if (flags.length) return bad(flags);

  var cands = x.who.map(function (n) {
    var s0 = cur(n, Q);
    return { n: n, rem: cap - s0.spent, slots: maxAct - s0.reports.length,
      usedMonth: s0.reports.indexOf(M) !== -1 };
  }).filter(function (c) {
    return c.rem > 0.5 && c.slots > 0 && !(mode === "month" && c.usedMonth);
  }).sort(function (a, b) { return b.rem - a.rem || (a.n < b.n ? -1 : 1) });

  if (cands.length < minFund)
    return bad(["only " + cands.length + " funder(s) with quota left, report needs " + minFund]);

  var set = cands.slice(0, minFund);
  var setDepts = {}, nSet = 0;
  set.forEach(function (c) { if (!setDepts[dept[c.n]]) { setDepts[dept[c.n]] = true; nSet++ } });
  if (nSet < 2) {
    var alt = null;
    cands.slice(minFund).forEach(function (c) { if (!alt && dept[c.n] !== dept[set[0].n]) alt = c });
    if (!alt) return bad(["funders with quota left are all from 1 department, need 2"]);
    set = set.slice(0, minFund - 1).concat([alt]);
  }
  var next = cands.filter(function (c) { return set.indexOf(c) === -1 });
  var split = [];
  for (;;) {
    split = waterfall(set, x.cost);
    var got = 0;
    split.forEach(function (p) { got += p.pay });
    if (x.cost - got <= 0.5 || !next.length) break;
    set = set.concat([next.shift()]);
  }
  var payers = split.filter(function (p) { return p.pay > 0.5 })
    .map(function (p) { return { n: p.n, pay: p.pay } });
  if (payers.length < minFund)
    return bad(["quota stretches to only " + payers.length + " paying funder(s), report needs " + minFund]);

  var covered = 0;
  payers.forEach(function (p) { covered += p.pay });
  return { valid: true, locked: false, flags: [], payers: payers,
    covered: covered, short: x.cost - covered };
}

// Even split capped by each funder's remaining quota; surplus re-spread over the rest.
function waterfall(set, cost) {
  var pool = set.map(function (c) { return { n: c.n, cap: c.rem, pay: 0 } });
  var left = cost;
  for (;;) {
    var open = pool.filter(function (p) { return p.pay < p.cap - 1e-6 });
    if (!open.length || left <= 0.5) break;
    var share = left / open.length, moved = 0;
    open.forEach(function (p) {
      var add = Math.min(share, p.cap - p.pay);
      p.pay += add; moved += add;
    });
    left -= moved;
    if (moved <= 1e-6) break;
  }
  return pool;
}

// ---- export / import ----------------------------------------------------
var FILE_TAG = "quotaquest";

function exportBlob(data) {
  var payload = { tag: FILE_TAG, version: 2, exportedAt: new Date().toISOString(),
    roster: data.roster, sessions: data.sessions, settings: data.settings };
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

// Returns {data:...} or {error:"..."}. Strict enough to refuse a foreign file, lenient
// about optional fields so a hand-edited export still loads.
function parseImport(text) {
  var j;
  try { j = JSON.parse(text) } catch (e) { return { error: "Not valid JSON: " + e.message } }
  if (!j || typeof j !== "object") return { error: "File is not a Quota Quest export." };
  if (j.tag && j.tag !== FILE_TAG) return { error: 'Wrong file, tagged "' + j.tag + '".' };
  if (!(j.roster instanceof Array) || !(j.sessions instanceof Array))
    return { error: "Missing roster or sessions array." };

  var roster = [], seen = {};
  j.roster.forEach(function (r) {
    var name = String(r && r.name ? r.name : "").trim();
    if (!name || seen[name]) return;
    seen[name] = true;
    var dept = String(r && r.dept ? r.dept : "").trim();
    roster.push({ name: name, dept: dept || "?" });
  });
  if (!roster.length) return { error: "Roster is empty." };

  var sessions = [], ids = {}, err = null;
  j.sessions.forEach(function (s) {
    if (err) return;
    var date = String(s && s.date ? s.date : "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { err = 'Bad session date "' + date + '".'; return }
    var cost = Number(s.cost);
    if (!(cost > 0)) { err = "Bad session cost on " + date + "."; return }
    var who = (s.who instanceof Array ? s.who : []).map(String)
      .filter(function (n) { return !!seen[n] });
    var id = String(s.id || "") || uid();
    while (ids[id]) id = uid();
    ids[id] = true;
    var locked = !!s.locked;
    var payers = s.payers instanceof Array
      ? s.payers.map(function (p) { return { n: String(p && p.n ? p.n : ""), pay: Number(p && p.pay) || 0 } })
        .filter(function (p) { return !!seen[p.n] && p.pay > 0 })
      : null;
    if (locked && !(payers && payers.length)) {
      err = "Session " + date + " is marked done but has no funders."; return;
    }
    sessions.push({ id: id, date: date, cost: cost, who: who, locked: locked,
      payers: locked ? payers : null, lockedAt: locked ? (s.lockedAt || null) : null });
  });
  if (err) return { error: err };

  var settings = { cap: num(j.settings && j.settings.cap, DEFAULTS.cap),
    maxAct: Math.round(num(j.settings && j.settings.maxAct, DEFAULTS.maxAct)),
    minFund: Math.round(num(j.settings && j.settings.minFund, DEFAULTS.minFund)),
    mode: j.settings && j.settings.mode === "month" ? "month" : "quarter" };
  return { data: { roster: roster, sessions: sessions, settings: settings } };
}

// Freeze a session's report. Once done the payers never change.
function lockSession(data, id, payers) {
  var s = null;
  data.sessions.forEach(function (x) { if (x.id === id) s = x });
  if (!s || s.locked) return false;
  s.payers = payers.map(function (p) { return { n: p.n, pay: p.pay } });
  s.locked = true;
  s.lockedAt = new Date().toISOString();
  return save(data);
}

// Quarter reset: allowance never carries over, so a closed quarter's sessions are
// dropped and its quota returns to full. Done reports go too, caller must confirm.
function resetQuarter(data, Q) {
  var before = data.sessions.length;
  data.sessions = data.sessions.filter(function (s) { return q(s.date) !== Q });
  save(data);
  return before - data.sessions.length;
}
