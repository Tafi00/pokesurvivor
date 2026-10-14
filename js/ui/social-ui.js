/* ============ social-ui.js — apodo, amigos, sala e invitaciones ============ */
(() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function copyText(txt, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => G.UI.toast(okMsg, 2200)).catch(() => fallbackCopy(txt, okMsg));
    } else {
      fallbackCopy(txt, okMsg);
    }
  }
  function fallbackCopy(txt, okMsg) {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      G.UI.toast(okMsg, 2200);
    } catch (e) {
      G.UI.toast(txt, 3200);
    }
  }

  /** ¿Se puede usar lo online? Si no, explica por qué. */
  function needOnline() {
    if (G.DB.online) return true;
    G.UI.toast('Esto necesita la versión online del juego (con la nube).', 3200);
    return false;
  }

  // ======================= APODO =======================

  G.NickUI = (() => {
    let then = null, skipped = false;

    function init() {
      $('nick-form').onsubmit = async e => {
        e.preventDefault();
        $('nick-err').textContent = '';
        $('nick-ok').disabled = true;
        const r = await G.Social.claimNick($('nick-in').value);
        $('nick-ok').disabled = false;
        if (!r.ok) { $('nick-err').textContent = r.error; G.Audio.sfx('error'); return; }
        G.Audio.sfx('confirm');
        G.UI.toast('Tu apodo es ' + G.Social.me.name);
        const cb = then; then = null;
        if (cb) cb(); else G.MenuUI.open();
      };
      $('nick-later').onclick = () => {
        skipped = true;
        const cb = then; then = null;
        if (cb && G.Social.me) cb();
        else G.MenuUI.open();
      };
    }

    /** @param next  qué abrir después de elegirlo */
    function open(next) {
      then = next || null;
      G.UI.show('scr-nick');
      $('nick-err').textContent = '';
      $('nick-in').value = G.Social.me ? G.Social.me.name : '';
      setTimeout(() => { $('nick-in').focus(); $('nick-in').select(); }, 50);
    }

    return { init, open, get skipped() { return skipped; } };
  })();

  /** Abre `fn` si tienes apodo; si no, pide el apodo primero. */
  function withNick(fn) {
    if (!needOnline()) return;
    if (G.Social.me) { fn(); return; }
    G.Social.start().then(r => { if (r === 'ok') fn(); else G.NickUI.open(fn); });
  }

  // ======================= AMIGOS Y COOPERATIVO =======================

  G.FriendsUI = (() => {
    let refreshTimer = 0;

    function init() {
      $('fr-add').onsubmit = async e => {
        e.preventDefault();
        const name = $('fr-name').value;
        msg('');
        const r = await G.Social.request(name);
        msg(r.ok ? r.msg : r.error, !r.ok);
        if (r.ok) $('fr-name').value = '';
      };
      $('fr-room').onclick = () => G.LobbyUI.open();
      if ($('fr-nick-btn')) {
        $('fr-nick-btn').onclick = () => G.NickUI.open(() => G.FriendsUI.open());
      }
      if ($('fr-create-room')) {
        $('fr-create-room').onclick = async () => {
          $('fr-create-room').disabled = true;
          try {
            await G.Social.createRoom();
            G.Audio.sfx('confirm');
            G.LobbyUI.open();
          } finally {
            $('fr-create-room').disabled = false;
          }
        };
      }
      if ($('fr-join-form')) {
        $('fr-join-form').onsubmit = async e => {
          e.preventDefault();
          const code = ($('fr-room-code').value || '').trim();
          if (!code) { msg('Escribe el código de la sala.', true); return; }
          $('fr-join-btn').disabled = true;
          msg('');
          const r = await G.Social.joinRoom(code);
          $('fr-join-btn').disabled = false;
          if (!r.ok) { msg(r.error, true); return; }
          $('fr-room-code').value = '';
          G.Audio.sfx('confirm');
          G.LobbyUI.open();
        };
      }
      G.Social.on(() => { if (G.UI.isOpen('scr-friends')) render(); });
    }

    function msg(t, bad) {
      $('fr-msg').textContent = t || '';
      $('fr-msg').style.color = bad ? '#ffb0b8' : '';
      if (t) G.Audio.sfx(bad ? 'error' : 'confirm');
    }

    function open() {
      withNick(() => {
        G.UI.show('scr-friends', true);
        msg('');
        G.Social.refreshPresence(true);
        render();
        clearInterval(refreshTimer);
        refreshTimer = setInterval(() => {
          if (!G.UI.isOpen('scr-friends')) { clearInterval(refreshTimer); refreshTimer = 0; return; }
          G.Social.refreshPresence();
          render();
        }, 3500);
      });
    }

    /** "hace 5 min", "hace 2 h", "hace 3 días". */
    function ago(t) {
      const m = Math.max(1, Math.round((Date.now() - t) / 60000));
      if (m < 60) return 'hace ' + m + ' min';
      const h = Math.round(m / 60);
      if (h < 48) return 'hace ' + h + ' h';
      return 'hace ' + Math.round(h / 24) + ' días';
    }

    function stateText(f) {
      if (f.status === 'in') return 'Quiere ser tu amigo';
      if (f.status === 'out') return 'Solicitud enviada';
      if (!f.online) return f.seen ? 'Visto ' + ago(f.seen) : 'Desconectado';
      if (f.room) return 'En sala #' + f.room;
      return f.play ? 'Jugando' : 'En línea';
    }

    function renderOpenRooms(currentRoom) {
      const box = $('fr-open-rooms');
      if (!box) return;
      const rooms = G.Social.openRooms ? G.Social.openRooms() : [];
      if ($('fr-rooms-count')) $('fr-rooms-count').textContent = String(rooms.length);
      box.innerHTML = '';
      if (!rooms.length) {
        box.innerHTML = '<p class="sub" style="margin:6px 0">No hay salas públicas abiertas ahora. ¡Crea una sala Co-op arriba!</p>';
        return;
      }
      for (const rm of rooms) {
        const el = document.createElement('div');
        el.className = 'fr-row coop-room-row';
        const isMine = currentRoom && currentRoom.id === rm.id;
        const mons = (rm.members || []).map(m => (G.DEX_BY[m.dex] || {}).name || 'Pokémon').join(', ');
        el.innerHTML = `
          <span class="room-code-pill" translate="no">#${esc(rm.id)}</span>
          <div class="coop-room-meta grow">
            <div><b translate="no">${esc(rm.hostName)}</b> <span class="st">(${rm.count}/${rm.max})</span></div>
            <small class="sub" style="margin:0;display:block">${esc(mons)}</small>
          </div>
        `;
        const b = document.createElement('button');
        b.className = 'btn small ' + (isMine ? 'ghost' : 'gold');
        b.textContent = isMine ? 'Ir a la sala' : 'Unirse';
        b.onclick = async () => {
          if (isMine) { G.LobbyUI.open(); return; }
          b.disabled = true;
          const r = await G.Social.joinRoom(rm.id);
          b.disabled = false;
          if (!r.ok) { msg(r.error, true); return; }
          G.Audio.sfx('confirm');
          G.LobbyUI.open();
        };
        el.appendChild(b);
        box.appendChild(el);
      }
    }

    function renderOnlinePlayers(currentRoom) {
      const box = $('fr-online-list');
      if (!box) return;
      const all = (G.Social.onlinePlayers ? G.Social.onlinePlayers() : []).filter(p => p.uid !== G.Social.uid);
      if ($('fr-online-count')) $('fr-online-count').textContent = String(all.length);
      box.innerHTML = '';
      if (!all.length) {
        box.innerHTML = '<p class="sub" style="margin:6px 0">No hay otros entrenadores conectados en este momento.</p>';
        return;
      }
      const friendSet = new Set(G.Social.friends.map(f => f.uid));
      for (const p of all) {
        const el = document.createElement('div');
        el.className = 'fr-row';
        const monName = (G.DEX_BY[p.dex] || {}).name || '';
        const inMyRoom = currentRoom && currentRoom.members.some(m => m.uid === p.uid);
        const stLabel = inMyRoom ? 'En tu sala' : p.play ? 'Jugando' : p.room ? ('En sala #' + p.room) : 'En línea';
        el.innerHTML = `
          <i class="dot ${p.play ? 'play' : 'on'}"></i>
          <b translate="no"><a href="#" class="plink" title="Ver su perfil">${esc(p.name)}</a></b>
          ${monName ? `<span class="coop-mon-tag">${esc(monName)}</span>` : ''}
          <span class="st">${esc(stLabel)}</span>
          <span class="grow"></span>
        `;
        el.querySelector('.plink').onclick = e => { e.preventDefault(); G.ProfileUI.show(p.uid); };

        if (p.room && (!currentRoom || currentRoom.id !== p.room) && !p.play) {
          const jb = document.createElement('button');
          jb.className = 'btn small gold';
          jb.textContent = 'Unirse';
          jb.onclick = async () => {
            const r = await G.Social.joinRoom(p.room);
            if (r.ok) G.LobbyUI.open();
            else msg(r.error, true);
          };
          el.appendChild(jb);
        } else if (!p.play && !inMyRoom && (!currentRoom || currentRoom.isHost)) {
          const ib = document.createElement('button');
          ib.className = 'btn small gold';
          ib.textContent = 'Invitar';
          ib.onclick = async () => {
            const r = await G.Social.invite(p.uid, p.name);
            msg(r.ok ? r.msg : r.error, !r.ok);
            if (r.ok) G.LobbyUI.open();
          };
          el.appendChild(ib);
        }

        if (!friendSet.has(p.uid)) {
          const fb = document.createElement('button');
          fb.className = 'btn small ghost';
          fb.textContent = '+ Amigo';
          fb.onclick = async () => {
            const r = await G.Social.request(p.name);
            msg(r.ok ? r.msg : r.error, !r.ok);
            render();
          };
          el.appendChild(fb);
        }
        box.appendChild(el);
      }
    }

    function render() {
      const room = G.Social.room;
      const wsOk = !!(G.OnlineHub && G.OnlineHub.wsConnected);
      const statusBadge = `<span class="online-hub-badge ${wsOk ? 'ok' : ''}"><i class="dot on"></i> ${wsOk ? 'Servidor Co-op en vivo' : 'Modo Co-op Local'}</span>`;
      $('fr-me').innerHTML = `${statusBadge} · Tu apodo: <b class="gold" translate="no">${esc(G.Social.me ? G.Social.me.name : '')}</b> · compártelo o crea una sala con código.`;
      $('fr-room').classList.toggle('hidden', !room);
      if ($('fr-create-room')) {
        $('fr-create-room').textContent = room ? ('Mi sala (#' + room.id + ')') : 'Crear sala Co-op';
      }

      renderOpenRooms(room);
      renderOnlinePlayers(room);

      const list = G.Social.friends.sort((a, b) => {
        const rank = f => f.status === 'in' ? 0 : f.status === 'ok' ? (f.online ? (f.play ? 2 : 1) : 3) : 4;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
      const box = $('fr-list');
      box.innerHTML = '';
      if (!list.length) {
        box.innerHTML = '<p class="sub">Aún no tienes amigos añadidos. Escribe arriba el apodo de un amigo o invítalo desde Entrenadores en línea.</p>';
        return;
      }
      for (const f of list) {
        const el = document.createElement('div');
        el.className = 'fr-row';
        const dot = f.status !== 'ok' ? 'pend' : !f.online ? 'off' : f.play ? 'play' : 'on';
        const inRoom = room && room.members.some(m => m.uid === f.uid);
        el.innerHTML = `<i class="dot ${dot}"></i><b translate="no"><a href="#" class="plink" title="Ver su perfil">${esc(f.name)}</a></b><span class="st">${inRoom ? 'En tu sala' : stateText(f)}</span><span class="grow"></span>`;
        if (f.status === 'ok') el.querySelector('.plink').onclick = e => { e.preventDefault(); G.ProfileUI.show(f.uid); };
        else el.querySelector('.plink').onclick = e => e.preventDefault();
        const btn = (txt, cls, fn) => {
          const b = document.createElement('button');
          b.className = 'btn small ' + cls; b.textContent = txt; b.onclick = fn; el.appendChild(b); return b;
        };
        if (f.status === 'in') {
          btn('Aceptar', 'gold', async () => { const r = await G.Social.accept(f.uid); msg(r.ok ? r.msg : r.error, !r.ok); });
          btn('Rechazar', 'ghost', () => G.Social.remove(f.uid));
        } else if (f.status === 'out') {
          btn('Cancelar', 'ghost', () => G.Social.remove(f.uid));
        } else {
          if (f.online && f.room && (!room || room.id !== f.room) && !f.play) {
            btn('Unirse', 'gold', async () => {
              const r = await G.Social.joinRoom(f.room);
              if (r.ok) G.LobbyUI.open();
              else msg(r.error, true);
            });
          }
          if (f.online && !f.play && !inRoom && (!room || room.isHost)) {
            btn('Invitar', 'gold', async () => {
              const r = await G.Social.invite(f.uid, f.name);
              msg(r.ok ? r.msg : r.error, !r.ok);
              if (r.ok) G.LobbyUI.open();
            });
          }
          btn('Quitar', 'ghost', () => { if (confirm('¿Quitar a ' + f.name + ' de tus amigos?')) G.Social.remove(f.uid); });
        }
        box.appendChild(el);
      }
    }

    return { init, open, render };
  })();

  // ======================= SALA =======================

  G.LobbyUI = (() => {
    let membersKey = '';

    function init() {
      $('lobby-leave').onclick = async () => {
        await G.Social.leaveRoom();
        G.Net.close();
        G.MenuUI.open();
      };
      $('lobby-menu').onclick = () => G.MenuUI.open();
      $('lobby-start').onclick = start;
      $('lobby-start').dataset.sfx = 'confirm';

      if ($('lobby-copy-code')) {
        $('lobby-copy-code').onclick = () => {
          const r = G.Social.room;
          if (!r) return;
          copyText(r.id, 'Código copiado: ' + r.id);
        };
      }
      if ($('lobby-copy-link')) {
        $('lobby-copy-link').onclick = () => {
          const r = G.Social.room;
          if (!r) return;
          const url = location.origin + location.pathname + '?room=' + encodeURIComponent(r.id);
          copyText(url, 'Enlace de invitación copiado');
        };
      }
      if ($('lobby-open-tab')) {
        $('lobby-open-tab').onclick = () => {
          const r = G.Social.room;
          if (!r) return;
          const url = location.origin + location.pathname + '?room=' + encodeURIComponent(r.id) + '&newtab=1';
          window.open(url, '_blank');
        };
      }
      if ($('lobby-change-mon')) {
        $('lobby-change-mon').onclick = () => {
          window.__returnToLobby = true;
          const dexBtn = document.querySelector('#scr-menu [data-go="dex"]');
          if (dexBtn) dexBtn.click();
        };
      }
      if ($('lobby-chat-form')) {
        $('lobby-chat-form').onsubmit = async e => {
          e.preventDefault();
          const input = $('lobby-chat-in');
          const txt = (input.value || '').trim();
          if (!txt) return;
          input.value = '';
          await G.Social.sendChat(txt);
          G.Audio.sfx('select');
        };
      }
      if ($('lobby-emotes')) {
        $('lobby-emotes').querySelectorAll('[data-msg]').forEach(b => {
          b.onclick = async () => {
            await G.Social.sendChat(b.dataset.msg);
            G.Audio.sfx('select');
          };
        });
      }

      // Conecta / desconecta la red al entrar o salir de una sala.
      G.Social.on(what => {
        const room = G.Social.room;
        if (room) {
          G.Net.open(room.id, room.isHost, room.host);
          G.Net.syncMembers(room.members.map(m => m.uid));
        } else if (G.Net.open_) G.Net.close();
        if (what === 'room-closed') {
          G.UI.toast('La sala se ha cerrado', 2600);
          if (G.UI.isOpen('scr-lobby')) G.MenuUI.open();
        }
        if (G.UI.isOpen('scr-lobby')) {
          if (what === 'chat') renderChat();
          else render();
        }
      });
      G.Net.onPeer(() => { if (G.UI.isOpen('scr-lobby')) render(); });
    }

    function open() {
      if (!G.Social.room) { G.MenuUI.open(); return; }
      G.Social.refreshMember();
      G.Social.refreshPresence();
      G.UI.show('scr-lobby', true);
      membersKey = '';
      render();
    }

    function close() { G.UI.hide('scr-lobby'); }

    function connText(m, room) {
      if (m.uid === room.host) return 'Anfitrión';
      if (!room.isHost) return m.uid === G.Social.uid ? 'Tú (Listo)' : 'En la sala';
      const mode = G.Net.mode(m.uid);
      return mode === 'direct' ? 'Conectado' : mode === 'relay' ? 'Conectado (por servidor)' : mode === 'failed' ? 'No se pudo conectar (reintentando…)' : 'Conectando…';
    }

    function renderChat() {
      const room = G.Social.room;
      const log = $('lobby-chat-log');
      if (!room || !log) return;
      const chat = room.chat || [];
      if (!chat.length) {
        log.innerHTML = '<p class="sub" style="margin:4px 0">Saluda a tu equipo o usa las frases rápidas de arriba.</p>';
      } else {
        const colorOf = u => {
          const idx = room.members.findIndex(m => m.uid === u);
          return G.Coop.COLORS[idx >= 0 ? idx : 0] || '#ffd23f';
        };
        log.innerHTML = chat.map(c =>
          `<div class="lobby-chat-line"><b style="color:${colorOf(c.uid)}" translate="no">${esc(c.name)}:</b> <span>${esc(c.text)}</span></div>`
        ).join('');
        log.scrollTop = log.scrollHeight;
      }

      // Burbuja reciente sobre la carta del jugador (últimos 8 s)
      const now = Date.now();
      const latestByUid = {};
      for (const c of chat) {
        if (now - (c.at || 0) < 8000) latestByUid[c.uid] = c.text;
      }
      const box = $('lobby-members');
      if (box) {
        box.querySelectorAll('.lob-bubble').forEach(el => {
          const txt = latestByUid[el.dataset.u] || '';
          el.textContent = txt;
          el.classList.toggle('hidden', !txt);
        });
      }
    }

    function render() {
      const room = G.Social.room;
      if (!room) return;
      const ms = room.members;
      if ($('lobby-code-val')) $('lobby-code-val').textContent = room.id;
      $('lobby-sub').textContent = room.isHost
        ? 'Eres el anfitrión. Comparte el código #' + room.id + ' o invita a tus amigos (hasta ' + G.Social.MAX_PLAYERS + ') y empezad cuando estéis.'
        : 'Estás en la sala #' + room.id + ' de ' + ((ms.find(m => m.uid === room.host) || {}).name || '…') + '. El anfitrión empezará la partida.';

      // Las tarjetas sólo se rehacen si cambian los miembros (los sprites no parpadean).
      const key = ms.map(m => m.uid + ':' + m.dex + ':' + (m.shiny ? 1 : 0) + ':' + m.name).join('|');
      const box = $('lobby-members');
      if (key !== membersKey) {
        membersKey = key;
        box.innerHTML = '';
        for (let i = 0; i < G.Social.MAX_PLAYERS; i++) {
          const m = ms[i];
          const c = document.createElement('div');
          c.className = 'lob-card' + (m ? '' : ' empty');
          if (m) {
            c.style.setProperty('--pc', G.Coop.COLORS[i]);
            c.insertAdjacentHTML('beforeend', `<div class="lob-bubble hidden" data-u="${m.uid}"></div>`);
            c.appendChild(G.UI.spriteCanvas(m.dex, 120, 96, { scale: 2, lively: true, shiny: !!m.shiny }));
            c.insertAdjacentHTML('beforeend', `<b translate="no">${esc(m.name)}</b><small>${esc((G.DEX_BY[m.dex] || {}).name || '')}</small><span class="conn" data-u="${m.uid}"></span>`);
          } else c.innerHTML = '<span>Libre</span>';
          box.appendChild(c);
        }
      }
      box.querySelectorAll('.conn').forEach(el => {
        const m = ms.find(x => x.uid === el.dataset.u);
        if (!m) return;
        const t = connText(m, room);
        el.textContent = t;
        el.className = 'conn' + (t === 'Conectando…' ? ' wait' : '');
      });

      renderChat();

      // Invitar (sólo el anfitrión y si queda sitio).
      const canInvite = room.isHost && ms.length < G.Social.MAX_PLAYERS;
      $('lobby-inv-title').classList.toggle('hidden', !canInvite);
      const inv = $('lobby-invite');
      inv.classList.toggle('hidden', !canInvite);
      if (canInvite) {
        inv.innerHTML = '';
        const inRoomSet = new Set(ms.map(m => m.uid));
        const candidates = new Map();
        for (const f of G.Social.friends) {
          if (f.status === 'ok' && f.online && !inRoomSet.has(f.uid)) {
            candidates.set(f.uid, { uid: f.uid, name: f.name, play: f.play, isFriend: true });
          }
        }
        for (const p of (G.Social.onlinePlayers ? G.Social.onlinePlayers() : [])) {
          if (p.uid !== G.Social.uid && !inRoomSet.has(p.uid) && !candidates.has(p.uid)) {
            candidates.set(p.uid, { uid: p.uid, name: p.name, play: p.play, isFriend: false });
          }
        }
        const list = [...candidates.values()];
        if (!list.length) {
          inv.innerHTML = '<p class="sub" style="margin:0">Ningún jugador libre ahora mismo. Usa "Abrir pestaña Co-op" arriba para probar en otra pestaña.</p>';
        }
        for (const f of list) {
          const el = document.createElement('div');
          el.className = 'fr-row';
          el.innerHTML = `<i class="dot ${f.play ? 'play' : 'on'}"></i><b translate="no">${esc(f.name)}</b><span class="st">${f.play ? 'Jugando' : 'En línea'}</span><span class="grow"></span>`;
          const b = document.createElement('button');
          b.className = 'btn small gold'; b.textContent = 'Invitar';
          b.onclick = async () => { const r = await G.Social.invite(f.uid, f.name); G.UI.toast(r.ok ? r.msg : r.error); };
          el.appendChild(b);
          inv.appendChild(el);
        }
      }

      const btn = $('lobby-start');
      btn.classList.toggle('hidden', !room.isHost);
      const connecting = ms.some(m => m.uid !== room.host && G.Net.mode(m.uid) === 'connecting');
      const failed = ms.some(m => m.uid !== room.host && G.Net.mode(m.uid) === 'failed');
      btn.disabled = !room.isHost || ms.length < 2 || connecting || failed;
      btn.textContent = 'Empezar partida (' + ms.length + '/' + G.Social.MAX_PLAYERS + ')';
      $('lobby-note').textContent = !room.isHost ? 'Cuando el anfitrión empiece, entraréis todos a la vez.'
        : ms.length < 2 ? 'Necesitas al menos un compañero en la sala (puedes pulsar "Abrir pestaña Co-op" arriba para unirte desde otra pestaña).'
        : failed ? 'No se puede conectar con algún amigo: su red (o la tuya) no deja jugar en grupo. Probad con otra wifi o datos móviles; se reintenta solo.'
        : connecting ? 'Conectando con tus amigos…' : 'La partida empieza para todos a la vez.';
    }

    function start() {
      const room = G.Social.room;
      if (!room || !room.isHost || room.members.length < 2) return;
      const cfg = {
        k: 'start', seed: Math.floor(Math.random() * 1e6), host: room.host,
        members: room.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: !!m.shiny }))
      };
      G.Social.setOpen(false);
      G.Net.broadcast(cfg);
      G.Flow.startCoop(cfg);
    }

    return { init, open, close, render };
  })();

  // ======================= INVITACIONES =======================

  G.InvitePop = (() => {
    let cur = null;

    function init() {
      $('inv-yes').onclick = async () => {
        if (!cur) return;
        const from = cur.from;
        hide();
        const r = await G.Social.acceptInvite(from);
        if (!r.ok) { G.UI.toast(r.error, 3000); return; }
        G.LobbyUI.open();
      };
      $('inv-no').onclick = () => { if (cur) G.Social.declineInvite(cur.from); hide(); };
      G.Social.on(what => { if (what === 'invites' || what === 'room') refresh(); });
    }

    function hide() { cur = null; $('invite-pop').classList.add('hidden'); }

    /** Enseña la invitación más antigua si estás en los menús (no en plena partida). */
    function refresh() {
      const room = G.Social.room;
      const list = G.Social.invites.filter(i => !room || i.room !== room.id).sort((a, b) => a.at - b.at);
      if (!list.length || G.Game.state !== 'ui' || !G.DB.loggedIn) { hide(); return; }
      if (cur && cur.from === list[0].from) return;
      cur = list[0];
      $('inv-text').innerHTML = `${G.Icons.html('friends', 22)} <b class="gold" translate="no">${esc(cur.name)}</b> te invita a jugar en su sala`;
      $('invite-pop').classList.remove('hidden');
      G.Audio.sfx('shiny');
    }

    return { init, refresh };
  })();

  G.SocialUI = {
    init() { G.NickUI.init(); G.FriendsUI.init(); G.LobbyUI.init(); G.InvitePop.init(); },
    withNick, needOnline
  };
})();
