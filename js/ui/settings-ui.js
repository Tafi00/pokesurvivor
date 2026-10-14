/* ============ settings-ui.js — pantalla de Ajustes (PC y móvil) ============
 * Se abre por encima de lo que haya (menú o pausa) y al cerrar vuelve ahí.
 * Pestañas: Sonido · Gráficos · Controles · Cuenta · Acerca de.
 * Los ajustes son de este dispositivo (G.Settings / G.Audio en el navegador).
 */
G.SettingsUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VERSION = '1.2 · 2026-10-09';
  const REPO = 'https://github.com/JPTER78/pokesurvivor';
  let tab = 'sound';

  function init() {
    document.querySelectorAll('#set-tabs .gen-tab').forEach(b => { b.onclick = () => { tab = b.dataset.t; render(); }; });
    $('set-close').onclick = close;
    $('btn-settings').innerHTML = G.Icons.html('gear', 20);
    $('btn-settings').onclick = () => open();
    $('btn-pause-settings').onclick = () => open('sound');
    // Pantalla completa (si el navegador la permite; en iPhone, cómo conseguirla).
    if (canFull() || iosTip()) {
      $('btn-full').classList.remove('hidden');
      $('btn-full').innerHTML = G.Icons.html('full', 20);
      $('btn-full').onclick = toggleFull;
    }
  }

  function open(t) {
    if (t) tab = t;
    $('scr-settings').classList.remove('hidden');
    render();
  }
  function close() { $('scr-settings').classList.add('hidden'); }
  const isOpen = () => !$('scr-settings').classList.contains('hidden');

  // ---------------- pantalla completa ----------------
  function canFull() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); }
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  // iPhone: Safari no deja poner una web a pantalla completa (por eso a veces
  // no salía la opción). Sí se puede abriéndola desde la pantalla de inicio.
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => !!navigator.standalone || (window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
  function iosTip() { return IOS && !canFull() && !standalone(); }
  const IOS_TIP = 'En iPhone, Safari no deja poner las webs a pantalla completa. Pulsa Compartir y luego "Añadir a pantalla de inicio": abriendo el juego desde ese icono se juega a pantalla completa.';
  function toggleFull() {
    if (!canFull()) { if (iosTip()) G.UI.toast(IOS_TIP, 9000); return; }
    if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const el = document.documentElement;
      const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      // En móvil, además se intenta fijar la pantalla en horizontal.
      if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* nada */ } }).catch(() => {});
    }
    setTimeout(() => { if (isOpen()) render(); }, 300);
  }

  // ---------------- piezas ----------------
  function section(title, sub) { return `<h3 class="set-h">${esc(title)}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}`; }
  function toggle(key, label, desc) {
    const on = !!G.Settings.get(key);
    return `<div class="set-row"><div class="grow"><b>${esc(label)}</b><small>${esc(desc)}</small></div>
      <button class="btn small switch ${on ? 'gold' : ''}" data-k="${key}">${on ? 'Sí' : 'No'}</button></div>`;
  }
  function choice(key, opts) {
    const cur = G.Settings.get(key);
    return `<div class="chips set-chips">${opts.map(([v, l]) => `<button class="chip ${v === cur ? 'on' : ''}" data-k="${key}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
  }

  function render() {
    document.querySelectorAll('#set-tabs .gen-tab').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    const box = $('set-body');
    box.scrollTop = 0;
    if (tab === 'sound') {
      box.innerHTML = section('Sonido') + '<div id="set-sound" class="sound-inline"></div>';
      G.UI.soundControls($('set-sound'));
    } else if (tab === 'gfx') {
      const auto = ['baja', 'media', 'alta'][G.Settings.autoLevel];
      box.innerHTML = section('Idioma', 'El juego se recarga al cambiarlo.')
        + `<div class="chips set-chips" translate="no">${[['vi', 'Tiếng Việt'], ['en', 'English'], ['es', 'Español']].map(([v, l]) =>
             `<button class="chip ${G.I18n.lang === v ? 'on' : ''}" data-lang="${v}">${l}</button>`).join('')}</div>`
        + section('Calidad', 'Cuántos efectos y partículas se dibujan. <b>Auto</b> la baja sola si el juego va a tirones (ahora: ' + auto + ').')
        + choice('quality', [['auto', 'Auto'], ['high', 'Alta'], ['mid', 'Media'], ['low', 'Baja']])
        + section('Pantalla')
        + toggle('minimap', 'Minimapa radar', 'Muestra el radar circular con enemigos, jefes, grietas y altares (tecla M).')
        + toggle('dmgNumbers', 'Números de daño', 'Los números que salen al golpear y al recibir daño.')
        + toggle('calm', 'Menos sacudidas y destellos', 'La cámara tiembla menos y los fogonazos son suaves.')
        + toggle('fps', 'Mostrar FPS', 'Fotogramas por segundo, en la esquina de abajo.')
        + (canFull() ? `<div class="set-row"><div class="grow"><b>Pantalla completa</b><small>Sin barras del navegador.</small></div>
             <button class="btn small" id="set-full">${isFull() ? 'Salir' : 'Activar'}</button></div>`
           : iosTip() ? `<div class="set-row"><div class="grow"><b>Pantalla completa</b><small>${esc(IOS_TIP)}</small></div></div>` : '');
    } else if (tab === 'ctl') {
      box.innerHTML = section('Ayudas de combate')
        + toggle('autoCycle', 'Rotación automática de movimientos (Auto)', 'Cambia solo al siguiente ataque disponible cuando el activo está recargándose (tecla C).')
        + section('En móvil o tablet')
        + `<p class="sub">Pon el dedo en cualquier parte y arrastra para moverte: el joystick aparece donde tocas. Toca un ataque de abajo, AUTO o DASH, y el botón de arriba a la derecha para pausar. Se juega en horizontal.</p>`
        + `<div class="set-row"><div class="grow"><b>Tamaño del joystick</b><small>Cuánto hay que arrastrar el dedo.</small></div></div>`
        + choice('stick', [[0.8, 'Pequeño'], [1, 'Normal'], [1.25, 'Grande']])
        + section('En PC')
        + `<div class="keys">
             <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o flechas</div><span>moverse</span>
             <div><kbd>Espacio</kbd> o <kbd>Shift</kbd></div><span>impulso / esquivar (invulnerable un instante)</span>
             <div><kbd>1</kbd>–<kbd>4</kbd> o clic en el icono</div><span>elegir ataque</span>
             <div><kbd>Q</kbd> / <kbd>E</kbd> / <kbd>Tab</kbd></div><span>ataque anterior / siguiente</span>
             <div><kbd>C</kbd></div><span>activar / desactivar rotación automática (AUTO)</span>
             <div><kbd>M</kbd></div><span>mostrar / ocultar minimapa radar</span>
             <div><kbd>Esc</kbd> o <kbd>P</kbd></div><span>pausa</span>
              <div><kbd>1</kbd>–<kbd>3</kbd> / <kbd>R</kbd></div><span>elegir o cambiar cartas al subir de nivel</span>
              ${G.DB && G.DB.isAdmin ? `<div><kbd>F2</kbd> o <kbd>\`</kbd></div><span>abrir / cerrar el Panel de Control Admin</span>` : ''}
            </div>`;
    } else if (tab === 'acc') {
      renderAccount(box);
    } else {
      box.innerHTML = `<div class="about-logo">PokéSurvivor</div><p class="sub center">Versión ${esc(VERSION)}</p>`
        + `<p class="sub">Juego de fans <b>gratuito y sin ánimo de lucro</b>: sin anuncios ni compras. Pokémon y sus personajes son propiedad de Nintendo, Creatures y GAME FREAK; este proyecto no está afiliado a ellos.</p>`
        + section('Créditos')
        + `<ul class="credits">
             <li><b>Sprites:</b> PMD SpriteCollab y sus artistas (CC BY-NC 4.0).</li>
             <li><b>Datos de los Pokémon:</b> PokéAPI.</li>
             <li><b>Música y sonidos:</b> originales, generados por el propio juego.</li>
             <li><b>Fuente:</b> Pixelify Sans (OFL).</li>
           </ul>`
        + `<div class="row wrap" style="justify-content:center;gap:8px">
             ${window.PS_PAGES ? `<a class="btn small" href="${G.I18n.lang === 'en' ? 'en/guide/' : 'guia/'}" target="_blank">Guía y preguntas</a>
             <a class="btn small" href="${G.I18n.lang === 'en' ? 'en/pokedex/' : 'pokedex/'}" target="_blank">Pokédex</a>` : ''}
             <button class="btn small" data-legal>Aviso legal y privacidad</button>
             <a class="btn small" href="contacto/" target="_blank" rel="noopener">Contacto</a>
             <a class="btn small" href="${REPO}" target="_blank" rel="noopener">Código (GitHub)</a>
           </div>`;
    }
    wire(box);
  }

  function renderAccount(box) {
    const st = G.DB.guest ? 'guest' : G.DB.syncState;
    const SYNC = { ok: 'Guardado en la nube', syncing: 'Guardando…', pending: 'Pendiente de subir (se sube al salir del juego)',
                   offline: 'Sin conexión: se subirá al volver', local: 'Guardado sólo en este navegador', guest: 'Invitado: guardado en este navegador' };
    const canAdmin = !!(G.DB && G.DB.isAdmin);
    const isAdm = canAdmin && !!(G.Admin && G.Admin.enabled);
    const adminBlock = canAdmin
      ? (section('Rol de Administrador (Admin)')
        + `<div class="set-row"><div class="grow"><b>Activar Rol Admin</b><small>Habilita el botón ADMIN y el Panel de Control Omnipotente (tecla F2).</small></div>
             <button class="btn small switch ${isAdm ? 'gold' : ''}" id="set-admin-role">${isAdm ? 'Sí' : 'No'}</button></div>`
        + (isAdm ? `<div class="row" style="margin-top:8px"><button class="btn small gold" id="set-open-admin">${G.Icons.html('crown', 14)} Abrir Panel de Control Admin (F2)</button></div>` : ''))
      : '';

    if (G.DB.guest) {
      box.innerHTML = section('Cuenta', 'Estás jugando como <b>invitado</b>: tu progreso se guarda en este navegador y se conservará si creas una cuenta o vinculas con Google.')
        + `<div class="row wrap" style="gap:8px">
             <button class="btn gold" id="set-login">Crear cuenta o entrar</button>
             ${G.DB.mode === 'cloud' ? `<button class="btn google" id="set-google-link">
               <svg class="g-ico" width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
               <span>Vincular con Google</span>
             </button>` : ''}
           </div><p class="note" id="set-msg"></p>`;
      return;
    }
    const nick = G.Social.me ? G.Social.me.name : (G.DB.user || '');
    const email = G.DB.email || '';
    const kind = G.DB.mode === 'local' ? 'Cuenta de este navegador' : G.DB.nameAccount ? 'Nombre y contraseña' : 'Google';
    box.innerHTML = section('Cuenta')
      + `<div class="set-row"><div class="grow"><b>Apodo</b><small>Tu nombre de entrenador en el juego.</small></div><span class="gold" translate="no">${esc(nick)}</span></div>`
      + (email ? `<div class="set-row"><div class="grow"><b>Correo Google</b></div><span translate="no">${esc(email)}</span></div>` : '')
      + `<div class="set-row"><div class="grow"><b>Tipo de cuenta</b></div><span>${esc(kind)}</span></div>`
      + `<div class="set-row"><div class="grow"><b>Partida</b><small>${esc(SYNC[st] || st)}</small></div>
           ${G.DB.mode === 'cloud' ? `<button class="btn small" id="set-sync-now">Sincronizar ahora</button>` : ''}</div>`
      + `<div class="row wrap" style="gap:8px;margin-top:12px">
           <button class="btn small" id="set-change-pass">Cambiar contraseña</button>
           <button class="btn small" id="set-logout">Cerrar sesión</button>
           <button class="btn small danger" id="set-delete">Borrar cuenta</button>
         </div><p class="note" id="set-msg"></p>`
      + adminBlock;
  }

  function openChangePassModal() {
    const el = document.createElement('section');
    el.className = 'scr dim';
    el.style.zIndex = 75;
    el.innerHTML = `<div class="box" style="max-width:390px;width:100%">
      <h3>Cambiar contraseña</h3>
      <p class="sub">Actualiza la contraseña de tu cuenta en la nube.</p>
      <label>Contraseña actual</label>
      <input class="field" id="cp-old" type="password" maxlength="64" placeholder="••••••••">
      <label>Nueva contraseña</label>
      <input class="field" id="cp-new" type="password" maxlength="64" placeholder="Mínimo 6 caracteres">
      <label>Confirmar nueva contraseña</label>
      <input class="field" id="cp-new2" type="password" maxlength="64" placeholder="Repite la nueva contraseña">
      <p class="err" id="cp-err"></p>
      <div class="row end" style="margin-top:12px">
        <button class="btn ghost" type="button" data-a="no">Cancelar</button>
        <button class="btn gold" type="button" data-a="yes">Guardar contraseña</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    if (G.I18n && G.I18n.walk) G.I18n.walk(el);
    const oldInp = el.querySelector('#cp-old');
    const newInp = el.querySelector('#cp-new');
    const new2Inp = el.querySelector('#cp-new2');
    const errEl = el.querySelector('#cp-err');
    const yesBtn = el.querySelector('[data-a=yes]');
    el.querySelector('[data-a=no]').onclick = () => el.remove();
    yesBtn.onclick = async () => {
      errEl.textContent = '';
      if (newInp.value !== new2Inp.value) {
        errEl.textContent = G.T('Las contraseñas no coinciden.');
        return;
      }
      yesBtn.disabled = true;
      const r = await G.DB.changePassword(oldInp.value, newInp.value);
      yesBtn.disabled = false;
      if (!r.ok) {
        errEl.textContent = r.error;
        return;
      }
      el.remove();
      G.UI.toast(G.T('Contraseña actualizada correctamente'));
    };
    setTimeout(() => oldInp.focus(), 50);
  }

  function wire(box) {
    box.querySelectorAll('.switch[data-k]').forEach(b => { b.onclick = () => { G.Settings.set(b.dataset.k, !G.Settings.get(b.dataset.k)); render(); }; });
    box.querySelectorAll('.chip[data-k]').forEach(b => {
      b.onclick = () => { const v = b.dataset.v; G.Settings.set(b.dataset.k, isNaN(+v) ? v : +v); render(); };
    });
    const full = $('set-full'); if (full) full.onclick = toggleFull;
    box.querySelectorAll('[data-lang]').forEach(b => { b.onclick = () => { if (b.dataset.lang !== G.I18n.lang) G.I18n.set(b.dataset.lang); }; });
    const admRole = $('set-admin-role');
    if (admRole && G.Admin && G.DB && G.DB.isAdmin) admRole.onclick = () => { G.Admin.setEnabled(!G.Admin.enabled); render(); };
    const admOpen = $('set-open-admin');
    if (admOpen && G.AdminUI && G.DB && G.DB.isAdmin) admOpen.onclick = () => { close(); G.AdminUI.open(); };
    const lo = $('set-login'); if (lo) lo.onclick = () => { close(); leave(); };
    const gLink = $('set-google-link');
    if (gLink) gLink.onclick = async () => {
      gLink.disabled = true;
      const r = await G.DB.loginWithGoogle();
      gLink.disabled = false;
      if (!r.ok) { if (r.error && $('set-msg')) $('set-msg').textContent = r.error; return; }
      G.UI.refreshCoins && G.UI.refreshCoins();
      G.UI.toast(G.T('Cuenta vinculada con Google'));
      render();
    };
    const syncBtn = $('set-sync-now');
    if (syncBtn) syncBtn.onclick = async () => {
      syncBtn.disabled = true;
      await G.DB.flush();
      syncBtn.disabled = false;
      G.UI.toast(G.T('Guardado en la nube'));
      render();
    };
    const chPass = $('set-change-pass');
    if (chPass) chPass.onclick = () => openChangePassModal();
    const out = $('set-logout'); if (out) out.onclick = () => { close(); leave(); };
    const del = $('set-delete');
    if (del) del.onclick = async () => {
      const ok = await G.UI.confirmDelete();
      if (!ok) return;
      del.disabled = true;
      const r = await G.DB.deleteAccount(ok.pass);
      if (!r.ok) { $('set-msg').textContent = r.error; del.disabled = false; return; }
      close();
      G.UI.toast('Cuenta borrada');
      G.Audio.music(null);
      G.Flow.toLogin();
    };
  }

  /** Cerrar sesión (si estás en una partida, se abandona). */
  function leave() {
    if (G.Game.state !== 'ui') G.Game.quit && G.Game.quit();
    G.Audio.music(null);
    G.DB.logout().then(() => G.Flow.toLogin());
  }

  return { init, open, close, get isOpen() { return isOpen(); } };
})();
