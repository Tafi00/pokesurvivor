/* ============ server.js — Servidor Online + Multijugador Co-op + Caché de Sprites ============
 * Sirve el juego en http://localhost:3000 con:
 *   1. Servidor WebSocket en tiempo real (/ws) sin dependencias externas (RFC 6455 nativo)
 *   2. Base de datos persistente en disco (data/online-db.json) para Cuentas, Amigos, Salas y Ranking
 *   3. Relé de paquetes de baja latencia (<1ms) para partidas cooperativas de hasta 4 jugadores
 *   4. Descarga y caché automática de sprites (/assets/pokemon/...)
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const ORIGIN = 'https://pokesurvivor.com';
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'online-db.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// ============================================================================
// 1. BASE DE DATOS EN MEMORIA + PERSISTENCIA EN DISCO
// ============================================================================
let state = {
  users: {},    // email -> { uid, email, pass, displayName, createdAt }
  docs: {},     // "col/doc" o "col/doc/sub/id" -> objeto JSON
  rtdb: {}      // árbol JSON para Realtime Database (rooms, etc.)
};

const ADMIN_USERNAMES = new Set(['admin', 'tafi', 'root']);

function nameToInternalEmail(name) {
  const hex = Buffer.from(String(name || '').trim().toLowerCase(), 'utf8').toString('hex');
  return hex + '@jugadores.pokesurvivor.net';
}

function emailToUsername(email) {
  const m = String(email || '').match(/^([0-9a-f]+)@jugadores\.pokesurvivor\.net$/i);
  if (m) {
    try { return Buffer.from(m[1], 'hex').toString('utf8').toLowerCase(); } catch (e) {}
  }
  return String(email || '').split('@')[0].toLowerCase();
}

function checkIsAdmin(email, displayName, role) {
  if (role === 'admin') return true;
  const u = emailToUsername(email);
  const d = String(displayName || '').trim().toLowerCase();
  return ADMIN_USERNAMES.has(u) || ADMIN_USERNAMES.has(d);
}

function findUserByUid(uid) {
  if (!uid) return null;
  for (const u of Object.values(state.users)) {
    if (u && u.uid === uid) return u;
  }
  return null;
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (raw && typeof raw === 'object') {
        state.users = raw.users || {};
        state.docs = raw.docs || {};
        state.rtdb = raw.rtdb || {};
      }
    }
  } catch (e) {
    console.warn('[DB] No se pudo leer online-db.json:', e.message);
  }
  state.rtdb.rooms = {};
  seedDefaultAdmins();
  seedDefaultLeaderboard();
}

function flushSaveSync() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const snap = {
      users: state.users,
      docs: state.docs,
      rtdb: {}
    };
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snap, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.warn('[DB] Error guardando online-db.json:', e.message);
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSaveSync();
  }, 150);
}

process.on('SIGINT', () => { flushSaveSync(); process.exit(0); });
process.on('SIGTERM', () => { flushSaveSync(); process.exit(0); });

function seedDefaultAdmins() {
  const now = Date.now();
  const defaults = [
    { name: 'admin', uid: 'u_admin', pass: 'admin123', dex: 6 },
    { name: 'Tafi',  uid: 'u_tafi',  pass: 'admin123', dex: 25 }
  ];
  for (const a of defaults) {
    const email = nameToInternalEmail(a.name);
    if (!state.users[email]) {
      state.users[email] = {
        uid: a.uid,
        email,
        pass: a.pass,
        displayName: a.name,
        role: 'admin',
        isAdmin: true,
        createdAt: now
      };
    } else {
      state.users[email].role = 'admin';
      state.users[email].isAdmin = true;
    }
    const uid = state.users[email].uid;
    if (!state.docs[`saves/${uid}`]) {
      state.docs[`saves/${uid}`] = {
        v: 3,
        updatedAt: now,
        save: {
          v: 3,
          name: a.name,
          created: now,
          updated: now,
          coins: 50000,
          owned: { [a.dex]: { at: now, from: 'starter' }, 25: { at: now, from: 'starter' }, 6: { at: now, from: 'starter' } },
          shiny: { [a.dex]: { at: now, from: 'starter' } },
          partner: a.dex,
          partnerShiny: true,
          starter: a.dex,
          upgrades: {},
          pupg: {},
          tickets: { t1: 10, t10: 5 },
          pity: {},
          legends: {},
          arenas: {},
          itemsFound: {},
          evoMoves: {},
          ach: {},
          missions: {},
          profile: { favs: [{ dex: a.dex, shiny: true }], title: 'Elegido de Arceus' },
          stats: { runs: 0, bestTime: 0, bestLevel: 0, totalKills: 0, pulls: 0, coinsEarned: 50000, shinies: 1,
                   bossesTotal: 0, riftWins: 0, evolutions: 0, missionsDone: 0, groupRuns: 0, bestGroupTime: 0 }
        }
      };
    }
  }
}

function seedDefaultLeaderboard() {
  if (state.docs['lbs/s_all2']) { scheduleSave(); return; }
  const now = Date.now();
  const sampleSolo = {
    bot_red:     { t: 1845, uids: ['bot_red'],     names: ['Red_Kanto'],   dex: [6],   shiny: [true],  lv: 54, kills: 4820 },
    bot_cynthia: { t: 1790, uids: ['bot_cynthia'], names: ['Cynthia_VN'],  dex: [445], shiny: [true],  lv: 51, kills: 4510 },
    bot_steven:  { t: 1620, uids: ['bot_steven'],  names: ['StevenStone'], dex: [376], shiny: [false], lv: 46, kills: 3890 },
    bot_lance:   { t: 1480, uids: ['bot_lance'],   names: ['LanceDragon'], dex: [149], shiny: [false], lv: 42, kills: 3420 },
    bot_n:       { t: 1310, uids: ['bot_n'],       names: ['Harmonia_N'],  dex: [644], shiny: [true],  lv: 39, kills: 2950 }
  };
  const sampleGroup = {
    'bot_red_bot_cynthia': {
      t: 1920,
      uids: ['bot_red', 'bot_cynthia'],
      names: ['Red_Kanto', 'Cynthia_VN'],
      dex: [6, 445],
      shiny: [true, true],
      lv: 58,
      kills: 6420
    }
  };
  state.docs['lbs/s_all2'] = { top: sampleSolo, me: 'bot_red', ev: '' };
  state.docs['lbs/g_all2'] = { top: sampleGroup, me: 'bot_red_bot_cynthia', ev: '' };
  for (const [id, r] of Object.entries(sampleSolo)) {
    state.docs[`lb/s_all2/e/${id}`] = Object.assign({}, r, { at: now });
    state.docs[`profiles/${id}`] = {
      name: r.names[0],
      lower: r.names[0].toLowerCase(),
      title: 'Elegido de Arceus',
      favs: [{ dex: r.dex[0], shiny: r.shiny[0] }],
      best: { solo: r.t, group: 1920, level: r.lv, bosses: 18, legends: 9, kills: r.kills, medals: 24 },
      medals: ['time30', 'judged', 'lvl50', 'kills5000'],
      at: now
    };
  }
  scheduleSave();
}

loadDb();

// Helpers para manipular rutas de RTDB (p. ej. "rooms/PK42/m/uid1")
function normPath(p) {
  return String(p || '').replace(/^\/+|\/+$/g, '');
}
function getRtdb(p) {
  const parts = normPath(p).split('/').filter(Boolean);
  let cur = state.rtdb;
  for (const k of parts) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[k];
  }
  return cur === undefined ? null : cur;
}
function setRtdb(p, val) {
  const parts = normPath(p).split('/').filter(Boolean);
  if (!parts.length) { state.rtdb = val || {}; return; }
  let cur = state.rtdb;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  const last = parts[parts.length - 1];
  if (val === null || val === undefined) delete cur[last];
  else cur[last] = val;
}
function updateRtdb(p, patch) {
  const cur = getRtdb(p);
  const base = (cur && typeof cur === 'object') ? cur : {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === null || v === undefined) delete base[k];
    else base[k] = v;
  }
  setRtdb(p, base);
}

// ============================================================================
// 2. SERVIDOR WEBSOCKET NATIVO (RFC 6455)
// ============================================================================
const clients = new Set(); // { socket, uid, onDisc: [{ path, mode }] }

function wsSend(client, obj) {
  if (!client || !client.socket || client.socket.destroyed) return;
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try {
    client.socket.write(Buffer.concat([header, payload]));
  } catch (e) { /* socket cerrado */ }
}

