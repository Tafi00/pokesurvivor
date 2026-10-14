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
const ADMIN_EMAILS = new Set(['nttafi.w@gmail.com', 'admin@gmail.com', 'tafi@gmail.com']);

function hashPassword(pass, salt) {
  const s = salt || 'ps_default_salt';
  return crypto.scryptSync(String(pass || ''), s, 32).toString('hex');
}

function verifyUserPassword(u, pass) {
  if (!u) return false;
  const p = String(pass || '');
  if (u.passHash && u.salt) {
    const computed = hashPassword(p, u.salt);
    try {
      return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(u.passHash, 'hex'));
    } catch (e) {
      return computed === u.passHash;
    }
  }
  if (u.pass !== undefined && u.pass !== null && u.pass !== '') {
    if (u.pass === p) {
      // Actualizar automáticamente a hash seguro con sal
      const salt = crypto.randomBytes(12).toString('hex');
      u.salt = salt;
      u.passHash = hashPassword(p, salt);
      return true;
    }
    return false;
  }
  return false;
}

function setUserPassword(u, pass) {
  const p = String(pass || '');
  const salt = crypto.randomBytes(12).toString('hex');
  u.salt = salt;
  u.passHash = hashPassword(p, salt);
  u.pass = p; // mantener compatibilidad hacia atrás
}

function ensureSessionToken(u) {
  if (!u.sessionToken) {
    u.sessionToken = crypto.randomBytes(24).toString('hex');
  }
  return u.sessionToken;
}

function sanitizeUserForClient(u) {
  if (!u) return null;
  const isAdmin = checkIsAdmin(u.email, u.displayName, u.role);
  const role = isAdmin ? 'admin' : 'user';
  u.role = role;
  u.isAdmin = isAdmin;
  ensureSessionToken(u);
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName || emailToUsername(u.email) || 'Trainer',
    photoURL: u.photoURL || '',
    provider: u.provider || (String(u.email || '').endsWith('@jugadores.pokesurvivor.net') ? 'password' : 'google'),
    role,
    isAdmin,
    sessionToken: u.sessionToken
  };
}

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
  const em = String(email || '').trim().toLowerCase();
  if (ADMIN_EMAILS.has(em)) return true;
  const u = emailToUsername(em);
  const d = String(displayName || '').trim().toLowerCase();
  return ADMIN_USERNAMES.has(u) || ADMIN_USERNAMES.has(d) || ADMIN_EMAILS.has(u);
}

function findUserByUid(uid) {
  if (!uid) return null;
  for (const u of Object.values(state.users)) {
    if (u && u.uid === uid) return u;
  }
  return null;
}

function findUserByLogin(emailOrEncoded) {
  const raw = String(emailOrEncoded || '').trim().toLowerCase();
  if (!raw) return null;
  if (state.users[raw]) return state.users[raw];
  const decoded = emailToUsername(raw);
  if (decoded && state.users[decoded]) return state.users[decoded];
  if (decoded && !decoded.includes('@') && state.users[ decoded + '@gmail.com' ]) {
    return state.users[ decoded + '@gmail.com' ];
  }
  const internal = nameToInternalEmail(decoded || raw);
  if (state.users[internal]) return state.users[internal];
  for (const u of Object.values(state.users)) {
    if (!u) continue;
    if (String(u.displayName || '').trim().toLowerCase() === (decoded || raw)) return u;
  }
  return null;
}

