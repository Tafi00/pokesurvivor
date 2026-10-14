/* ============ login.js — inicio: entrar, crear cuenta, Google o invitado ============ */
G.LoginUI = (() => {
  const $ = G.UI.$;
  let mode = 'login';

  function init() {
    document.querySelectorAll('#scr-login .tab').forEach(t => {
      t.onclick = () => setMode(t.dataset.tab);
    });

    const eyeBtn = $('btn-eye');
    if (eyeBtn) {
      eyeBtn.onclick = () => {
        const p1 = $('f-pass'), p2 = $('f-pass2');
        const show = p1.type === 'password';
        p1.type = show ? 'text' : 'password';
        if (p2) p2.type = show ? 'text' : 'password';
        eyeBtn.textContent = show ? '🙈' : '👁';
      };
    }

    $('login-form').onsubmit = async e => {
      e.preventDefault();
      $('login-err').textContent = '';
      const uVal = ($('f-user').value || '').trim();
      const pVal = $('f-pass').value || '';
      const p2El = $('f-pass2');

      if (!uVal) {
        $('login-err').textContent = G.T('Escribe tu nombre o correo.');
        $('f-user').focus();
        return;
      }
      if (mode === 'register' && p2El && pVal !== p2El.value) {
        $('login-err').textContent = G.T('Las contraseñas no coinciden.');
        p2El.focus();
        return;
      }

      const remEl = $('f-remember');
      if (remEl && G.DB.fb && G.DB.fb.auth && G.DB.fb.auth.setPersistence) {
        await G.DB.fb.auth.setPersistence(remEl.checked ? 'local' : 'session');
      }

      $('btn-auth').disabled = true;
      const fn = mode === 'login' ? G.DB.login : G.DB.register;
      const r = await fn(uVal, pVal);
      $('btn-auth').disabled = false;
      if (!r.ok) { $('login-err').textContent = r.error; return; }
      $('f-pass').value = '';
      if (p2El) p2El.value = '';
      G.Flow.afterLogin();
    };

    $('btn-guest').onclick = () => { G.DB.playAsGuest(); G.Flow.afterLogin(); };
    $('btn-google').onclick = async () => {
      $('login-err').textContent = '';
      const remEl = $('f-remember');
      if (remEl && G.DB.fb && G.DB.fb.auth && G.DB.fb.auth.setPersistence) {
        await G.DB.fb.auth.setPersistence(remEl.checked ? 'local' : 'session');
      }
      $('btn-google').disabled = true;
      const r = await G.DB.loginWithGoogle();
      $('btn-google').disabled = false;
      if (!r.ok) {
        if (r.error) $('login-err').textContent = r.error;
        return;
      }
      G.Flow.afterLogin();
    };
  }

  /** Explica dónde se guarda la partida según el modo de la base de datos. */
  function modeNote() {
    if (G.DB.mode === 'cloud') return 'Tu partida se guarda en la nube: entra desde cualquier ordenador. Como invitado se guarda en este navegador.';
    const why = G.DB.localReason === 'file'
      ? 'Abierto desde un archivo: la partida sólo se guarda en este navegador. Para guardar en la nube, juega en la versión publicada.'
      : G.DB.localReason === 'config'
        ? 'Nube sin configurar: la partida sólo se guarda en este navegador.'
        : 'Modo local: tu partida (y el modo invitado) se guardan automáticamente en este navegador.';
    return why;
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('#scr-login .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === m));
    $('btn-auth').textContent = G.T(m === 'login' ? 'Entrar' : 'Crear cuenta');
    $('f-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    const wrap2 = $('wrap-pass2');
    if (wrap2) wrap2.classList.toggle('hidden', m !== 'register');
    const lblUser = $('lbl-user');
    if (lblUser) lblUser.textContent = G.T(m === 'login' ? 'Nombre o correo' : 'Nombre (3-16 letras o números)');
    $('f-user').maxLength = m === 'login' ? 64 : 16;
    $('f-user').placeholder = G.T(m === 'login' ? 'Tu apodo o correo' : 'Ej: Pikachu_99');
    $('login-err').textContent = '';
    if (m === 'register' && G.DB.mode === 'cloud' && G.Signups) G.Signups.check().then(applySignups);
  }

  /** Tope de cuentas del mes alcanzado: sin "Crear cuenta" hasta el mes siguiente. */
  function applySignups(open) {
    const reg = document.querySelector('#scr-login .tab[data-tab="register"]');
    if (reg) reg.classList.toggle('hidden', !open);
    if (!open && mode === 'register') setMode('login');
    const note = $('signup-closed');
    note.classList.toggle('hidden', open);
    if (!open) note.textContent = 'Este mes se han llenado las plazas de cuentas nuevas: vuelven el 1 de ' + G.Signups.nextMonthName() +
      '. Si ya tienes cuenta, entra normal. Si no, juega como invitado.';
    const gTxt = $('btn-google-txt') || $('btn-google');
    if (gTxt) gTxt.textContent = G.T(open ? 'Entrar con Google' : 'Entrar con Google (si ya tienes cuenta)');
  }

  function open() {
    G.UI.chrome(false);
    G.UI.show('scr-login');
    let lBar = $('login-langs');
    if (!lBar) {
      lBar = document.createElement('div');
      lBar.id = 'login-langs';
      lBar.className = 'seg login-langs';
      lBar.setAttribute('translate', 'no');
      const modeEl = $('login-mode');
      if (modeEl && modeEl.parentNode) modeEl.parentNode.insertBefore(lBar, modeEl);
    }
    lBar.innerHTML = [['vi', 'Tiếng Việt'], ['en', 'English'], ['es', 'Español']].map(([v, l]) =>
      `<button type="button" class="${G.I18n.lang === v ? 'on' : ''}" data-lang="${v}">${l}</button>`).join('');
    lBar.querySelectorAll('[data-lang]').forEach(b => {
      b.onclick = () => { if (b.dataset.lang !== G.I18n.lang) G.I18n.set(b.dataset.lang); };
    });

    if (G.DB.mode === 'cloud' && G.Signups) {
      if (G.Signups.closed) G.Signups.check().then(applySignups); else applySignups(true);
    }
    if (!G.DB.storageOk) $('login-err').textContent = 'Este navegador no deja guardar datos: juega como invitado.';
    $('btn-google').classList.toggle('hidden', G.DB.mode !== 'cloud');
    $('login-mode').textContent = G.T(modeNote());
    setTimeout(() => $('f-user').focus(), 50);
  }

  return { init, open };
})();

