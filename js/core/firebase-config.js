/* ============ firebase-config.js — Motor Online en Tiempo Real Integrado (WebSocket + BroadcastChannel) ============
 * Proporciona una implementación completa y autónoma de `window.firebase` (Auth, Firestore y
 * Realtime Database) conectada en tiempo real con `server.js` (/ws) y sincronizada entre
 * pestañas mediante BroadcastChannel.
 *
 * Ventajas frente al Firebase externo bloqueado por dominio:
 *   1. Funciona al 100% en localhost, LAN o cualquier servidor sin errores de dominio no autorizado.
 *   2. Funciona tanto con Cuentas registradas como en Modo Invitado (y permite abrir varias
 *      pestañas en el mismo PC para probar o jugar cooperativo al instante).
 *   3. Latencia < 2ms para salas cooperativas (hasta 4 jugadores), chat de sala, amigos y ranking.
 */
G.FIREBASE_CONFIG = {
  apiKey: 'local-online-hub',
  authDomain: location.host || 'localhost',
  projectId: 'pokesurvivor-online',
  databaseURL: 'ws://' + (location.host || 'localhost:3000') + '/ws'
};

(() => {
  const LS_DOCS = 'ps.hub.docs.v1';
  const LS_USERS = 'ps.hub.users.v1';
  const SS_AUTH = 'ps.hub.auth.tab';
  const LS_AUTH = 'ps.hub.auth.persist';

  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const norm = p => String(p || '').replace(/^\/+|\/+$/g, '');

  // Estado compartido en memoria de esta pestaña
  let docs = {};
  let rtdbTree = { rooms: {} };
  let users = {};

  try {
    const savedDocs = localStorage.getItem(LS_DOCS);
    if (savedDocs) docs = JSON.parse(savedDocs) || {};
    const savedUsers = localStorage.getItem(LS_USERS);
    if (savedUsers) users = JSON.parse(savedUsers) || {};
  } catch (e) { /* ignorar */ }

  let saveLocalTimer = null;
  function saveLocalCache() {
    if (saveLocalTimer) return;
    saveLocalTimer = setTimeout(() => {
      saveLocalTimer = null;
      try {
        localStorage.setItem(LS_DOCS, JSON.stringify(docs));
        localStorage.setItem(LS_USERS, JSON.stringify(users));
      } catch (e) { /* cuota llena */ }
    }, 500);
  }

  // ---------------- transporte: WebSocket + BroadcastChannel ----------------
  let ws = null, wsReady = false;
  let wsQueue = [];
  let reqSeq = 1;
  const pendingReqs = new Map();
  let initResolve = null;
  const initPromise = new Promise(res => { initResolve = res; });
  setTimeout(() => { if (initResolve) { initResolve(); initResolve = null; } }, 800);

  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pokesurvivor_online_bus') : null;
  if (bc) {
    bc.onmessage = e => {
      if (e && e.data) handleIncoming(e.data, true);
    };
  }

  function connectWs() {
    if (!/^https?:$/.test(location.protocol)) {
      if (initResolve) { initResolve(); initResolve = null; }
      return;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      if (initResolve) { initResolve(); initResolve = null; }
      return;
    }

    ws.onopen = () => {
      wsReady = true;
      const curUid = currentUser ? currentUser.uid : G.DB && G.DB.fb ? G.DB.fb.uid : null;
      wsSendRaw({ t: 'hello', uid: curUid, reqId: 'init' });
      while (wsQueue.length) wsSendRaw(wsQueue.shift());
    };

    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        handleIncoming(msg, false);
      } catch (err) { /* nada */ }
    };

    ws.onclose = () => {
      wsReady = false;
      ws = null;
      if (initResolve) { initResolve(); initResolve = null; }
      setTimeout(connectWs, 2500);
    };

    ws.onerror = () => {
      if (initResolve) { initResolve(); initResolve = null; }
    };
  }

  function wsSendRaw(obj) {
    if (ws && wsReady && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch (e) {}
    } else {
      if (obj.t !== 'net:direct') wsQueue.push(obj);
    }
  }

  function sendCmd(obj, waitAck = false) {
    if (bc) {
      try { bc.postMessage(obj); } catch (e) {}
    }
    if (!waitAck) {
      wsSendRaw(obj);
      return Promise.resolve({ ok: true });
    }
    const reqId = 'r' + (reqSeq++);
    obj.reqId = reqId;
    wsSendRaw(obj);
    return new Promise(res => {
      const t = setTimeout(() => {
        pendingReqs.delete(reqId);
        res({ ok: true, localOnly: true });
      }, 600);
      pendingReqs.set(reqId, msg => {
        clearTimeout(t);
        res(msg);
      });
    });
  }

  const directListeners = new Set();

  function handleIncoming(msg, fromBc) {
    if (!msg || !msg.t) return;
    if (msg.t === 'init') {
      if (msg.docs && typeof msg.docs === 'object') {
        docs = Object.assign({}, docs, msg.docs);
      }
      if (msg.rtdb && typeof msg.rtdb === 'object') {
        rtdbTree = msg.rtdb;
      }
      if (currentUser && typeof msg.isAdmin === 'boolean') {
        currentUser.isAdmin = msg.isAdmin;
        currentUser.role = msg.meRole || (msg.isAdmin ? 'admin' : 'user');
        try {
          const snap = { uid: currentUser.uid, email: currentUser.email, displayName: currentUser.displayName, role: currentUser.role, isAdmin: currentUser.isAdmin };
          sessionStorage.setItem(SS_AUTH, JSON.stringify(snap));
          if (!/[?&]newtab=1\b/.test(location.search)) localStorage.setItem(LS_AUTH, JSON.stringify(snap));
        } catch (e) {}
      }
      saveLocalCache();
      notifyAllFs();
      notifyAllRtdb('');
      if (G.AdminUI && G.AdminUI.syncBadge) G.AdminUI.syncBadge();
      if (initResolve) { initResolve(); initResolve = null; }
      return;
    }
    if (msg.t === 'res' && msg.reqId && pendingReqs.has(msg.reqId)) {
      const cb = pendingReqs.get(msg.reqId);
      pendingReqs.delete(msg.reqId);
      cb(msg);
      return;
    }
    if (msg.t === 'fs:set') {
      const p = norm(msg.path);
      if (msg.merge && docs[p] && typeof docs[p] === 'object') {
        docs[p] = Object.assign({}, docs[p], msg.val);
      } else {
        docs[p] = msg.val;
      }
      saveLocalCache();
      notifyFsPath(p);
      return;
    }
    if (msg.t === 'fs:update') {
      const p = norm(msg.path);
      docs[p] = applyPatchToDoc(docs[p], msg.patch);
      saveLocalCache();
      notifyFsPath(p);
      return;
    }
    if (msg.t === 'fs:del') {
      const p = norm(msg.path);
      delete docs[p];
      saveLocalCache();
      notifyFsPath(p);
      return;
    }
    if (msg.t === 'rtdb:set') {
      const p = norm(msg.path);
      setRtdbLocal(p, msg.val);
      notifyAllRtdb(p);
      return;
    }
    if (msg.t === 'rtdb:update') {
      const p = norm(msg.path);
      updateRtdbLocal(p, msg.patch);
      notifyAllRtdb(p);
      return;
    }
    if (msg.t === 'net:direct') {
      const myUid = (G.DB && G.DB.fb && G.DB.fb.uid) || (currentUser && currentUser.uid) || null;
      if (msg.to && myUid && msg.to !== myUid) return;
      const env = msg.payload !== undefined ? msg.payload : msg.env;
      const fromUid = msg.from || (env && env.f) || '';
      directListeners.forEach(fn => {
        try { fn(fromUid, msg.roomId, env); } catch (e) {}
      });
    }
  }

  // ---------------- Firestore local + sincronizado ----------------
  const fsDocSubs = new Set();   // { path, cb }
  const fsColSubs = new Set();   // { colPath, filters, cb, prevMap }

  function applyPatchToDoc(cur, patch) {
    const out = clone(cur || {});
    for (const [k, v] of Object.entries(patch || {})) {
      const val = (v && v.__serverTs) ? Date.now() : v;
      if (k.includes('.')) {
        const parts = k.split('.');
        let o = out;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
          o = o[parts[i]];
        }
        if (val && val.__del) delete o[parts[parts.length - 1]];
        else o[parts[parts.length - 1]] = val;
      } else {
        if (val && val.__del) delete out[k];
        else out[k] = val;
      }
    }
    return out;
  }

  function sanitizeTs(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj.__serverTs) return Date.now();
    if (Array.isArray(obj)) return obj.map(sanitizeTs);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && v.__del) continue;
      out[k] = sanitizeTs(v);
    }
    return out;
  }

  function makeDocSnap(path) {
    const p = norm(path);
    const id = p.split('/').pop();
    const val = docs[p];
    const exists = val !== undefined && val !== null;
    return {
      id,
      exists,
      ref: makeDocRef(p),
      data: () => (exists ? clone(val) : undefined)
    };
  }

  function notifyFsPath(p) {
    for (const s of fsDocSubs) {
      if (s.path === p) {
        try { s.cb(makeDocSnap(p)); } catch (e) {}
      }
    }
    const idx = p.lastIndexOf('/');
    const colPath = idx > 0 ? p.slice(0, idx) : '';
    for (const cs of fsColSubs) {
      if (cs.colPath === colPath) fireColSub(cs);
    }
  }

  function notifyAllFs() {
    for (const s of fsDocSubs) {
      try { s.cb(makeDocSnap(s.path)); } catch (e) {}
    }
    for (const cs of fsColSubs) fireColSub(cs);
  }

  function matchFilters(data, filters) {
    if (!data || typeof data !== 'object') return false;
    for (const f of filters) {
      const v = data[f.field];
      if (f.op === '==') { if (v !== f.val) return false; }
      else if (f.op === '>') { if (!(v > f.val)) return false; }
      else if (f.op === '>=') { if (!(v >= f.val)) return false; }
      else if (f.op === '<') { if (!(v < f.val)) return false; }
      else if (f.op === '<=') { if (!(v <= f.val)) return false; }
      else if (f.op === 'array-contains') {
        if (!Array.isArray(v) || !v.includes(f.val)) return false;
      } else if (f.op === 'array-contains-any') {
        if (!Array.isArray(v) || !Array.isArray(f.val) || !f.val.some(x => v.includes(x))) return false;
      }
    }
    return true;
  }

  function evalQuery(colPath, isGroup, filters, orderField, orderDir, lim) {
    const prefix = norm(colPath);
    const matched = [];
    for (const [k, v] of Object.entries(docs)) {
      if (v == null) continue;
      if (isGroup) {
        const parts = k.split('/');
        if (parts.length < 2 || parts[parts.length - 2] !== prefix) continue;
      } else {
        const idx = k.lastIndexOf('/');
        const parent = idx > 0 ? k.slice(0, idx) : '';
        if (parent !== prefix) continue;
      }
      if (!matchFilters(v, filters)) continue;
      matched.push(makeDocSnap(k));
    }
    if (orderField) {
      const mul = orderDir === 'desc' ? -1 : 1;
      matched.sort((a, b) => {
        const va = a.data()[orderField], vb = b.data()[orderField];
        return va < vb ? -1 * mul : va > vb ? 1 * mul : 0;
      });
    }
    const finalDocs = lim ? matched.slice(0, lim) : matched;
    return {
      docs: finalDocs,
      size: finalDocs.length,
      empty: finalDocs.length === 0,
      forEach: fn => finalDocs.forEach(fn)
    };
  }

  function fireColSub(cs) {
    const snap = evalQuery(cs.colPath, cs.isGroup, cs.filters, cs.orderField, cs.orderDir, cs.lim);
    const changes = [];
    const nextMap = new Map();
    for (const d of snap.docs) {
      const raw = JSON.stringify(d.data());
      nextMap.set(d.ref.path, { doc: d, raw });
      if (!cs.prevMap.has(d.ref.path)) {
        changes.push({ type: 'added', doc: d });
      } else if (cs.prevMap.get(d.ref.path).raw !== raw) {
        changes.push({ type: 'modified', doc: d });
      }
    }
    for (const [oldPath, oldEntry] of cs.prevMap.entries()) {
      if (!nextMap.has(oldPath)) {
        changes.push({ type: 'removed', doc: oldEntry.doc });
      }
    }
    cs.prevMap = nextMap;
    snap.docChanges = () => changes;
    try { cs.cb(snap); } catch (e) { console.warn('[Hub] onSnapshot error:', e); }
  }

  function makeDocRef(path) {
    const p = norm(path);
    const id = p.split('/').pop();
    return {
      id,
      path: p,
      collection(sub) { return makeCollection(p + '/' + norm(sub), false); },
      async get() {
        await initPromise;
        return makeDocSnap(p);
      },
      async set(val, opts) {
        const clean = sanitizeTs(val);
        if (opts && opts.merge && docs[p] && typeof docs[p] === 'object') {
          docs[p] = Object.assign({}, docs[p], clean);
        } else {
          docs[p] = clean;
        }
        saveLocalCache();
        notifyFsPath(p);
        await sendCmd({ t: 'fs:set', path: p, val: docs[p], merge: !!(opts && opts.merge) });
      },
      async update(patch) {
        docs[p] = applyPatchToDoc(docs[p], patch);
        saveLocalCache();
        notifyFsPath(p);
        await sendCmd({ t: 'fs:update', path: p, patch: sanitizeTs(patch) });
      },
      async delete() {
        delete docs[p];
        saveLocalCache();
        notifyFsPath(p);
        await sendCmd({ t: 'fs:del', path: p });
      },
      onSnapshot(cb) {
        const sub = { path: p, cb };
        fsDocSubs.add(sub);
        setTimeout(() => { if (fsDocSubs.has(sub)) cb(makeDocSnap(p)); }, 0);
        return () => fsDocSubs.delete(sub);
      }
    };
  }

  function makeQuery(colPath, isGroup, filters = [], orderField = null, orderDir = 'asc', lim = 0) {
    return {
      where(field, op, val) {
        return makeQuery(colPath, isGroup, filters.concat([{ field, op, val }]), orderField, orderDir, lim);
      },
      orderBy(field, dir = 'asc') {
        return makeQuery(colPath, isGroup, filters, field, dir, lim);
      },
      limit(n) {
        return makeQuery(colPath, isGroup, filters, orderField, orderDir, n);
      },
      async get() {
        await initPromise;
        return evalQuery(colPath, isGroup, filters, orderField, orderDir, lim);
      },
      onSnapshot(cb) {
        const cs = { colPath: norm(colPath), isGroup, filters, orderField, orderDir, lim, cb, prevMap: new Map() };
        fsColSubs.add(cs);
        initPromise.then(() => { if (fsColSubs.has(cs)) fireColSub(cs); });
        return () => fsColSubs.delete(cs);
      }
    };
  }

  function makeCollection(colPath, isGroup = false) {
    const p = norm(colPath);
    const q = makeQuery(p, isGroup);
    return Object.assign(q, {
      doc(id) {
        const docId = id || ('d_' + Math.random().toString(36).slice(2, 10));
        return makeDocRef(p + '/' + norm(docId));
      }
    });
  }

  const fsApi = {
    collection: p => makeCollection(p, false),
    collectionGroup: p => makeCollection(p, true),
    async runTransaction(fn) {
      await initPromise;
      const ops = [];
      const tx = {
        async get(ref) { return ref.get(); },
        set(ref, val, opts) { ops.push(() => ref.set(val, opts)); return tx; },
        update(ref, patch) { ops.push(() => ref.update(patch)); return tx; },
        delete(ref) { ops.push(() => ref.delete()); return tx; }
      };
      const res = await fn(tx);
      for (const op of ops) await op();
      return res;
    }
  };

  // ---------------- Realtime Database local + sincronizado ----------------
  function getRtdbLocal(p) {
    const parts = norm(p).split('/').filter(Boolean);
    let cur = rtdbTree;
    for (const k of parts) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[k];
    }
    return cur === undefined ? null : cur;
  }

  function setRtdbLocal(p, val) {
    const parts = norm(p).split('/').filter(Boolean);
    if (!parts.length) { rtdbTree = val || {}; return; }
    let cur = rtdbTree;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    const last = parts[parts.length - 1];
    if (val === null || val === undefined) delete cur[last];
    else cur[last] = clone(val);
  }

  function updateRtdbLocal(p, patch) {
    const cur = getRtdbLocal(p);
    const base = (cur && typeof cur === 'object') ? clone(cur) : {};
    for (const [k, v] of Object.entries(patch || {})) {
      if (v === null || v === undefined) delete base[k];
      else base[k] = clone(v);
    }
    setRtdbLocal(p, base);
  }

  const rtdbSubs = new Set(); // { path, event, cb, seenKeys, refInstance }

  function makeRtdbSnap(p) {
    const clean = norm(p);
    const key = clean.split('/').pop() || '';
    const v = getRtdbLocal(clean);
    return {
      key,
      ref: makeRtdbRef(clean),
      val: () => clone(v),
      exists: () => v !== null && v !== undefined,
      numChildren: () => (v && typeof v === 'object' ? Object.keys(v).length : 0)
    };
  }

  function notifyAllRtdb(changedPath) {
    const cp = norm(changedPath);
    for (const sub of [...rtdbSubs]) {
      if (cp && !cp.startsWith(sub.path) && !sub.path.startsWith(cp)) continue;
      fireRtdbSub(sub);
    }
  }

  function fireRtdbSub(sub) {
    if (sub.event === 'value') {
      try { sub.cb(makeRtdbSnap(sub.path)); } catch (e) {}
    } else if (sub.event === 'child_added') {
      const v = getRtdbLocal(sub.path);
      if (!v || typeof v !== 'object') return;
      for (const k of Object.keys(v)) {
        if (sub.seenKeys.has(k)) continue;
        sub.seenKeys.add(k);
        try { sub.cb(makeRtdbSnap(sub.path + '/' + k)); } catch (e) {}
      }
    }
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      if (!getRtdbLocal('rooms/' + code)) return code;
    }
    return 'R' + Math.floor(100 + Math.random() * 900);
  }

  let pushCounter = 1;
  function makeRtdbRef(path) {
    const p = norm(path);
    const key = p.split('/').pop() || '';
    const refObj = {
      key,
      path: p,
      async set(val) {
        const clean = sanitizeTs(val);
        setRtdbLocal(p, clean);
        notifyAllRtdb(p);
        await sendCmd({ t: 'rtdb:set', path: p, val: clean });
      },
      async update(patch) {
        const clean = sanitizeTs(patch);
        updateRtdbLocal(p, clean);
        notifyAllRtdb(p);
        await sendCmd({ t: 'rtdb:update', path: p, patch: clean });
      },
      async remove() {
        return refObj.set(null);
      },
      push(val) {
        const childKey = p === 'rooms'
          ? generateRoomCode()
          : ('p_' + Date.now().toString(36) + '_' + (pushCounter++));
        const childRef = makeRtdbRef(p + '/' + childKey);
        if (val !== undefined) {
          const prom = childRef.set(val).then(() => childRef);
          return Object.assign(prom, childRef);
        }
        return childRef;
      },
      async get() {
        await initPromise;
        return makeRtdbSnap(p);
      },
      on(event, cb) {
        const sub = { path: p, event, cb, seenKeys: new Set(), refInstance: refObj };
        rtdbSubs.add(sub);
        initPromise.then(() => { if (rtdbSubs.has(sub)) fireRtdbSub(sub); });
        return cb;
      },
      off(event, cb) {
        for (const sub of [...rtdbSubs]) {
          if (sub.refInstance === refObj || sub.path === p) {
            if ((!event || sub.event === event) && (!cb || sub.cb === cb)) {
              rtdbSubs.delete(sub);
            }
          }
        }
      },
      onDisconnect() {
        return {
          remove() {
            sendCmd({ t: 'rtdb:ondisc', path: p });
            return Promise.resolve();
          },
          cancel() {
            sendCmd({ t: 'rtdb:ondisc', path: p, cancel: true });
            return Promise.resolve();
          }
        };
      }
    };
    return refObj;
  }

  const rtdbApi = {
    ref: p => makeRtdbRef(p),
    goOnline() {},
    goOffline() {}
  };

  // ---------------- Auth local + sincronizado ----------------
  let currentUser = null;
  const authListeners = new Set();

  function loadInitialAuth() {
    try {
      // Si la URL pide explícitamente una pestaña nueva de prueba (?newtab=1), no reusar sesión
      if (/[?&]newtab=1\b/.test(location.search)) return;
      const ss = sessionStorage.getItem(SS_AUTH);
      if (ss) { currentUser = JSON.parse(ss); }
      else {
        const ls = localStorage.getItem(LS_AUTH);
        if (ls) currentUser = JSON.parse(ls);
      }
      if (currentUser && (/^google_\d+$/.test(currentUser.uid || '') || String(currentUser.email || '').endsWith('@google.local'))) {
        currentUser = null;
        sessionStorage.removeItem(SS_AUTH);
        localStorage.removeItem(LS_AUTH);
      }
    } catch (e) {}
  }
  loadInitialAuth();

  function setAuthUser(u, remember = true) {
    if (u) {
      const uidVal = u.uid;
      currentUser = {
        uid: uidVal,
        email: u.email || (uidVal + '@local'),
        displayName: u.displayName || 'Trainer',
        photoURL: u.photoURL || '',
        provider: u.provider || (String(u.email || '').endsWith('@jugadores.pokesurvivor.net') ? 'password' : 'google'),
        role: u.role || (u.isAdmin ? 'admin' : 'user'),
        isAdmin: !!u.isAdmin,
        sessionToken: u.sessionToken || '',
        getIdToken: () => Promise.resolve(u.sessionToken || ('local-token-' + uidVal)),
        reauthenticateWithCredential: async cred => {
          const pass = cred && cred.pass !== undefined ? cred.pass : '';
          const r = await sendCmd({ t: 'auth:reauth', uid: uidVal, pass }, true);
          if (!r.ok && !r.localOnly) throw { code: r.code || 'auth/wrong-password' };
        },
        reauthenticateWithPopup: async () => Promise.resolve(),
        changePassword: async (oldPass, newPass) => {
          const r = await sendCmd({ t: 'auth:change-pass', uid: uidVal, oldPass, newPass }, true);
          if (!r.ok && !r.localOnly) throw { code: r.code || 'auth/wrong-password' };
          return r;
        },
        delete: async pass => {
          const r = await sendCmd({ t: 'auth:delete', uid: uidVal, pass }, true);
          if (!r.ok && !r.localOnly) throw { code: r.code || 'auth/wrong-password' };
          setAuthUser(null);
        }
      };
      try {
        const snap = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          provider: currentUser.provider,
          role: currentUser.role,
          isAdmin: currentUser.isAdmin,
          sessionToken: currentUser.sessionToken
        };
        sessionStorage.setItem(SS_AUTH, JSON.stringify(snap));
        if (remember !== false && !/[?&]newtab=1\b/.test(location.search)) {
          localStorage.setItem(LS_AUTH, JSON.stringify(snap));
        } else if (remember === false) {
          localStorage.removeItem(LS_AUTH);
        }
      } catch (e) {}
      wsSendRaw({ t: 'hello', uid: currentUser.uid });
    } else {
      currentUser = null;
      try {
        sessionStorage.removeItem(SS_AUTH);
        localStorage.removeItem(LS_AUTH);
      } catch (e) {}
    }
    authListeners.forEach(fn => { try { fn(currentUser); } catch (e) {} });
    if (G.AdminUI && G.AdminUI.syncBadge) G.AdminUI.syncBadge();
  }

  function openGoogleAuthPopupOrModal() {
    return new Promise((resolve, reject) => {
      const lang = (G.I18n && G.I18n.lang) || 'vi';
      const url = `/auth/google?lang=${encodeURIComponent(lang)}`;
      const w = 450, h = 620;
      const left = Math.max(0, Math.round((window.screen.width - w) / 2));
      const top = Math.max(0, Math.round((window.screen.height - h) / 2));
      try { localStorage.removeItem('ps.google.auth.result'); } catch (e) {}

      let settled = false;
      let popup = null;
      let modalEl = null;
      let timer = null;

      const cleanup = () => {
        window.removeEventListener('message', onMsg);
        window.removeEventListener('storage', onStorage);
        if (timer) clearInterval(timer);
        if (modalEl) { try { modalEl.remove(); } catch (e) {} modalEl = null; }
      };

      const finish = data => {
        if (settled) return;
        settled = true;
        cleanup();
        try { if (popup && !popup.closed) popup.close(); } catch (e) {}
        if (data && data.ok && data.user) {
          resolve(data);
        } else {
          reject({ code: (data && data.code) || 'auth/popup-closed-by-user', message: (data && data.error) || '' });
        }
      };

      const onMsg = e => {
        if (e && e.data && e.data.type === 'ps:google-auth') {
          finish(e.data);
        }
      };

      const onStorage = e => {
        if (e && e.key === 'ps.google.auth.result' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            if (parsed && parsed.type === 'ps:google-auth') finish(parsed);
          } catch (err) {}
        }
      };

      window.addEventListener('message', onMsg);
      window.addEventListener('storage', onStorage);

      try {
        popup = window.open(url, 'ps_google_auth', `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
      } catch (e) { popup = null; }

      if (!popup) {
        // Fallback: si el navegador bloqueó el popup (p.ej. móvil), abrir modal integrado con iframe
        modalEl = document.createElement('div');
        modalEl.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(4,9,24,.82);display:flex;align-items:center;justify-content:center;padding:12px;';
        modalEl.innerHTML = `<div style="position:relative;width:min(440px,100%);height:min(620px,92vh);border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.75);background:#fff">
          <iframe src="${url}" style="width:100%;height:100%;border:0"></iframe>
        </div>`;
        modalEl.onclick = e => { if (e.target === modalEl) finish({ ok: false, code: 'auth/popup-closed-by-user' }); };
        document.body.appendChild(modalEl);
      } else {
        timer = setInterval(() => {
          try {
            const raw = localStorage.getItem('ps.google.auth.result');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.type === 'ps:google-auth') { finish(parsed); return; }
            }
          } catch (e) {}
          if (popup.closed) {
            setTimeout(() => {
              if (!settled) finish({ ok: false, code: 'auth/popup-closed-by-user' });
            }, 250);
          }
        }, 300);
      }
    });
  }

  let rememberPref = true;
  const authApi = {
    get currentUser() { return currentUser; },
    languageCode: 'vi',
    setPersistence: mode => {
      rememberPref = mode !== 'session';
      return Promise.resolve();
    },
    onAuthStateChanged(cb) {
      authListeners.add(cb);
      setTimeout(() => cb(currentUser), 0);
      return () => authListeners.delete(cb);
    },
    async createUserWithEmailAndPassword(email, pass) {
      await initPromise;
      const em = String(email || '').toLowerCase();
      const res = await sendCmd({ t: 'auth:register', email: em, pass }, true);
      if (!res.ok && res.code) throw { code: res.code };
      if (res.localOnly) {
        if (users[em]) throw { code: 'auth/email-already-in-use' };
        const uid = 'u_' + Math.random().toString(36).slice(2, 10);
        users[em] = { uid, email: em, pass };
        saveLocalCache();
        setAuthUser({ uid, email: em, provider: 'password', role: 'user', isAdmin: false }, rememberPref);
      } else {
        setAuthUser(res.user, rememberPref);
      }
      return { user: currentUser, additionalUserInfo: { isNewUser: true } };
    },
    async signInWithEmailAndPassword(email, pass) {
      await initPromise;
      const em = String(email || '').toLowerCase();
      const res = await sendCmd({ t: 'auth:login', email: em, pass }, true);
      if (!res.ok && res.code) {
        if (users[em] && users[em].pass === pass) {
          setAuthUser(users[em], rememberPref);
          return { user: currentUser, additionalUserInfo: { isNewUser: false } };
        }
        throw { code: res.code };
      }
      if (res.localOnly) {
        const u = users[em];
        if (!u || u.pass !== pass) throw { code: 'auth/invalid-credential' };
        setAuthUser(u, rememberPref);
      } else {
        setAuthUser(res.user, rememberPref);
      }
      return { user: currentUser, additionalUserInfo: { isNewUser: false } };
    },
    async signInWithPopup() {
      await initPromise;
      const res = await openGoogleAuthPopupOrModal();
      setAuthUser(res.user, rememberPref);
      await sendCmd({ t: 'hello', uid: res.user.uid }, true);
      return { user: currentUser, additionalUserInfo: { isNewUser: !!res.isNewUser } };
    },
    async signOut() {
      setAuthUser(null);
    }
  };

  // Exponer `window.firebase` compatible con el SDK de Firebase
  function authFn() { return authApi; }
  authFn.Auth = { Persistence: { LOCAL: 'local' } };
  authFn.GoogleAuthProvider = class {};
  authFn.EmailAuthProvider = { credential: (email, pass) => ({ email, pass }) };

  function firestoreFn() { return fsApi; }
  firestoreFn.FieldValue = {
    serverTimestamp: () => ({ __serverTs: true }),
    delete: () => ({ __del: true })
  };

  function databaseFn() { return rtdbApi; }
  Object.defineProperty(databaseFn, 'ServerValue', {
    get: () => ({ TIMESTAMP: Date.now() })
  });

  window.firebase = {
    __psLocalHub: true,
    initializeApp: () => window.firebase,
    auth: authFn,
    firestore: firestoreFn,
    database: databaseFn
  };

  // ---------------- Utilidades directas para Co-op y Explorador de Salas ----------------
  G.OnlineHub = {
    get wsConnected() { return wsReady; },
    ensureGuestAuth(preferredName) {
      let guestId = null;
      try { guestId = sessionStorage.getItem('ps.guest.tab.uid'); } catch (e) {}
      if (!guestId) {
        guestId = 'guest_' + Math.random().toString(36).slice(2, 8);
        try { sessionStorage.setItem('ps.guest.tab.uid', guestId); } catch (e) {}
      }
      const disp = preferredName && preferredName !== 'Invitado'
        ? preferredName
        : ('Trainer_' + guestId.slice(-4).toUpperCase());
      setAuthUser({ uid: guestId, email: guestId + '@guest.local', displayName: disp, role: 'guest', isAdmin: false });
      return currentUser;
    },
    forkTabGuestAuth() {
      const guestId = 'guest_' + Math.random().toString(36).slice(2, 8);
      const disp = 'Trainer_' + guestId.slice(-4).toUpperCase();
      try { sessionStorage.setItem('ps.guest.tab.uid', guestId); } catch (e) {}
      setAuthUser({ uid: guestId, email: guestId + '@guest.local', displayName: disp, role: 'guest', isAdmin: false });
      return currentUser;
    },
    setUid(uid) {
      wsSendRaw({ t: 'hello', uid });
    },
    sendDirect(roomId, a, b, c) {
      // Soporta (roomId, to, payload) y (roomId, from, to, payload)
      let from, to, payload;
      if (c !== undefined) {
        from = a; to = b; payload = c;
      } else {
        to = a; payload = b;
        from = (payload && payload.f) || (G.DB && G.DB.fb && G.DB.fb.uid) || (currentUser && currentUser.uid) || '';
      }
      const msg = { t: 'net:direct', roomId, from, to, payload };
      if (bc) { try { bc.postMessage(msg); } catch (e) {} }
      wsSendRaw(msg);
    },
    onDirect(fn) {
      directListeners.add(fn);
      return () => directListeners.delete(fn);
    },
    listOpenRooms() {
      const rooms = rtdbTree.rooms || {};
      const out = [];
      for (const [id, r] of Object.entries(rooms)) {
        if (!r || !r.host || !r.m || r.open === false) continue;
        const members = Object.entries(r.m).map(([u, m]) => Object.assign({ uid: u }, m));
        if (!members.length) continue;
        const hostMem = members.find(m => m.uid === r.host) || members[0];
        out.push({
          id,
          host: r.host,
          hostName: hostMem.name || r.hostName || 'Trainer',
          hostDex: hostMem.dex || 25,
          hostShiny: !!hostMem.shiny,
          open: r.open !== false,
          count: members.length,
          max: 4,
          members
        });
      }
      return out;
    },
    listOnlinePlayers(excludeUid) {
      const out = [];
      const now = Date.now();
      for (const [k, v] of Object.entries(docs)) {
        if (!k.startsWith('pres/') || !v || !v.on) continue;
        const u = k.slice(5);
        if (u === excludeUid) continue;
        if (v.at && now - v.at > 30 * 60 * 1000) continue;
        const prof = docs['profiles/' + u];
        out.push({
          uid: u,
          name: (prof && prof.name) || v.name || u,
          dex: v.dex || 25,
          shiny: !!v.shiny,
          play: !!v.play,
          room: v.room || ''
        });
      }
      return out;
    },
    onRtdbRooms(cb) {
      return makeRtdbRef('rooms').on('value', () => cb(G.OnlineHub.listOpenRooms()));
    }
  };

  connectWs();
})();
