/* ============ social.js — apodo, amigos, en línea, invitaciones y salas ============
 * Sólo funciona con cuenta en la nube (G.DB.online). Usa:
 *
 *   Firestore
 *     names/{apodo en minúsculas}  { uid }               apodos únicos
 *     profiles/{uid}               { name, lower, at }   apodo público
 *     friendships/{uidA_uidB}      { users, from, to, status: 'pending'|'ok', names, at }
 *
 *     pres/{uid}                   { on, at, room, play } en línea (aproximado)
 *     inv/{para_de}                { to, from, room, name, at } invitaciones
 *
 *   Realtime Database: SÓLO mientras estás en una sala o partida en grupo
 *     rooms/{id}          { host, open, at, m: { uid: { name, dex, shiny } }, q: ... }
 *                         la sala; q/ son los mensajes de net.js
 *
 * Por qué así: el plan gratuito de Firebase sólo admite 100 conexiones a la
 * vez a la Realtime Database. Si todo el mundo estuviera conectado para el
 * "en línea", ése sería el máximo de jugadores. Ahora sólo cuentan los que
 * están en una sala; el "en línea" va por Firestore con un latido cada 10 min
 * y se lee sólo al abrir Amigos o la sala (lo leído vale 1 min).
 *
 * El resto del juego escucha los cambios con G.Social.on(fn).
 */