function verifyGoogleTokenOnline(idToken, accessToken) {
  return new Promise(resolve => {
    const url = idToken
      ? `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      : accessToken
        ? `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(accessToken)}`
        : null;
    if (!url) return resolve(null);
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (data && data.email) {
            resolve({
              email: String(data.email).toLowerCase(),
              displayName: data.name || data.given_name || String(data.email).split('@')[0],
              photoURL: data.picture || '',
              googleSub: data.sub || ''
            });
          } else {
            resolve(null);
          }
        } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
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
      const u = {
        uid: a.uid,
        email,
        displayName: a.name,
        provider: 'password',
        role: 'admin',
        isAdmin: true,
        createdAt: now
      };
      setUserPassword(u, a.pass);
      ensureSessionToken(u);
      state.users[email] = u;
    } else {
      state.users[email].role = 'admin';
      state.users[email].isAdmin = true;
      ensureSessionToken(state.users[email]);
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

async function authenticateGooglePayload(payload) {
  let verified = null;
  if (payload && (payload.idToken || payload.accessToken)) {
    verified = await verifyGoogleTokenOnline(payload.idToken, payload.accessToken);
    if (!verified) {
      return { ok: false, code: 'auth/invalid-credential', error: 'Token de Google inválido o expirado.' };
    }
  }
  let email = String((verified && verified.email) || (payload && payload.email) || '').trim().toLowerCase();
  if (!email) return { ok: false, code: 'auth/invalid-email', error: 'Ingresa tu correo de Google.' };
  if (!email.includes('@')) email += '@gmail.com';
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
    return { ok: false, code: 'auth/invalid-email', error: 'Formato de correo inválido.' };
  }

  let u = state.users[email] || findUserByLogin(email);
  let isNewUser = false;

  if (u) {
    // Si no viene con idToken firmado por Google, verificar sessionToken o contraseña/PIN si la cuenta tiene una
    if (!verified) {
      const tokenMatch = payload.sessionToken && u.sessionToken && payload.sessionToken === u.sessionToken;
      if (!tokenMatch && (u.passHash || u.pass)) {
        if (!payload.pass) {
          return { ok: false, code: 'auth/google-pin-required', needPin: true };
        }
        if (!verifyUserPassword(u, payload.pass)) {
          return { ok: false, code: 'auth/wrong-password', needPin: true };
        }
      } else if (!u.passHash && !u.pass && payload.pass && String(payload.pass).length >= 4) {
        setUserPassword(u, payload.pass);
      }
    }
    if (verified && verified.photoURL) u.photoURL = verified.photoURL;
    if (payload.displayName && (!u.displayName || u.displayName === emailToUsername(email))) {
      u.displayName = String(payload.displayName).trim().slice(0, 16);
    }
    u.lastLoginAt = Date.now();
  } else {
    isNewUser = true;
    const uid = 'g_' + crypto.createHash('sha1').update(email).digest('hex').slice(0, 12);
    const rawName = String((verified && verified.displayName) || (payload && payload.displayName) || email.split('@')[0] || 'Trainer')
      .trim()
      .replace(/[^A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]/g, '')
      .slice(0, 16) || 'Trainer';
    const isAdmin = checkIsAdmin(email, rawName, null);
    u = {
      uid,
      email,
      displayName: rawName,
      photoURL: (verified && verified.photoURL) || (payload && payload.photoURL) || '',
      provider: 'google',
      role: isAdmin ? 'admin' : 'user',
      isAdmin,
      createdAt: Date.now(),
      lastLoginAt: Date.now()
    };
    if (payload && payload.pass && String(payload.pass).length >= 4) {
      setUserPassword(u, payload.pass);
    }
    ensureSessionToken(u);
    state.users[email] = u;
  }

  flushSaveSync();
  return { ok: true, isNewUser, user: sanitizeUserForClient(u) };
}

function renderGooglePopupHtml(lang) {
  const isVi = lang === 'vi';
  const isEn = lang === 'en';
  const T = {
    title: isVi ? 'Đăng nhập bằng Google' : isEn ? 'Sign in with Google' : 'Iniciar sesión con Google',
    sub: isVi ? 'Tiếp tục tới PokéSurvivor · Đồng bộ Đám mây' : isEn ? 'Continue to PokéSurvivor · Cloud Sync' : 'Continuar a PokéSurvivor · Guardado en la nube',
    savedTitle: isVi ? 'Chọn một tài khoản trên thiết bị này' : isEn ? 'Choose an account on this device' : 'Elige una cuenta en este dispositivo',
    otherAcc: isVi ? 'Sử dụng một tài khoản Google khác' : isEn ? 'Use another Google account' : 'Usar otra cuenta de Google',
    emailLbl: isVi ? 'Email hoặc tài khoản Gmail' : isEn ? 'Google Email or Gmail address' : 'Correo de Google (Gmail)',
    emailPh: isVi ? 'tenban@gmail.com' : isEn ? 'you@gmail.com' : 'tucorreo@gmail.com',
    nameLbl: isVi ? 'Biệt danh trong game (tùy chọn)' : isEn ? 'In-game Trainer Name (optional)' : 'Apodo en el juego (opcional)',
    namePh: isVi ? 'VD: Pikachu_VN' : isEn ? 'e.g. Red_Kanto' : 'Ej: Red_Kanto',
    pinLbl: isVi ? 'Mật khẩu / Mã PIN bảo vệ Cloud (tối thiểu 4 ký tự)' : isEn ? 'Cloud Protection Password / PIN (min 4 chars)' : 'Contraseña / PIN de protección en la nube (mín. 4)',
    pinPh: isVi ? 'Nhập mật khẩu bảo vệ tài khoản Google này' : isEn ? 'Password to protect your cloud save across devices' : 'Contraseña para proteger tu cuenta entre dispositivos',
    pinHint: isVi ? 'Giúp bảo vệ tiến trình của bạn và đăng nhập lại từ mọi máy tính / điện thoại khác.' : isEn ? 'Protects your progress and lets you sign in from any other PC or phone.' : 'Protege tu progreso y te permite entrar desde cualquier otro PC o móvil.',
    btnCont: isVi ? 'Tiếp tục với Google' : isEn ? 'Continue with Google' : 'Continuar con Google',
    btnCancel: isVi ? 'Hủy' : isEn ? 'Cancel' : 'Cancelar',
    btnBack: isVi ? '← Quay lại danh sách tài khoản' : isEn ? '← Back to saved accounts' : '← Volver a cuentas guardadas',
    errEmail: isVi ? 'Vui lòng nhập địa chỉ Gmail hợp lệ.' : isEn ? 'Please enter a valid Gmail address.' : 'Introduce un correo válido.',
    errPinReq: isVi ? 'Tài khoản Google này đã có mật khẩu bảo vệ. Vui lòng nhập mật khẩu.' : isEn ? 'This Google account is password-protected. Please enter your password.' : 'Esta cuenta tiene contraseña de protección. Escríbela.',
    errWrongPin: isVi ? 'Mật khẩu bảo vệ không đúng. Vui lòng thử lại.' : isEn ? 'Incorrect password. Please try again.' : 'Contraseña incorrecta. Inténtalo de nuevo.'
  };
  const cfgAuth = state.docs['config/auth'] || {};
  const googleClientId = process.env.GOOGLE_CLIENT_ID || cfgAuth.googleClientId || '';

  return `<!DOCTYPE html>
<html lang="${lang || 'vi'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${T.title} - PokéSurvivor</title>
<style>
  * { box-sizing: border-box; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at 50% 20%, #1d356b, #091228 80%); color: #202124; padding: 16px;
  }
  .card {
    width: 100%; max-width: 420px; background: #fff; border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,.55); padding: 28px 26px 24px;
    animation: pop .18s ease-out;
  }
  @keyframes pop { from { transform: scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
  .g-logo { display: flex; justify-content: center; margin-bottom: 12px; }
  h1 { font-size: 22px; font-weight: 600; text-align: center; margin: 0 0 6px; color: #202124; }
  .sub { font-size: 14px; text-align: center; color: #5f6368; margin: 0 0 20px; }
  .sub b { color: #1a73e8; }
  .acc-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
  .acc-item {
    display: flex; align-items: center; gap: 12px; padding: 10px 12px;
    border: 1px solid #dadce0; border-radius: 10px; cursor: pointer; transition: background .12s, border-color .12s;
  }
  .acc-item:hover { background: #f8fafe; border-color: #1a73e8; }
  .acc-ava {
    width: 38px; height: 38px; border-radius: 50%; background: #1a73e8; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0;
  }
  .acc-info { flex: 1; min-width: 0; }
  .acc-name { font-weight: 600; font-size: 14px; color: #202124; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acc-mail { font-size: 12px; color: #5f6368; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acc-del {
    border: 0; background: none; color: #9aa0a6; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 6px;
  }
  .acc-del:hover { background: #fee8e6; color: #d93025; }
  .field-wrap { margin-bottom: 14px; }
  label { display: block; font-size: 13px; font-weight: 600; color: #3c4043; margin-bottom: 5px; }
  input {
    width: 100%; padding: 11px 13px; border: 1.5px solid #dadce0; border-radius: 8px;
    font-size: 15px; color: #202124; outline: none; transition: border-color .15s;
  }
  input:focus { border-color: #1a73e8; box-shadow: 0 0 0 3px rgba(26,115,232,.15); }
  .hint { font-size: 12px; color: #5f6368; margin-top: 5px; line-height: 1.35; }
  .err { color: #d93025; font-size: 13px; font-weight: 500; min-height: 18px; margin: 8px 0; }
  .btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
  .btn {
    appearance: none; border: 0; border-radius: 8px; padding: 10px 18px;
    font-size: 14px; font-weight: 600; cursor: pointer; transition: filter .12s, background .12s;
  }
  .btn.primary { background: #1a73e8; color: #fff; flex: 1; }
  .btn.primary:hover { background: #1557b0; }
  .btn.ghost { background: #f1f3f4; color: #3c4043; }
  .btn.ghost:hover { background: #e8eaed; }
  .link-btn {
    display: inline-block; background: none; border: 0; color: #1a73e8; font-size: 13px;
    font-weight: 600; cursor: pointer; padding: 4px 0; margin-bottom: 10px;
  }
  .hidden { display: none !important; }
  #gsi-box { display: flex; justify-content: center; margin-bottom: 14px; }
</style>
</head>
<body>
<div class="card">
  <div class="g-logo">
    <svg width="40" height="40" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
  </div>
  <h1>${T.title}</h1>
  <p class="sub">${T.sub}</p>
  <div id="gsi-box" class="hidden"></div>

  <div id="view-saved" class="hidden">
    <label>${T.savedTitle}</label>
    <div id="saved-list" class="acc-list"></div>
    <button type="button" id="btn-other" class="btn ghost" style="width:100%">+ ${T.otherAcc}</button>
  </div>

  <form id="view-form" autocomplete="on">
    <button type="button" id="btn-back" class="link-btn hidden">${T.btnBack}</button>
    <div class="field-wrap">
      <label for="g-email">${T.emailLbl}</label>
      <input id="g-email" type="text" placeholder="${T.emailPh}" autocomplete="email" required>
    </div>
    <div class="field-wrap" id="wrap-name">
      <label for="g-name">${T.nameLbl}</label>
      <input id="g-name" type="text" maxlength="16" placeholder="${T.namePh}">
    </div>
    <div class="field-wrap">
      <label for="g-pin">${T.pinLbl}</label>
      <input id="g-pin" type="password" maxlength="64" placeholder="${T.pinPh}" autocomplete="current-password">
      <div class="hint">${T.pinHint}</div>
    </div>
    <div id="g-err" class="err"></div>
    <div class="btns">
      <button type="button" id="btn-cancel" class="btn ghost">${T.btnCancel}</button>
      <button type="submit" id="btn-submit" class="btn primary">${T.btnCont}</button>
    </div>
  </form>
</div>
<script>
(() => {
  const LS_ACCS = 'ps.google.accounts';
  const LS_RES  = 'ps.google.auth.result';
  const T = ${JSON.stringify(T)};
  const CLIENT_ID = ${JSON.stringify(googleClientId)};

  function getSaved() {
    try { return JSON.parse(localStorage.getItem(LS_ACCS) || '[]'); } catch (e) { return []; }
  }
  function setSaved(list) {
    try { localStorage.setItem(LS_ACCS, JSON.stringify(list.slice(0, 6))); } catch (e) {}
  }

  function finishAuth(data) {
    if (data && data.ok && data.user) {
      const list = getSaved().filter(a => a.email !== data.user.email);
      list.unshift({
        email: data.user.email,
        displayName: data.user.displayName,
        photoURL: data.user.photoURL || '',
        sessionToken: data.user.sessionToken || ''
      });
      setSaved(list);
    }
    const payload = Object.assign({ type: 'ps:google-auth', ts: Date.now() }, data);
    try { localStorage.setItem(LS_RES, JSON.stringify(payload)); } catch (e) {}
    try { if (window.opener && !window.opener.closed) window.opener.postMessage(payload, '*'); } catch (e) {}
    setTimeout(() => window.close(), 60);
  }

  async function submitGoogle(body) {
    const errEl = document.getElementById('g-err');
    errEl.textContent = '';
    const btn = document.getElementById('btn-submit');
    btn.disabled = true;
    try {
      const r = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const res = await r.json();
      btn.disabled = false;
      if (!res.ok) {
        if (res.needPin) {
          showForm(body.email, body.displayName);
          document.getElementById('g-pin').focus();
          errEl.textContent = res.code === 'auth/wrong-password' ? T.errWrongPin : T.errPinReq;
          return;
        }
        errEl.textContent = res.error || T.errEmail;
        return;
      }
      finishAuth(res);
    } catch (e) {
      btn.disabled = false;
      errEl.textContent = e.message || 'Error';
    }
  }

  function showForm(prefillEmail, prefillName) {
    document.getElementById('view-saved').classList.add('hidden');
    document.getElementById('view-form').classList.remove('hidden');
    document.getElementById('btn-back').classList.toggle('hidden', getSaved().length === 0);
    if (prefillEmail) document.getElementById('g-email').value = prefillEmail;
    if (prefillName) document.getElementById('g-name').value = prefillName;
    setTimeout(() => document.getElementById(prefillEmail ? 'g-pin' : 'g-email').focus(), 40);
  }

  function renderSaved() {
    const list = getSaved();
    if (!list.length) { showForm(); return; }
    document.getElementById('view-saved').classList.remove('hidden');
    document.getElementById('view-form').classList.add('hidden');
    const box = document.getElementById('saved-list');
    box.innerHTML = '';
    list.forEach(acc => {
      const row = document.createElement('div');
      row.className = 'acc-item';
      const init = (acc.displayName || acc.email || 'G')[0].toUpperCase();
      row.innerHTML = '<div class="acc-ava">' + init + '</div>' +
        '<div class="acc-info"><div class="acc-name"></div><div class="acc-mail"></div></div>' +
        '<button type="button" class="acc-del" title="Remove">×</button>';
      row.querySelector('.acc-name').textContent = acc.displayName || acc.email.split('@')[0];
      row.querySelector('.acc-mail').textContent = acc.email;
      row.onclick = e => {
        if (e.target.closest('.acc-del')) return;
        submitGoogle({ email: acc.email, displayName: acc.displayName, sessionToken: acc.sessionToken });
      };
      row.querySelector('.acc-del').onclick = e => {
        e.stopPropagation();
        setSaved(getSaved().filter(x => x.email !== acc.email));
        renderSaved();
      };
      box.appendChild(row);
    });
  }

  document.getElementById('btn-other').onclick = () => showForm('', '');
  document.getElementById('btn-back').onclick = () => renderSaved();
  document.getElementById('btn-cancel').onclick = () => {
    finishAuth({ ok: false, code: 'auth/popup-closed-by-user' });
  };

  const emailInp = document.getElementById('g-email');
  const nameInp = document.getElementById('g-name');
  emailInp.addEventListener('input', () => {
    if (!nameInp.dataset.touched) {
      const prefix = emailInp.value.split('@')[0].replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
      nameInp.value = prefix;
    }
  });
  nameInp.addEventListener('input', () => { nameInp.dataset.touched = '1'; });

  document.getElementById('view-form').onsubmit = e => {
    e.preventDefault();
    let em = emailInp.value.trim().toLowerCase();
    if (!em) return;
    if (!em.includes('@')) em += '@gmail.com';
    submitGoogle({
      email: em,
      displayName: nameInp.value.trim(),
      pass: document.getElementById('g-pin').value
    });
  };

  if (CLIENT_ID) {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      try {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: resp => { if (resp && resp.credential) submitGoogle({ idToken: resp.credential }); }
        });
        const gsiBox = document.getElementById('gsi-box');
        gsiBox.classList.remove('hidden');
        window.google.accounts.id.renderButton(gsiBox, { theme: 'outline', size: 'large', width: 340 });
      } catch (e) {}
    };
    document.head.appendChild(s);
  }

  renderSaved();
})();
</script>
</body>
</html>`;
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
        isAdmin,
        user: u ? sanitizeUserForClient(u) : null
      });
      break;
    }

    case 'auth:register': {
      const email = String(msg.email || '').trim().toLowerCase();
      if (state.users[email] || findUserByLogin(email)) {
        wsSend(client, { t: 'res', reqId: msg.reqId, ok: false, code: 'auth/email-already-in-use' });
        return;
      }
      const uid = msg.uid || ('u_' + crypto.randomBytes(6).toString('hex'));
      const uname = emailToUsername(email);
      const disp = msg.displayName || uname || 'Trainer';
      const isAdmin = checkIsAdmin(email, disp, null);
      const role = isAdmin ? 'admin' : 'user';
      const u = {
        uid,
        email,
        displayName: disp,
        provider: 'password',
        role,
        isAdmin,
        createdAt: Date.now(),
        lastLoginAt: Date.now()
      };
      setUserPassword(u, msg.pass || '');
      ensureSessionToken(u);
      state.users[email] = u;
      client.uid = uid;
      flushSaveSync();
      wsSend(client, { t: 'res', reqId: msg.reqId, ok: true, user: sanitizeUserForClient(u) });
      break;
    }

    case 'auth:login': {
      const email = String(msg.email || '').trim().toLowerCase();
      const u = findUserByLogin(email);
      if (!u || !verifyUserPassword(u, msg.pass)) {
        wsSend(client, { t: 'res', reqId: msg.reqId, ok: false, code: 'auth/invalid-credential' });
        return;
      }
      u.lastLoginAt = Date.now();
      client.uid = u.uid;
      flushSaveSync();
      wsSend(client, { t: 'res', reqId: msg.reqId, ok: true, user: sanitizeUserForClient(u) });
      break;
    }

    case 'auth:google': {
      authenticateGooglePayload(msg).then(res => {
        if (res.ok && res.user) client.uid = res.user.uid;
        wsSend(client, Object.assign({ t: 'res', reqId: msg.reqId }, res));
      });
      break;
    }

    case 'auth:change-pass': {
      const u = findUserByUid(msg.uid || client.uid);
      if (!u) {
        wsSend(client, { t: 'res', reqId: msg.reqId, ok: false, code: 'auth/user-not-found' });
        return;
      }
      if ((u.passHash || u.pass) && !verifyUserPassword(u, msg.oldPass)) {
        wsSend(client, { t: 'res', reqId: msg.reqId, ok: false, code: 'auth/wrong-password' });
        return;
      }
      if (!msg.newPass || String(msg.newPass).length < 6) {
        wsSend(client, { t: 'res', reqId: msg.reqId, ok: false, code: 'auth/weak-password' });
        return;
      }
      setUserPassword(u, msg.newPass);
      flushSaveSync();
      wsSend(client, { t: 'res', reqId: msg.reqId, ok: true, user: sanitizeUserForClient(u) });
      break;
    }

    case 'auth:reauth': {
      const u = findUserByUid(msg.uid || client.uid);
      if (!u) {
        wsSend(client, { t: 'res', reqId: msg.reqId, ok: false, code: 'auth/user-not-found' });
        return;
      }
      if (u.provider !== 'google' && !verifyUserPassword(u, msg.pass)) {
        wsSend(client, { t: 'res', reqId: msg.reqId, ok: false, code: 'auth/wrong-password' });
        return;
      }
      wsSend(client, { t: 'res', reqId: msg.reqId, ok: true });
      break;
    }

    case 'auth:delete': {
      const targetUid = msg.uid || client.uid;
      const u = findUserByUid(targetUid);
      if (u) {
        if (u.provider !== 'google' && msg.pass !== undefined && !verifyUserPassword(u, msg.pass)) {
          wsSend(client, { t: 'res', reqId: msg.reqId, ok: false, code: 'auth/wrong-password' });
          return;
        }
        delete state.users[u.email];
      }
      delete state.docs[`saves/${targetUid}`];
      delete state.docs[`profiles/${targetUid}`];
      delete state.docs[`pres/${targetUid}`];
      flushSaveSync();
      wsSend(client, { t: 'res', reqId: msg.reqId, ok: true });
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

  // Ventana emergente de inicio de sesión con Google (OAuth 2.0 + Selector de Cuentas Google)
  if (rawUrl === '/auth/google' && req.method === 'GET') {
    const q = (req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(q);
    const lang = params.get('lang') || 'vi';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderGooglePopupHtml(lang));
    return;
  }

  // Endpoint REST para verificar y autenticar cuentas de Google
  if (rawUrl === '/api/auth/google' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const result = await authenticateGooglePayload(body || {});
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Solicitud inválida' }));
      }
    });
    return;
  }

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
