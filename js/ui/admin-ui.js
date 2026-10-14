/* ============ admin-ui.js — Rol de Admin y Panel de Control Omnipotente ============
 * Otorga el rol de Administrador ("ADMIN") y un panel de control completo
 * estilo Pokémon Mundo Misterioso (PMD) accesible con F2, tecla ` o el botón
 * ADMIN en la barra superior / pantalla de pausa / botón flotante en partida.
 */
G.Admin = (() => {
  const GOD_KEY = 'ps.admin.god';
  const OHKO_KEY = 'ps.admin.ohko';
  const NOCD_KEY = 'ps.admin.nocd';

  let godMode = false;
  let oneHitKo = false;
  let noCd = false;

  try {
    godMode = localStorage.getItem(GOD_KEY) === '1';
    oneHitKo = localStorage.getItem(OHKO_KEY) === '1';
    noCd = localStorage.getItem(NOCD_KEY) === '1';
  } catch (e) { /* nada */ }

  function isAdminAccount() {
    return !!(G.DB && G.DB.isAdmin);
  }

  function setEnabled() {
    if (G.AdminUI && G.AdminUI.syncBadge) G.AdminUI.syncBadge();
  }

  function setGodMode(v) {
    if (!isAdminAccount()) v = false;
    godMode = !!v;
    try { localStorage.setItem(GOD_KEY, godMode ? '1' : '0'); } catch (e) { /* nada */ }
    if (G.Game && G.Game.player) G.Game.player.godMode = godMode;
  }

  function setOneHitKo(v) {
    if (!isAdminAccount()) v = false;
    oneHitKo = !!v;
    try { localStorage.setItem(OHKO_KEY, oneHitKo ? '1' : '0'); } catch (e) { /* nada */ }
    if (G.Game && G.Game.player) G.Game.player.oneHitKo = oneHitKo;
  }

  function setNoCd(v) {
    if (!isAdminAccount()) v = false;
    noCd = !!v;
    try { localStorage.setItem(NOCD_KEY, noCd ? '1' : '0'); } catch (e) { /* nada */ }
    if (G.Game && G.Game.player) {
      G.Game.player.noCd = noCd;
      if (noCd) {
        G.Game.player.dashCd = 0;
        for (const m of G.Game.player.moves) m.t = 0;
      }
    }
  }

  return {
    get enabled() { return isAdminAccount(); },
    setEnabled,
    get godMode() { return isAdminAccount() && godMode; },
    setGodMode,
    get oneHitKo() { return isAdminAccount() && oneHitKo; },
    setOneHitKo,
    get noCd() { return isAdminAccount() && noCd; },
    setNoCd
  };
})();

