/* ============ menu.js — menú principal, colección y mejoras ============ */
G.MenuUI = (() => {
  const $ = G.UI.$;
  const GEN_NAMES = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  let dexFilter = 'all', dexGen = 1, dexSel = null, dexSearch = '', dexType = '';

  function init() {
    const ICON = { play: 'ball', dex: 'book', upgrades: 'up', gacha: 'ball4', goals: 'medal3', friends: 'friends', rank: 'trophy', settings: 'gear' };
    document.querySelectorAll('#scr-menu [data-go]').forEach(b => {
      b.insertAdjacentHTML('afterbegin', `<span class="mi-ico">${G.Icons.html(ICON[b.dataset.go], 26)}</span>`);
      b.dataset.sfx = b.dataset.go === 'play' ? 'confirm' : 'click';
      b.onclick = () => {
        const go = b.dataset.go;
        if (go === 'play') { if (G.Social.room) G.LobbyUI.open(); else G.Flow.play(); }
        else if (go === 'dex') openDex();
        else if (go === 'upgrades') openUpgrades();
        else if (go === 'gacha') G.GachaUI.open();
        else if (go === 'goals') G.GoalsUI.open();
        else if (go === 'friends') G.FriendsUI.open();
        else if (go === 'rank') G.RankingUI.open();
        else if (go === 'settings') G.SettingsUI.open();
      };
    });
    document.querySelectorAll('[data-back]').forEach(b => { b.onclick = open; });
    G.Social.on(() => { if (G.UI.isOpen('scr-menu')) socialLine(); });
    $('btn-logout').onclick = () => {
      G.Audio.music(null);
      G.DB.logout().then(() => G.Flow.toLogin());
    };
  }

  // ---------------- menú principal ----------------

  function open() {
    const s = G.DB.save;
    const mon = G.DEX_BY[s.partner];
    const shiny = !!s.partnerShiny && G.DB.ownsShiny(mon.dex);
    G.UI.chrome(true);
    G.UI.show('scr-menu');
    G.UI.sprite($('menu-partner'), mon.dex, { lively: true, scale: 4, hero: true, shiny });
    $('menu-partner').style.setProperty('--stage-c', shiny ? '#9ae6ff' : G.U.TYPE_COLOR[mon.types[0]]);
    $('menu-partner').classList.toggle('shiny', shiny);
    $('menu-partner-name').innerHTML = mon.name + (shiny ? ' ' + G.Icons.html('shiny', 24) : '');
    $('menu-partner-info').innerHTML = G.UI.typeChips(mon.types) + ' ' + G.UI.stars(mon.rarity);
    // Normal / shiny a mano, aquí mismo (en el móvil no se encontraba en la ficha).
    const seg = $('menu-shiny');
    seg.classList.toggle('hidden', !G.DB.ownsShiny(mon.dex));
    seg.lastChild.innerHTML = G.Icons.html('shiny', 12) + ' Shiny';
    seg.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', (b.dataset.v === '1') === shiny);
      b.onclick = () => {
        if ((b.dataset.v === '1') === shiny) return;
        s.partnerShiny = b.dataset.v === '1';
        G.DB.commit();
        G.Audio.sfx('confirm');
        open();
      };
    });

    const owned = Object.keys(s.owned).filter(d => G.DEX_BY[d]).length;
    const shinies = Object.keys(s.shiny || {}).length;
    $('menu-dex-count').textContent = `${owned} / ${G.DEX.length}` + (shinies ? ` · ${shinies} shiny` : '');

    const st = s.stats;
    $('menu-stats').innerHTML =
      `Runs <b style="color:#fff">${st.runs}</b> · Mejor tiempo <b style="color:#fff">${G.U.mmss(st.bestTime)}</b><br>` +
      `Mejor nivel <b style="color:#fff">${st.bestLevel}</b> · Derrotados <b style="color:#fff">${st.totalKills.toLocaleString('es')}</b>` +
      (G.DB.guest ? '<br><span style="color:#5fe08a">Modo invitado: guardado en este navegador</span>' : '');

    socialLine();
    // Premios de misiones por recoger.
    G.Progress.checkAch();
    const pend = G.Progress.pending();
    $('menu-goals-sub').textContent = pend ? pend + (pend === 1 ? ' premio por recoger' : ' premios por recoger') : 'Misiones, logros y perfil';
    $('menu-goals-sub').classList.toggle('gold', pend > 0);
    // Con cuenta en la nube: amigos en línea, invitaciones y (una vez) el apodo.
    if (G.DB.online && !G.Social.started) {
      G.Social.start().then(r => {
        if (r === 'need-nick' && !G.NickUI.skipped && G.UI.isOpen('scr-menu')) G.NickUI.open();
        socialLine();
      });
    }
    G.InvitePop.refresh();
  }

  /** Texto bajo "Amigos" y "Jugar": quién está en línea, solicitudes, sala. */
  function socialLine() {
    const room = G.Social.room;
    const play = document.querySelector('#scr-menu [data-go=play] small');
    if (play) play.textContent = room ? 'Volver a tu sala (' + room.members.length + '/' + G.Social.MAX_PLAYERS + ')' : 'Entra en la mazmorra';
    const fr = G.Social.friends;
    const on = fr.filter(f => f.status === 'ok' && f.online).length;
    const req = fr.filter(f => f.status === 'in').length;
    const parts = [];
    if (on) parts.push(on + ' en línea');
    if (req) parts.push(req + (req === 1 ? ' solicitud' : ' solicitudes'));
    $('menu-friends-sub').textContent = parts.length ? parts.join(' · ') : 'Juega en grupo, hasta 4';
    $('menu-friends-sub').classList.toggle('gold', req > 0);
  }

  // ---------------- colección ----------------

  function openDex() {
    G.UI.show('scr-dex', true);
    const s = G.DB.save;
    if (dexSel == null) { dexSel = s.partner; dexGen = G.DEX_BY[s.partner].gen; }
    const owned = Object.keys(s.owned).filter(d => G.DEX_BY[d]).length;
    $('dex-total').textContent = `${owned} / ${G.DEX.length}`;

    // Pestañas de generación, con cuántos tienes de cada una.
    const tabs = $('dex-gens');
    tabs.innerHTML = '';
    GEN_NAMES.forEach((name, i) => {
      const g = i + 1;
      const total = G.DEX.filter(p => p.gen === g).length;
      const have = G.DEX.filter(p => p.gen === g && s.owned[p.dex]).length;
      const b = document.createElement('button');
      b.className = 'gen-tab' + (g === dexGen && !dexSearch ? ' on' : '');
      b.innerHTML = `<b>${name}</b><small>${have}/${total}</small>`;
      b.onclick = () => { dexGen = g; dexSearch = ''; openDex(); };
      tabs.appendChild(b);
    });

    const F = [['all', 'Todos'], ['own', 'Tengo'], ['miss', 'Me faltan'], ['shiny', 'Shiny'],
               ['5', 5], ['4', 4], ['3', 3], ['2', 2], ['1', 1]];
    const fb = $('dex-filters');
    fb.innerHTML = '';
    for (const [k, label] of F) {
      const c = document.createElement('button');
      c.className = 'chip' + (k === dexFilter ? ' on' : '');
      c.innerHTML = k === 'shiny' ? G.Icons.html('shiny', 12) + ' Shiny'
                  : typeof label === 'number' ? G.Icons.rarity(label, 12) + ' ' + G.Gacha.RARITY_NAME[label] : label;
      c.onclick = () => { dexFilter = k; openDex(); };
      fb.appendChild(c);
    }

    // Buscador por nombre / Nº y barra de chips de tipo elemental estilo PMD
    let sRow = $('dex-search-row');
    if (!sRow) {
      sRow = document.createElement('div');
      sRow.id = 'dex-search-row';
      sRow.className = 'dex-search-row';
      fb.insertAdjacentElement('beforebegin', sRow);
    }
    let tRow = $('dex-types');
    if (!tRow) {
      tRow = document.createElement('div');
      tRow.id = 'dex-types';
      tRow.className = 'filters dex-type-chips';
      fb.insertAdjacentElement('afterend', tRow);
    }
    sRow.innerHTML = `
      <input id="dex-search" class="field small-field" type="text" placeholder="Buscar Pokémon o Nº (todas las regiones)…" spellcheck="false">
      <button id="dex-clear" class="btn small ghost ${dexSearch || dexType ? '' : 'hidden'}" type="button">Quitar filtro</button>
    `;
    const sIn = $('dex-search');
    const cBtn = $('dex-clear');
    sIn.value = dexSearch;
    sIn.oninput = () => {
      dexSearch = sIn.value.trim().toLowerCase();
      cBtn.classList.toggle('hidden', !dexSearch && !dexType);
      tabs.querySelectorAll('.gen-tab').forEach((b, idx) => b.classList.toggle('on', !dexSearch && (idx + 1) === dexGen));
      renderGrid();
    };
    cBtn.onclick = () => {
      dexSearch = '';
      dexType = '';
      openDex();
    };

    const types = Object.keys(G.U.TYPE_NAME);
    tRow.innerHTML = `<button type="button" class="chip ${!dexType ? 'on' : ''}" data-type="">Todos los tipos</button>` +
      types.map(t => `<button type="button" class="chip ${dexType === t ? 'on' : ''}" data-type="${t}">${G.Icons.html('type:' + t, 12)} ${G.U.TYPE_NAME[t]}</button>`).join('');
    tRow.querySelectorAll('[data-type]').forEach(b => {
      b.onclick = () => {
        const next = b.dataset.type;
        dexType = dexType === next ? '' : next;
        openDex();
      };
    });

    renderGrid();
    showDetail(dexSel);
  }

  function renderGrid() {
    const s = G.DB.save;
    const grid = $('dex-grid');
    grid.innerHTML = '';
    for (const p of G.DEX) {
      if (!dexSearch && p.gen !== dexGen) continue;
      const own = !!s.owned[p.dex], sh = !!(s.shiny && s.shiny[p.dex]);
      if (dexSearch) {
        const num = String(p.dex).padStart(3, '0');
        const nm = p.name.toLowerCase();
        if (!nm.includes(dexSearch) && !num.includes(dexSearch) && String(p.dex) !== dexSearch) continue;
      }
      if (dexType && !p.types.includes(dexType)) continue;
      if (dexFilter === 'own' && !own) continue;
      if (dexFilter === 'miss' && own) continue;
      if (dexFilter === 'shiny' && !sh) continue;
      if (/^\d$/.test(dexFilter) && p.rarity !== +dexFilter) continue;

      const cell = document.createElement('div');
      cell.className = 'cell' + (own ? '' : ' locked') + (p.dex === dexSel ? ' on' : '');
      cell.insertAdjacentHTML('beforeend', `<span class="no">${String(p.dex).padStart(3, '0')}</span>`);
      if (p.dex === s.partner) cell.insertAdjacentHTML('beforeend', `<span class="badge-r" title="Compañero">${G.Icons.html('crown', 14)}</span>`);
      else if (sh) cell.insertAdjacentHTML('beforeend', `<span class="badge-r" title="Tienes su shiny">${G.Icons.html('shiny', 12)}</span>`);
      const useShiny = sh && p.dex === s.partner && s.partnerShiny;
      cell.appendChild(G.UI.spriteCanvas(p.dex, 92, 80, { scale: 2, silhouette: !own, shadow: own, shiny: useShiny }));
      cell.insertAdjacentHTML('beforeend', `<b>${own ? p.name : '???'}</b>${G.UI.stars(p.rarity, 9)}`);
      cell.onclick = () => {
        dexSel = p.dex;
        grid.querySelectorAll('.cell').forEach(c => c.classList.remove('on'));
        cell.classList.add('on');
        showDetail(p.dex);
      };
      grid.appendChild(cell);
    }
    if (!grid.children.length) grid.innerHTML = '<p class="sub" style="grid-column:1/-1">Ninguno con este filtro.</p>';
  }

  // Variante que se está viendo en la ficha (normal o shiny).
  let viewShiny = false;

  function showDetail(dex) {
    const s = G.DB.save;
    const p = G.DEX_BY[dex];
    const own = !!s.owned[dex];
    const hasSh = G.DB.ownsShiny(dex);
    const isPartner = dex === s.partner;
    if (!hasSh) viewShiny = false;
    else if (isPartner && dex !== showDetail.last) viewShiny = !!s.partnerShiny;
    showDetail.last = dex;

    const max = { hp: 183, atk: 1.55, spd: 137 };
    const bar = (label, v, m, txt) =>
      `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, v / m * 100)}%"></i></div><span>${txt}</span></div>`;
    const usingThis = isPartner && (!hasSh || !!s.partnerShiny === viewShiny);
    const startMove = G.Moves.BY_ID[G.startMoveOf(dex)];
    const startEvo = startMove && G.Moves.EVOLUTIONS && G.Moves.EVOLUTIONS[startMove.id];
    const statDef = id => G.LevelUp && G.LevelUp.STATS && G.LevelUp.STATS.find(x => x.id === id);
    const statTitle = id => { const st = statDef(id); return st ? st.title : id; };
    const statIcon = id => { const st = statDef(id); return st ? st.icon : 'up'; };

    const box = $('dex-detail');
    box.innerHTML = `
      <canvas id="dex-big" class="stage" width="160" height="136"></canvas>
      ${hasSh ? `<div class="seg">
          <button class="${viewShiny ? '' : 'on'}" data-v="0">Normal</button>
          <button class="${viewShiny ? 'on' : ''}" data-v="1">${G.Icons.html('shiny', 12)} Shiny</button></div>` : ''}
      <div class="center">
        <div style="color:var(--muted);font-size:13px">Nº ${String(p.dex).padStart(3, '0')} · ${GEN_NAMES[p.gen - 1]}</div>
        <h3>${own ? p.name : '???'}</h3>
        <div style="color:${G.Gacha.RARITY_COLOR[p.rarity]}">${G.UI.stars(p.rarity, 24)} ${G.Gacha.RARITY_NAME[p.rarity]}</div>
        <div style="margin:6px 0">${own ? G.UI.typeChips(p.types) : ''}</div>
      </div>
      ${own ? `
        ${bar('Vida', p.hp, max.hp, p.hp)}
        ${bar('Ataque', p.atk, max.atk, '×' + p.atk.toFixed(2))}
        ${bar('Velocidad', p.spd, max.spd, p.spd)}
        <p style="font-size:14px;margin:10px 0 4px">Empieza con <b class="gold">${startMove.name}</b></p>
        ${startEvo ? `<div class="pmd-evo-tag" style="margin-bottom:6px">${G.Icons.html(statIcon(startEvo.needs), 14)} <span class="tag-chip" style="background:#ffd23f">${statTitle(startEvo.needs)} → ${startEvo.name}</span></div>` : ''}
        <p class="move-icons" title="Movimientos que puede aprender">
          ${G.Moves.poolFor(p).map(id => {
            const mv = G.Moves.BY_ID[id];
            const ev = G.Moves.EVOLUTIONS && G.Moves.EVOLUTIONS[id];
            const tip = mv.name + (ev ? ` → ${ev.name} (${statTitle(ev.needs)})` : '');
            return `<span title="${tip}">${G.Icons.html('move:' + id, 16)}</span>`;
          }).join('')}</p>
        ${usingThis
          ? '<button class="btn grow" disabled style="width:100%">Es tu compañero</button>'
          : `<button id="dex-pick" class="btn gold" data-sfx="confirm" style="width:100%">Elegir de compañero${viewShiny ? ' (shiny)' : ''}</button>`}
      ` : `<p class="center" style="color:var(--muted)">Aún no lo tienes.<br>Consíguelo en el banner de <b class="gold">${GEN_NAMES[p.gen - 1]}</b>
            o derrotándolo cuando salga shiny.</p>`}
    `;
    $('dex-big').style.setProperty('--stage-c', !own ? '#5b83d6' : viewShiny ? '#9ae6ff' : G.U.TYPE_COLOR[p.types[0]]);
    $('dex-big').classList.toggle('shiny', own && viewShiny);
    G.UI.sprite($('dex-big'), dex, { lively: own, spin: own, silhouette: !own, scale: 2, hero: true, shiny: own && viewShiny });
    box.querySelectorAll('.seg button').forEach(b => {
      b.onclick = () => { viewShiny = b.dataset.v === '1'; showDetail(dex); };
    });
    const pick = $('dex-pick');
    if (pick) pick.onclick = () => {
      s.partner = dex;
      s.partnerShiny = hasSh && viewShiny;
      G.DB.commit();
      G.UI.toast(p.name + (s.partnerShiny ? ' shiny' : '') + ' es ahora tu compañero');
      renderGrid(); showDetail(dex);
    };
  }

  // ---------------- mejoras ----------------

  let upgDex = null, upgPickerOpen = false, bindOpenSlot = null;

  function openUpgrades() {
    G.UI.show('scr-upgrades', true);
    const s = G.DB.save;
    if (!upgDex || !s.owned[upgDex]) upgDex = s.partner;
    upgPickerOpen = false;
    bindOpenSlot = null;
    renderUpgrades();
  }

  function renderUpgMonPicker() {
    const s = G.DB.save;
    const lv = d => Object.values(s.pupg[d] || {}).reduce((a, b) => a + b, 0);
    const mons = Object.keys(s.owned).map(Number).filter(d => G.DEX_BY[d])
      .sort((a, b) => (b === s.partner) - (a === s.partner) || lv(b) - lv(a) || a - b);

    // Reemplaza el <select id="upg-mon"> original por un botón estilo PMD
    const oldSel = $('upg-mon');
    let btn = $('upg-mon-btn');
    if (oldSel) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'upg-mon-btn';
      btn.className = 'btn small upg-mon-btn';
      oldSel.replaceWith(btn);
    }
    if (btn) {
      const m = G.DEX_BY[upgDex];
      const l = lv(upgDex);
      btn.innerHTML = `${upgDex === s.partner ? G.Icons.html('crown', 14) + ' ' : ''}<b>${m.name}</b>` +
        (l ? ` <span class="tag-chip" style="background:#ffd23f">+${l}</span>` : '') +
        ` <small style="opacity:.75">${upgPickerOpen ? '▲' : '▼'}</small>`;
      btn.onclick = () => {
        upgPickerOpen = !upgPickerOpen;
        G.Audio.sfx('select');
        renderUpgrades();
      };
    }

    let pBox = $('upg-mon-picker');
    if (!upgPickerOpen) {
      if (pBox) pBox.remove();
      return;
    }
    if (!pBox) {
      pBox = document.createElement('div');
      pBox.id = 'upg-mon-picker';
      pBox.className = 'panel upg-mon-picker';
      $('upg-list').insertAdjacentElement('beforebegin', pBox);
    }
    pBox.innerHTML = `<div class="ban-moves">${mons.map(d => {
      const m = G.DEX_BY[d];
      const l = lv(d);
      const on = d === upgDex;
      return `<button type="button" class="chip ${on ? 'on' : ''}" data-dex="${d}">
        ${d === s.partner ? G.Icons.html('crown', 12) + ' ' : ''}${m.name}${l ? ` (+${l})` : ''}
      </button>`;
    }).join('')}</div>`;
    pBox.querySelectorAll('[data-dex]').forEach(b => {
      b.onclick = () => {
        upgDex = +b.dataset.dex;
        upgPickerOpen = false;
        bindOpenSlot = null;
        G.Audio.sfx('select');
        renderUpgrades();
      };
    });
  }

  function renderUpgrades() {
    const s = G.DB.save;
    renderUpgMonPicker();
    const levels = G.DB.upgradesOf(upgDex);
    const mon = G.DEX_BY[upgDex];
    const shiny = upgDex === s.partner && !!s.partnerShiny && G.DB.ownsShiny(upgDex);
    G.UI.sprite($('upg-stage'), upgDex, { lively: true, scale: 2, hero: true, shiny });
    $('upg-stage').style.setProperty('--stage-c', shiny ? '#9ae6ff' : G.U.TYPE_COLOR[mon.types[0]]);
    const box = $('upg-list');
    box.innerHTML = '';
    for (const u of G.Upgrades.LIST) {
      const lvl = levels[u.id] || 0;
      const maxed = lvl >= u.max;
      const cost = maxed ? 0 : G.Upgrades.cost(u.id, lvl);
      const el = document.createElement('div');
      el.className = 'panel upg-item';
      el.innerHTML = `
        <div class="ic">${G.Icons.html(u.icon, 32)}</div>
        <div>
          <b>${u.name}</b> <span style="color:var(--muted);font-size:13px">${u.unit}</span>
          <div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        </div>
        <div class="upg-btns">
          ${u.id === 'ban' && lvl > 0 ? `<button class="btn small" data-ban>Elegir (${banList().length}/${lvl})</button>` : ''}
          <button class="btn small ${maxed ? '' : 'gold'}" data-buy data-sfx="none" ${maxed || s.coins < cost ? 'disabled' : ''}>
          ${maxed ? 'Máx.' : `<span class="coin"></span> ${cost}`}</button></div>`;
      if (u.id === 'ban' && lvl > 0) el.querySelector('[data-ban]').onclick = () => { banOpen = !banOpen; renderUpgrades(); };
      el.querySelector('[data-buy]').onclick = () => {
        // Se vuelve a leer todo al pulsar (la partida puede haber cambiado desde que se dibujó).
        const sv = G.DB.save, lv = G.DB.upgradesOf(upgDex), now = lv[u.id] || 0;
        if (now >= u.max) { renderUpgrades(); return; }
        const price = G.Upgrades.cost(u.id, now);
        if (sv.coins < price) { renderUpgrades(); return; }
        sv.coins -= price;
        lv[u.id] = now + 1;
        G.DB.commit(true);
        G.Audio.sfx('buy');
        G.UI.refreshCoins();
        G.UI.toast(`${mon.name} · ${u.name}: nivel ${now + 1}`);
        renderUpgrades();
      };
      box.appendChild(el);
      if (u.id === 'ban' && lvl > 0 && banOpen) box.appendChild(banPicker(lvl));
    }
    box.appendChild(bindPanel());
  }

  // ---------------- atajos: hueco fijo para cada movimiento ----------------
  // save.pbind[dex] = [movimiento del hueco 1, del 2, del 3, del 4] (o null).
  function bindPanel() {
    const s = G.DB.save;
    s.pbind = s.pbind || {};
    const list = s.pbind[upgDex] || [null, null, null, null];
    const mon = G.DEX_BY[upgDex];
    const ids = G.Moves.poolFor(mon).concat([G.startMoveOf(upgDex)]).filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => G.Moves.BY_ID[a].name.localeCompare(G.Moves.BY_ID[b].name, 'es'));
    const el = document.createElement('div');
    el.className = 'panel bind-panel';
    el.innerHTML = `<b>Atajos de movimientos</b>
      <p class="sub" style="margin:2px 0 8px">Elige qué movimiento va siempre en cada hueco (teclas 1-4 o los iconos de abajo), para la memoria muscular. Si aún no tienes tantos movimientos, va al hueco más cercano.</p>
      <div class="bind-slots">${[0, 1, 2, 3].map(i => {
        const cur = list[i] && G.Moves.BY_ID[list[i]];
        const open = bindOpenSlot === i;
        return `<div class="bind-slot"><span>${i + 1}</span>
          <button type="button" class="btn small ${open ? 'gold' : 'ghost'} bind-btn" data-slot="${i}">
            ${cur ? `${G.Icons.html('move:' + cur.id, 15)} ${cur.name}` : 'Libre'}
          </button></div>`;
      }).join('')}</div>
      ${bindOpenSlot != null ? `<div class="ban-moves" style="margin-top:10px">
        <button type="button" class="chip ${!list[bindOpenSlot] ? 'on' : ''}" data-pick="">Libre</button>
        ${ids.map(id => {
          const mv = G.Moves.BY_ID[id];
          const on = list[bindOpenSlot] === id;
          return `<button type="button" class="chip ${on ? 'on' : ''}" data-pick="${id}">${G.Icons.html('move:' + id, 15)} ${mv.name}</button>`;
        }).join('')}
      </div>` : ''}`;
    el.querySelectorAll('.bind-btn[data-slot]').forEach(btn => {
      btn.onclick = () => {
        const i = +btn.dataset.slot;
        bindOpenSlot = bindOpenSlot === i ? null : i;
        G.Audio.sfx('select');
        renderUpgrades();
      };
    });
    el.querySelectorAll('[data-pick]').forEach(b => {
      b.onclick = () => {
        const l = (s.pbind[upgDex] || [null, null, null, null]).slice(0, 4);
        while (l.length < 4) l.push(null);
        const id = b.dataset.pick || null;
        for (let j = 0; j < 4; j++) if (id && l[j] === id) l[j] = null;
        l[bindOpenSlot] = id;
        s.pbind[upgDex] = l;
        bindOpenSlot = null;
        G.DB.commit();
        G.Audio.sfx('select');
        renderUpgrades();
      };
    });
    return el;
  }

  // ---------------- veto: movimientos bloqueados ----------------
  // Lista por Pokémon en save.pban[dex]; con N niveles de Veto, N movimientos.
  let banOpen = false;
  function banList() {
    const s = G.DB.save;
    s.pban = s.pban || {};
    return s.pban[upgDex] || (s.pban[upgDex] = []);
  }
  function banPicker(max) {
    const mon = G.DEX_BY[upgDex];
    const start = G.startMoveOf(upgDex);
    const ids = G.Moves.poolFor(mon).filter(id => id !== start)
      .sort((a, b) => G.Moves.BY_ID[a].name.localeCompare(G.Moves.BY_ID[b].name, 'es'));
    const list = banList();
    const el = document.createElement('div');
    el.className = 'panel ban-picker';
    el.innerHTML = `<p class="sub" style="margin:0 0 8px">Toca los movimientos que no quieres que te salgan en las cartas (${list.length}/${max}). El movimiento de inicio no se puede vetar.</p>
      <div class="ban-moves">${ids.map(id => { const d = G.Moves.BY_ID[id]; const on = list.includes(id);
        return `<button class="chip ${on ? 'on ban' : ''}" data-id="${id}">${G.Icons.html('move:' + id, 16)} ${d.name}${on ? ' ' + G.Icons.html('ban', 14) : ''}</button>`; }).join('')}</div>`;
    el.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => {
        const l = banList(), id = b.dataset.id, i = l.indexOf(id);
        if (i >= 0) l.splice(i, 1);
        else if (l.length >= max) { G.UI.toast('Ya tienes ' + max + ' vetados: quita uno primero'); return; }
        else l.push(id);
        G.DB.commit();
        G.Audio.sfx('select');
        renderUpgrades();
      };
    });
    return el;
  }

  return { init, open, openDex, openUpgrades, GEN_NAMES };
})();
