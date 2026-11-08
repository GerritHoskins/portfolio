import { TITLE, INTRO, INTRO_NEXT, A, match } from './portfolio-content.js';
import { AvatarAdapter } from './avatar-adapter.js';

const $ = selector => document.querySelector(selector);
const log = $('#transcript'), input = $('#question'), suggestions = $('#suggestions');
const announcer = $('#announcer'), notice = $('#notice');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobileAvatar = matchMedia('(max-width: 599px)');
let following = true, lastScroll = 0, timer, localReply, busy = false, live = null, lastQuestion = '', opening = false;
let panel, panelOpener, guideOpener, previousState = 'off', announcementTimer;
const announcements = [];
const liveMessages = new Map();
const activeStates = ['connecting', 'ready', 'recording', 'transcribing', 'speaking', 'ending', 'textOnly'];
const icons = {
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  check: '<path d="m5 12 4.5 5 9.5-10"/>',
  retry: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/>',
};
function deliverAnnouncement() {
  if (!announcements.length) { announcementTimer = null; return; }
  // Separate live-region updates so reduced-motion replies and repeated answers
  // still expose both their start and completion to assistive technology.
  announcer.textContent = '';
  announcementTimer = setTimeout(() => {
    announcer.textContent = announcements.shift();
    announcementTimer = setTimeout(deliverAnnouncement, 150);
  }, 30);
}
function announce(text) { announcements.push(text); if (!announcementTimer) deliverAnnouncement(); }
function showNotice(text) { notice.textContent = text; notice.hidden = !text; }
function action(label, icon, callback) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'quiet-button';
  if (icon) button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[icon]}</svg>`;
  const span = document.createElement('span'); span.textContent = label; button.append(span);
  button.addEventListener('click', callback); return button;
}

// Parse only inline links. Everything else, including model output, is text.
// No raw HTML, active URLs, or arbitrary markup is inserted into the transcript.
function renderText(target, text) {
  target.replaceChildren();
  for (const paragraph of text.split('\n\n')) {
    const p = document.createElement('p');
    const links = /\[([^\]]+)\]\(([^)]+)\)/g;
    let end = 0, m;
    while ((m = links.exec(paragraph))) {
      p.append(paragraph.slice(end, m.index));
      let safe = false;
      try { const url = new URL(m[2]); safe = ['https:', 'mailto:'].includes(url.protocol); } catch { /* Keep an invalid link as text. */ }
      if (safe) {
        const link = document.createElement('a'); link.textContent = m[1]; link.href = m[2];
        if (!m[2].startsWith('mailto:')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        p.append(link);
      } else p.append(m[1]);
      end = links.lastIndex;
    }
    p.append(paragraph.slice(end)); target.append(p);
  }
}

function scrollLatest() { log.scrollTop = log.scrollHeight; lastScroll = log.scrollTop; following = true; updateScrollCue(); }
function updateScrollCue() {
  $('.log-wrap').toggleAttribute('data-clipped', log.scrollTop > 2);
  $('#latest').hidden = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
}
function afterText() { if (following) scrollLatest(); else updateScrollCue(); }
log.addEventListener('scroll', () => {
  if (log.scrollTop < lastScroll - 3) following = false;
  if (log.scrollHeight - log.scrollTop - log.clientHeight < 20) following = true;
  lastScroll = log.scrollTop; updateScrollCue();
});
log.addEventListener('wheel', e => { if (e.deltaY < 0) following = false; }, { passive: true });
log.addEventListener('keydown', e => { if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) following = false; });
$('#latest').addEventListener('click', scrollLatest);

function createReply(kind, question = '') {
  announce(kind === 'welcome' ? 'Introduction started.' : 'Reply started.');
  const article = document.createElement('article'); article.className = 'reply';
  const note = document.createElement('div'); note.className = 'reply-note';
  note.textContent = kind === 'live' ? 'Live AI guide' : 'Prewritten answer';
  if (kind !== 'welcome') article.append(note);
  const text = document.createElement('div'); text.className = 'reply-text'; article.append(text);
  const actions = document.createElement('div'); actions.className = 'reply-actions'; article.append(actions);
  const reply = { article, text, note, actions, question, kind, shown: '', complete: false };
  const copy = action('Copy', 'copy', async () => {
    const visible = [...text.querySelectorAll('p')].map(p => p.textContent).join('\n\n');
    try {
      await navigator.clipboard.writeText(visible);
      copy.querySelector('svg').innerHTML = icons.check; copy.querySelector('span').textContent = 'Copied'; announce('Reply copied.');
    } catch {
      const range = document.createRange(); range.selectNodeContents(text);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      showNotice('Couldn’t copy automatically. The reply is selected. Use your device’s Copy command.');
    }
  });
  copy.hidden = true; reply.copy = copy; actions.append(copy);
  log.append(article); return reply;
}
function showReply(reply, text, done = false) {
  if (reply.shown !== text) { renderText(reply.text, text); reply.shown = text; }
  reply.article.setAttribute('aria-busy', String(!done));
  reply.copy.hidden = !text;
  if (done && !reply.complete) { reply.complete = true; announce(reply.text.textContent); }
  afterText();
}
function userMessage(text) { const p = document.createElement('p'); p.className = 'user-message'; p.textContent = text; p.setAttribute('aria-label', 'Your question'); log.append(p); afterText(); return p; }
function setSuggestions(questions) {
  suggestions.replaceChildren(...questions.map(q => action(q, null, () => ask(q, false))));
}
function updateControls() {
  busy = Boolean(localReply || live?.state === 'speaking' || live?.state === 'transcribing');
  document.body.toggleAttribute('data-busy', busy || live?.state === 'recording');
  document.body.toggleAttribute('data-writing', Boolean(localReply || live?.state === 'speaking'));
  $('#send').hidden = busy; $('#stop').hidden = !busy;
  $('#send').disabled = !input.value.trim() || Boolean(live && activeStates.includes(live.state) && !live.canAsk);
  suggestions.hidden = busy || live?.state === 'recording';
  $('#voice').disabled = opening || busy || Boolean(live && activeStates.includes(live.state) && !live.canRecord);
  $('#voice').setAttribute('aria-pressed', String(live?.state === 'recording'));
  $('#voice').setAttribute('aria-label', live?.state === 'recording' ? 'Send voice recording' : 'Use voice');
  $('#end-guide').hidden = !live || !activeStates.includes(live.state);
  $('#start-guide').hidden = Boolean(live && activeStates.includes(live.state));
  $('#guide-info').disabled = opening;
  syncAvatarControl();
  if (!live || !activeStates.includes(live.state)) $('#avatar-status').textContent = localReply ? (localReply.kind === 'welcome' ? 'Introducing…' : 'Replying…') : defaultSubtitle();
}
function defaultSubtitle() { return TITLE; }
function syncAvatarControl() {
  const control = $('#guide-info'), admitted = Boolean(live?.canAsk);
  $('.avatar-control').dataset.access = admitted ? 'unlocked' : 'locked';
  $('#guide-indicator').textContent = opening ? 'Loading…' : live?.state === 'connecting' && !admitted ? 'Connecting…' : admitted ? 'On' : 'Off';
  if (mobileAvatar.matches) {
    control.setAttribute('role', 'switch');
    control.setAttribute('aria-label', 'Live avatar');
    control.setAttribute('aria-checked', String(admitted));
    control.removeAttribute('aria-expanded');
    control.removeAttribute('aria-controls');
    control.removeAttribute('aria-haspopup');
    $('#guide-label').textContent = admitted ? 'Avatar on' : live?.state === 'connecting' ? 'Connecting…' : 'Start avatar';
    control.title = admitted ? 'Turn off the avatar' : 'Enter your access code to start the avatar';
  } else {
    control.removeAttribute('role'); control.removeAttribute('aria-label'); control.removeAttribute('aria-checked');
    control.setAttribute('aria-haspopup', 'dialog');
    control.setAttribute('aria-expanded', String(panel === $('#guide-panel') || Boolean(live?.dialogOpen)));
    const active = live && activeStates.includes(live.state);
    if (active) control.setAttribute('aria-controls', 'guide-panel'); else control.removeAttribute('aria-controls');
    control.title = active ? 'Live avatar session details' : 'Enter your access code to start the avatar';
    $('#guide-label').textContent = active ? 'Live AI guide' : 'Start avatar';
  }
}
function addRetry(reply) {
  if (reply.retry || !reply.question) return;
  reply.retry = action('Retry', 'retry', () => ask(reply.question, false)); reply.actions.append(reply.retry);
}
function stopLocal() {
  if (!localReply) return;
  clearTimeout(timer);
  const reply = localReply; localReply = null;
  showReply(reply, reply.shown, true); reply.note.textContent = 'Stopped. The partial reply is kept.';
  if (!reply.note.isConnected) reply.article.prepend(reply.note);
  addRetry(reply); setSuggestions(INTRO_NEXT); updateControls();
}
function typeReply(text, kind, question, next) {
  stopLocal();
  const reply = createReply(kind, question); localReply = reply;
  // Links enter as a whole; copying a stopped reply cannot reveal unseen words.
  const tokens = text.match(/\[[^\]]+\]\([^)]+\)|\s+|[^\s[]+|\[/g) || [];
  let at = 0;
  const tick = () => {
    if (localReply !== reply) return;
    at = reduced.matches ? tokens.length : Math.min(tokens.length, at + 2);
    const done = at === tokens.length;
    showReply(reply, tokens.slice(0, at).join(''), done);
    if (done) { localReply = null; setSuggestions(next); updateControls(); }
    else timer = setTimeout(tick, 24);
  };
  tick(); updateControls();
}
function resizeInput() {
  // Measure at full width before deciding whether a scrollbar is needed.
  input.style.overflowY = 'hidden';
  input.style.height = '44px';
  input.style.height = `${Math.min(input.scrollHeight, document.body.hasAttribute('data-keyboard') ? 72 : 132)}px`;
  input.style.overflowY = input.scrollHeight > input.clientHeight + 1 ? 'auto' : 'hidden';
}
function ask(question, fromInput) {
  question = question.trim().slice(0, 2000);
  if (!question || busy) return;
  showNotice(''); $('#recovery').hidden = true;
  lastQuestion = question;
  if (live && activeStates.includes(live.state)) {
    if (!adapter.ask(question)) { showNotice('The guide is not ready yet. Your draft is kept.'); return; }
  } else {
    userMessage(question);
    const answer = A[match(question)]; typeReply(answer.t, 'curated', question, answer.next);
  }
  if (fromInput) { input.value = ''; resizeInput(); }
  updateControls();
}

function onSnapshot(snapshot) {
  live = snapshot;
  const state = snapshot.state;
  for (let i = 0; i < snapshot.messages.length; i++) {
    const m = snapshot.messages[i], key = `${snapshot.session}:${i}`;
    let entry = liveMessages.get(key);
    if (!entry) {
      entry = m.role === 'user' ? { user: userMessage(m.text) } : createReply('live', lastQuestion);
      liveMessages.set(key, entry);
    }
    if (entry.user) { entry.user.textContent = m.text; lastQuestion = m.text; }
    else showReply(entry, m.text, state !== 'speaking' && state !== 'transcribing');
  }
  const active = activeStates.includes(state);
  // canAsk becomes true only once the admitted session can accept questions.
  // Opening consent or merely submitting a key must not imply access.
  const access = snapshot.canAsk ? 'unlocked' : 'locked';
  if ($('#guide-info').dataset.access !== access) {
    $('#guide-info').dataset.access = access;
    $('#guide-lock-shackle').setAttribute('d', snapshot.canAsk ? 'M8 10V7a4 4 0 0 1 7.5-2' : 'M8 10V7a4 4 0 0 1 8 0v3');
  }
  $('#guide-label').textContent = active ? 'Live AI guide' : 'Start avatar';
  if (active) $('#guide-info').setAttribute('aria-controls', 'guide-panel');
  else {
    $('#guide-info').removeAttribute('aria-controls');
    $('#guide-info').setAttribute('aria-expanded', String(snapshot.dialogOpen));
  }
  $('#guide-info').title = active ? 'Live avatar session details' : 'Enter your access code to start the avatar';
  $('#input-hint').textContent = state === 'recording' ? 'Recording. Tap the microphone to send.' : active ? 'Live AI answers can be wrong. Avoid private information.' : 'Prewritten answers. Optional live AI guide.';
  const status = { connecting: 'Connecting…', ready: 'Live AI guide', speaking: 'Speaking', recording: 'Listening', transcribing: 'Transcribing…', ending: 'Session ending soon', textOnly: 'Live guide · video unavailable', ended: 'Session ended', lost: 'Connection lost' };
  $('#avatar-status').textContent = status[state] || defaultSubtitle();
  const failed = state === 'lost' || Boolean(snapshot.notice && /fail|couldn.t|unavailable|went wrong/i.test(snapshot.notice) && !/voice|mic|speech/i.test(snapshot.notice));
  if (snapshot.notice) showNotice(snapshot.notice);
  else if (state !== previousState) {
    if (state === 'lost') showNotice('The guide connection was lost. Your history and draft are kept. You can use prewritten answers or start again.');
    else if (state === 'ended') showNotice('The live session has ended. Your history stays here, and prewritten answers are available.');
    else if (state === 'off' && previousState !== 'off') showNotice('The live guide is off. Your history and draft are kept.');
    else showNotice('');
  }
  $('#recovery').hidden = !failed || !lastQuestion;
  if (previousState !== state && state === 'off' && ['start', 'wrongKey', 'expiredKey', 'busy'].includes(previousState)) requestAnimationFrame(() => guideOpener?.focus());
  // Native consent remains modal; keep the custom transcript out of its tab order.
  for (const el of [$('.orbit-bar'), $('.orbit-main')]) {
    // The avatar owns the dialog inside main, so only its sibling region can be inert.
    if (el.classList.contains('orbit-bar')) el.inert = snapshot.dialogOpen;
  }
  $('.conversation').inert = snapshot.dialogOpen;
  $('#guide-info').inert = snapshot.dialogOpen;
  previousState = state; updateControls();
}
const adapter = new AvatarAdapter($('pixeltronic-avatar'), onSnapshot, () => input.focus({ preventScroll: true }));
async function startGuide(opener) {
  if (opening) return;
  stopLocal(); guideOpener = opener; closePanel(false);
  opening = true; showNotice('Loading the optional guide…'); updateControls();
  try { await adapter.start(); }
  catch (error) { showNotice(`${error.message} You can still explore the prewritten answers.`); guideOpener?.focus(); }
  finally { opening = false; updateControls(); }
}
$('#start-guide').addEventListener('click', () => startGuide($('#guide-info')));
$('#end-guide').addEventListener('click', () => { adapter.stop(); closePanel(); });
$('#voice').addEventListener('click', () => {
  if (live?.canRecord) { showNotice(''); if (!adapter.voice()) showNotice('Voice is unavailable. You can still type.'); }
  else startGuide($('#voice'));
});
$('#stop').addEventListener('click', () => {
  if (localReply) stopLocal();
  else if (!adapter.interrupt()) { adapter.stop(); showNotice('The guide was stopped. Your partial reply and draft are kept.'); }
  for (const reply of liveMessages.values()) if (!reply.user && reply.question) addRetry(reply);
  updateControls();
});
$('#retry-live').addEventListener('click', () => {
  if (live?.canAsk) ask(lastQuestion, false);
  else startGuide($('#guide-info'));
});
$('#curated').addEventListener('click', () => { adapter.stop(); const answer = A[match(lastQuestion)]; typeReply(answer.t, 'curated', lastQuestion, answer.next); $('#recovery').hidden = true; showNotice(''); });
$('#composer').addEventListener('submit', event => { event.preventDefault(); ask(input.value, true); });
input.addEventListener('input', () => { resizeInput(); updateControls(); });
input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); ask(input.value, true); } });

function closePanel(restore = true) {
  if (!panel) return;
  panel.hidden = true; panelOpener.setAttribute('aria-expanded', 'false'); panel = null;
  if (restore) panelOpener.focus();
}
function togglePanel(next, opener) {
  const same = panel === next; closePanel(false);
  if (same) { opener.focus(); return; }
  panel = next; panelOpener = opener; panel.hidden = false; opener.setAttribute('aria-expanded', 'true'); panel.querySelector('.close-panel').focus();
}
$('#guide-info').addEventListener('click', event => {
  if (mobileAvatar.matches && live && activeStates.includes(live.state)) { adapter.stop(); closePanel(false); }
  else if (live && activeStates.includes(live.state)) togglePanel($('#guide-panel'), event.currentTarget);
  else startGuide(event.currentTarget);
});
$('#privacy').addEventListener('click', event => togglePanel($('#privacy-panel'), event.currentTarget));
document.querySelectorAll('.close-panel').forEach(button => button.addEventListener('click', () => closePanel()));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && panel) { event.preventDefault(); closePanel(); } });
document.addEventListener('pointerdown', event => { if (panel && !panel.contains(event.target) && !panelOpener.contains(event.target)) closePanel(false); });
const themeButton = $('#theme');
function syncTheme() { themeButton.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'dark')); }
themeButton.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('pxt-theme', dark ? 'dark' : 'light'); } catch { /* The page still works without storage. */ }
  syncTheme();
});
syncTheme();
function centerMobileAvatar() {
  if (!mobileAvatar.matches) return;
  const control = $('.avatar-control');
  const box = control.getBoundingClientRect();
  const caption = $('.identity-caption').getBoundingClientRect();
  const currentOffset = parseFloat(control.style.getPropertyValue('--avatar-center-offset')) || 0;
  const targetTop = (caption.bottom + log.getBoundingClientRect().top - box.height) / 2;
  control.style.setProperty('--avatar-center-offset', `${targetTop - box.top + currentOffset}px`);
}
// Keep equal visual gaps even when the title wraps or the keyboard resizes chat.
const avatarSpacing = new ResizeObserver(centerMobileAvatar);
avatarSpacing.observe($('.identity-caption'));
avatarSpacing.observe(log);
function viewport() {
  const view = window.visualViewport;
  document.body.style.setProperty('--viewport-height', `${view?.height || innerHeight}px`);
  document.body.toggleAttribute('data-keyboard', Boolean(view && innerHeight - view.height > 100));
  if (!busy && (!live || !activeStates.includes(live.state))) $('#avatar-status').textContent = defaultSubtitle();
  resizeInput(); afterText();
  syncAvatarControl();
}
window.visualViewport?.addEventListener('resize', viewport);
window.addEventListener('resize', viewport);
function syncPageVisibility() { document.body.toggleAttribute('data-page-hidden', document.hidden); }
document.addEventListener('visibilitychange', syncPageVisibility);
syncPageVisibility();
mobileAvatar.addEventListener('change', () => { if (mobileAvatar.matches) closePanel(false); syncAvatarControl(); });
window.addEventListener('pagehide', () => { clearTimeout(timer); clearTimeout(announcementTimer); announcements.length = 0; adapter.stop(); });
$('.portrait-fallback img').addEventListener('error', event => { event.target.hidden = true; });
input.disabled = false; $('#voice').disabled = false;
$('#welcome').remove();
typeReply(INTRO, 'welcome', '', INTRO_NEXT);
viewport();