G.Social = (() => {
  const VALID = /^[A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]{3,16}$/;
  const MAX_PLAYERS = 4;
  const INVITE_TTL = 3 * 60 * 1000;
  const BEAT = G.OnlineHub ? 25 * 1000 : 15 * 60 * 1000;
  const ONLINE = 22 * 60 * 1000;        // "en línea" si el último latido es más reciente
  const PRES_TTL = G.OnlineHub ? 2000 : 60 * 1000;

  let fb = null, uid = null;
  let me = null;                    // { uid, name }
  let friends = new Map();          // otherUid -> { uid, name, pid, status: 'ok'|'in'|'out', online, play }
  let unFriends = null, unRoomsHub = null;
  let beatT = 0, presAt = 0, unInv = null;
  const pres = new Map();           // otherUid -> { online, play, room, seen } (lo último leído)
  const sentInv = new Set();        // a quién invitaste (para retirarlo al salir)
  let room = null;                  // { id, host, isHost, members: [{ uid, name, dex, shiny }], chat: [] }
  let roomRefs = [];
  const invites = new Map();        // fromUid -> { from, name, room, at }
  const listeners = new Set();
  let started = false;

  function emit(what) { listeners.forEach(fn => { try { fn(what); } catch (e) { console.warn(e); } }); }
  const ts = () => firebase.database.ServerValue.TIMESTAMP;
  const fts = () => firebase.firestore.FieldValue.serverTimestamp();
  const msOf = v => (v && v.toMillis ? v.toMillis() : +v || 0);
  const pidOf = (a, b) => (a < b ? a + '_' + b : b + '_' + a);

  // ---------------- arranque ----------------

  /** Tras iniciar sesión. → 'ok' | 'need-nick' | 'off' (sin nube) */
  async function start() {
    if (!G.DB.online) return 'off';
    if (started && me) return 'ok';
    fb = G.DB.fb; uid = fb.uid;
    started = true;
    const NICK = 'ps.nick.' + uid;
    let cachedNick = null;
    try { cachedNick = localStorage.getItem(NICK); } catch (e) { /* nada */ }
    const prof = cachedNick ? { name: cachedNick }
      : await fb.fs.collection('profiles').doc(uid).get().then(s => s.exists ? s.data() : null).catch(() => null);
    if (prof && prof.name) {
      me = { uid, name: prof.name };
      if (G.DB.user !== prof.name) G.DB.setName(prof.name);
      try { localStorage.setItem(NICK, prof.name); } catch (e) { /* nada */ }
      // Asegura que el documento en names y profiles exista en el servidor
      fb.fs.collection('names').doc(prof.name.toLowerCase()).set({ uid }).catch(() => {});
      fb.fs.collection('profiles').doc(uid).set({ name: prof.name, lower: prof.name.toLowerCase(), at: fts() }, { merge: true }).catch(() => {});
    } else {
      let candidate = (G.DB.save && G.DB.save.name ? String(G.DB.save.name).trim() : '').replace(/[^A-Za-z0-9_]/g, '');
      if (!VALID.test(candidate) || candidate.toLowerCase() === 'invitado') {
        candidate = 'Trainer_' + String(Math.floor(1000 + Math.random() * 9000));
      }
      let r = await claimNick(candidate);
      if (!r.ok) {
        candidate = candidate.slice(0, 11) + '_' + Math.floor(100 + Math.random() * 900);
        r = await claimNick(candidate);
      }
      if (!r.ok) return 'need-nick';
    }
    online();
    return 'ok';
  }

  /** Reserva un apodo único y crea el perfil público (también permite cambiar de apodo). */
  async function claimNick(name) {
    if (!fb && G.DB.online) { fb = G.DB.fb; uid = fb.uid; }
    name = (name || '').trim();
    if (!VALID.test(name)) return { ok: false, error: 'El apodo debe tener 3-16 letras, números o _.' };
    const lower = name.toLowerCase();
    const oldLower = me && me.name ? me.name.toLowerCase() : null;
    try {
      await fb.fs.runTransaction(async tx => {
        const nref = fb.fs.collection('names').doc(lower);
        const n = await tx.get(nref);
        if (n.exists && n.data().uid !== uid) throw { code: 'taken' };
        if (oldLower && oldLower !== lower) {
          tx.delete(fb.fs.collection('names').doc(oldLower));
        }
        tx.set(nref, { uid });
        tx.set(fb.fs.collection('profiles').doc(uid),
          { name, lower, at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      });
    } catch (e) {
      if (e && e.code === 'taken') return { ok: false, error: 'Ese apodo ya lo tiene otro jugador.' };
      return { ok: false, error: 'No se pudo guardar el apodo (' + ((e && e.code) || 'error') + ').' };
    }
    me = { uid, name };
    try { localStorage.setItem('ps.nick.' + uid, name); } catch (e) { /* nada */ }
    G.DB.setName(name);
    if (started && !beatT) online();
    writeStatus();
    if (room) refreshMember();
    publishProfile(true);
    emit('nick');
    return { ok: true };
  }

  /** Presencia (latido), amigos e invitaciones. */
  function online() {
    if (beatT) return;                        // ya estaba en marcha
    if (fb.rtdb && !G.OnlineHub) fb.rtdb.goOffline();
    writeStatus();
    clearInterval(beatT);
    beatT = setInterval(() => { if (document.visibilityState === 'visible') writeStatus(); }, BEAT);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onHide);
    listenFriends();
    listenInvites();
    if (G.OnlineHub && G.OnlineHub.onRtdbRooms && !unRoomsHub) {
      unRoomsHub = G.OnlineHub.onRtdbRooms(() => emit('rooms'));
    }
  }

  /** Invitaciones a salas: escucha siempre para recibir invitaciones de amigos o de la sala pública. */
  function listenInvites() {
    if (unInv || !fb) return;
    unInv = fb.fs.collection('inv').where('to', '==', uid).onSnapshot(snap => {
      snap.docChanges().forEach(ch => {
        const v = ch.doc.data();
        if (ch.type === 'removed') { invites.delete(v.from); emit('invites'); return; }
        onInvite(ch.doc.ref, v);
      });
    }, e => console.warn('[Social] invitaciones:', e.code || e.message));
  }

  let playing = false, lastBeat = 0;
  const hasFriends = () => [...friends.values()].some(f => f.status === 'ok');
  function writeStatus(on = true) {
    if (!fb || !me) return;
    if (!G.OnlineHub && !hasFriends()) return;
    lastBeat = Date.now();
    const s = G.DB.save || {};
    fb.fs.collection('pres').doc(uid).set({
      on,
      at: fts(),
      name: me.name,
      dex: s.partner || 25,
      shiny: !!(s.partnerShiny && G.DB.ownsShiny(s.partner)),
      room: room ? room.id : '',
      play: playing
    }).catch(() => {});
  }
  function setPlaying(p) { if (playing !== !!p) { playing = !!p; writeStatus(); } }
  function onVisible() { if (document.visibilityState === 'visible' && Date.now() - lastBeat > BEAT) writeStatus(); }
  function onHide() { writeStatus(false); }

  async function stop(why) {
    if (!started) return;
    await leaveRoom().catch(() => {});
    if (unFriends) { unFriends(); unFriends = null; }
    if (unInv) { unInv(); unInv = null; }
    if (unRoomsHub) { unRoomsHub(); unRoomsHub = null; }
    clearInterval(beatT); beatT = 0;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pagehide', onHide);
    if (me && fb) await fb.fs.collection('pres').doc(uid).delete().catch(() => {});
    if (why === 'delete') {
      try { localStorage.removeItem('ps.nick.' + uid); } catch (e) { /* nada */ }
      await deleteAll().catch(e => console.warn('[Social] borrar:', e));
    }
    friends.clear(); invites.clear(); sentInv.clear(); pres.clear(); presAt = 0;
    me = null; started = false; fb = null; uid = null; playing = false;
    emit('stop');
  }

  /** Al borrar la cuenta: amistades, marcas del ranking, perfil y apodo. */
  async function deleteAll() {
    const step = async (what, fn) => { try { await fn(); } catch (e) { console.warn('[Social] no se pudo borrar ' + what + ':', e.code || e.message); } };
    const del = async q => { const s = await q.get(); await Promise.all(s.docs.map(d => d.ref.delete().catch(() => {}))); };
    await step('amistades', () => del(fb.fs.collection('friendships').where('users', 'array-contains', uid)));
    await step('filas del ranking', () => G.Ranking.removeMine());
    await step('invitaciones', () => del(fb.fs.collection('inv').where('to', '==', uid)));
    await step('marcas', () => del(fb.fs.collectionGroup('e').where('uids', 'array-contains', uid)));
    await step('partida en curso', () => fb.fs.collection('runs').doc(uid).delete());
    await step('apodo', async () => {
      const prof = await fb.fs.collection('profiles').doc(uid).get();
      const lower = prof.exists ? prof.data().lower : me && me.name.toLowerCase();
      if (lower) await fb.fs.collection('names').doc(lower).delete().catch(() => {});
      if (prof.exists) await fb.fs.collection('profiles').doc(uid).delete();
    });
  }

  // ---------------- amigos ----------------

  function listenFriends() {
    unFriends = fb.fs.collection('friendships').where('users', 'array-contains', uid).onSnapshot(snap => {
      const next = new Map();
      snap.forEach(d => {
        const f = d.data();
        const other = f.users[0] === uid ? f.users[1] : f.users[0];
        next.set(other, Object.assign({
          uid: other, pid: d.id, name: (f.names && f.names[other]) || '???',
          status: f.status === 'ok' ? 'ok' : f.to === uid ? 'in' : 'out',
          online: false, play: false, room: '', seen: 0
        }, pres.get(other) || {}));
      });
      const added = [...next.values()].some(f => f.status === 'ok' && (!friends.has(f.uid) || friends.get(f.uid).status !== 'ok'));
      const hadFriends = hasFriends();
      friends = next;
      emit('friends');
      if (!hadFriends && hasFriends()) writeStatus();
      if (hasFriends()) listenInvites();
      if (added) setTimeout(() => { if (started) refreshPresence(true); }, 800);
    }, e => console.warn('[Social] amigos:', e.code || e.message));
  }

  /**
   * Lee el "en línea" de tus amigos.
   */
  async function refreshPresence(force = false) {
    if (!fb || (!force && Date.now() - presAt < PRES_TTL)) return;
    presAt = Date.now();
    writeStatus();
    const ok = [...friends.values()].filter(f => f.status === 'ok');
    const docs = await Promise.all(ok.map(f => fb.fs.collection('pres').doc(f.uid).get().catch(() => null)));
    const t = Date.now();
    ok.forEach((f, i) => {
      const v = docs[i] && docs[i].exists ? docs[i].data() : null;
      const on = !!(v && v.on && t - msOf(v.at) < ONLINE);
      const p = { online: on, play: !!(on && v.play), room: on ? v.room : '', seen: v ? msOf(v.at) : 0 };
      pres.set(f.uid, p);
      const cur = friends.get(f.uid);
      if (cur) Object.assign(cur, p);
    });
    emit('presence');
  }

  /** Envía una solicitud de amistad (o acepta la que ya te había mandado). */
  async function request(name) {
    name = (name || '').trim();
    if (!me) await start();
    if (!me) return { ok: false, error: 'Primero elige tu apodo.' };
    if (!VALID.test(name)) return { ok: false, error: 'Escribe el apodo exacto de tu amigo.' };
    const n = await fb.fs.collection('names').doc(name.toLowerCase()).get().catch(() => null);
    if (!n || !n.exists) return { ok: false, error: 'No hay ningún jugador con ese apodo.' };
    const other = n.data().uid;
    if (other === uid) return { ok: false, error: 'Ese eres tú.' };
    const f = friends.get(other);
    if (f && f.status === 'ok') return { ok: false, error: 'Ya sois amigos.' };
    if (f && f.status === 'out') return { ok: false, error: 'Ya le enviaste una solicitud.' };
    if (f && f.status === 'in') return accept(other);
    const prof = await fb.fs.collection('profiles').doc(other).get().catch(() => null);
    const otherName = prof && prof.exists ? prof.data().name : name;
    const users = [uid, other].sort();
    try {
      await fb.fs.collection('friendships').doc(users[0] + '_' + users[1]).set({
        users, from: uid, to: other, status: 'pending',
        names: { [uid]: me.name, [other]: otherName },
        at: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { ok: true, msg: 'Solicitud enviada a ' + otherName };
    } catch (e) { return { ok: false, error: 'No se pudo enviar (' + (e.code || 'error') + ').' }; }
  }

  async function accept(other) {
    const f = friends.get(other);
    if (!f || f.status !== 'in') return { ok: false, error: 'No hay solicitud.' };
    try {
      await fb.fs.collection('friendships').doc(f.pid).update({
        status: 'ok', at: firebase.firestore.FieldValue.serverTimestamp(), ['names.' + uid]: me.name
      });
      refreshPresence(true);
      return { ok: true, msg: 'Ahora eres amigo de ' + f.name };
    } catch (e) { return { ok: false, error: 'No se pudo aceptar (' + (e.code || 'error') + ').' }; }
  }

  async function remove(other) {
    const f = friends.get(other);
    if (!f) return { ok: false };
    try { await fb.fs.collection('friendships').doc(f.pid).delete(); return { ok: true }; }
    catch (e) { return { ok: false, error: 'No se pudo borrar (' + (e.code || 'error') + ').' }; }
  }

  // ---------------- salas ----------------

  function memberInfo() {
    const s = G.DB.save;
    const partnerDex = (s && s.partner) || 25;
    return {
      name: (me && me.name) || G.DB.user || 'Trainer',
      dex: partnerDex,
      shiny: !!(s && s.partnerShiny && G.DB.ownsShiny(partnerDex)),
      at: ts()
    };
  }

  function rtOn() { if (fb && fb.rtdb) fb.rtdb.goOnline(); }
  function rtOff() { if (fb && fb.rtdb && !room && !G.OnlineHub) fb.rtdb.goOffline(); }

  async function createRoom() {
    if (!me) await start();
    if (room) return room;
    rtOn();
    const id = fb.rtdb.ref('rooms').push().key;
    await fb.rtdb.ref('rooms/' + id).set({
      host: uid,
      hostName: (me && me.name) || G.DB.user || 'Trainer',
      open: true,
      at: ts(),
      m: { [uid]: memberInfo() },
      chat: {}
    });
    enterRoom(id, uid);
    return room;
  }

  async function joinRoom(rawId) {
    if (!me) await start();
    let id = String(rawId || '').trim();
    if (!id) return { ok: false, error: 'Escribe el código de la sala.' };
    // Normaliza códigos cortos de 4-8 caracteres a mayúsculas
    if (id.length <= 8) id = id.toUpperCase();
    if (room && room.id === id) return { ok: true };
    if (room) await leaveRoom();
    rtOn();
    let open = null, host = null;
    try {
      open = (await fb.rtdb.ref('rooms/' + id + '/open').get()).val();
      host = (await fb.rtdb.ref('rooms/' + id + '/host').get()).val();
    } catch (e) { /* sala borrada */ }
    if (!host) { rtOff(); return { ok: false, error: 'Esa sala ya no existe.' }; }
    if (open !== true) { rtOff(); return { ok: false, error: 'La partida de esa sala ya ha empezado.' }; }
    try { await fb.rtdb.ref('rooms/' + id + '/m/' + uid).set(memberInfo()); }
    catch (e) { rtOff(); return { ok: false, error: 'No se pudo entrar en la sala.' }; }
    const n = (await fb.rtdb.ref('rooms/' + id + '/m').get()).numChildren();
    if (n > MAX_PLAYERS) {
      await fb.rtdb.ref('rooms/' + id + '/m/' + uid).remove();
      rtOff();
      return { ok: false, error: 'La sala está llena (máximo ' + MAX_PLAYERS + ').' };
    }
    enterRoom(id, host);
    return { ok: true };
  }

  function enterRoom(id, host) {
    room = { id, host, isHost: host === uid, members: [], open: true, chat: [] };
    watchRoomDisconnect();
    const mref = fb.rtdb.ref('rooms/' + id + '/m');
    mref.on('value', s => {
      if (!room || room.id !== id) return;
      const m = s.val() || {};
      // El anfitrión siempre primero; el resto por orden de llegada.
      room.members = Object.keys(m).map(k => Object.assign({ uid: k }, m[k]))
        .sort((a, b) => (a.uid === room.host ? -1 : b.uid === room.host ? 1 : (a.at || 0) - (b.at || 0)));
      emit('room');
    }, () => closedRoom());
    const href = fb.rtdb.ref('rooms/' + id + '/host');
    href.on('value', s => { if (room && room.id === id && !s.val()) closedRoom(); }, () => closedRoom());
    const oref = fb.rtdb.ref('rooms/' + id + '/open');
    oref.on('value', s => { if (room && room.id === id) { room.open = s.val() === true; emit('room'); } }, () => {});
    const cref = fb.rtdb.ref('rooms/' + id + '/chat');
    cref.on('value', s => {
      if (!room || room.id !== id) return;
      const c = s.val() || {};
      room.chat = Object.keys(c).map(k => Object.assign({ id: k }, c[k]))
        .sort((a, b) => (a.at || 0) - (b.at || 0))
        .slice(-30);
      emit('chat');
    }, () => {});
    roomRefs = [mref, href, oref, cref];
    writeStatus();
    emit('room');
  }

  async function sendChat(text) {
    if (!room || !fb || !fb.rtdb) return false;
    const clean = String(text || '').trim().slice(0, 140);
    if (!clean) return false;
    const msg = {
      uid,
      name: (me && me.name) || G.DB.user || 'Trainer',
      text: clean,
      at: Date.now()
    };
    try {
      await fb.rtdb.ref('rooms/' + room.id + '/chat').push(msg);
      return true;
    } catch (e) { return false; }
  }

  /** Si se cierra el navegador, la sala (anfitrión) o tu plaza (invitado) se borran solas. */
  function watchRoomDisconnect() {
    if (!room) return;
    const ref = room.isHost ? fb.rtdb.ref('rooms/' + room.id) : fb.rtdb.ref('rooms/' + room.id + '/m/' + uid);
    ref.onDisconnect().remove();
  }

  function detachRoom() {
    for (const r of roomRefs) r.off();
    roomRefs = [];
  }

  function closedRoom() {
    if (!room) return;
    detachRoom();
    room = null;
    retractInvites();
    writeStatus();
    rtOff();
    emit('room-closed');
  }

  async function leaveRoom() {
    if (!room) return;
    const r = room;
    detachRoom();
    room = null;
    const ref = r.isHost ? fb.rtdb.ref('rooms/' + r.id) : fb.rtdb.ref('rooms/' + r.id + '/m/' + uid);
    ref.onDisconnect().cancel().catch(() => {});
    await ref.remove().catch(() => {});
    retractInvites();
    writeStatus();
    rtOff();
    emit('room');
  }

  /** El anfitrión cierra la sala a nuevos jugadores al empezar la partida. */
  function setOpen(open) {
    if (room && room.isHost) fb.rtdb.ref('rooms/' + room.id + '/open').set(!!open).catch(() => {});
  }

  /** Actualiza tu Pokémon en la sala (si cambias de compañero). */
  function refreshMember() {
    if (room && me) {
      const s = G.DB.save;
      fb.rtdb.ref('rooms/' + room.id + '/m/' + uid).update({
        name: me.name,
        dex: s.partner,
        shiny: !!s.partnerShiny && G.DB.ownsShiny(s.partner)
      }).catch(() => {});
    }
    writeStatus();
  }

  // ---------------- invitaciones ----------------

  async function invite(other, otherNameOpt) {
    if (!me) await start();
    const f = friends.get(other);
    const targetName = (f && f.name) || otherNameOpt || 'Jugador';
    if (!f && !otherNameOpt) return { ok: false, error: 'Sólo puedes invitar a tus amigos.' };
    if (room && room.members.length >= MAX_PLAYERS) return { ok: false, error: 'La sala está llena.' };
    if (room && !room.isHost) return { ok: false, error: 'Sólo el anfitrión de la sala puede invitar.' };
    if (!room) await createRoom();
    try {
      await fb.fs.collection('inv').doc(other + '_' + uid).set({ to: other, from: uid, room: room.id, name: me.name, at: fts() });
    } catch (e) { return { ok: false, error: 'No se pudo invitar (' + (e.code || 'error') + ').' }; }
    sentInv.add(other);
    return { ok: true, msg: 'Invitación enviada a ' + targetName };
  }

  /** Retira las invitaciones que mandaste (al salir de la sala). */
  function retractInvites() {
    if (!fb) return;
    for (const o of sentInv) fb.fs.collection('inv').doc(o + '_' + uid).delete().catch(() => {});
    sentInv.clear();
  }

  function onInvite(ref, v) {
    if (!v || (v.at && Date.now() - msOf(v.at) > INVITE_TTL)) { ref.delete().catch(() => {}); return; }
    invites.set(v.from, { from: v.from, name: v.name, room: v.room, at: msOf(v.at) || Date.now() });
    emit('invites');
  }

  const invDoc = from => fb.fs.collection('inv').doc(uid + '_' + from);

  async function acceptInvite(from) {
    const inv = invites.get(from);
    if (!inv || Date.now() - inv.at > INVITE_TTL) { invites.delete(from); emit('invites'); return { ok: false, error: 'La invitación ha caducado.' }; }
    invites.delete(from);
    invDoc(from).delete().catch(() => {});
    emit('invites');
    return joinRoom(inv.room);
  }

  function declineInvite(from) {
    invites.delete(from);
    invDoc(from).delete().catch(() => {});
    emit('invites');
  }

  // ---------------- salas abiertas y jugadores en línea ----------------

  function openRooms() {
    if (G.OnlineHub && G.OnlineHub.listOpenRooms) return G.OnlineHub.listOpenRooms();
    return [];
  }

  function onlinePlayers() {
    if (G.OnlineHub && G.OnlineHub.listOnlinePlayers) return G.OnlineHub.listOnlinePlayers();
    return [];
  }

  // ---------------- perfil público ----------------

  /** Lo que se enseña de ti (también para tu vista previa, sin subirlo). */
  function profileData() {
    const s = G.DB.save, st = s.stats, prof = s.profile || {};
    const unlocked = G.AchDefs.LIST.filter(a => s.ach && s.ach[a.id]);
    const medals = unlocked.slice().sort((a, b) => (b.tier - a.tier) || (s.ach[b.id] - s.ach[a.id])).slice(0, 8).map(a => a.id);
    return {
      name: me ? me.name : G.DB.user,
      favs: (prof.favs || []).slice(0, 3).map(f => ({ dex: f.dex | 0, shiny: !!f.shiny })),
      title: prof.title || '',
      best: { solo: st.bestTime | 0, group: st.bestGroupTime | 0, level: st.bestLevel | 0, bosses: st.bossesTotal | 0,
              legends: Object.keys(s.legends || {}).length, kills: st.totalKills | 0, medals: unlocked.length },
      medals
    };
  }

  let pubT = 0, pubAt = 0, pubLast = '';
  function publishProfile(force = false) {
    if (!me || !fb) return;
    if (!force && Date.now() - pubAt < 30 * 60 * 1000) return;
    clearTimeout(pubT);
    pubT = setTimeout(() => {
      if (!me || !fb) return;
      const d = profileData();
      const key = JSON.stringify(Object.assign({}, d, { best: Object.assign({}, d.best, { kills: Math.floor(d.best.kills / 1000) }) }));
      const lsKey = 'ps.pub.' + uid;
      if (!pubLast) { try { pubLast = localStorage.getItem(lsKey) || ''; } catch (e) { /* nada */ } }
      if (key === pubLast && !force) return;
      pubLast = key; pubAt = Date.now();
      try { localStorage.setItem(lsKey, key); } catch (e) { /* nada */ }
      fb.fs.collection('profiles').doc(uid).set(Object.assign(d, {
        name: me.name, lower: me.name.toLowerCase(), at: firebase.firestore.FieldValue.serverTimestamp()
      })).catch(e => { pubLast = ''; console.warn('[Social] perfil:', e.code || e.message); });
    }, 300);
  }

  /** El perfil público de otro jugador. */
  const profCache = new Map();
  async function getProfile(other) {
    if (!fb) return null;
    if (other === uid && me) return Object.assign(profileData(), { name: me.name });
    const c = profCache.get(other);
    if (c && Date.now() - c.at < 60 * 1000) return c.v;
    const d = await fb.fs.collection('profiles').doc(other).get().catch(() => null);
    const v = d && d.exists ? d.data() : null;
    profCache.set(other, { at: Date.now(), v });
    return v;
  }

  // Al cerrar sesión o borrar la cuenta.
  G.DB.onLeave(why => stop(why));

  return {
    start, stop, claimNick, request, accept, remove, publishProfile, getProfile, profileData,
    createRoom, joinRoom, leaveRoom, setOpen, refreshMember, setPlaying, refreshPresence,
    invite, acceptInvite, declineInvite, sendChat, openRooms, onlinePlayers,
    on(fn) { listeners.add(fn); }, off(fn) { listeners.delete(fn); },
    get me() { return me; },
    get started() { return started; },
    get friends() { return [...friends.values()]; },
    get invites() { return [...invites.values()]; },
    get room() { return room; },
    get uid() { return uid; },
    VALID, MAX_PLAYERS
  };
})();