G.AdminUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = (vi, en, es) => G.I18n.lang === 'vi' ? vi : G.I18n.lang === 'en' ? en : (es || vi);

  let tab = 'res';
  let pokeQuery = '';
  let pokeGen = 0;
  let pokeShiny = true;
  let moveQuery = '';
  let moveType = 'all';

  function init() {
    const topBtn = $('btn-admin');
    if (topBtn) {
      topBtn.innerHTML = `${G.Icons.html('crown', 16)} <span>ADMIN</span>`;
      topBtn.onclick = () => toggle();
    }
    const pauseBtn = $('btn-pause-admin');
    if (pauseBtn) {
      pauseBtn.innerHTML = `${G.Icons.html('crown', 16)} <span>Admin (F2)</span>`;
      pauseBtn.onclick = () => open('combat');
    }
    const floatBtn = $('btn-admin-float');
    if (floatBtn) {
      floatBtn.innerHTML = `${G.Icons.html('crown', 16)} <span>ADMIN</span> <kbd>F2</kbd>`;
      floatBtn.onclick = () => toggle();
    }
    const closeBtn = $('admin-close');
    if (closeBtn) closeBtn.onclick = close;

    document.querySelectorAll('#admin-tabs .gen-tab').forEach(b => {
      b.onclick = () => { tab = b.dataset.t; render(); };
    });

    // Atajos globales: F2 o tecla ` (Backquote) — SOLO funcionan para cuentas con rol Admin
    window.addEventListener('keydown', e => {
      if (!G.Admin.enabled) return;
      if (e.key === 'F2' || (e.code === 'Backquote' && !e.ctrlKey && !e.altKey && !e.metaKey)) {
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (e.code === 'Backquote' && (tag === 'input' || tag === 'textarea')) return;
        e.preventDefault();
        toggle();
      }
    });

    syncBadge();
    setInterval(syncBadge, 400);
  }

  function syncBadge() {
    const on = G.Admin.enabled;
    const topBtn = $('btn-admin');
    if (topBtn) topBtn.classList.toggle('hidden', !on);
    const pauseBtn = $('btn-pause-admin');
    if (pauseBtn) pauseBtn.classList.toggle('hidden', !on);
    const floatBtn = $('btn-admin-float');
    if (floatBtn) {
      const inRun = G.Game && G.Game.state !== 'ui' && G.Game.state !== 'over';
      floatBtn.classList.toggle('hidden', !(on && inRun));
    }
    const rkMod = $('rk-mod');
    if (rkMod) rkMod.classList.toggle('hidden', !on);
    if (!on && isOpen()) {
      $('scr-admin').classList.add('hidden');
    }
  }

  const isOpen = () => {
    const el = $('scr-admin');
    return !!(el && !el.classList.contains('hidden'));
  };

  function toggle() {
    if (!G.Admin.enabled) return;
    if (isOpen()) close();
    else open();
  }

  function open(t) {
    if (!G.Admin.enabled) return;
    if (t) tab = t;
    else if (G.Game && G.Game.state !== 'ui' && G.Game.state !== 'over' && tab === 'res') {
      tab = 'combat';
    }
    $('scr-admin').classList.remove('hidden');
    G.Audio.sfx('select');
    render();
  }

  function close() {
    $('scr-admin').classList.add('hidden');
    G.Audio.sfx('back');
    refreshExternalUI();
  }

  function refreshExternalUI() {
    if (!G.DB.save) return;
    G.DB.commit(true);
    if (G.DB.flush) G.DB.flush();
    G.UI.refreshCoins();
    if (G.UI.isOpen('scr-menu') && G.MenuUI) G.MenuUI.open();
    else if (G.UI.isOpen('scr-gacha') && G.GachaUI) G.GachaUI.open();
    else if (G.UI.isOpen('scr-dex') && G.MenuUI && G.MenuUI.openDex) G.MenuUI.openDex();
    else if (G.UI.isOpen('scr-upgrades') && G.MenuUI && G.MenuUI.openUpgrades) G.MenuUI.openUpgrades();
    else if (G.UI.isOpen('scr-goals') && G.GoalsUI) G.GoalsUI.open();
  }

  function render() {
    const s = G.DB.save;
    if (!s) return;
    s.tickets = s.tickets || { t1: 0, t10: 0 };
    s.owned = s.owned || {};
    s.shiny = s.shiny || {};
    s.pupg = s.pupg || {};
    s.ach = s.ach || {};

    // Traduce pestañas del encabezado según el idioma actual
    const tabLabels = {
      res: L('Tài nguyên & Tài khoản', 'Resources & Account', 'Recursos y Cuenta'),
      dex: L('Kho Pokémon & Nâng cấp', 'Pokédex & Upgrades', 'Pokémon y Mejoras'),
      combat: L('Chiến đấu & Kỹ năng', 'Combat & Build', 'Combate y Build'),
      world: L('Thế giới, Boss & Sự kiện', 'World, Boss & Events', 'Mundo, Jefes y Eventos')
    };
    document.querySelectorAll('#admin-tabs .gen-tab').forEach(b => {
      b.classList.toggle('on', b.dataset.t === tab);
      if (tabLabels[b.dataset.t]) b.textContent = tabLabels[b.dataset.t];
    });
    const titleEl = $('admin-title-txt');
    if (titleEl) titleEl.textContent = L('Bảng Điều Khiển Admin', 'Admin Control Panel', 'Panel de Control Admin');
    const subEl = $('admin-sub-txt');
    if (subEl) subEl.textContent = L('Quyền năng tối thượng · Muốn gì có đó · Phím tắt: F2 hoặc `', 'Omnipotent God Mode · Anything You Want · Hotkey: F2 or `', 'Modo Dios Omnipotente · Atajo: F2 o `');
    const closeBtn = $('admin-close');
    if (closeBtn) closeBtn.textContent = L('Đóng (Esc)', 'Close (Esc)', 'Cerrar (Esc)');

    const box = $('admin-body');
    const prevScroll = box.scrollTop;

    const ownedCount = G.DEX.filter(p => s.owned[p.dex]).length;
    const shinyCount = G.DEX.filter(p => s.shiny[p.dex]).length;
    const achCount = G.AchDefs ? G.AchDefs.LIST.filter(a => s.ach[a.id]).length : 0;
    const achTotal = G.AchDefs ? G.AchDefs.LIST.length : 0;
    const pl = G.Game ? G.Game.player : null;
    const partnerMon = G.DEX_BY[s.partner] || G.DEX[0];

    const statusBanner = `
      <div class="admin-status-bar">
        <div class="admin-stat-pill"><span class="coin"></span> <b>${s.coins.toLocaleString('es')}</b> <small>${L('Pokécoins', 'Coins', 'Monedas')}</small></div>
        <div class="admin-stat-pill">${G.Icons.html('ticket', 16)} <b>${s.tickets.t1}</b> · ${G.Icons.html('ticket10', 16)} <b>${s.tickets.t10}</b> <small>${L('Vé Gacha', 'Tickets', 'Tickets')}</small></div>
        <div class="admin-stat-pill">${G.Icons.html('ball3', 14)} <b>${ownedCount}/${G.DEX.length}</b> <small>Pokémon</small></div>
        <div class="admin-stat-pill">${G.Icons.html('sparkle', 14)} <b>${shinyCount}/${G.DEX.length}</b> <small>Shiny</small></div>
        <div class="admin-stat-pill">${G.Icons.html('medal3', 14)} <b>${achCount}/${achTotal}</b> <small>${L('Thành tựu', 'Achievements', 'Logros')}</small></div>
        <div class="admin-stat-pill ${pl ? 'live' : ''}">${G.Icons.html('crown', 14)} <b>${pl ? L('Đang trong trận (Lv.' + pl.level + ')', 'In Run (Lv.' + pl.level + ')', 'En partida (Nv.' + pl.level + ')') : L('Tại Menu (' + partnerMon.name + ')', 'In Menu (' + partnerMon.name + ')', 'En Menú (' + partnerMon.name + ')')}</b></div>
      </div>`;

    if (tab === 'res') {
      box.innerHTML = statusBanner + renderResTab(s);
      wireResTab(box, s);
    } else if (tab === 'dex') {
      box.innerHTML = statusBanner + renderDexTab(s, partnerMon);
      wireDexTab(box, s);
    } else if (tab === 'combat') {
      box.innerHTML = statusBanner + renderCombatTab(s, pl);
      wireCombatTab(box, s, pl);
    } else if (tab === 'world') {
      box.innerHTML = statusBanner + renderWorldTab(s, pl);
      wireWorldTab(box, s, pl);
    }
    box.scrollTop = prevScroll;
  }

  // =========================================================================
  // TAB 1: RECURSOS, GACHA Y CUENTA
  // =========================================================================
  function renderResTab(s) {
    return `
      <div class="admin-grid-2">
        <div class="admin-card">
          <div class="admin-card-h"><span class="coin"></span> ${L('Kho Tiền Vàng (Pokécoins)', 'Pokécoins Treasury', 'Tesoro de Pokémonedas')}</div>
          <p class="admin-card-sub">${L('Cộng thêm hoặc đặt số lượng Pokécoins tùy ý ngay lập tức.', 'Add or set any amount of Pokécoins instantly.', 'Añade o fija cualquier cantidad de Pokémonedas al instante.')}</p>
          <div class="admin-btn-grid">
            <button class="btn small" data-coin="+10000">+10.000</button>
            <button class="btn small" data-coin="+100000">+100.000</button>
            <button class="btn small gold" data-coin="+1000000">+1.000.000</button>
            <button class="btn small gold" data-coin="max">${L('Tối đa (9.999.999)', 'Max (9,999,999)', 'Máximo (9.999.999)')}</button>
            <button class="btn small ghost" data-coin="zero">${L('Đặt về 0', 'Reset to 0', 'Poner a 0')}</button>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('ticket10', 18)} ${L('Vé Quay Gacha (Thường & ×10)', 'Gacha Tickets (Single & ×10)', 'Tickets del Gacha (×1 y ×10)')}</div>
          <p class="admin-card-sub">${L('Nhận vé quay Gacha miễn phí không giới hạn cho cả 9 vùng.', 'Get unlimited Gacha pull tickets for all 9 regions.', 'Consigue tickets ilimitados para las 9 regiones.')}</p>
          <div class="admin-btn-grid">
            <button class="btn small" data-t1="+25">${G.Icons.html('ticket', 14)} +25 ${L('Vé đơn', 'Tickets ×1', 'Tickets ×1')}</button>
            <button class="btn small" data-t1="+100">${G.Icons.html('ticket', 14)} +100 ${L('Vé đơn', 'Tickets ×1', 'Tickets ×1')}</button>
            <button class="btn small gold" data-t10="+25">${G.Icons.html('ticket10', 14)} +25 ${L('Vé ×10', 'Tickets ×10', 'Tickets ×10')}</button>
            <button class="btn small gold" data-t10="+100">${G.Icons.html('ticket10', 14)} +100 ${L('Vé ×10', 'Tickets ×10', 'Tickets ×10')}</button>
            <button class="btn small gold" data-tboth="999">${G.Icons.html('sparkle', 14)} ${L('+999 Cả 2 loại vé', '+999 Both Tickets', '+999 Ambos tickets')}</button>
            <button class="btn small ghost" data-tboth="zero">${L('Đặt vé về 0', 'Reset Tickets', 'Poner tickets a 0')}</button>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('sparkle', 18)} ${L('Can Thiệp Tỷ Lệ Gacha & Shiny', 'Gacha & Shiny RNG Manipulation', 'Manipulación de Gacha y Shiny')}</div>
          <p class="admin-card-sub">${L('Ép chắc chắn 100% nổ Shiny hoặc kích hoạt bảo hiểm 5★ Huyền Thoại ngay lượt kế tiếp.', 'Force 100% Shiny rate or trigger 5★ Legendary pity on your very next pull.', 'Fuerza 100% Shiny o activa el pity 5★ en la siguiente tirada.')}</p>
          <div class="admin-btn-grid">
            <button class="btn small gold" id="adm-shiny-gacha10">${G.Icons.html('sparkle', 14)} ${L('Ép 10 lượt Gacha tới 100% Shiny', 'Force Next 10 Pulls 100% Shiny', 'Forzar 10 tiradas Gacha Shiny')}</button>
            <button class="btn small gold" id="adm-shiny-gacha50">${G.Icons.html('sparkle', 14)} ${L('Ép 50 lượt Gacha tới 100% Shiny', 'Force Next 50 Pulls 100% Shiny', 'Forzar 50 tiradas Gacha Shiny')}</button>
            <button class="btn small" id="adm-pity-max">${G.Icons.html('ball5', 14)} ${L('Đặt Pity 9 vùng = 89/90 (Nổ 5★ ngay!)', 'Set All Pity = 89/90 (Next Pull 5★!)', 'Fijar Pity = 89/90 (¡5★ seguro!)')}</button>
            <button class="btn small" id="adm-shiny-wild10">${G.Icons.html('sparkle', 14)} ${L('Ép 10 quái hoang dã tới là Shiny', 'Force Next 10 Wild Spawns Shiny', 'Forzar 10 salvajes Shiny')}</button>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('medal3', 18)} ${L('Thành Tựu, Nhiệm Vụ & Danh Hiệu', 'Achievements, Missions & Titles', 'Logros, Misiones y Títulos')}</div>
          <p class="admin-card-sub">${L('Mở khóa toàn bộ huy chương, danh hiệu hồ sơ và hoàn thành nhiệm vụ hàng ngày/tuần.', 'Unlock all medals, profile titles, and complete all daily/weekly missions.', 'Desbloquea todas las medallas, títulos y misiones.')}</p>
          <div class="admin-btn-grid">
            <button class="btn small gold" id="adm-unlock-ach">${G.Icons.html('medal3', 14)} ${L('Mở khóa TẤT CẢ Thành tựu & Danh hiệu', 'Unlock ALL Achievements & Titles', 'Desbloquear TODOS los Logros y Títulos')}</button>
            <button class="btn small gold" id="adm-done-missions">${G.Icons.html('star', 14)} ${L('Hoàn thành & Nhận thưởng Nhiệm vụ', 'Complete & Claim All Missions', 'Completar y Reclamar Misiones')}</button>
            <button class="btn small" id="adm-unlock-records">${G.Icons.html('crown', 14)} ${L('Mở khóa 18 Huy hiệu Đấu trường & Arceus', 'Unlock All 18 Arena Badges & Arceus', 'Desbloquear 18 Arenas y Arceus')}</button>
            <button class="btn small ghost" id="adm-open-mod">${G.Icons.html('shield', 14)} ${L('Mở bảng Kiểm duyệt Ranking', 'Open Ranking Moderation', 'Abrir Moderación del Ranking')}</button>
          </div>
        </div>
      </div>

      <div class="admin-card" style="margin-top:10px">
        <div class="admin-card-h">${G.Icons.html('gear', 18)} ${L('Gói Siêu Khởi Đầu "Muốn Gì Có Đó" (1-Click Full Account)', '1-Click Omnipotent Account Bundle', 'Paquete Cuenta Omnipotente en 1 Clic')}</div>
        <div class="row wrap" style="gap:8px;margin-top:6px">
          <button class="btn gold grow" id="adm-god-account">${G.Icons.html('crown', 16)} ${L('KÍCH HOẠT TÀI KHOẢN TỐI THƯỢNG (9.99M Xu + 999 Vé + 966 Pokémon & Shiny + Max Nâng Cấp + Full Thành Tựu)', 'UNLOCK EVERYTHING (9.99M Coins + 999 Tickets + All 966 Pokémon & Shinies + Max Upgrades + All Achievements)', 'DESBLOQUEAR TODO (9.99M Monedas + 999 Tickets + 966 Pokémon y Shinies + Mejoras Máx + Logros)')}</button>
        </div>
      </div>
    `;
  }

  function wireResTab(box, s) {
    box.querySelectorAll('[data-coin]').forEach(b => {
      b.onclick = () => {
        const v = b.dataset.coin;
        if (v === 'max') s.coins = 9999999;
        else if (v === 'zero') s.coins = 0;
        else s.coins = Math.min(99999999, s.coins + Number(v));
        G.DB.commit(true);
        G.Audio.sfx('buy');
        G.UI.toast(L(`Pokécoins: ${s.coins.toLocaleString('es')}`, `Pokécoins: ${s.coins.toLocaleString('en')}`, `Pokémonedas: ${s.coins.toLocaleString('es')}`));
        render();
      };
    });

    box.querySelectorAll('[data-t1]').forEach(b => {
      b.onclick = () => {
        s.tickets.t1 = Math.min(99999, (s.tickets.t1 || 0) + Number(b.dataset.t1));
        G.DB.commit(true);
        G.Audio.sfx('shiny');
        G.UI.toast(L(`Vé thường: ${s.tickets.t1}`, `Single Tickets: ${s.tickets.t1}`, `Tickets ×1: ${s.tickets.t1}`));
        render();
      };
    });

    box.querySelectorAll('[data-t10]').forEach(b => {
      b.onclick = () => {
        s.tickets.t10 = Math.min(99999, (s.tickets.t10 || 0) + Number(b.dataset.t10));
        G.DB.commit(true);
        G.Audio.sfx('legend');
        G.UI.toast(L(`Vé ×10: ${s.tickets.t10}`, `×10 Tickets: ${s.tickets.t10}`, `Tickets ×10: ${s.tickets.t10}`));
        render();
      };
    });

    box.querySelectorAll('[data-tboth]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.tboth === 'zero') { s.tickets.t1 = 0; s.tickets.t10 = 0; }
        else { s.tickets.t1 = Math.min(99999, (s.tickets.t1 || 0) + 999); s.tickets.t10 = Math.min(99999, (s.tickets.t10 || 0) + 999); }
        G.DB.commit(true);
        G.Audio.sfx('legend');
        G.UI.toast(L('Đã cập nhật Vé Gacha!', 'Updated Gacha Tickets!', '¡Tickets actualizados!'));
        render();
      };
    });

    $('adm-shiny-gacha10').onclick = () => {
      G.Gacha.debugForceShiny(10);
      G.Audio.sfx('shinyGet');
      G.UI.toast(L('✨ 10 lượt Gacha tiếp theo chắc chắn 100% là SHINY!', '✨ Next 10 Gacha pulls are guaranteed 100% SHINY!', '✨ ¡Las próximas 10 tiradas serán 100% SHINY!'));
    };
    $('adm-shiny-gacha50').onclick = () => {
      G.Gacha.debugForceShiny(50);
      G.Audio.sfx('shinyGet');
      G.UI.toast(L('✨ 50 lượt Gacha tiếp theo chắc chắn 100% là SHINY!', '✨ Next 50 Gacha pulls are guaranteed 100% SHINY!', '✨ ¡Las próximas 50 tiradas serán 100% SHINY!'));
    };
    $('adm-pity-max').onclick = () => {
      s.pity = s.pity || {};
      for (let g = 1; g <= 9; g++) s.pity[g] = G.Gacha.PITY_5 - 1;
      G.DB.commit(true);
      G.Audio.sfx('legend');
      G.UI.toast(L('🔥 Đã đặt Bảo hiểm 5★ = 89/90 cho cả 9 vùng! Lượt quay tới chắc chắn ra 5★!', '🔥 Set 5★ Pity = 89/90 across all 9 regions!', '🔥 ¡Pity 5★ fijado en 89/90 en las 9 regiones!'));
      render();
    };
    $('adm-shiny-wild10').onclick = () => {
      G.Spawner.debugForceShiny(10);
      G.Audio.sfx('shiny');
      G.UI.toast(L('✨ 10 Pokémon hoang dã xuất hiện tiếp theo sẽ là SHINY!', '✨ Next 10 wild Pokémon spawns will be SHINY!', '✨ ¡Los próximos 10 Pokémon salvajes serán SHINY!'));
    };

    $('adm-unlock-ach').onclick = () => {
      unlockAllAchievements(s);
      G.DB.commit(true);
      G.Audio.sfx('legend');
      G.UI.toast(L('🏆 Đã mở khóa toàn bộ Thành tựu & Danh hiệu!', '🏆 Unlocked all Achievements & Titles!', '🏆 ¡Todos los logros y títulos desbloqueados!'));
      render();
    };

    $('adm-done-missions').onclick = () => {
      G.Progress.ensure(s);
      for (const m of [...(s.missions.daily || []), ...(s.missions.weekly || [])]) {
        m.prog = m.goal;
        m.told = true;
      }
      for (const m of s.missions.daily || []) G.Progress.claim(m, false);
      for (const m of s.missions.weekly || []) G.Progress.claim(m, true);
      G.DB.commit(true);
      G.Audio.sfx('confirm');
      G.UI.toast(L('⭐ Đã hoàn thành và nhận thưởng toàn bộ Nhiệm vụ Ngày & Tuần!', '⭐ Completed and claimed all Daily & Weekly Missions!', '⭐ ¡Misiones diarias y semanales completadas!'));
      render();
    };

    $('adm-unlock-records').onclick = () => {
      unlockAllRecords(s);
      G.DB.commit(true);
      G.Audio.sfx('legend');
      G.UI.toast(L('👑 Đã mở khóa 18 Huy hiệu Đấu trường, Bộ sưu tập Vật phẩm, Tiến hóa & Kỷ lục Arceus!', '👑 Unlocked all 18 Arena Badges, Items, Evolutions & Arceus Records!', '👑 ¡18 Arenas, Objetos, Evoluciones y Récord de Arceus desbloqueados!'));
      render();
    };

    $('adm-open-mod').onclick = () => {
      close();
      if (G.ModUI) G.ModUI.open();
    };

    $('adm-god-account').onclick = () => {
      s.coins = 9999999;
      s.tickets = { t1: 999, t10: 999 };
      const now = Date.now();
      for (const p of G.DEX) {
        if (!s.owned[p.dex]) s.owned[p.dex] = { count: 1, how: 'admin', firstAt: now };
        if (G.Sprites.hasShiny(p.dex) && !s.shiny[p.dex]) s.shiny[p.dex] = { count: 1, how: 'admin', firstAt: now };
        s.pupg[p.dex] = s.pupg[p.dex] || {};
        for (const u of G.Upgrades.LIST) s.pupg[p.dex][u.id] = u.max;
      }
      unlockAllRecords(s);
      unlockAllAchievements(s);
      G.DB.commit(true);
      G.Audio.sfx('shinyGet');
      G.UI.toast(L('👑 ĐÃ KÍCH HOẠT TÀI KHOẢN TỐI THƯỢNG 100%!', '👑 100% OMNIPOTENT ACCOUNT ACTIVATED!', '👑 ¡CUENTA OMNIPOTENTE AL 100% ACTIVADA!'), 3800);
      render();
    };
  }

  function unlockAllRecords(s) {
    const now = Date.now();
    s.arenas = s.arenas || {};
    for (const t of Object.keys(G.U.TYPE_NAME)) s.arenas[t] = s.arenas[t] || now;
    s.itemsFound = s.itemsFound || {};
    for (const it of G.Items.LIST) s.itemsFound[it.id] = s.itemsFound[it.id] || now;
    s.evoMoves = s.evoMoves || {};
    for (const mId of Object.keys(G.Moves.EVO || {})) s.evoMoves[mId] = s.evoMoves[mId] || now;
    s.legends = s.legends || {};
    for (const p of G.DEX) if (p.rarity === 5) s.legends[p.dex] = s.legends[p.dex] || now;
    s.stats = s.stats || {};
    s.stats.bestTime = Math.max(s.stats.bestTime || 0, 2100);
    s.stats.bestLevel = Math.max(s.stats.bestLevel || 0, 60);
    s.stats.totalKills = Math.max(s.stats.totalKills || 0, 50000);
    s.stats.bossesTotal = Math.max(s.stats.bossesTotal || 0, 200);
    s.stats.riftWins = Math.max(s.stats.riftWins || 0, 50);
    s.stats.evolutions = Math.max(s.stats.evolutions || 0, 60);
    s.stats.missionsDone = Math.max(s.stats.missionsDone || 0, 100);
    s.stats.judged = Math.max(s.stats.judged || 0, 5);
    s.stats.judgeTime = Math.max(s.stats.judgeTime || 0, 360);
    s.stats.judgeBosses = Math.max(s.stats.judgeBosses || 0, 18);
  }

  function unlockAllAchievements(s) {
    const now = Date.now();
    s.ach = s.ach || {};
    if (!G.AchDefs) return;
    for (const a of G.AchDefs.LIST) {
      if (!s.ach[a.id]) {
        s.ach[a.id] = now;
        if (a.reward) G.Progress.grant(a.reward);
      }
    }
  }

  // =========================================================================
  // TAB 2: POKÉDEX, SHINIES Y MEJORAS PERMANENTES
  // =========================================================================
  function renderDexTab(s, partnerMon) {
    return `
      <div class="admin-grid-2">
        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('ball5', 18)} ${L('Mở Khóa Kho Pokémon (966 Loài)', 'Unlock Pokédex Collection (966 Species)', 'Desbloquear Colección Pokémon (966 Especies)')}</div>
          <p class="admin-card-sub">${L('Mở khóa tức thì toàn bộ 966 Pokémon từ 9 vùng (Kanto → Paldea) cả bản Thường lẫn bản Shiny.', 'Instantly unlock all 966 Pokémon across all 9 regions (Normal & Shiny).', 'Desbloquea al instante los 966 Pokémon de las 9 regiones.')}</p>
          <div class="admin-btn-grid">
            <button class="btn small gold" id="adm-dex-all">${G.Icons.html('ball4', 14)} ${L('Mở khóa 966 Pokémon Thường', 'Unlock All 966 Normal', 'Desbloquear 966 Normales')}</button>
            <button class="btn small gold" id="adm-dex-shiny">${G.Icons.html('sparkle', 14)} ${L('Mở khóa 966 Pokémon SHINY ✨', 'Unlock All 966 SHINY ✨', 'Desbloquear 966 SHINY ✨')}</button>
            <button class="btn small gold" id="adm-dex-both">${G.Icons.html('crown', 14)} ${L('Mở khóa 100% Thường + Shiny', 'Unlock 100% Normal + Shiny', 'Desbloquear 100% Normal + Shiny')}</button>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('up', 18)} ${L('Nâng Cấp Vĩnh Viễn (13 Chỉ Số)', 'Permanent Upgrades (13 Stats)', 'Mejoras Permanentes (13 Atributos)')}</div>
          <p class="admin-card-sub">${L('Tối đa hóa toàn bộ 13 nâng cấp (Máu, Công, Tốc, Hồi chiêu, Chí mạng, Đổi thẻ, Khởi đầu 2 chiêu...).', 'Max out all 13 permanent upgrades for your current partner or all 966 Pokémon.', 'Sube al máximo las 13 mejoras permanentes.')}</p>
          <div class="admin-btn-grid">
            <button class="btn small gold" id="adm-upg-partner">${G.Icons.html('up', 14)} ${L(`MAX Nâng cấp cho ${partnerMon.name}`, `MAX Upgrades for ${partnerMon.name}`, `MAX Mejoras para ${partnerMon.name}`)}</button>
            <button class="btn small gold" id="adm-upg-all">${G.Icons.html('crown', 14)} ${L('MAX Nâng cấp cho TẤT CẢ 966 Pokémon', 'MAX Upgrades for ALL 966 Pokémon', 'MAX Mejoras para los 966 Pokémon')}</button>
            <button class="btn small ghost" id="adm-upg-reset">${L(`Đặt lại Nâng cấp của ${partnerMon.name}`, `Reset ${partnerMon.name} Upgrades`, `Reiniciar mejoras de ${partnerMon.name}`)}</button>
          </div>
        </div>
      </div>

      <div class="admin-card" style="margin-top:10px">
        <div class="row between wrap" style="gap:8px;margin-bottom:8px">
          <div class="admin-card-h" style="margin:0">${G.Icons.html('sparkle', 18)} ${L('Chọn / Đổi Đồng Hành Ngay Lập Tức (Kể Cả Đang Trong Trận!)', 'Instant Partner Selector & Live Morph (Works Mid-Run!)', 'Selector Instantáneo de Compañero (¡Incluso en Partida!)')}</div>
          <div class="seg" id="adm-poke-shiny">
            <button type="button" data-sh="0" class="${!pokeShiny ? 'on' : ''}">${L('Thường', 'Normal', 'Normal')}</button>
            <button type="button" data-sh="1" class="${pokeShiny ? 'on' : ''}">✨ Shiny</button>
          </div>
        </div>
        <div class="row wrap" style="gap:6px;margin-bottom:8px">
          <input id="adm-poke-q" class="field grow" placeholder="${L('Tìm tên Pokémon hoặc số # Pokédex (VD: Charizard, Rayquaza, Mewtwo, 384)...', 'Search Pokémon name or #Dex (e.g. Charizard, Rayquaza, 384)...', 'Buscar nombre o #Dex...')}" value="${esc(pokeQuery)}" spellcheck="false">
        </div>
        <div class="chips" id="adm-poke-gens" style="margin-bottom:8px">
          <button class="chip ${pokeGen === 0 ? 'on' : ''}" data-g="0">${L('Tất cả (966)', 'All (966)', 'Todos (966)')}</button>
          ${(G.MenuUI ? G.MenuUI.GEN_NAMES : ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea']).map((nm, i) =>
            `<button class="chip ${pokeGen === i + 1 ? 'on' : ''}" data-g="${i + 1}">${esc(G.T(nm))}</button>`
          ).join('')}
        </div>
        <div id="adm-poke-grid" class="admin-poke-grid"></div>
      </div>
    `;
  }

  function wireDexTab(box, s) {
    const unlockDex = (normal, shiny) => {
      const now = Date.now();
      for (const p of G.DEX) {
        if (normal && !s.owned[p.dex]) s.owned[p.dex] = { count: 1, how: 'admin', firstAt: now };
        if (shiny && G.Sprites.hasShiny(p.dex)) {
          if (!s.owned[p.dex]) s.owned[p.dex] = { count: 1, how: 'admin', firstAt: now };
          if (!s.shiny[p.dex]) s.shiny[p.dex] = { count: 1, how: 'admin', firstAt: now };
        }
      }
      G.DB.commit(true);
      G.Audio.sfx('shinyGet');
      G.UI.toast(L('✨ Đã mở khóa toàn bộ Pokémon trong Pokédex!', '✨ Unlocked all Pokémon in Pokédex!', '✨ ¡Todos los Pokémon desbloqueados!'));
      render();
    };

    $('adm-dex-all').onclick = () => unlockDex(true, false);
    $('adm-dex-shiny').onclick = () => unlockDex(true, true);
    $('adm-dex-both').onclick = () => unlockDex(true, true);

    $('adm-upg-partner').onclick = () => {
      const d = s.partner;
      s.pupg[d] = s.pupg[d] || {};
      for (const u of G.Upgrades.LIST) s.pupg[d][u.id] = u.max;
      applyPerksToLivePlayer(d);
      G.DB.commit(true);
      G.Audio.sfx('levelup');
      G.UI.toast(L('💪 Đã tối đa 13 nâng cấp cho Đồng hành hiện tại!', '💪 Maxed all 13 upgrades for current Partner!', '💪 ¡13 mejoras al máximo para tu compañero!'));
      render();
    };

    $('adm-upg-all').onclick = () => {
      for (const p of G.DEX) {
        s.pupg[p.dex] = s.pupg[p.dex] || {};
        for (const u of G.Upgrades.LIST) s.pupg[p.dex][u.id] = u.max;
      }
      applyPerksToLivePlayer(s.partner);
      G.DB.commit(true);
      G.Audio.sfx('legend');
      G.UI.toast(L('👑 Đã tối đa nâng cấp cho TẤT CẢ 966 Pokémon!', '👑 Maxed upgrades for ALL 966 Pokémon!', '👑 ¡Mejoras al máximo para los 966 Pokémon!'));
      render();
    };

    $('adm-upg-reset').onclick = () => {
      delete s.pupg[s.partner];
      G.DB.commit(true);
      G.Audio.sfx('back');
      G.UI.toast(L('Đã đặt lại nâng cấp của đồng hành hiện tại.', 'Reset current partner upgrades.', 'Mejoras del compañero reiniciadas.'));
      render();
    };

    box.querySelectorAll('#adm-poke-shiny button').forEach(b => {
      b.onclick = () => { pokeShiny = b.dataset.sh === '1'; renderPokeGrid(s); box.querySelectorAll('#adm-poke-shiny button').forEach(x => x.classList.toggle('on', x === b)); };
    });

    box.querySelectorAll('#adm-poke-gens .chip').forEach(b => {
      b.onclick = () => { pokeGen = Number(b.dataset.g); renderPokeGrid(s); box.querySelectorAll('#adm-poke-gens .chip').forEach(x => x.classList.toggle('on', x === b)); };
    });

    const inp = $('adm-poke-q');
    inp.oninput = () => { pokeQuery = inp.value; renderPokeGrid(s); };
    renderPokeGrid(s);
  }

  function renderPokeGrid(s) {
    const grid = $('adm-poke-grid');
    if (!grid) return;
    const q = pokeQuery.trim().toLowerCase();
    const list = G.DEX.filter(p => {
      if (pokeGen && p.gen !== pokeGen) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || String(p.dex).includes(q);
    }).slice(0, 36);

    grid.innerHTML = list.map(p => {
      const isPartner = s.partner === p.dex && (!!s.partnerShiny === !!pokeShiny);
      const useSh = pokeShiny && G.Sprites.hasShiny(p.dex);
      return `<button type="button" class="admin-poke-cell ${isPartner ? 'on' : ''} ${useSh ? 'shiny' : ''}" data-dex="${p.dex}">
        <canvas width="52" height="44" data-dex="${p.dex}" data-sh="${useSh ? 1 : 0}"></canvas>
        <div class="admin-poke-meta">
          <span class="num">#${String(p.dex).padStart(3, '0')} ${G.UI.stars(p.rarity, 10)}</span>
          <b translate="no">${esc(p.name)} ${useSh ? '✨' : ''}</b>
          <div class="types">${G.UI.typeChips(p.types)}</div>
        </div>
      </button>`;
    }).join('');

    grid.querySelectorAll('canvas[data-dex]').forEach(cv => {
      G.UI.sprite(cv, Number(cv.dataset.dex), { scale: 1, shiny: cv.dataset.sh === '1' });
    });

    grid.querySelectorAll('.admin-poke-cell').forEach(btn => {
      btn.onclick = () => {
        const dex = Number(btn.dataset.dex);
        const mon = G.DEX_BY[dex];
        if (!mon) return;
        const useSh = pokeShiny && G.Sprites.hasShiny(dex);
        G.DB.grant(dex, 'admin');
        if (useSh) G.DB.grantShiny(dex, 'admin');
        s.partner = dex;
        s.partnerShiny = useSh;
        s.pupg[dex] = s.pupg[dex] || {};
        for (const u of G.Upgrades.LIST) s.pupg[dex][u.id] = u.max;
        G.DB.commit(true);

        // Si está en una partida en curso, transforma el Pokémon en vivo
        const pl = G.Game && G.Game.player;
        if (pl && G.Game.state !== 'ui' && G.Game.state !== 'over') {
          morphLivePlayer(pl, mon, useSh);
        }
        G.Audio.sfx(useSh ? 'shinyGet' : 'confirm');
        G.UI.toast(L(
          `⚡ Đã chọn ${mon.name}${useSh ? ' Shiny ✨' : ''} (Max Nâng cấp)${pl ? ' & Biến hình ngay trong trận!' : '!'}`,
          `⚡ Selected ${mon.name}${useSh ? ' Shiny ✨' : ''} (Max Upgrades)${pl ? ' & Morphed mid-run!' : '!'}`,
          `⚡ ¡${mon.name}${useSh ? ' Shiny ✨' : ''} elegido!`
        ));
        render();
      };
    });
  }

  function applyPerksToLivePlayer(dex) {
    const pl = G.Game && G.Game.player;
    if (!pl || pl.dex !== dex) return;
    const perks = G.Upgrades.perks(G.DB.upgradesOf(dex));
    pl.atkMul = Math.max(pl.atkMul, perks.atkMul || 1);
    pl.spdMul = Math.max(pl.spdMul, perks.spdMul || 1);
    pl.cdMul = Math.min(pl.cdMul, perks.cdMul || 1);
    pl.dmgReduce = Math.max(pl.dmgReduce, perks.dmgReduce || 0);
    pl.regenFlat = Math.max(pl.regenFlat, perks.regen || 0);
    pl.critChance = Math.max(pl.critChance, perks.crit || 0);
    pl.rerollBonus = Math.max(pl.rerollBonus, perks.rerolls || 0);
  }

  function morphLivePlayer(pl, mon, shiny) {
    G.Sprites.preload([mon.dex], 8000, shiny);
    pl.mon = mon;
    pl.dex = mon.dex;
    pl.shiny = shiny && G.Sprites.hasShiny(mon.dex);
    pl.anim = new G.Sprites.Animator(mon.dex, 1, pl.shiny);
    pl.r = G.Sprites.bodyRadius(mon.dex);
    pl.bodyH = G.Sprites.bodyHeight(mon.dex);
    pl.baseSpd = Math.max(pl.baseSpd, mon.spd);
    pl.baseAtk = Math.max(pl.baseAtk, mon.atk);
    const perks = G.Upgrades.perks(G.DB.upgradesOf(mon.dex));
    pl.maxHp = Math.max(pl.maxHp, mon.hp + (perks.hp || 0));
    pl.hp = pl.maxHp;
    const startId = G.startMoveOf(mon.dex);
    if (startId && !pl.hasMove(startId)) {
      if (pl.slots.length >= pl.maxMoves) pl.maxMoves = pl.slots.length + 1;
      pl.addMove(startId);
    }
    G.FX.ring(pl.x, pl.y, 8, 120, shiny ? '#9ae6ff' : '#ffd23f', 0.6, 5);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffe9a0', 28, 180);
  }

  // =========================================================================
  // TAB 3: COMBATE EN VIVO, MODO DIOS, MOVIMIENTOS Y OBJETOS
  // =========================================================================
  function renderCombatTab(s, pl) {
    const spdNow = G.Game ? G.Game.speedK : 1;
    const speeds = [[0.5, '×0.5'], [1, '×1'], [2, '×2'], [4, '×4'], [8, '×8']];

    return `
      <div class="admin-grid-2">
        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('crown', 18)} ${L('Chế Độ Thần Thánh (God Mode — Lưu Xuyên Trận)', 'God Mode Toggles (Persisted Across Runs)', 'Modo Dios (Se mantiene entre partidas)')}</div>
          <div class="admin-switch-list">
            <div class="admin-sw-row">
              <div>
                <b>🛡️ ${L('Bất Tử Tuyệt Đối (God Mode)', 'Invincible (God Mode)', 'Invencible (God Mode)')}</b>
                <small>${L('Không nhận bất kỳ sát thương nào từ quái, Boss hay Arceus.', 'Take 0 damage from all enemies, hazards, and Arceus.', 'No recibes daño de enemigos, trampas ni Arceus.')}</small>
              </div>
              <button type="button" class="btn small ${G.Admin.godMode ? 'gold' : 'ghost'}" id="adm-sw-god">${G.Admin.godMode ? L('ĐANG BẬT', 'ON', 'SÍ') : L('TẮT', 'OFF', 'NO')}</button>
            </div>
            <div class="admin-sw-row">
              <div>
                <b>⚡ ${L('One-Hit KO (Sát Thương Vô Cực)', 'One-Hit KO (999,999 Damage)', 'Golpe Fulminante (999.999 Daño)')}</b>
                <small>${L('Mọi chiêu thức gây 999.999 sát thương, tiêu diệt Boss trong 1 chạm.', 'Every attack deals 999,999 damage, instant-killing any Boss.', 'Cada ataque hace 999.999 de daño.')}</small>
              </div>
              <button type="button" class="btn small ${G.Admin.oneHitKo ? 'gold' : 'ghost'}" id="adm-sw-ohko">${G.Admin.oneHitKo ? L('ĐANG BẬT', 'ON', 'SÍ') : L('TẮT', 'OFF', 'NO')}</button>
            </div>
            <div class="admin-sw-row">
              <div>
                <b>🚀 ${L('Không Hồi Chiêu & Lướt Vô Hạn', 'Zero Cooldown & Infinite Dash', 'Sin Recarga y Esquive Infinito')}</b>
                <small>${L('Chiêu thức xả liên thanh cực nhanh & Lướt (Space) liên tục.', 'Rapid-fire all moves with no cooldown & dash infinitely.', 'Disparo continuo sin enfriamiento y esquive infinito.')}</small>
              </div>
              <button type="button" class="btn small ${G.Admin.noCd ? 'gold' : 'ghost'}" id="adm-sw-nocd">${G.Admin.noCd ? L('ĐANG BẬT', 'ON', 'SÍ') : L('TẮT', 'OFF', 'NO')}</button>
            </div>
          </div>
          <div style="margin-top:10px">
            <div class="admin-sub-label">${G.Icons.html('clock', 14)} ${L('Tốc độ thời gian trận đấu:', 'Game Speed Multiplier:', 'Velocidad del juego:')}</div>
            <div class="chips" id="adm-speed-chips">
              ${speeds.map(([k, lbl]) => `<button type="button" class="chip ${spdNow === k ? 'on' : ''}" data-spd="${k}">${lbl}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('fist', 18)} ${L('Thao Túng Nhân Vật Trong Trận', 'Live In-Run Character Manipulation', 'Manipulación del Personaje en Partida')}</div>
          ${!pl ? `
            <p class="admin-card-sub">${L('Bạn đang ở ngoài Menu. Các nút Bất Tử / One-Hit KO bên trái đã được lưu sẵn. Bấm nút dưới để vào trận ngay!', 'You are currently in the Menu. God Mode toggles on the left are saved and ready. Click below to start a run now!', 'Estás en el menú. ¡Pulsa abajo para empezar una partida!')}</p>
            <button type="button" class="btn gold grow" id="adm-start-run">${G.Icons.html('fist', 16)} ${L('Vào Trận Ngay Bây Giờ!', 'Start Dungeon Run Now!', '¡Empezar Partida Ahora!')}</button>
          ` : `
            <p class="admin-card-sub">${L(`Đang điều khiển: ${pl.mon.name} · Cấp ${pl.level} · HP ${Math.round(pl.hp)}/${Math.round(pl.maxHp)} · Công ×${pl.atkMul.toFixed(2)}`, `Controlling: ${pl.mon.name} · Lv.${pl.level} · HP ${Math.round(pl.hp)}/${Math.round(pl.maxHp)} · Atk ×${pl.atkMul.toFixed(2)}`, `Controlando: ${pl.mon.name} · Nv.${pl.level}`)}</p>
            <div class="admin-btn-grid">
              <button type="button" class="btn small gold" data-act="lv1">${G.Icons.html('up', 14)} ${L('+1 Cấp (Mở thẻ)', '+1 Level (Cards)', '+1 Nivel (Cartas)')}</button>
              <button type="button" class="btn small gold" data-act="lv5">${G.Icons.html('up', 14)} ${L('+5 Cấp liên tiếp', '+5 Levels', '+5 Niveles')}</button>
              <button type="button" class="btn small" data-act="lv10silent">${G.Icons.html('up', 14)} ${L('+10 Cấp (Tức thì)', '+10 Levels (Instant)', '+10 Niveles (Directo)')}</button>
              <button type="button" class="btn small" data-act="heal">${G.Icons.html('heart', 14)} ${L('Hồi đầy HP + Hồi sinh', 'Full Heal / Revive', 'Curar al 100%')}</button>
              <button type="button" class="btn small" data-act="hp500">${G.Icons.html('heart', 14)} ${L('+500 HP Tối đa', '+500 Max HP', '+500 Vida Máx.')}</button>
              <button type="button" class="btn small" data-act="atk2">${G.Icons.html('fist', 14)} ${L('×2 Sát thương', '×2 Attack Power', '×2 Ataque')}</button>
              <button type="button" class="btn small" data-act="spd50">${G.Icons.html('boot', 14)} ${L('+50% Tốc chạy', '+50% Move Speed', '+50% Velocidad')}</button>
              <button type="button" class="btn small" data-act="reroll99">${G.Icons.html('cards', 14)} ${L('+99 Lượt đổi thẻ', '+99 Card Rerolls', '+99 Cambios de carta')}</button>
              <button type="button" class="btn small gold" data-act="bond">${G.Icons.html('sparkle', 14)} ${L('+1 Liên kết (Dung hợp)', '+1 Move Bond (Fuse)', '+1 Vínculo (Fusión)')}</button>
              <button type="button" class="btn small" data-act="magnet">${G.Icons.html('magnet', 14)} ${L('Hút toàn bộ chiến lợi phẩm', 'Magnet All Pickups', 'Atraer todo el botín')}</button>
            </div>
          `}
        </div>
      </div>

      ${pl ? `
        <div class="admin-card" style="margin-top:10px">
          <div class="row between wrap" style="gap:8px;margin-bottom:6px">
            <div class="admin-card-h" style="margin:0">${G.Icons.html('cards', 18)} ${L(`Chiêu Thức Đang Trang Bị (${pl.moves.length} chiêu · ${pl.slots.length}/${pl.maxMoves} ô)`, `Equipped Moves (${pl.moves.length} moves · ${pl.slots.length}/${pl.maxMoves} slots)`, `Movimientos Equipados (${pl.moves.length})`)}</div>
            <div class="row wrap" style="gap:6px">
              <button type="button" class="btn small gold" id="adm-max-all-moves">${G.Icons.html('star', 14)} ${L('Tối đa Lv.5 & Tiến hóa Hoàng Kim TẤT CẢ chiêu!', 'Max Lv.5 & Evolve ALL Equipped Moves!', '¡Subir al Nv.5 y Evolucionar TODOS!')}</button>
              <button type="button" class="btn small" id="adm-fuse-all">${G.Icons.html('sparkle', 14)} ${L('Dung hợp tất cả chiêu vào Ô 1!', 'Fuse All Moves into Slot 1!', '¡Fusionar todos en el Hueco 1!')}</button>
            </div>
          </div>
          <div class="admin-eq-moves">
            ${pl.moves.map(m => {
              const canEvo = G.Moves.EVO && G.Moves.EVO[m.id] && !m.evolved;
              return `<div class="admin-eq-move ${m.evolved ? 'evo' : ''}">
                ${G.Icons.html('move:' + m.id, 26)}
                <div class="grow">
                  <b>${esc(G.T(m.name))} <span class="lvl-tag">${m.evolved ? '★ EVO' : 'Lv.' + m.lvl + '/' + m.def.maxLvl}</span></b>
                  <small>${G.UI.typeChips([m.type])}</small>
                </div>
                <div class="row" style="gap:4px">
                  ${m.lvl < m.def.maxLvl ? `<button type="button" class="btn small" data-mv-max="${m.id}">Lv.5</button>` : ''}
                  ${canEvo ? `<button type="button" class="btn small gold" data-mv-evo="${m.id}">★ ${L('Tiến hóa', 'Evolve', 'Evolucionar')}</button>` : ''}
                  ${pl.moves.length > 1 ? `<button type="button" class="btn small ghost" data-mv-del="${m.id}">✕</button>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="admin-grid-2" style="margin-top:10px">
          <div class="admin-card">
            <div class="admin-card-h">${G.Icons.html('book', 18)} ${L('Học Chiêu Thức Bất Kỳ (64 Chiêu — Tự Động Tiến Hóa)', 'Learn Any of the 64 Moves (Instant Max/Evolve)', 'Aprender Cualquiera de los 64 Movimientos')}</div>
            <div class="row wrap" style="gap:6px;margin-bottom:6px">
              <input id="adm-move-q" class="field grow" placeholder="${L('Tìm tên chiêu thức...', 'Search move name...', 'Buscar movimiento...')}" value="${esc(moveQuery)}" spellcheck="false">
            </div>
            <div class="chips" id="adm-move-types" style="margin-bottom:6px">
              <button type="button" class="chip ${moveType === 'all' ? 'on' : ''}" data-mt="all">${L('Tất cả', 'All', 'Todos')}</button>
              ${Object.keys(G.U.TYPE_NAME).map(t => `<button type="button" class="chip ${moveType === t ? 'on' : ''}" data-mt="${t}" style="${moveType === t ? '' : 'border-color:' + G.U.TYPE_COLOR[t]}">${esc(G.T(G.U.TYPE_NAME[t]))}</button>`).join('')}
            </div>
            <div id="adm-move-grid" class="admin-move-grid"></div>
          </div>

          <div class="admin-card">
            <div class="admin-card-h">${G.Icons.html('chest', 18)} ${L('Trang Bị Vật Phẩm Bảo Bối (11 Vật Phẩm)', 'Equip Held Item (All 11 Items)', 'Equipar Objeto (11 Objetos)')}</div>
            <p class="admin-card-sub">${L('Bấm vào bất kỳ vật phẩm nào dưới đây để trang bị ngay lập tức.', 'Click any item below to equip it immediately.', 'Haz clic en cualquier objeto para equiparlo al instante.')}</p>
            <div class="admin-item-grid">
              ${G.Items.LIST.map(it => {
                const active = pl.item === it.id;
                return `<button type="button" class="admin-item-cell ${active ? 'on' : ''}" data-item="${it.id}">
                  ${G.Icons.html('item:' + it.id, 28)}
                  <div class="grow">
                    <b>${esc(G.T(it.name))} ${active ? `<span class="gold">(${L('Đang đeo', 'Equipped', 'Equipado')})</span>` : ''}</b>
                    <small>${esc(G.T(it.desc))}</small>
                  </div>
                </button>`;
              }).join('')}
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }

  function wireCombatTab(box, s, pl) {
    $('adm-sw-god').onclick = () => {
      G.Admin.setGodMode(!G.Admin.godMode);
      G.Audio.sfx('confirm');
      G.UI.toast(G.Admin.godMode ? L('🛡️ Đã BẬT Chế độ Bất Tử (God Mode)!', '🛡️ God Mode ON!', '🛡️ ¡Modo Dios ACTIVADO!') : L('Đã tắt Chế độ Bất Tử.', 'God Mode OFF.', 'Modo Dios desactivado.'));
      render();
    };
    $('adm-sw-ohko').onclick = () => {
      G.Admin.setOneHitKo(!G.Admin.oneHitKo);
      G.Audio.sfx('confirm');
      G.UI.toast(G.Admin.oneHitKo ? L('⚡ Đã BẬT One-Hit KO (999.999 sát thương)!', '⚡ One-Hit KO ON!', '⚡ ¡Golpe Fulminante ACTIVADO!') : L('Đã tắt One-Hit KO.', 'One-Hit KO OFF.', 'Golpe Fulminante desactivado.'));
      render();
    };
    $('adm-sw-nocd').onclick = () => {
      G.Admin.setNoCd(!G.Admin.noCd);
      G.Audio.sfx('confirm');
      G.UI.toast(G.Admin.noCd ? L('🚀 Đã BẬT Không Hồi Chiêu & Lướt Vô Hạn!', '🚀 Zero Cooldown & Infinite Dash ON!', '🚀 ¡Sin Recarga ACTIVADO!') : L('Đã tắt Không Hồi Chiêu.', 'Zero Cooldown OFF.', 'Sin Recarga desactivado.'));
      render();
    };

    box.querySelectorAll('#adm-speed-chips .chip').forEach(b => {
      b.onclick = () => {
        const k = Number(b.dataset.spd);
        G.Game.debugSpeed(k);
        G.Audio.sfx('select');
        G.UI.toast(L(`⏱️ Tốc độ trận đấu: ×${k}`, `⏱️ Game Speed: ×${k}`, `⏱️ Velocidad: ×${k}`));
        render();
      };
    });

    const startBtn = $('adm-start-run');
    if (startBtn) {
      startBtn.onclick = () => {
        close();
        G.Flow.play();
      };
    }

    if (!pl) return;

    box.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = () => {
        const act = b.dataset.act;
        if (act === 'lv1') {
          close();
          G.Game.debugLevelUp(1);
          return;
        } else if (act === 'lv5') {
          close();
          G.Game.debugLevelUp(5);
          return;
        } else if (act === 'lv10silent') {
          pl.level += 10;
          pl.xpNext = G.Player.xpFor(pl.level);
          pl.atkMul *= 1.35;
          pl.addMaxHp(80);
          G.Audio.sfx('levelup');
          G.UI.toast(L(`Đã tăng lên Cấp ${pl.level}!`, `Leveled up to Lv.${pl.level}!`, `¡Subiste al Nivel ${pl.level}!`));
        } else if (act === 'heal') {
          if (pl.dead) pl.revive(1);
          else pl.hp = pl.maxHp;
          G.Audio.sfx('heal');
          G.UI.toast(L('💚 Đã hồi đầy 100% HP!', '💚 Fully healed!', '💚 ¡Vida al 100%!'));
        } else if (act === 'hp500') {
          pl.addMaxHp(500);
          G.Audio.sfx('heal');
          G.UI.toast(L(`💚 Máu tối đa: ${Math.round(pl.maxHp)}!`, `💚 Max HP: ${Math.round(pl.maxHp)}!`, `💚 ¡Vida máx: ${Math.round(pl.maxHp)}!`));
        } else if (act === 'atk2') {
          pl.atkMul *= 2;
          G.Audio.sfx('levelup');
          G.UI.toast(L(`⚔️ Sát thương nhân ×${pl.atkMul.toFixed(1)}!`, `⚔️ Attack Multiplier ×${pl.atkMul.toFixed(1)}!`, `⚔️ ¡Ataque ×${pl.atkMul.toFixed(1)}!`));
        } else if (act === 'spd50') {
          pl.spdMul *= 1.5;
          G.Audio.sfx('select');
          G.UI.toast(L('💨 Đã tăng +50% tốc độ di chuyển!', '💨 +50% Move Speed!', '💨 ¡+50% Velocidad!'));
        } else if (act === 'reroll99') {
          pl.rerollBonus = (pl.rerollBonus || 0) + 99;
          G.Audio.sfx('confirm');
          G.UI.toast(L('🎲 Đã cộng +99 lượt đổi thẻ bài!', '🎲 Added +99 Card Rerolls!', '🎲 ¡+99 cambios de carta!'));
        } else if (act === 'bond') {
          pl.bonds = (pl.bonds || 0) + 1;
          close();
          G.Game.offerBond(false);
          return;
        } else if (act === 'magnet') {
          G.Pickups.pullAll();
          G.Audio.sfx('confirm');
          G.UI.toast(L('🧲 Đã hút toàn bộ XP & Vật phẩm trên bản đồ!', '🧲 Pulled all XP & Pickups on map!', '🧲 ¡Todo el botín atraído!'));
        }
        render();
      };
    });

    const maxAllBtn = $('adm-max-all-moves');
    if (maxAllBtn) {
      maxAllBtn.onclick = () => {
        for (const m of pl.moves) {
          while (G.Moves.levelUp(m)) { /* max */ }
          G.Moves.evolve(m);
        }
        G.Audio.sfx('legend');
        G.UI.toast(L('🌟 Toàn bộ chiêu thức đã đạt Cấp 5 & Tiến Hóa Hoàng Kim!', '🌟 All moves Maxed & Evolved!', '🌟 ¡Todos los movimientos evolucionados!'));
        render();
      };
    }

    const fuseAllBtn = $('adm-fuse-all');
    if (fuseAllBtn) {
      fuseAllBtn.onclick = () => {
        if (pl.moves.length < 2) {
          G.UI.toast(L('Hãy học ít nhất 2 chiêu để dung hợp!', 'Learn at least 2 moves to fuse!', '¡Aprende al menos 2 movimientos!'));
          return;
        }
        pl.slots = [pl.moves.slice()];
        pl.active = 0;
        G.Projectiles.clearOrbs(pl);
        G.Audio.sfx('legend');
        G.UI.toast(L(`💥 Đã dung hợp toàn bộ ${pl.moves.length} chiêu vào cùng Ô số 1 (Xả đồng loạt)!`, `💥 Fused all ${pl.moves.length} moves into Slot 1!`, `💥 ¡${pl.moves.length} movimientos fusionados en el Hueco 1!`));
        render();
      };
    }

    box.querySelectorAll('[data-mv-max]').forEach(b => {
      b.onclick = () => {
        const m = pl.moves.find(x => x.id === b.dataset.mvMax);
        if (m) { while (G.Moves.levelUp(m)) {} G.Audio.sfx('levelup'); render(); }
      };
    });
    box.querySelectorAll('[data-mv-evo]').forEach(b => {
      b.onclick = () => {
        const m = pl.moves.find(x => x.id === b.dataset.mvEvo);
        if (m) {
          while (G.Moves.levelUp(m)) {}
          G.Moves.evolve(m);
          G.Audio.sfx('legend');
          render();
        }
      };
    });
    box.querySelectorAll('[data-mv-del]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.mvDel;
        if (pl.moves.length <= 1) return;
        pl.moves = pl.moves.filter(x => x.id !== id);
        for (let i = pl.slots.length - 1; i >= 0; i--) {
          pl.slots[i] = pl.slots[i].filter(x => x.id !== id);
          if (!pl.slots[i].length) pl.slots.splice(i, 1);
        }
        pl.active = Math.min(pl.active, Math.max(0, pl.slots.length - 1));
        G.Projectiles.clearOrbs(pl);
        G.Audio.sfx('back');
        render();
      };
    });

    box.querySelectorAll('[data-item]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.item;
        pl.equip(id);
        G.Progress.event('item', { id });
        G.Audio.sfx('legend');
        G.UI.toast(L(`Đã trang bị: ${G.T(G.Items.BY[id].name)}!`, `Equipped: ${G.T(G.Items.BY[id].name)}!`, `¡Equipado: ${G.Items.BY[id].name}!`));
        render();
      };
    });

    const mInp = $('adm-move-q');
    if (mInp) mInp.oninput = () => { moveQuery = mInp.value; renderMoveCatalog(pl); };
    box.querySelectorAll('#adm-move-types .chip').forEach(b => {
      b.onclick = () => { moveType = b.dataset.mt; renderMoveCatalog(pl); box.querySelectorAll('#adm-move-types .chip').forEach(x => x.classList.toggle('on', x === b)); };
    });
    renderMoveCatalog(pl);
  }

  const KIND_LABEL = {
    projectile: ['Đạn bắn', 'Projectile', 'Proyectil'],
    melee:      ['Cận chiến', 'Melee', 'Cuerpo a cuerpo'],
    beam:       ['Tia năng lượng', 'Beam', 'Rayo'],
    orbit:      ['Quỹ đạo xoay', 'Orbit', 'Órbita'],
    nova:       ['Bùng nổ tỏa tròn', 'Nova', 'Nova'],
    aura:       ['Hào quang quanh thân', 'Aura', 'Aura'],
    buff:       ['Cường hóa', 'Buff', 'Mejora'],
    boomerang:  ['Phi tiêu khứ hồi', 'Boomerang', 'Bumerán'],
    chain:      ['Giật sét dây chuyền', 'Chain', 'Cadena'],
    mine:       ['Bẫy mìn', 'Mine', 'Mina'],
    meteor:     ['Thiên thạch rơi', 'Meteor', 'Meteoro'],
    turret:     ['Trụ tự động', 'Turret', 'Torreta'],
    dash:       ['Húc xung kích', 'Dash', 'Embestida'],
    trail:      ['Vệt sát thương', 'Trail', 'Rastro'],
    cone:       ['Quạt tầm gần', 'Cone', 'Cono']
  };
  function kindText(k) {
    const row = KIND_LABEL[k];
    return row ? L(row[0], row[1], row[2]) : k;
  }

  function renderMoveCatalog(pl) {
    const grid = $('adm-move-grid');
    if (!grid || !pl) return;
    const q = moveQuery.trim().toLowerCase();
    const list = G.Moves.ALL.filter(m => {
      if (moveType !== 'all' && m.type !== moveType) return false;
      if (!q) return true;
      const trName = G.T(m.name).toLowerCase();
      const evo = G.Moves.EVO && G.Moves.EVO[m.id] ? G.T(G.Moves.EVO[m.id][0]).toLowerCase() : '';
      return trName.includes(q) || m.name.toLowerCase().includes(q) || evo.includes(q) || m.id.includes(q);
    });

    grid.innerHTML = list.map(m => {
      const has = pl.hasMove(m.id);
      const evoArr = G.Moves.EVO && G.Moves.EVO[m.id];
      const evoName = evoArr ? G.T(evoArr[0]) : null;
      return `<button type="button" class="admin-move-cell ${has ? 'on' : ''}" data-add-mv="${m.id}">
        ${G.Icons.html('move:' + m.id, 24)}
        <div class="grow">
          <b>${esc(G.T(m.name))}${evoName ? ` <span class="gold">→ ${esc(evoName)}</span>` : ''}</b>
          <small>${G.UI.typeChips([m.type])} · ${esc(kindText(m.kind))}</small>
        </div>
        <span class="adm-mv-badge">${has ? L('Nâng ★', 'Max ★', 'Subir ★') : '+ ' + L('Học ★', 'Add ★', 'Añadir ★')}</span>
      </button>`;
    }).join('');

    grid.querySelectorAll('[data-add-mv]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.addMv;
        if (!pl.hasMove(id)) {
          if (pl.slots.length >= pl.maxMoves) pl.maxMoves = pl.slots.length + 1;
          pl.addMove(id);
        }
        const inst = pl.moves.find(x => x.id === id);
        if (inst) {
          while (G.Moves.levelUp(inst)) {}
          G.Moves.evolve(inst);
        }
        G.Audio.sfx('legend');
        G.UI.toast(L(`⚡ Đã trang bị & Tiến hóa tối đa: ${G.T(inst ? inst.name : id)}!`, `⚡ Added & Evolved: ${G.T(inst ? inst.name : id)}!`, `⚡ ¡Movimiento evolucionado: ${inst ? inst.name : id}!`));
        render();
      };
    });
  }

  // =========================================================================
  // TAB 4: MUNDO, RELOJ, JEFES, GRIETAS, CLIMA Y EVENTOS
  // =========================================================================
  function renderWorldTab(s, pl) {
    if (!pl) {
      return `
        <div class="admin-card center" style="padding:28px">
          <h3>${L('Hãy vào trận để điều khiển Thế giới, Boss & Sự kiện!', 'Start a Run to Control World, Bosses & Events!', '¡Empieza una partida para controlar el Mundo, Jefes y Eventos!')}</h3>
          <p class="admin-card-sub">${L('Trong trận đấu, bạn có thể nhảy thời gian tới Phán Quyết Arceus, mở Khe Nứt Không Gian, dịch chuyển vào 18 Đấu trường Huyền Thoại, triệu hồi Boss, đổi Thời tiết & kích hoạt Sự kiện.', 'During a run, you can jump the clock to Arceus Judgment, open Rifts, enter all 18 Legendary Arenas, spawn Bosses, change Weather, and trigger Events.', 'En partida puedes saltar el reloj, abrir grietas, invocar jefes y cambiar el clima.')}</p>
          <button type="button" class="btn gold" id="adm-world-start">${G.Icons.html('fist', 16)} ${L('Vào Trận Ngay Bây Giờ!', 'Start Dungeon Run Now!', '¡Empezar Partida Ahora!')}</button>
        </div>`;
    }

    const curT = Math.floor(G.Game.st.time || 0);
    const mm = String(Math.floor(curT / 60)).padStart(2, '0');
    const ss = String(curT % 60).padStart(2, '0');

    return `
      <div class="admin-grid-2">
        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('clock', 18)} ${L(`Điều Khiển Đồng Hồ Trận Đấu (Hiện tại: ${mm}:${ss})`, `Run Clock Control (Current: ${mm}:${ss})`, `Reloj de la Partida (Actual: ${mm}:${ss})`)}</div>
          <p class="admin-card-sub">${L('Nhảy tới bất kỳ mốc thời gian nào hoặc triệu hồi Phán Quyết của Arceus ở phút 30:00.', 'Jump to any timestamp or trigger the Judgment of Arceus at 30:00.', 'Salta a cualquier minuto o activa la Sentencia de Arceus (30:00).')}</p>
          <div class="admin-btn-grid">
            <button type="button" class="btn small" data-time="+60">+1 ${L('phút', 'min', 'min')}</button>
            <button type="button" class="btn small" data-time="+180">+3 ${L('phút', 'min', 'min')}</button>
            <button type="button" class="btn small" data-time="+300">+5 ${L('phút', 'min', 'min')}</button>
            <button type="button" class="btn small" data-time="300">${L('Tới 05:00', 'Go to 05:00', 'Ir a 05:00')}</button>
            <button type="button" class="btn small" data-time="900">${L('Tới 15:00', 'Go to 15:00', 'Ir a 15:00')}</button>
            <button type="button" class="btn small" data-time="1500">${L('Tới 25:00', 'Go to 25:00', 'Ir a 25:00')}</button>
            <button type="button" class="btn small gold" data-time="1797" style="grid-column:1/-1">${G.Icons.html('crown', 14)} ${L('🔥 Tới 29:57 — Triệu Hồi Phán Quyết Của Arceus!', '🔥 Jump to 29:57 — Trigger Arceus Judgment!', '🔥 ¡Ir a 29:57 — Sentencia de Arceus!')}</button>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('fist', 18)} ${L('Chiến Trường, Quái Vật & Triệu Hồi Boss', 'Battlefield, Spawner & Boss Summoner', 'Campo de Batalla e Invocación de Jefes')}</div>
          <p class="admin-card-sub">${L('Quét sạch toàn bộ quái trên màn hình hoặc triệu hồi Shiny / Boss ngay lập tức.', 'Nuke all enemies on screen or summon Shiny Pokémon and Bosses on demand.', 'Aniquila a todos los enemigos o invoca Shiny y Jefes.')}</p>
          <div class="admin-btn-grid">
            <button type="button" class="btn small danger" id="adm-nuke">${G.Icons.html('ban', 14)} ${L('💣 Hủy diệt TẤT CẢ kẻ địch (Nuke)', '💣 Nuke ALL Enemies on Screen', '💣 Aniquilar TODOS los enemigos')}</button>
            <button type="button" class="btn small gold" id="adm-spawn-shiny">${G.Icons.html('sparkle', 14)} ${L('✨ Triệu hồi ngay 1 Pokémon Shiny', '✨ Spawn Wild Shiny Now', '✨ Invocar Pokémon Shiny')}</button>
            <button type="button" class="btn small gold" id="adm-spawn-boss">${G.Icons.html('crown', 14)} ${L('👹 Triệu hồi Boss ngẫu nhiên', '👹 Spawn Random Boss', '👹 Invocar Jefe aleatorio')}</button>
            <button type="button" class="btn small" id="adm-spawn-horde">${G.Icons.html('fist', 14)} ${L('🌊 Triệu hồi Đợt càn quét (30 quái)', '🌊 Spawn Monster Surge (30)', '🌊 Invocar Marea (30)')}</button>
          </div>
          <div class="admin-sub-label" style="margin-top:8px">${L('Triệu hồi Boss chỉ định:', 'Summon Specific Boss:', 'Invocar Jefe específico:')}</div>
          <div class="chips" id="adm-boss-list">
            ${(G.Enemies && G.Enemies.BOSSES || []).map((b, i) =>
              `<button type="button" class="chip" data-boss="${i}" translate="no">${esc(b.name)}</button>`
            ).join('')}
          </div>
        </div>
      </div>

      <div class="admin-card" style="margin-top:10px">
        <div class="row between wrap" style="gap:8px;margin-bottom:6px">
          <div class="admin-card-h" style="margin:0">${G.Icons.html('sparkle', 18)} ${L('Khe Nứt Không Gian & 18 Đấu Trường Huyền Thoại', 'Dimensional Rift & 18 Legendary Arenas', 'Grieta Dimensional y 18 Arenas Legendarias')}</div>
          <button type="button" class="btn small gold" id="adm-rift-open">${G.Icons.html('sparkle', 14)} ${L('🌀 Mở Khe Nứt Không Gian ngay cạnh bạn', '🌀 Open Dimensional Rift Next to You', '🌀 Abrir Grieta Dimensional a tu lado')}</button>
        </div>
        <p class="admin-card-sub">${L('Hoặc bấm vào bất kỳ Hệ nào dưới đây để dịch chuyển thẳng vào Đấu trường Huyền Thoại tương ứng:', 'Or click any Type below to teleport straight into that Legendary Arena:', 'O pulsa cualquier Tipo para entrar directamente en su Arena Legendaria:')}</p>
        <div class="chips" id="adm-arena-types">
          ${Object.keys(G.U.TYPE_NAME).map(t =>
            `<button type="button" class="chip" data-arena="${t}" style="background:${G.U.TYPE_COLOR[t]};color:#1a1c24;font-weight:700;border-color:rgba(255,255,255,.4)">${esc(G.T(G.U.TYPE_NAME[t]))}</button>`
          ).join('')}
        </div>
      </div>

      <div class="admin-grid-2" style="margin-top:10px">
        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('sprout', 18)} ${L('Thời Tiết & Quần Xã Bản Đồ', 'Weather & Map Biome', 'Clima y Bioma del Mapa')}</div>
          <div class="admin-sub-label">${L('Đổi Quần xã bản đồ:', 'Change Map Biome:', 'Cambiar Bioma:')}</div>
          <div class="chips" style="margin-bottom:8px">
            <button type="button" class="chip" data-biome="0">${L('🌲 Khu rừng', '🌲 Forest', '🌲 Bosque')}</button>
            <button type="button" class="chip" data-biome="1">${L('🪨 Hang động', '🪨 Cave', '🪨 Cueva')}</button>
            <button type="button" class="chip" data-biome="2">${L('🌋 Núi lửa', '🌋 Volcano', '🌋 Volcán')}</button>
          </div>
          <div class="admin-sub-label">${L('Đổi Thời tiết:', 'Change Weather:', 'Cambiar Clima:')}</div>
          <div class="chips">
            <button type="button" class="chip" data-weather="">${L('☀️ Quang đãng', '☀️ Clear', '☀️ Despejado')}</button>
            <button type="button" class="chip" data-weather="sun">${L('🔥 Nắng gắt', '🔥 Harsh Sun', '🔥 Sol')}</button>
            <button type="button" class="chip" data-weather="rain">${L('🌧️ Mưa lớn', '🌧️ Heavy Rain', '🌧️ Lluvia')}</button>
            <button type="button" class="chip" data-weather="sand">${L('🏜️ Bão cát', '🏜️ Sandstorm', '🏜️ Tormenta Arena')}</button>
            <button type="button" class="chip" data-weather="snow">${L('❄️ Bão tuyết', '❄️ Snowstorm', '❄️ Nieve')}</button>
            <button type="button" class="chip" data-weather="fog">${L('🌫️ Sương mù', '🌫️ Dense Fog', '🌫️ Niebla')}</button>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-h">${G.Icons.html('star', 18)} ${L('Kích Hoạt Sự Kiện Giữa Trận', 'Trigger Mid-Run Events', 'Activar Eventos de Partida')}</div>
          <p class="admin-card-sub">${L('Khởi phát ngay lập tức các sự kiện đặc biệt trên bản đồ.', 'Trigger special map events immediately.', 'Activa eventos especiales al instante.')}</p>
          <div class="admin-btn-grid">
            <button type="button" class="btn small gold" data-ev="gold">${G.Icons.html('coin', 14)} ${L('Giờ Vàng (Quái hóa Vàng)', 'Golden Hour', 'Hora Dorada')}</button>
            <button type="button" class="btn small" data-ev="horde">${G.Icons.html('fist', 14)} ${L('Đợt Càn Quét Quái Vật', 'Horde Event', 'Horda')}</button>
            <button type="button" class="btn small" data-ev="lost">${G.Icons.html('heart', 14)} ${L('Giải Cứu Pokémon Lạc', 'Lost Pokémon Rescue', 'Pokémon Perdido')}</button>
            <button type="button" class="btn small gold" data-ev="thief">${G.Icons.html('ticket10', 14)} ${L('Meowth / Gholdengo Kho Báu', 'Treasure Meowth / Gholdengo', 'Meowth / Gholdengo')}</button>
          </div>
        </div>
      </div>
    `;
  }

  function wireWorldTab(box, s, pl) {
    const startBtn = $('adm-world-start');
    if (startBtn) {
      startBtn.onclick = () => { close(); G.Flow.play(); };
      return;
    }

    box.querySelectorAll('[data-time]').forEach(b => {
      b.onclick = () => {
        const v = b.dataset.time;
        const cur = G.Game.st.time || 0;
        const next = v.startsWith('+') ? cur + Number(v) : Number(v);
        G.Game.debugTime(next);
        G.Audio.sfx('confirm');
        G.UI.toast(L(`⏱️ Đã chuyển đồng hồ tới ${Math.floor(next / 60)}:${String(Math.floor(next % 60)).padStart(2, '0')}!`, `⏱️ Jumped clock to ${Math.floor(next / 60)}:${String(Math.floor(next % 60)).padStart(2, '0')}!`, `⏱️ ¡Reloj en ${Math.floor(next / 60)}:${String(Math.floor(next % 60)).padStart(2, '0')}!`));
        if (next >= 1795) close();
        else render();
      };
    });

    $('adm-nuke').onclick = () => {
      let killed = 0;
      for (const e of G.EnemyMgr.all().slice()) {
        if (!e.dead) {
          e.hurt(9999999, '#ffd23f', 0, 0, 0);
          if (!e.dead && e.die) e.die();
          killed++;
        }
      }
      G.Camera.kick(1.0);
      if (pl) G.FX.ring(pl.x, pl.y, 12, 420, '#ff7b3d', 0.6, 6);
      G.Audio.sfx('break');
      G.UI.toast(L(`💣 Đã tiêu diệt ${killed} kẻ địch trên màn hình!`, `💣 Nuked ${killed} enemies on screen!`, `💣 ¡${killed} enemigos eliminados!`));
    };

    $('adm-spawn-shiny').onclick = () => {
      const e = G.Spawner.debugSpawnShiny();
      close();
      if (e) G.UI.toast(L(`✨ Đã triệu hồi ${e.name} Shiny!`, `✨ Spawned Shiny ${e.name}!`, `✨ ¡${e.name} Shiny invocado!`));
    };

    $('adm-spawn-boss').onclick = () => {
      const e = G.Spawner.debugSpawnBoss();
      close();
      if (e) G.UI.toast(L(`👹 Đã triệu hồi Boss ${e.name}!`, `👹 Spawned Boss ${e.name}!`, `👹 ¡Jefe ${e.name} invocado!`));
    };

    $('adm-spawn-horde').onclick = () => {
      G.Spawner.burst(30);
      close();
      G.UI.toast(L('🌊 Đã triệu hồi 30 Pokémon hoang dã!', '🌊 Spawned 30 wild Pokémon!', '🌊 ¡30 Pokémon invocados!'));
    };

    box.querySelectorAll('[data-boss]').forEach(b => {
      b.onclick = () => {
        const idx = Number(b.dataset.boss);
        const e = G.Spawner.debugSpawnBoss(idx);
        close();
        if (e) G.UI.toast(L(`👹 Đã triệu hồi Boss ${e.name}!`, `👹 Spawned Boss ${e.name}!`, `👹 ¡Jefe ${e.name} invocado!`));
      };
    });

    $('adm-rift-open').onclick = () => {
      G.Rift.debugOpen();
      close();
      G.UI.toast(L('🌀 Đã mở Khe Nứt Không Gian ngay cạnh bạn!', '🌀 Opened Dimensional Rift next to you!', '🌀 ¡Grieta Dimensional abierta a tu lado!'));
    };

    box.querySelectorAll('[data-arena]').forEach(b => {
      b.onclick = () => {
        const t = b.dataset.arena;
        close();
        G.Rift.debugArena(t);
      };
    });

    box.querySelectorAll('[data-biome]').forEach(b => {
      b.onclick = () => {
        G.Game.debugBiome(Number(b.dataset.biome));
        G.UI.toast(L('🗺️ Đã đổi Quần xã bản đồ!', '🗺️ Changed Map Biome!', '🗺️ ¡Bioma cambiado!'));
      };
    });

    box.querySelectorAll('[data-weather]').forEach(b => {
      b.onclick = () => {
        const w = b.dataset.weather;
        if (w) G.Weather.debugStart(w, 60);
        else G.Weather.clear();
        G.Audio.sfx('select');
        const wName = G.Weather.current() ? G.T(G.Weather.current().name) : L('Quang đãng', 'Clear', 'Despejado');
        G.UI.toast(L(`🌦️ Thời tiết: ${wName}`, `🌦️ Weather: ${wName}`, `🌦️ Clima: ${wName}`));
      };
    });

    box.querySelectorAll('[data-ev]').forEach(b => {
      b.onclick = () => {
        const ev = b.dataset.ev;
        close();
        if (ev === 'thief') G.Events.debugThief();
        else G.Events.debugStart(ev === 'rescue' ? 'lost' : ev);
      };
    });
  }

  return { init, open, close, toggle, syncBadge, get isOpen() { return isOpen(); } };
})();
