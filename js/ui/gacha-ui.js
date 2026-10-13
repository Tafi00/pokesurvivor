/* ============ gacha-ui.js — banners por generación y animación de tirada ============
 * La lógica (probabilidades, pity, shiny, repetidos) está en systems/gacha.js.
 */
G.GachaUI = (() => {
  const $ = G.UI.$;
  let busy = false;
  let gen = 1;
  let inspectRarity = 5;
  let lastPull = { n: 1, use: 't1' };

  function init() {
    $('pull-1').onclick = () => pull(1, 't1');
    $('pull-10').onclick = () => pull(10, 't1');
    $('pull-10b').onclick = () => pull(10, 't10');
    $('pull-close').onclick = close;

    const tabs = $('gacha-gens');
    tabs.innerHTML = '';
    G.Gacha.BANNERS.forEach(b => {
      const t = document.createElement('button');
      t.className = 'gen-tab';
      t.dataset.gen = b.gen;
      t.innerHTML = `<b>${b.name}</b><small>Gen ${b.gen}</small>`;
      t.onclick = () => { gen = b.gen; refresh(); };
      tabs.appendChild(t);
    });
  }

  function open() {
    G.UI.show('scr-gacha', true);
    refresh();
  }

  function refresh() {
    const s = G.DB.save;
    const banner = G.Gacha.BANNERS[gen - 1];

    // Actualiza pestañas de generación con el progreso de colección de cada región
    document.querySelectorAll('#gacha-gens .gen-tab').forEach(t => {
      const g = +t.dataset.gen;
      const b = G.Gacha.BANNERS[g - 1];
      const gAll = G.DEX.filter(p => p.gen === g);
      const gOwn = gAll.filter(p => s.owned[p.dex]).length;
      t.classList.toggle('on', g === gen);
      t.innerHTML = `<b>${b.name}</b><small>${gOwn}/${gAll.length}</small>`;
    });

    const all = G.DEX.filter(p => p.gen === gen);
    const owned = all.filter(p => s.owned[p.dex]).length;
    const shinies = all.filter(p => s.shiny && s.shiny[p.dex]).length;
    const pct = all.length ? Math.round((owned / all.length) * 100) : 0;
    const [c1, c2, c3] = banner.color;

    const bannerEl = $('banner');
    bannerEl.style.background =
      `radial-gradient(circle at 82% 24%, rgba(255,210,63,.32), transparent 46%),
       radial-gradient(circle at 16% 82%, rgba(196,123,255,.32), transparent 52%),
       linear-gradient(135deg, ${c1}, ${c2} 55%, ${c3})`;

    $('banner-title').innerHTML = `${G.Icons.html('ball4', 22)} <span>${banner.name} Misterioso</span>`;
    $('banner-desc').textContent = `Los ${all.length} Pokémon de la generación ${gen}. ¡Los legendarios esperan!`;
    $('gacha-owned').innerHTML = `
      <div class="gacha-own-row">
        <span>Tienes ${owned} de ${all.length} (${pct}%)</span>
        ${shinies ? `<span>${G.Icons.html('shiny', 12)} ${shinies} shiny</span>` : ''}
      </div>
      <div class="bar gacha-own-bar"><i style="width:${pct}%"></i></div>
    `;

    // Pedestales de los 3 Legendarios destacados del banner
    const feat = $('gacha-feat');
    feat.innerHTML = '';
    for (const dex of G.Gacha.featured(gen)) {
      const mon = G.DEX_BY[dex];
      const isOwn = !!s.owned[dex];
      const isSh = G.DB.ownsShiny(dex);
      const card = document.createElement('div');
      card.className = 'feat-card' + (isOwn ? ' owned' : '');
      card.style.setProperty('--fc', isSh ? '#9ae6ff' : G.U.TYPE_COLOR[mon.types[0]]);
      card.title = mon.name;
      card.innerHTML = `<div class="feat-top">${G.UI.stars(mon.rarity, 11)}${isSh ? ' ' + G.Icons.html('shiny', 12) : isOwn ? ` <span class="tag-chip" style="background:#5fe08a">✓</span>` : ''}</div>`;
      card.appendChild(G.UI.spriteCanvas(dex, 128, 114, { lively: true, scale: 2, shadow: true, shiny: isSh }));
      card.insertAdjacentHTML('beforeend', `
        <b class="feat-nm">${mon.name}</b>
        <div class="feat-types">${G.UI.typeChips(mon.types)}</div>
      `);
      card.onclick = () => {
        inspectRarity = 5;
        G.Audio.sfx('select');
        renderRates(s, banner);
      };
      feat.appendChild(card);
    }

    // Medidor visual de Pity 5★ y cartera de tickets
    const pity = (s.pity && s.pity[gen]) || 0;
    const pityPct = Math.min(100, Math.round((pity / G.Gacha.PITY_5) * 100));
    const pityLeft = Math.max(1, G.Gacha.PITY_5 - pity);
    $('gacha-pity').innerHTML = `
      <div class="gacha-pity-box">
        <div class="gacha-pity-head">
          <span>${G.Icons.html('ball4', 16)} <b>Garantía Legendaria (5★)</b> · ${banner.name}</span>
          <b class="gold">${pity} / ${G.Gacha.PITY_5}</b>
        </div>
        <div class="bar pity-bar"><i style="width:${pityPct}%"></i></div>
        <small>Faltan ${pityLeft} tiradas para 5★ asegurada · La tirada ×10 garantiza 4★ o superior</small>
      </div>
    `;

    const t = s.tickets;
    $('cost-1').innerHTML = `${G.Icons.html('ticket', 18)} 1`;
    $('cost-10').innerHTML = `${G.Icons.html('ticket', 18)} 10`;
    $('cost-10b').innerHTML = `${G.Icons.html('ticket10', 18)} 1`;
    $('gacha-tickets').innerHTML = `
      <span class="gacha-wallet-pill">${G.Icons.html('ticket', 18)} <span>Tickets:</span> <b>${t.t1}</b></span>
      <span class="gacha-wallet-pill">${G.Icons.html('ticket10', 18)} <span>Tickets ×10:</span> <b>${t.t10}</b></span>
    `;
    $('pull-1').disabled = !G.Gacha.costOf(s, 1);
    $('pull-10').disabled = !G.Gacha.costOf(s, 10, 't1');
    $('pull-10b').disabled = !G.Gacha.costOf(s, 10, 't10');

    renderRates(s, banner);
    G.UI.refreshCoins();
  }

  function renderRates(s, banner) {
    const poolList = G.Gacha.pool(inspectRarity, gen);
    const ownedInInspect = poolList.filter(p => s.owned[p.dex]).length;

    const ratesBox = $('gacha-rates');
    ratesBox.innerHTML = `
      <div class="row between" style="margin-bottom:4px">
        <h3 style="margin:0">Probabilidades</h3>
        <span class="sub" style="font-size:12px">Toca una rareza para ver sus Pokémon</span>
      </div>
      <div class="gacha-rate-list">
        ${G.Gacha.RATES.slice().reverse().map(([r, w]) => {
          const list = G.Gacha.pool(r, gen);
          const have = list.filter(p => s.owned[p.dex]).length;
          const on = r === inspectRarity;
          return `<button type="button" class="rate-row ${on ? 'on' : ''}" data-r="${r}" style="--rc:${G.Gacha.RARITY_COLOR[r]}">
            <span class="rate-lbl">${G.UI.stars(r, 12)} <b>${G.Gacha.RARITY_NAME[r]}</b></span>
            <span class="rate-meta"><small>${have}/${list.length}</small> <span class="tag-chip" style="background:${G.Gacha.RARITY_COLOR[r]}">${w}%</span></span>
          </button>`;
        }).join('')}
        <div class="rate-row static">
          <span class="rate-lbl">${G.Icons.html('shiny', 13)} <b style="color:#9ae6ff">Shiny</b> <small style="color:var(--muted)">(sin repetidos)</small></span>
          <span class="rate-meta"><span class="tag-chip" style="background:#9ae6ff">1%</span></span>
        </div>
      </div>
      <div class="gacha-pool-head">
        <span>${G.UI.stars(inspectRarity, 12)} <b style="color:${G.Gacha.RARITY_COLOR[inspectRarity]}">${G.Gacha.RARITY_NAME[inspectRarity]}</b> · ${banner.name} (${ownedInInspect}/${poolList.length})</span>
        <small><span>Repetido:</span> <span class="coin"></span> +${G.Gacha.REFUND[inspectRarity]}</small>
      </div>
      <div class="gacha-pool-grid" id="gacha-pool-grid"></div>
      <p class="note" style="margin-top:8px">· Los tickets se consiguen jugando: los jefes y los legendarios de grieta sueltan tickets y tickets ×10.</p>
    `;

    ratesBox.querySelectorAll('.rate-row[data-r]').forEach(btn => {
      btn.onclick = () => {
        inspectRarity = +btn.dataset.r;
        G.Audio.sfx('select');
        renderRates(s, banner);
      };
    });

    const pGrid = $('gacha-pool-grid');
    for (const p of poolList) {
      const own = !!s.owned[p.dex];
      const sh = G.DB.ownsShiny(p.dex);
      const cell = document.createElement('div');
      cell.className = 'gacha-mon-cell' + (own ? ' own' : ' miss');
      cell.title = `${p.name} (Nº ${String(p.dex).padStart(3, '0')})`;
      if (sh) cell.insertAdjacentHTML('beforeend', `<span class="g-sh">${G.Icons.html('shiny', 10)}</span>`);
      cell.appendChild(G.UI.spriteCanvas(p.dex, 56, 48, { scale: 1, silhouette: !own, shadow: own, shiny: sh }));
      cell.insertAdjacentHTML('beforeend', `<small>${own ? p.name : '???'}</small>`);
      pGrid.appendChild(cell);
    }
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function pull(n, use = 't1') {
    if (busy) return;
    const res = G.Gacha.pull(G.DB.save, n, gen, use);
    if (!res) { G.Audio.sfx('error'); G.UI.toast('No tienes tickets suficientes: consíguelos jugando'); return; }
    lastPull = { n, use };
    G.Progress.checkAch();
    G.DB.commit(true);
    busy = true;

    const best = Math.max(...res.map(r => r.rarity));
    const fx = $('pull-fx'), slot = $('slot'), out = $('pull-results');
    out.innerHTML = '';

    // Cabecera de resultados y controles de la tragaperras
    let sumEl = $('pull-summary');
    if (!sumEl) {
      sumEl = document.createElement('div');
      sumEl.id = 'pull-summary';
      sumEl.className = 'pull-summary hidden';
      fx.insertBefore(sumEl, slot);
    }
    sumEl.classList.add('hidden');

    let ctlEl = $('slot-controls');
    if (!ctlEl) {
      ctlEl = document.createElement('div');
      ctlEl.id = 'slot-controls';
      ctlEl.className = 'slot-controls';
      slot.insertAdjacentElement('afterend', ctlEl);
    }
    ctlEl.classList.remove('hidden');
    ctlEl.innerHTML = `
      <button type="button" class="btn small ghost" id="slot-fast">Acelerar</button>
      <button type="button" class="btn small gold" id="slot-skip">Saltar animación</button>
    `;
    $('slot-fast').onclick = () => { G.Slots.speedUp(); G.Audio.sfx('select'); };
    $('slot-skip').onclick = () => { G.Slots.stop(); G.Audio.sfx('select'); };

    let actEl = $('pull-actions');
    const closeBtn = $('pull-close');
    if (!actEl) {
      actEl = document.createElement('div');
      actEl.id = 'pull-actions';
      actEl.className = 'pull-actions hidden';
      closeBtn.parentNode.insertBefore(actEl, closeBtn);
      actEl.appendChild(closeBtn);
      const againBtn = document.createElement('button');
      againBtn.id = 'pull-again';
      againBtn.type = 'button';
      againBtn.className = 'btn gold';
      againBtn.dataset.sfx = 'none';
      actEl.insertBefore(againBtn, closeBtn);
    }
    actEl.classList.add('hidden');
    closeBtn.classList.remove('hidden');

    slot.style.display = '';
    fx.classList.remove('hidden');

    // La tragaperras (ui/slots.js) y luego las cartas.
    await G.Slots.play(slot, res);
    ctlEl.classList.add('hidden');
    G.Audio.sfx('burst', { rarity: best });
    slot.style.display = 'none';

    const banner = G.Gacha.BANNERS[gen - 1];
    const newCount = res.filter(r => r.isNew).length;
    const shinyCount = res.filter(r => r.shiny).length;
    const totalRefund = res.reduce((a, r) => a + (r.refund || 0), 0);
    sumEl.innerHTML = `
      <h3>${G.Icons.html('ball4', 20)} <span>${banner.name} Misterioso · Tirada ×${n}</span></h3>
      <div class="pull-sum-chips">
        ${newCount ? `<span class="tag-chip" style="background:#5fe08a">¡${newCount} ${newCount === 1 ? 'NUEVO' : 'NUEVOS'}!</span>` : ''}
        ${shinyCount ? `<span class="tag-chip" style="background:#9ae6ff">${shinyCount} SHINY</span>` : ''}
        ${totalRefund ? `<span class="tag-chip" style="background:#ffd23f">+${totalRefund} Monedas</span>` : ''}
      </div>
    `;
    sumEl.classList.remove('hidden');

    for (const r of res) {
      const mon = G.DEX_BY[r.dex];
      const c = document.createElement('div');
      c.className = 'pcard r' + r.rarity + (r.shiny ? ' shiny' : '') + (r.isNew ? ' is-new' : '');
      c.style.setProperty('--rc', r.shiny ? '#9ae6ff' : G.Gacha.RARITY_COLOR[r.rarity]);
      c.innerHTML = `<div class="stars">${G.UI.stars(r.rarity, 20)}</div>`;
      c.appendChild(G.UI.spriteCanvas(r.dex, 128, 112, { lively: r.rarity >= 4 || r.shiny, scale: 2, shadow: true, shiny: r.shiny }));
      const tag = r.isNew
        ? `<span class="new">${r.shiny ? '¡SHINY NUEVO!' : '¡NUEVO!'}</span>`
        : `Repetido · <span class="coin"></span> +${r.refund}`;
      c.insertAdjacentHTML('beforeend', `
        <b>${r.shiny ? G.Icons.html('shiny', 12) + ' ' : ''}${mon.name}</b>
        <div class="pcard-types">${G.UI.typeChips(mon.types)}</div>
        <div class="tag">${tag}</div>
      `);
      out.appendChild(c);
      G.Audio.sfx('reveal', { rarity: r.rarity });
      await wait(n === 10 ? 110 : 0);
    }

    const canAgain = G.Gacha.costOf(G.DB.save, lastPull.n, lastPull.use);
    const againBtn = $('pull-again');
    if (againBtn) {
      if (canAgain) {
        const ico = lastPull.use === 't10' ? G.Icons.html('ticket10', 18) + ' 1' : G.Icons.html('ticket', 18) + ' ' + lastPull.n;
        againBtn.innerHTML = `Tirar ×${lastPull.n} · ${ico}`;
        againBtn.classList.remove('hidden');
        againBtn.onclick = () => pull(lastPull.n, lastPull.use);
      } else {
        againBtn.classList.add('hidden');
      }
    }
    closeBtn.className = canAgain ? 'btn ghost' : 'btn gold';
    actEl.classList.remove('hidden');
    refresh();
    busy = false;
  }

  function close() {
    G.Slots.stop();
    $('pull-fx').classList.add('hidden');
    busy = false;
    refresh();
  }

  return { init, open, get open_() { return !$('pull-fx').classList.contains('hidden'); } };
})();
