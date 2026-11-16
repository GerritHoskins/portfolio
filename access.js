// Theme toggle and access-request form for access.html. Kept external so the
// page's Content-Security-Policy needs no inline-script allowance beyond the
// hashed theme bootstrap in <head>.
(function () {
  var themeButton = document.getElementById('theme');
  function syncTheme() { themeButton.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'dark')); }
  themeButton.addEventListener('click', function () {
    var dark = document.documentElement.dataset.theme !== 'dark';
    if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('pxt-theme', dark ? 'dark' : 'light'); } catch (e) { /* The page still works without storage. */ }
    syncTheme();
  });
  syncTheme();
  themeButton.hidden = false;
})();
(function () {
  var API = 'https://avatar.pixeltronic.dev/api/access-request';
  var form = document.getElementById('request-form');
  var status = document.getElementById('status');
  var send = document.getElementById('f-send');
  var fields = document.getElementById('request-fields');
  var inFlight = false;
  var name = document.getElementById('f-name'), reply = document.getElementById('f-reply'), message = document.getElementById('f-message');
  var ICON = {
    err: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
    ok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>'
  };
  function show(kind, text) {
    status.className = 'status ' + kind; status.hidden = false;
    status.innerHTML = ICON[kind]; var s = document.createElement('span'); s.textContent = text; status.appendChild(s);
  }
  function mark(el, bad) { el.setAttribute('aria-invalid', bad ? 'true' : 'false'); }
  message.addEventListener('input', function () { document.getElementById('f-count').textContent = message.value.length + ' / 500'; });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (inFlight) return;
    var bad = [];
    if (!name.value.trim()) bad.push(name);
    if (reply.value.trim().length < 3) bad.push(reply);
    [name, reply].forEach(function (el) { mark(el, bad.indexOf(el) !== -1); });
    if (bad.length) { show('err', 'Please fill in your name and how I can reach you.'); bad[0].focus(); return; }
    inFlight = true; send.disabled = true; status.hidden = true; form.setAttribute('aria-busy', 'true');
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 15000);
    fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer',
      signal: controller.signal,
      body: JSON.stringify({ name: name.value.trim(), reply: reply.value.trim(), message: message.value.trim(), website: document.getElementById('f-website').value })
    }).then(function (response) {
      if (response.status === 429) { show('err', 'Too many requests from this connection. Please try again later.'); return; }
      if (!response.ok) { show('err', 'The request could not be sent. Please check the form and try again.'); return; }
      form.reset(); document.getElementById('f-count').textContent = '0 / 500';
      show('ok', 'Request sent. If it fits, you will get a pass key at the contact you gave.');
    }).catch(function (error) {
      show('err', error.name === 'AbortError'
        ? 'The server did not respond in time. Your request may have arrived. Please wait before trying again, or email me.'
        : 'The request could not be confirmed. Please check your connection or contact me by email.');
    }).finally(function () {
      clearTimeout(timeout); inFlight = false; send.disabled = false; form.removeAttribute('aria-busy');
    });
  });
  // The static fallback remains disabled if this script cannot initialize.
  if (typeof fetch === 'function' && typeof AbortController === 'function') {
    fields.disabled = false; send.disabled = false;
  }
})();
