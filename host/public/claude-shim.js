/*
 * Stands in for the claude.ai runtime when the page is served from your own
 * domain. It gives the page the same two things it asks for there — a live
 * document store and a way to save a file — over this host's own API, and
 * hands it an authenticator so passwords are checked on the server.
 *
 * Loaded ahead of the page's own script, which is why window.claude exists by
 * the time the page looks for it.
 */
(function () {
  "use strict";
  var BOOT = window.KS_BOOT || { needsSetup: true, accountId: null };

  /* The server is the authority on who is signed in: a cookie that expired
     while the tab was closed must not leave the page believing otherwise. */
  try {
    if (BOOT.accountId) localStorage.setItem("ks_session", JSON.stringify({ id: BOOT.accountId }));
    else localStorage.setItem("ks_session", "null");
  } catch (e) {}

  var signedIn = !!BOOT.accountId;

  function fail(code, status) {
    var e = new Error(code);
    e.code = code;
    e.status = status;
    return e;
  }
  async function api(method, url, body) {
    var res;
    try {
      res = await fetch(url, {
        method: method,
        credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) { throw fail("unavailable", 0); }
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && !/^\/api\/(login|setup|logout|bootstrap)/.test(url)) {
      /* signed in a moment ago and refused now: the session is gone, and the
         server draws the right screen on a fresh load */
      if (signedIn) { signedIn = false; location.reload(); }
      throw fail("not_signed_in", 401);
    }
    if (!res.ok) throw fail((data && data.code) || "failed", res.status);
    return data || {};
  }

  /* ------------------------------------------------------------ snapshots */
  var subs = [];           // {coll, qs, cb, err, doc}
  function qsOf(spec) {
    var p = new URLSearchParams();
    (spec.wheres || []).forEach(function (w) { p.append("where", w.join(",")); });
    if (spec.orderBy) { p.set("orderBy", spec.orderBy); p.set("dir", spec.dir || "asc"); }
    if (spec.limit) p.set("limit", String(spec.limit));
    var s = p.toString();
    return s ? "?" + s : "";
  }
  function snapOf(docs) {
    return {
      docs: docs.map(function (d) { return { id: d.id, data: function () { return d.data; } }; })
    };
  }
  async function refill(sub) {
    /* Before anyone signs in there is nothing to show and nothing the server
       would answer, so the page is handed an empty result rather than a
       refusal — it needs one to draw its sign-in screen. */
    if (!signedIn) {
      sub.cb(sub.doc ? { exists: false, data: function () { return {}; } } : snapOf([]));
      return;
    }
    try {
      if (sub.doc) {
        var one = await api("GET", "/api/db/" + sub.coll + "/" + encodeURIComponent(sub.id));
        sub.cb({ exists: !!one.exists, data: function () { return one.data || {}; } });
      } else {
        var many = await api("GET", "/api/db/" + sub.coll + sub.qs);
        sub.cb(snapOf(many.docs || []));
      }
    } catch (e) {
      /* before anyone has signed in there is nothing to show, which is not an
         error — the page needs an empty answer so it can draw its gate */
      if (e.code === "not_signed_in") {
        sub.cb(sub.doc ? { exists: false, data: function () { return {}; } } : snapOf([]));
      } else if (sub.err) sub.err(e);
    }
  }
  function refreshAll(coll) {
    subs.forEach(function (s) { if (!coll || s.coll === coll) refill(s); });
  }

  /* Changes reach other devices over the event stream, and over a slow poll
     when a proxy between here and the server will not hold one open. */
  var seen = {};
  var watching = false;
  function watch() {
    if (watching || !signedIn) return;
    watching = true;
    var es = null;
    try { es = new EventSource("/api/stream", { withCredentials: true }); } catch (e) { es = null; }
    if (!es) return poll();
    es.onmessage = function (ev) {
      var msg = {};
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.coll) { seen[msg.coll] = msg.rev; refreshAll(msg.coll); }
    };
    es.onerror = function () {
      if (es.readyState === 2) { es.close(); setTimeout(poll, 1000); }
    };
  }
  function poll() {
    setInterval(async function () {
      try {
        var r = await api("GET", "/api/rev");
        Object.keys(r.rev || {}).forEach(function (c) {
          if (seen[c] !== r.rev[c]) { seen[c] = r.rev[c]; refreshAll(c); }
        });
      } catch (e) {}
    }, 4000);
  }

  /* ------------------------------------------------------------------- db */
  function docRef(coll, id) {
    var base = "/api/db/" + coll + "/" + encodeURIComponent(id);
    return {
      async get() {
        var r = await api("GET", base);
        return { exists: !!r.exists, data: function () { return r.data || {}; } };
      },
      async set(data) { await api("PUT", base, { data: data }); refreshAll(coll); },
      async update(data) { await api("PATCH", base, { data: data }); refreshAll(coll); },
      async delete() { await api("DELETE", base); refreshAll(coll); },
      async acquire(opts) {
        return await api("POST", base + "/acquire", { holder: (opts || {}).holder, ttlMs: (opts || {}).ttlMs });
      },
      onSnapshot(cb, err) {
        var sub = { coll: coll, id: id, doc: true, cb: cb, err: err };
        subs.push(sub); refill(sub);
        return function () { subs = subs.filter(function (s) { return s !== sub; }); };
      }
    };
  }
  function collRef(coll, spec) {
    spec = spec || {};
    var ref = {
      where: function (f, op, v) {
        return collRef(coll, Object.assign({}, spec, { wheres: (spec.wheres || []).concat([[f, op, v]]) }));
      },
      orderBy: function (f, dir) { return collRef(coll, Object.assign({}, spec, { orderBy: f, dir: dir })); },
      limit: function (n) { return collRef(coll, Object.assign({}, spec, { limit: n })); },
      async get() {
        var r = await api("GET", "/api/db/" + coll + qsOf(spec));
        return snapOf(r.docs || []);
      },
      onSnapshot: function (cb, err) {
        var sub = { coll: coll, qs: qsOf(spec), cb: cb, err: err };
        subs.push(sub); refill(sub);
        return function () { subs = subs.filter(function (s) { return s !== sub; }); };
      }
    };
    return ref;
  }
  function split(p) {
    var parts = String(p).split("/").filter(Boolean);
    return parts;
  }
  var dbNamespace = {
    doc: function (p) {
      var parts = split(p);
      if (parts.length !== 2) throw fail("invalid_argument");
      return docRef(parts[0], parts[1]);
    },
    collection: function (p) {
      var parts = split(p);
      if (parts.length !== 1) throw fail("invalid_argument");
      return collRef(parts[0]);
    }
  };

  /* ------------------------------------------------------------ downloads */
  var downloadsNamespace = {
    async save(opts) {
      var url = URL.createObjectURL(opts.data);
      var a = document.createElement("a");
      a.href = url;
      a.download = opts.filename || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      return { saved: true };
    }
  };

  window.claude = {
    use: async function (name) {
      if (name === "db") return dbNamespace;
      if (name === "downloads") return downloadsNamespace;
      return null;    // nothing else is served here
    }
  };

  /* ----------------------------------------------------------------- auth */
  /* The page keeps its own sign-in screen; only the checking moves here, so a
     password travels to this server and a stored derivation never travels out. */
  window.KS_HOST_AUTH = {
    needsSetup: function () { return !!BOOT.needsSetup; },
    async signIn(username, password) {
      try {
        var r = await api("POST", "/api/login", { username: username, password: password });
        signedIn = true;
        BOOT.needsSetup = false;
        watch();
        refreshAll();
        return { id: r.id };
      } catch (e) {
        if (e.code === "bad_login") return null;
        if (e.code === "not_signed_in") return null;
        throw e;
      }
    },
    async setup(username, password, doc) {
      var r = await api("POST", "/api/setup", { username: username, password: password, doc: doc || {} });
      signedIn = true;
      BOOT.needsSetup = false;
      watch();
      refreshAll();
      return { id: r.id };
    },
    async signOut() {
      try { await api("POST", "/api/logout"); } catch (e) {}
      signedIn = false;
      try { localStorage.setItem("ks_session", "null"); } catch (e) {}
      location.reload();
    },
    async saveAccount(existingId, username, password, doc) {
      var r = await api("POST", "/api/accounts", {
        id: existingId || null, password: password || "",
        doc: Object.assign({}, doc, { username: username })
      });
      refreshAll("accounts");
      return r.id;
    }
  };

  watch();
})();
