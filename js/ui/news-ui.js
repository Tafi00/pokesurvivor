/* ============ news-ui.js — "Novedades" ============
 * Botón en la barra de arriba que abre la lista de cambios del juego
 * (js/data/changelog.js). Lleva un punto mientras haya algo que no has visto.
 */
G.NewsUI = (() => {
  const $ = G.UI.$;
  const KEY = 'ps.news.seen';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const latest = () => (G.CHANGELOG[0] || {}).d || '';
  function seen() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

  function init() {
    const b = $('btn-news');
    b.innerHTML = G.Icons.html('book', 18) + ' <span>Novedades</span><i class="dot"></i>';
    b.onclick = open;
    $('news-close').onclick = close;
    refresh();
  }
  function refresh() { $('btn-news').classList.toggle('new', seen() < latest()); }

  function fmt(d) {
    const [y, m, day] = d.split('-').map(Number);
    const loc = G.I18n.lang === 'vi' ? 'vi-VN' : G.I18n.lang === 'en' ? 'en-GB' : 'es-ES';
    return new Date(y, m - 1, day).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function open() {
    const lang = G.I18n.lang;
    const idx = lang === 'en' ? 1 : 0;
    const tr = s => lang === 'vi' ? G.I18n.t(s) : s;
    const PARTS = [
      ['new', { es: 'Nuevo', en: 'New', vi: 'Mới' }],
      ['chg', { es: 'Cambios', en: 'Changes', vi: 'Thay đổi' }],
      ['fix', { es: 'Arreglos', en: 'Fixes', vi: 'Sửa lỗi' }]
    ];
    $('news-body').innerHTML = G.CHANGELOG.map(v =>
      `<div class="news-day" translate="no"><h3>${esc(v.title ? (v.title[2] && lang === 'vi' ? v.title[2] : tr(v.title[idx])) : '')}<small>${fmt(v.d)}</small></h3>` +
      PARTS.filter(([k]) => v[k] && v[k].length).map(([k, lbl]) =>
        `<div class="news-part"><span class="news-tag ${k}">${lbl[lang] || lbl.en}</span><ul>${v[k].map(t => `<li>${esc(t[2] && lang === 'vi' ? t[2] : tr(t[idx]))}</li>`).join('')}</ul></div>`).join('') +
      '</div>').join('');
    $('news-body').scrollTop = 0;
    $('scr-news').classList.remove('hidden');
    try { localStorage.setItem(KEY, latest()); } catch (e) { /* nada */ }
    refresh();
  }
  function close() { $('scr-news').classList.add('hidden'); }

  return { init, open, close };
})();