function wsBroadcast(obj, exceptClient = null) {
  for (const c of clients) {
    if (c !== exceptClient) wsSend(c, obj);
  }
}

function handleUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  socket.setNoDelay(true);
  const client = { socket, uid: null, onDisc: [] };
  clients.add(client);

  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const b0 = buf[0];
      const b1 = buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }
      const totalLen = offset + (masked ? 4 : 0) + len;
      if (buf.length < totalLen) return;

      let data = buf.slice(offset + (masked ? 4 : 0), totalLen);
      if (masked) {
        const mask = buf.slice(offset, offset + 4);
        data = Buffer.from(data);
        for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      }
      buf = buf.slice(totalLen);

      if (opcode === 0x8) { // close
        socket.end();
        return;
      } else if (opcode === 0x9) { // ping -> pong
        try { socket.write(Buffer.from([0x8a, 0x00])); } catch (e) {}
      } else if (opcode === 0x1) { // text
        try {
          const msg = JSON.parse(data.toString('utf8'));
          onClientMessage(client, msg);
        } catch (e) { /* JSON inválido */ }
      }
    }
  });

  const cleanup = () => {
    if (!clients.has(client)) return;
    clients.delete(client);
    // Ejecutar todos los onDisconnect registrados por este cliente
    for (const p of client.onDisc) {
      setRtdb(p, null);
      wsBroadcast({ t: 'rtdb:set', path: p, val: null });
    }
    // Si tenía presencia o sala activa, limpiarla si no tiene otra pestaña con el mismo uid
    if (client.uid) {
      const stillConnected = [...clients].some(c => c.uid === client.uid);
      if (!stillConnected) {
        if (state.docs[`pres/${client.uid}`]) {
          state.docs[`pres/${client.uid}`] = Object.assign({}, state.docs[`pres/${client.uid}`], {
            on: false, play: false, room: '', at: Date.now()
          });
          wsBroadcast({ t: 'fs:set', path: `pres/${client.uid}`, val: state.docs[`pres/${client.uid}`] });
        }
        const rooms = (state.rtdb && state.rtdb.rooms) || {};
        for (const [rId, rm] of Object.entries(rooms)) {
          if (!rm) continue;
          if (rm.host === client.uid) {
            delete rooms[rId];
            wsBroadcast({ t: 'rtdb:set', path: `rooms/${rId}`, val: null });
          } else if (rm.m && rm.m[client.uid]) {
            delete rm.m[client.uid];
            wsBroadcast({ t: 'rtdb:set', path: `rooms/${rId}/m/${client.uid}`, val: null });
          }
        }
      }
    }
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

function onClientMessage(client, msg) {
  if (!msg || !msg.t) return;

  switch (msg.t) {
    case 'hello': {
      client.uid = msg.uid || client.uid;
      const u = findUserByUid(client.uid);
      const isAdmin = u ? checkIsAdmin(u.email, u.displayName, u.role) : false;
      wsSend(client, {
        t: 'init',
        reqId: msg.reqId,
        docs: state.docs,
        rtdb: state.rtdb,
        meRole: isAdmin ? 'admin' : 'user',
        isAdmin
      });
      break;
    }

    case 'auth:register': {
      const email = String(msg.email || '').toLowerCase();
      if (state.users[email]) {
        wsSend(client, { t: 'res', reqId: msg.reqId, ok: false, code: 'auth/email-already-in-use' });
        return;
      }
      const uid = msg.uid || ('u_' + crypto.randomBytes(6).toString('hex'));
      const uname = emailToUsername(email);
      const disp = msg.displayName || uname || 'Trainer';
      const isAdmin = checkIsAdmin(email, disp, null);
      const role = isAdmin ? 'admin' : 'user';
      state.users[email] = { uid, email, pass: msg.pass, displayName: disp, role, isAdmin, createdAt: Date.now() };
      client.uid = uid;
      scheduleSave();
      wsSend(client, { t: 'res', reqId: msg.reqId, ok: true, user: { uid, email, displayName: disp, role, isAdmin } });
      break;
    }

    case 'auth:login': {
      const email = String(msg.email || '').toLowerCase();
      const u = state.users[email];
      if (!u || u.pass !== msg.pass) {
        wsSend(client, { t: 'res', reqId: msg.reqId, ok: false, code: 'auth/invalid-credential' });
        return;
      }
      const isAdmin = checkIsAdmin(u.email, u.displayName, u.role);
      const role = isAdmin ? 'admin' : 'user';
      u.role = role;
      u.isAdmin = isAdmin;
      client.uid = u.uid;
      scheduleSave();
      wsSend(client, { t: 'res', reqId: msg.reqId, ok: true, user: { uid: u.uid, email: u.email, displayName: u.displayName, role, isAdmin } });
      break;
    }

    case 'fs:set': {
      const p = normPath(msg.path);
      if (p.startsWith('pres/')) client.uid = p.slice(5);
      if (msg.merge && state.docs[p] && typeof state.docs[p] === 'object') {
        state.docs[p] = Object.assign({}, state.docs[p], msg.val);
      } else {
        state.docs[p] = msg.val;
      }
      scheduleSave();
      wsBroadcast({ t: 'fs:set', path: p, val: state.docs[p] });
      if (msg.reqId) wsSend(client, { t: 'res', reqId: msg.reqId, ok: true });
      break;
    }

    case 'fs:update': {
      const p = normPath(msg.path);
      const cur = Object.assign({}, state.docs[p] || {});
      for (const [k, v] of Object.entries(msg.patch || {})) {
        if (k.includes('.')) {
          const parts = k.split('.');
          let o = cur;
          for (let i = 0; i < parts.length - 1; i++) {
            o[parts[i]] = Object.assign({}, o[parts[i]] || {});
            o = o[parts[i]];
          }
          if (v && v.__del) delete o[parts[parts.length - 1]];
          else o[parts[parts.length - 1]] = v;
        } else {
          if (v && v.__del) delete cur[k];
          else cur[k] = v;
        }
      }
      state.docs[p] = cur;
      scheduleSave();
      wsBroadcast({ t: 'fs:set', path: p, val: cur });
      if (msg.reqId) wsSend(client, { t: 'res', reqId: msg.reqId, ok: true });
      break;
    }

    case 'fs:del': {
      const p = normPath(msg.path);
      delete state.docs[p];
      scheduleSave();
      wsBroadcast({ t: 'fs:del', path: p });
      if (msg.reqId) wsSend(client, { t: 'res', reqId: msg.reqId, ok: true });
      break;
    }

    case 'rtdb:set': {
      const p = normPath(msg.path);
      const mMatch = p.match(/^rooms\/[^/]+\/m\/([^/]+)$/);
      if (mMatch && msg.val) client.uid = mMatch[1];
      setRtdb(p, msg.val);
      wsBroadcast({ t: 'rtdb:set', path: p, val: msg.val });
      if (msg.reqId) wsSend(client, { t: 'res', reqId: msg.reqId, ok: true });
      break;
    }

    case 'rtdb:update': {
      const p = normPath(msg.path);
      updateRtdb(p, msg.patch);
      const next = getRtdb(p);
      wsBroadcast({ t: 'rtdb:set', path: p, val: next });
      if (msg.reqId) wsSend(client, { t: 'res', reqId: msg.reqId, ok: true });
      break;
    }

    case 'rtdb:ondisc': {
      const p = normPath(msg.path);
      if (msg.cancel) {
        client.onDisc = client.onDisc.filter(x => x !== p);
      } else if (!client.onDisc.includes(p)) {
        client.onDisc.push(p);
      }
      break;
    }

    case 'net:direct': {
      // Relé directo ultrarrápido en memoria de usuario a usuario sin tocar disco
      const targetUid = msg.to;
      const payload = msg.payload !== undefined ? msg.payload : msg.env;
      const fromUid = msg.from || (payload && payload.f) || client.uid || '';
      for (const c of clients) {
        if (c.uid === targetUid) {
          wsSend(c, { t: 'net:direct', roomId: msg.roomId, from: fromUid, to: targetUid, payload });
        }
      }
      break;
    }
  }
}

// ============================================================================
// 3. CACHÉ INTELIGENTE DE SPRITES Y ARCHIVOS ESTÁTICOS
// ============================================================================
function fetchAndCache(relPath, localFile, res) {
  const url = ORIGIN + '/' + relPath.replace(/\\/g, '/');
  https.get(url, up => {
    if (up.statusCode !== 200) {
      up.resume();
      res.writeHead(up.statusCode || 404);
      res.end('Not found');
      return;
    }
    const chunks = [];
    up.on('data', c => chunks.push(c));
    up.on('end', () => {
      const buf = Buffer.concat(chunks);
      try {
        fs.mkdirSync(path.dirname(localFile), { recursive: true });
        fs.writeFileSync(localFile, buf);
      } catch (e) { /* ignorar errores de escritura */ }
      const ext = path.extname(localFile).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(buf);
    });
  }).on('error', () => {
    res.writeHead(502);
    res.end('Upstream error');
  });
}

const server = http.createServer((req, res) => {
  const rawUrl = (req.url || '/').split('?')[0];

  // Endpoint REST de sincronización instantánea en la nube (soporta fetch y navigator.sendBeacon)
  if (rawUrl === '/api/cloud-sync' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (body && body.uid && body.save) {
          const docPath = `saves/${body.uid}`;
          state.docs[docPath] = {
            save: body.save,
            updatedAt: Date.now(),
            v: body.save.v || 3
          };
          flushSaveSync();
          wsBroadcast({ t: 'fs:set', path: docPath, val: state.docs[docPath] });
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  // Endpoint REST de estado del servidor online
  if (rawUrl === '/api/online-status') {
    const onlinePlayers = [];
    const seenUids = new Set();
    for (const c of clients) {
      if (c.uid && !seenUids.has(c.uid)) {
        seenUids.add(c.uid);
        const prof = state.docs[`profiles/${c.uid}`];
        const pres = state.docs[`pres/${c.uid}`];
        onlinePlayers.push({
          uid: c.uid,
          name: (prof && prof.name) || c.uid,
          play: !!(pres && pres.play),
          room: (pres && pres.room) || ''
        });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, connections: clients.size, players: onlinePlayers, rooms: state.rtdb.rooms || {} }));
    return;
  }

  let rel = decodeURIComponent(rawUrl);
  if (rel === '/' || rel === '/en' || rel === '/en/') rel = '/index.html';
  else if (rel.endsWith('/')) rel += 'index.html';

  const safeRel = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  const filePath = path.join(ROOT, safeRel);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (safeRel.startsWith('assets' + path.sep) || safeRel.startsWith('assets/')) {
      fetchAndCache(safeRel, filePath, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + safeRel);
  });
});

server.on('upgrade', (req, socket) => {
  if ((req.url || '').startsWith('/ws')) handleUpgrade(req, socket);
  else socket.destroy();
});

server.listen(PORT, () => {
  console.log(`PokéSurvivor Online & Co-op Server listo en http://localhost:${PORT}`);
});
