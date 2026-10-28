/*
 * Kitchen Stock — self-hosting server
 *
 * Serves web/kitchen-stock.html from your own domain and gives it the two
 * runtime abilities it gets for free on claude.ai: somewhere to keep its data,
 * and a way to hand the viewer a file. The page itself is served byte for byte
 * as it is published, with a boot record and a shim injected ahead of its own
 * script, so there is only ever one copy of the app to maintain.
 *
 * The one thing this host does better than the published page: a password is
 * checked here, on the server, against a stored scrypt derivation. The browser
 * never receives a hash, so an account's password cannot be attacked offline
 * by whoever reaches the page.
 */
import express from "express";
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(HERE, "data");
const PAGE = process.env.PAGE_FILE || path.join(HERE, "..", "web", "kitchen-stock.html");
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
/* Behind a proxy that terminates TLS (Caddy, nginx, a PaaS router) the cookie
   still has to be marked Secure, which this cannot tell from the socket. */
const SECURE_COOKIES = process.env.SECURE_COOKIES !== "0";

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "kitchen-stock.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS docs (
    coll TEXT NOT NULL,
    id   TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (coll, id)
  );
  CREATE TABLE IF NOT EXISTS secrets (
    account_id TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS leases (
    coll TEXT NOT NULL,
    id   TEXT NOT NULL,
    holder TEXT NOT NULL,
    until INTEGER NOT NULL,
    PRIMARY KEY (coll, id)
  );
`);

/* ------------------------------------------------------------- documents */
/* The page addresses its data as collection/id pairs, so only the collections
   it actually uses are accepted — a typo cannot quietly start a new one. */
const COLLECTIONS = ["ingredients", "products", "accounts", "branches", "movements", "meta"];
const ID_RE = /^[A-Za-z0-9_.-]{1,80}$/;
const okColl = (c) => COLLECTIONS.includes(c);

const q = {
  all:    db.prepare("SELECT id, data FROM docs WHERE coll = ?"),
  one:    db.prepare("SELECT id, data FROM docs WHERE coll = ? AND id = ?"),
  put:    db.prepare("INSERT INTO docs (coll,id,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(coll,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"),
  del:    db.prepare("DELETE FROM docs WHERE coll = ? AND id = ?"),
  count:  db.prepare("SELECT COUNT(*) AS n FROM docs WHERE coll = ?")
};

function readDoc(coll, id) {
  const row = q.one.get(coll, id);
  return row ? JSON.parse(row.data) : null;
}
function readColl(coll) {
  return q.all.all(coll).map((r) => ({ id: r.id, data: JSON.parse(r.data) }));
}
function writeDoc(coll, id, data) {
  q.put.run(coll, id, JSON.stringify(data), new Date().toISOString());
  bump(coll);
}
function deleteDoc(coll, id) {
  q.del.run(coll, id);
  bump(coll);
}

/* -------------------------------------------------------------- watchers */
/* Every open till needs to see a sale the moment it happens, so each change
   bumps a counter and wakes the pages listening on the event stream. */
const rev = Object.fromEntries(COLLECTIONS.map((c) => [c, 1]));
const watchers = new Set();
function bump(coll) {
  rev[coll] = (rev[coll] || 0) + 1;
  const line = `data: ${JSON.stringify({ coll, rev: rev[coll] })}\n\n`;
  for (const res of watchers) { try { res.write(line); } catch { watchers.delete(res); } }
}

/* ------------------------------------------------------------- passwords */
/* scrypt, from Node's own crypto — no dependency, and deliberately slow. */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt: salt.toString("base64"), hash: key.toString("base64") };
}
function passwordMatches(pw, salt, hash) {
  try {
    const want = Buffer.from(hash, "base64");
    const got = crypto.scryptSync(String(pw), Buffer.from(salt, "base64"), want.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return crypto.timingSafeEqual(want, got);
  } catch { return false; }
}
const setSecret = db.prepare("INSERT INTO secrets (account_id,salt,hash) VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET salt=excluded.salt, hash=excluded.hash");
const getSecret = db.prepare("SELECT salt, hash FROM secrets WHERE account_id = ?");
const dropSecret = db.prepare("DELETE FROM secrets WHERE account_id = ?");

/* A wrong password costs the attacker time that grows with each attempt, which
   a shop's own staff never notice and a script run against the domain does. */
const attempts = new Map();
function throttle(key) {
  const rec = attempts.get(key);
  if (!rec) return 0;
  if (Date.now() > rec.until) { attempts.delete(key); return 0; }
  return rec.until - Date.now();
}
function noteFailure(key) {
  const rec = attempts.get(key) || { n: 0, until: 0 };
  rec.n += 1;
  rec.until = Date.now() + Math.min(30000, 250 * 2 ** Math.min(rec.n, 7));
  attempts.set(key, rec);
}

/* -------------------------------------------------------------- sessions */
const newSession = db.prepare("INSERT INTO sessions (token,account_id,expires_at) VALUES (?,?,?)");
const findSession = db.prepare("SELECT account_id, expires_at FROM sessions WHERE token = ?");
const dropSession = db.prepare("DELETE FROM sessions WHERE token = ?");
const dropAccountSessions = db.prepare("DELETE FROM sessions WHERE account_id = ?");
db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());

const COOKIE = "ks_sid";
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function startSession(res, accountId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  newSession.run(token, accountId, expires.toISOString());
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: SECURE_COOKIES,
    expires, path: "/"
  });
  return token;
}
function endSession(req, res) {
  const token = cookies(req)[COOKIE];
  if (token) dropSession.run(token);
  res.clearCookie(COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: SECURE_COOKIES });
}
/* The signed-in account is read from the database on every request, so a
   manager who revokes an account or changes its permissions is obeyed at once
   rather than whenever that device next signs in. */
function currentAccount(req) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  const s = findSession.get(token);
  if (!s) return null;
  if (s.expires_at < new Date().toISOString()) { dropSession.run(token); return null; }
  const acct = readDoc("accounts", s.account_id);
  if (!acct || acct.active === false) return null;
  return Object.assign({ id: s.account_id }, acct);
}
function needsSetup() { return q.count.get("accounts").n === 0; }

function requireAccount(req, res, next) {
  const acct = currentAccount(req);
  if (!acct) return res.status(401).json({ code: "not_signed_in" });
  req.account = acct;
  next();
}

/* ------------------------------------------------------------------ app */
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY !== "0") app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
/* express 4 has res.cookie but not a cookie reader; the pair above is enough. */

/* ---- the page itself -------------------------------------------------- */
/* Injected ahead of the page's own script: what the server already knows about
   this request, then the shim that stands in for the claude.ai runtime. */
const SKELETON_HEAD =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<meta name="robots" content="noindex,nofollow">' +
  '<link rel="icon" href="data:image/svg+xml,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text y="13" font-size="13">🍳</text></svg>') +
  '"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style></head><body>';

function pageHtml(req) {
  let html = fs.readFileSync(PAGE, "utf8");
  const acct = currentAccount(req);
  const boot = { host: true, needsSetup: needsSetup(), accountId: acct ? acct.id : null };
  const inject =
    "<script>window.KS_BOOT=" + JSON.stringify(boot).replace(/</g, "\\u003c") + ";</script>\n" +
    '<script src="/claude-shim.js"></script>\n';
  const at = html.indexOf("<script");
  if (at < 0) throw new Error("the page has no script to inject ahead of");
  html = html.slice(0, at) + inject + html.slice(at);
  /* The published page is a fragment: claude.ai wraps it in a document when it
     serves it, and without the same wrapper here the browser would guess at the
     encoding and ignore the phone viewport. */
  if (!/^\s*<!doctype/i.test(html)) html = SKELETON_HEAD + html + "</body></html>";
  return html;
}
app.get("/", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("html").send(pageHtml(req));
});
app.get("/claude-shim.js", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("js").sendFile(path.join(HERE, "public", "claude-shim.js"));
});
app.get("/healthz", (req, res) => res.json({ ok: true }));

/* ---- signing in ------------------------------------------------------- */
app.get("/api/bootstrap", (req, res) => {
  const acct = currentAccount(req);
  res.json({ needsSetup: needsSetup(), accountId: acct ? acct.id : null });
});

app.post("/api/setup", (req, res) => {
  if (!needsSetup()) return res.status(409).json({ code: "already_set_up" });
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || password.length < 6) return res.status(400).json({ code: "invalid_argument" });
  const id = "acct_" + crypto.randomBytes(8).toString("hex");
  const doc = Object.assign({}, req.body?.doc || {}, {
    username, role: "admin", active: true, branch: "*",
    created_at: new Date().toISOString()
  });
  doc.perms = Object.assign({}, doc.perms, { admin: 1 });
  const s = hashPassword(password);
  setSecret.run(id, s.salt, s.hash);
  writeDoc("accounts", id, doc);
  startSession(res, id);
  res.json({ id });
});

app.post("/api/login", (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const key = (req.ip || "?") + "|" + username;
  const wait = throttle(key);
  if (wait > 0) return res.status(429).json({ code: "rate_limited", retryInMs: wait });
  const hit = readColl("accounts").find(
    (a) => String(a.data.username || "").toLowerCase() === username && a.data.active !== false
  );
  const secret = hit ? getSecret.get(hit.id) : null;
  if (!hit || !secret || !passwordMatches(password, secret.salt, secret.hash)) {
    noteFailure(key);
    return res.status(401).json({ code: "bad_login" });
  }
  attempts.delete(key);
  startSession(res, hit.id);
  res.json({ id: hit.id });
});

app.post("/api/logout", (req, res) => { endSession(req, res); res.json({ ok: true }); });

/* Creating and editing accounts goes through here rather than the document
   routes, because only this path ever sees a password and it never stores one
   in a document the browser can read back. */
app.post("/api/accounts", requireAccount, (req, res) => {
  if (!req.account.perms?.admin) return res.status(403).json({ code: "not_allowed" });
  const existingId = req.body?.id ? String(req.body.id) : null;
  const password = req.body?.password ? String(req.body.password) : "";
  const doc = Object.assign({}, req.body?.doc || {});
  delete doc.salt; delete doc.hash;
  if (existingId) {
    if (!ID_RE.test(existingId)) return res.status(400).json({ code: "invalid_argument" });
    const prev = readDoc("accounts", existingId);
    if (!prev) return res.status(404).json({ code: "not_found" });
    if (password) {
      if (password.length < 6) return res.status(400).json({ code: "invalid_argument" });
      const s = hashPassword(password);
      setSecret.run(existingId, s.salt, s.hash);
      /* a new password should turn the old devices out */
      dropAccountSessions.run(existingId);
      if (existingId === req.account.id) startSession(res, existingId);
    }
    writeDoc("accounts", existingId, Object.assign(prev, doc));
    return res.json({ id: existingId });
  }
  if (!doc.username || password.length < 6) return res.status(400).json({ code: "invalid_argument" });
  const taken = readColl("accounts").some(
    (a) => String(a.data.username || "").toLowerCase() === String(doc.username).toLowerCase()
  );
  if (taken) return res.status(409).json({ code: "user_taken" });
  const id = "acct_" + crypto.randomBytes(8).toString("hex");
  doc.created_at = doc.created_at || new Date().toISOString();
  const s = hashPassword(password);
  setSecret.run(id, s.salt, s.hash);
  writeDoc("accounts", id, doc);
  res.json({ id });
});

/* ---- documents -------------------------------------------------------- */
/* Whatever a page is allowed to write, it is not allowed to write its own way
   past the account rules, so account documents are filtered on the way out and
   refused on the way in. */
function publicAccount(data) {
  const out = Object.assign({}, data);
  delete out.salt; delete out.hash;
  return out;
}
function outward(coll, docs) {
  return coll === "accounts" ? docs.map((d) => ({ id: d.id, data: publicAccount(d.data) })) : docs;
}
function writable(coll, account) {
  if (coll === "accounts") return false;   // only /api/accounts writes those
  return !!account;
}

function applyQuery(docs, req) {
  let rows = docs;
  const wheres = [].concat(req.query.where || []);
  for (const w of wheres) {
    const [field, op, ...rest] = String(w).split(",");
    const value = rest.join(",");
    rows = rows.filter((r) => {
      const v = r.data[field];
      if (op === "==") return String(v) === value;
      if (op === ">=") return String(v) >= value;
      if (op === "<=") return String(v) <= value;
      if (op === ">") return String(v) > value;
      if (op === "<") return String(v) < value;
      return true;
    });
  }
  if (req.query.orderBy) {
    const f = String(req.query.orderBy), dir = req.query.dir === "desc" ? -1 : 1;
    rows = rows.slice().sort((a, b) => {
      const x = String(a.data[f] ?? ""), y = String(b.data[f] ?? "");
      return x < y ? -dir : x > y ? dir : 0;
    });
  }
  const limit = Number(req.query.limit);
  if (limit > 0) rows = rows.slice(0, limit);
  return rows;
}

app.get("/api/db/:coll", requireAccount, (req, res) => {
  const { coll } = req.params;
  if (!okColl(coll)) return res.status(404).json({ code: "no_such_collection" });
  res.json({ docs: outward(coll, applyQuery(readColl(coll), req)), rev: rev[coll] });
});

app.get("/api/db/:coll/:id", requireAccount, (req, res) => {
  const { coll, id } = req.params;
  if (!okColl(coll) || !ID_RE.test(id)) return res.status(404).json({ code: "not_found" });
  const data = readDoc(coll, id);
  if (!data) return res.json({ exists: false });
  res.json({ exists: true, data: coll === "accounts" ? publicAccount(data) : data });
});

app.put("/api/db/:coll/:id", requireAccount, (req, res) => {
  const { coll, id } = req.params;
  if (!okColl(coll) || !ID_RE.test(id)) return res.status(400).json({ code: "invalid_argument" });
  if (!writable(coll, req.account)) return res.status(403).json({ code: "not_allowed" });
  writeDoc(coll, id, req.body?.data || {});
  res.json({ ok: true });
});

app.patch("/api/db/:coll/:id", requireAccount, (req, res) => {
  const { coll, id } = req.params;
  if (!okColl(coll) || !ID_RE.test(id)) return res.status(400).json({ code: "invalid_argument" });
  if (!writable(coll, req.account)) return res.status(403).json({ code: "not_allowed" });
  const prev = readDoc(coll, id) || {};
  writeDoc(coll, id, Object.assign(prev, req.body?.data || {}));
  res.json({ ok: true });
});

app.delete("/api/db/:coll/:id", requireAccount, (req, res) => {
  const { coll, id } = req.params;
  if (!okColl(coll) || !ID_RE.test(id)) return res.status(400).json({ code: "invalid_argument" });
  if (coll === "accounts") {
    if (!req.account.perms?.admin) return res.status(403).json({ code: "not_allowed" });
    dropSecret.run(id); dropAccountSessions.run(id);
    deleteDoc(coll, id);
    return res.json({ ok: true });
  }
  if (!writable(coll, req.account)) return res.status(403).json({ code: "not_allowed" });
  deleteDoc(coll, id);
  res.json({ ok: true });
});

/* Two tills recording a sale in the same second must not overwrite each
   other's line, so the day's movement bucket is appended under a short lease. */
app.post("/api/db/:coll/:id/acquire", requireAccount, (req, res) => {
  const { coll, id } = req.params;
  if (!okColl(coll) || !ID_RE.test(id)) return res.status(400).json({ code: "invalid_argument" });
  const holder = String(req.body?.holder || "").slice(0, 80);
  const ttl = Math.min(Math.max(Number(req.body?.ttlMs) || 4000, 500), 30000);
  const now = Date.now();
  const row = db.prepare("SELECT holder, until FROM leases WHERE coll = ? AND id = ?").get(coll, id);
  if (row && row.until > now && row.holder !== holder) return res.json({ acquired: false });
  db.prepare("INSERT INTO leases (coll,id,holder,until) VALUES (?,?,?,?) ON CONFLICT(coll,id) DO UPDATE SET holder=excluded.holder, until=excluded.until")
    .run(coll, id, holder, now + ttl);
  res.json({ acquired: true });
});

/* ---- change notifications -------------------------------------------- */
app.get("/api/rev", requireAccount, (req, res) => res.json({ rev }));

app.get("/api/stream", requireAccount, (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ hello: true, rev })}\n\n`);
  watchers.add(res);
  const beat = setInterval(() => { try { res.write(": beat\n\n"); } catch {} }, 25000);
  req.on("close", () => { clearInterval(beat); watchers.delete(res); });
});

/* Someone will type the domain with a path on the end; there is only one page
   here, so send them to it rather than to a 404. */
app.get(/^(?!\/api\/).*/, (req, res) => res.redirect("/"));

app.listen(PORT, () => {
  console.log(`Kitchen Stock is serving on http://localhost:${PORT}`);
  console.log(`  data:  ${DATA_DIR}`);
  console.log(`  page:  ${PAGE}`);
  if (needsSetup()) console.log("  open it to create the first manager account");
});
