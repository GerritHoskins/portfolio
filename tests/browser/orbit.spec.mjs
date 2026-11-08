import { test, expect } from '@playwright/test';

// Offline contract double reproduces the widget's public methods and named
// parts. Real media/provider acceptance remains a separate, explicit check.
const widget = `customElements.define('pixeltronic-avatar', class extends HTMLElement {
  state = 'off'; canAsk = false; messages = []; asks = []; micCount = 0;
  connectedCallback() {
    this.attachShadow({mode:'open'}).innerHTML = '<div part="stage"></div><div part="dialog" role="dialog" hidden><button id="cancel">Cancel</button><label>Pass key<input></label><button id="consent">Start with test consent</button></div><section part="panel"><div part="transcript"></div><p part="notice" hidden></p><p part="notice-error" hidden></p><button part="mic">Record</button><button part="send-recording" hidden>Send recording</button><button part="interrupt" hidden>Stop</button><button part="end-session">End</button></section>';
    this.shadowRoot.querySelector('#cancel').onclick = () => this.stop();
    this.shadowRoot.querySelector('#consent').onclick = () => { this.setState('connecting'); this.setState('ready'); };
    this.p('mic').onclick = () => { this.micCount++; this.setState('recording'); };
    this.p('send-recording').onclick = () => { this.micCount++; this.setState('transcribing'); };
    this.p('interrupt').onclick = () => this.setState('ready');
    this.p('end-session').onclick = () => this.setState('ended');
  }
  p(n) { return this.shadowRoot.querySelector('[part="'+n+'"]'); }
  setState(s) {
    this.state = s; this.canAsk = ['ready','speaking','recording','transcribing','textOnly','ending'].includes(s);
    this.p('dialog').hidden = s !== 'start';
    // The real widget leaves hidden panel controls unchanged in off/start.
    if (!['off','start'].includes(s)) this.p('mic').disabled = !this.canAsk;
    this.p('mic').hidden = s === 'recording';
    this.p('send-recording').hidden = s !== 'recording'; this.p('interrupt').hidden = s !== 'speaking';
    this.dispatchEvent(new Event('statechange'));
  }
  start() { this.setState('start'); }
  stop() { this.messages = []; this.renderLog(); this.setState('off'); }
  ask(t) { if(!this.canAsk) return false; this.asks.push(t); this.messages.push({role:'user', text:t}); this.setState('speaking'); this.renderLog(); return true; }
  reply(text, done=false) {
    if(this.messages.at(-1)?.role === 'avatar') this.messages.at(-1).text=text;
    else this.messages.push({role:'avatar',text});
    this.renderLog(); if(done) this.setState('ready');
  }
  renderLog() { this.p('transcript').replaceChildren(...this.messages.map(m=>{const d=document.createElement('div');d.setAttribute('part','message-'+m.role);d.textContent=m.text;return d;})); }
  fail(message) { const p=this.p('notice-error');p.textContent=message;p.hidden=false;this.setState('ready'); }
});`;

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL && !route.request().url().endsWith('/__preview/avatar.js') ? route.continue() : route.abort());
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.__errors = errors;
});
test.afterEach(async ({ page }) => expect(page.__errors).toEqual([]));
async function mockWidget(context) {
  await context.route('**/__preview/avatar.js', route => route.fulfill({ contentType: 'text/javascript', body: widget }));
}
async function activate(page) {
  await page.getByRole('button', { name: 'Start avatar', exact: true }).click();
  await page.getByRole('button', { name: 'Start with test consent' }).click();
}

test('composer hides its scrollbar until the draft exceeds its growing input', async ({ page }) => {
  await page.setViewportSize({ width: 1025, height: 768 });
  await page.goto('/');
  const input = page.locator('#question');
  const metrics = () => input.evaluate(el => ({
    height: el.clientHeight, content: el.scrollHeight, overflow: getComputedStyle(el).overflowY,
  }));
  for (const draft of ['', 'A short question', 'First line\nSecond line']) {
    await input.fill(draft);
    const size = await metrics();
    expect(size.overflow).toBe('hidden');
    expect(size.content).toBeLessThanOrEqual(size.height + 1);
  }
  expect((await metrics()).height).toBeGreaterThan(44);
  await input.fill(Array.from({ length: 12 }, (_, i) => `Draft line ${i + 1}`).join('\n'));
  const long = await metrics();
  expect(long.overflow).toBe('auto');
  expect(long.content).toBeGreaterThan(long.height);
  expect(long.height).toBeLessThanOrEqual(132);
  await input.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await input.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 394, height: 853 });
  await expect(input).toHaveCSS('overflow-y', 'auto');
  await input.fill('Short again');
  await expect(input).toHaveCSS('overflow-y', 'hidden');
  expect((await metrics()).height).toBe(44);
});

test('visible Start avatar opens access-code consent directly and restores focus on cancel', async ({ context, page }) => {
  await mockWidget(context);
  await page.goto('/');
  await page.getByRole('textbox').fill('Keep my draft');
  const start = page.getByRole('button', { name: 'Start avatar', exact: true });
  await expect(start).toBeVisible();
  await expect(page.locator('.identity #guide-info')).toBeVisible();
  await expect(page.locator('.orbit-bar #guide-info')).toHaveCount(0);
  await start.click();
  await expect(page.locator('pixeltronic-avatar [part="dialog"]')).toBeVisible();
  await expect(page.getByLabel('Pass key')).toBeVisible();
  await expect(page.locator('#guide-panel')).toBeHidden();
  expect(await page.locator('pixeltronic-avatar').evaluate(el => ({ state: el.state, asks: el.asks.length, recordings: el.micCount }))).toEqual({ state: 'start', asks: 0, recordings: 0 });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(start).toBeFocused();
  await expect(page.getByRole('textbox')).toHaveValue('Keep my draft');
});

test('avatar lock reflects confirmed session access, not code entry or connection attempts', async ({ context, page }) => {
  await mockWidget(context); await page.goto('/');
  const control = page.locator('#guide-info');
  const shackle = page.locator('#guide-lock-shackle');
  const closed = await shackle.getAttribute('d');
  await control.click();
  await page.getByLabel('Pass key').fill('not-yet-verified');
  await expect(control).toHaveAttribute('data-access', 'locked');
  const avatar = page.locator('pixeltronic-avatar');
  for (const state of ['connecting', 'wrongKey', 'expiredKey']) {
    await avatar.evaluate((el, state) => el.setState(state), state);
    await expect(control).toHaveAttribute('data-access', 'locked');
    await expect(shackle).toHaveAttribute('d', closed);
  }
  for (const state of ['ready', 'speaking', 'textOnly', 'recording']) {
    await avatar.evaluate((el, state) => el.setState(state), state);
    await expect(control).toHaveAttribute('data-access', 'unlocked');
    await expect(shackle).not.toHaveAttribute('d', closed);
  }
  for (const state of ['ended', 'lost', 'off']) {
    await avatar.evaluate((el, state) => el.setState(state), state);
    await expect(control).toHaveAttribute('data-access', 'locked');
    await expect(shackle).toHaveAttribute('d', closed);
  }
});

test('mobile portrait and switch share one consent-gated on/off control', async ({ context, page }) => {
  await mockWidget(context); await page.setViewportSize({width:413,height:915}); await page.goto('/');
  const control = page.getByRole('switch', {name:'Live avatar',exact:true});
  await expect(control).toHaveAttribute('aria-checked', 'false');
  const caption = await page.locator('.identity-caption').boundingBox();
  expect(caption.x).toBe(16); expect(caption.y).toBe(12);
  const track = await page.locator('.avatar-control').boundingBox();
  expect(Math.abs(track.x + track.width / 2 - 413 / 2)).toBeLessThan(1);
  const thumb = page.locator('.portrait-orbit');
  const off = await thumb.boundingBox();
  // The portrait is part of the same hit target, not a second tab stop.
  await page.mouse.click(off.x + off.width / 2, off.y + off.height / 2);
  await expect(page.locator('pixeltronic-avatar [part="dialog"]')).toBeVisible();
  await expect(control).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button',{name:'Start with test consent'}).click();
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#guide-indicator')).toHaveText('On');
  expect((await thumb.boundingBox()).x).toBeGreaterThan(off.x + 100);
  await page.getByRole('textbox').fill('Keep this draft');
  await control.press('Space');
  await expect(control).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#guide-indicator')).toHaveText('Off');
  await expect(page.getByRole('textbox')).toHaveValue('Keep this draft');
  expect(await page.locator('pixeltronic-avatar').evaluate(el=>el.state)).toBe('off');
  await page.setViewportSize({width:1440,height:900});
  await expect(page.getByRole('button',{name:'Start avatar',exact:true})).toBeVisible();
  await expect(page.locator('#guide-indicator')).toBeHidden();
});

test('Orbit fits fixed viewports in both themes with a usable transcript and composer', async ({ page }) => {
  await page.goto('/');
  for (const [width, height] of [[1440,900],[1024,768],[768,1024],[390,844],[320,640],[320,480],[844,390],[720,450]]) {
    await page.setViewportSize({ width, height });
    // visualViewport's resize event is delivered on the next browser frame.
    await expect.poll(() => page.evaluate(() => Math.round(document.body.getBoundingClientRect().height))).toBe(height);
    for (const dark of [false, true]) {
      await page.evaluate(d => { document.documentElement.dataset.theme = d ? 'dark' : ''; }, dark);
      const layout = await page.evaluate(() => {
        const box = id => { const r = document.querySelector(id).getBoundingClientRect(); return { top:r.top, bottom:r.bottom, height:r.height }; };
        return { w:document.documentElement.scrollWidth, h:document.documentElement.scrollHeight, input:box('#composer'), log:box('#transcript'), name:box('h1') };
      });
      expect(layout.w).toBeLessThanOrEqual(width); expect(layout.h).toBeLessThanOrEqual(height);
      expect(layout.input.bottom).toBeLessThanOrEqual(height); expect(layout.log.height).toBeGreaterThan(50);
      expect(layout.name.top).toBeGreaterThanOrEqual(0);
      await expect(page.getByRole('navigation')).toHaveCount(0);
    }
  }
});

test('orbits continue clockwise across reply completion and respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'What have you built?', exact: true })).toBeVisible();
  await page.evaluate(() => {
    // Keep start, sampling and stop in one task so a slow browser cannot finish
    // the typed reply before this regression exercises the busy-to-idle edge.
    document.querySelector('#suggestions button').click();
    window.orbits = [...document.querySelectorAll('.satellite-one, .satellite-two')].map(el => {
      const animation = el.getAnimations()[0];
      animation.pause(); animation.currentTime = 12000;
      const angle = () => { const m = new DOMMatrix(getComputedStyle(el).transform); return Math.atan2(m.b, m.a) * 180 / Math.PI; };
      const before = angle(); animation.currentTime = 13000;
      const turn = (angle() - before + 360) % 360;
      animation.currentTime = 12000;
      return { el, animation, turn, transform: getComputedStyle(el).transform };
    });
    document.querySelector('#stop').click();
  });
  expect(await page.evaluate(() => window.orbits.every(({el,animation,turn,transform}) =>
    el.getAnimations()[0] === animation && turn > 0 && turn < 15 && getComputedStyle(el).transform === transform))).toBe(true);
  await page.evaluate(() => { document.querySelector('#suggestions button').click(); document.querySelector('#stop').click(); });
  expect(await page.evaluate(() => window.orbits.every(({el,animation}) => el.getAnimations()[0] === animation))).toBe(true);
  await page.evaluate(() => window.orbits.forEach(({animation}) => animation.play()));
  await expect.poll(() => page.evaluate(() => window.orbits.every(({animation}) => animation.currentTime > 12000))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.locator('.rings').evaluate(el => el.getAnimations({subtree:true}).length)).toBe(0);
});

test('reply activity animates only the surrounding rings, with a still reduced-motion cue', async ({ context, page }) => {
  await mockWidget(context);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/');
  await expect(page.getByRole('button',{name:'What have you built?',exact:true})).toBeVisible();
  // Exercise local start/stop in one task so typing cannot finish before sampling.
  expect(await page.evaluate(() => {
    document.querySelector('#suggestions button').click();
    const writing = document.body.hasAttribute('data-writing');
    document.querySelector('#stop').click();
    return writing && !document.body.hasAttribute('data-writing');
  })).toBe(true);
  await activate(page);
  await page.getByRole('textbox').fill('A live question'); await page.getByRole('textbox').press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-writing', '');
  await expect(page.locator('.communication-ring')).toHaveCSS('opacity', '1');
  await expect(page.locator('.signal-wave').first()).toHaveCSS('animation-play-state', 'running');
  expect(await page.locator('.portrait-fallback').evaluate(el => ({transform:getComputedStyle(el).transform, animations:el.getAnimations({subtree:true}).length}))).toEqual({transform:'none',animations:0});
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(() => page.locator('.rings').evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
  await expect(page.locator('.signal-wave').first()).toHaveCSS('opacity', '0.65');
  await expect(page.locator('.communication-ring')).toHaveCSS('opacity', '1');
  for (const state of ['ready','recording','transcribing','off']) {
    await page.locator('pixeltronic-avatar').evaluate((el,state)=>el.setState(state),state);
    await expect(page.locator('body')).not.toHaveAttribute('data-writing');
    await expect(page.locator('.communication-ring')).toHaveCSS('opacity','0');
  }
});

test('mobile identity and scrolling history keep clear top and bottom space', async ({ page }) => {
  await page.setViewportSize({width:394,height:853}); await page.goto('/');
  await expect(page.locator('#avatar-status')).toHaveText('Fullstack Engineer, frontend focus');
  await page.getByRole('button', {name:'What have you built?',exact:true}).click();
  await page.getByRole('button', {name:'How can I reach you?',exact:true}).click();
  const measure = () => page.evaluate(() => {
    const rect = s => document.querySelector(s).getBoundingClientRect();
    return { top:rect('#transcript').top - rect('.identity').bottom,
      bottom:rect('.composer-area').top - rect('#transcript').bottom,
      identity:rect('.identity').height };
  });
  const before = await measure();
  expect(before.identity).toBeLessThan(180);
  expect(Math.round(before.top)).toBeGreaterThanOrEqual(24);
  expect(Math.round(before.bottom)).toBeGreaterThanOrEqual(24);
  await page.locator('#transcript').evaluate(el => { el.scrollTop = el.scrollHeight / 3; el.dispatchEvent(new Event('scroll')); });
  expect(await measure()).toEqual(before);
  await page.locator('#latest').click();
  const log = await page.locator('#transcript').boundingBox();
  const copy = await page.locator('.reply').last().getByRole('button',{name:'Copy',exact:true}).boundingBox();
  // scrollTop is rounded to device pixels; allow under one pixel of rounding.
  expect(copy.y + copy.height).toBeLessThanOrEqual(log.y + log.height - 15);
});

test('local answers preserve draft, accumulate history, and pause following while reading', async ({ page }) => {
  let widgetRequests = 0; page.on('request', r => { if (/\/(?:widget|__preview)\/avatar.js/.test(r.url())) widgetRequests++; });
  await page.setViewportSize({width:390,height:844}); await page.goto('/');
  await page.getByRole('textbox').fill('Keep this draft');
  await page.getByRole('button', {name:'What have you built?',exact:true}).click();
  await expect(page.getByRole('textbox')).toHaveValue('Keep this draft');
  await expect(page.locator('#transcript')).toContainText('charge-portal');
  await page.getByRole('button', {name:'Show the other projects',exact:true}).click();
  await expect(page.locator('#transcript')).toContainText('hushpush');
  await page.locator('#transcript').evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await expect(page.locator('#latest')).toBeVisible();
  await page.getByRole('button', {name:'Tell me about hushpush',exact:true}).click();
  expect(await page.locator('#transcript').evaluate(el=>el.scrollTop)).toBe(0);
  await page.locator('#latest').click(); await expect(page.locator('#latest')).toBeHidden();
  expect(widgetRequests).toBe(0);
});

test('Stop keeps only visible text, copy does not expose unseen text, retry keeps the draft', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(() => { window.copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText: async text=>window.copies.push(text)}}); });
  await page.goto('/');
  await page.getByRole('button', {name:'What have you built?',exact:true}).click();
  await expect(page.locator('.reply').last().locator('.reply-text')).toContainText('Two');
  await page.getByRole('button', {name:'Stop reply',exact:true}).click();
  const partial = await page.locator('.reply').last().locator('.reply-text').innerText();
  expect(partial).not.toContain('There are four more');
  await page.locator('.reply').last().getByRole('button',{name:'Copy',exact:true}).click();
  expect((await page.evaluate(()=>window.copies))[0].trim()).toBe(partial.trim());
  await page.getByRole('textbox').fill('Draft stays');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.getByRole('textbox')).toHaveValue('Draft stays');
  await expect(page.locator('.reply').last()).toContainText('There are four more', {timeout:12000});
});

test('clipboard denial selects text; panels restore focus and unknown questions stay honest', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied')}}}));
  await page.goto('/');
  await page.locator('.reply').getByRole('button',{name:'Copy',exact:true}).click();
  await expect(page.locator('#notice')).toContainText('selected');
  expect(await page.evaluate(()=>getSelection().toString())).toContain('Gerrit Hoskins');
  await page.getByRole('button',{name:'Privacy',exact:true}).click();
  await expect(page.getByRole('button',{name:'Close privacy'})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button',{name:'Privacy',exact:true})).toBeFocused();
  await page.getByRole('textbox').fill('<img src=x onerror=alert(1)>'); await page.getByRole('textbox').press('Enter');
  await expect(page.locator('.reply').last()).toContainText('I don’t have a prewritten answer');
  await expect(page.locator('#transcript img')).toHaveCount(0);
});

test('failed widget loading preserves a useful page and draft', async ({ page }) => {
  await page.goto('/'); await page.getByRole('textbox').fill('My question');
  await page.getByRole('button',{name:'Use voice',exact:true}).click();
  await expect(page.locator('#notice')).toContainText('could not be loaded');
  await expect(page.getByRole('textbox')).toHaveValue('My question');
  await page.getByRole('button',{name:'What have you built?',exact:true}).click();
  await expect(page.locator('#transcript')).toContainText('charge-portal');
});

test('privacy and live-session panels toggle when their button icon is clicked', async ({ context, page }) => {
  await mockWidget(context); await page.goto('/');
  for (const [buttonId, panelId] of [['privacy', 'privacy-panel'], ['guide-info', 'guide-panel']]) {
    if (buttonId === 'guide-info') await activate(page);
    const button = page.locator(`#${buttonId}`), panel = page.locator(`#${panelId}`);
    await button.locator('svg').click();
    await expect(panel).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await button.locator('svg').click();
    await expect(panel).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  }
});

test('assistive announcements include start and completion for repeated answers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#announcer')).toContainText('Hi, I’m Gerrit');
  await page.evaluate(() => {
    window.announced = [];
    const region = document.querySelector('#announcer');
    new MutationObserver(() => { if (region.textContent) window.announced.push(region.textContent); }).observe(region, {childList:true,subtree:true,characterData:true});
  });
  for (let i = 0; i < 2; i++) {
    await page.getByRole('textbox').fill('How can I reach you?');
    await page.getByRole('textbox').press('Enter');
    await expect.poll(() => page.evaluate(() => window.announced.filter(text => text.startsWith('Email works best:')).length)).toBe(i + 1);
  }
  expect(await page.evaluate(() => window.announced.filter(text => text === 'Reply started.').length)).toBe(2);
});

test('avatar consent is explicit, streamed replies are mirrored once, and teardown keeps history', async ({ context, page }) => {
  await mockWidget(context); await page.goto('/');
  await expect(page.locator('pixeltronic-avatar [part="dialog"]')).toHaveCount(0);
  await page.getByRole('textbox').fill('Draft');
  await page.getByRole('button',{name:'Use voice',exact:true}).click();
  await expect(page.locator('pixeltronic-avatar [part="dialog"]')).toBeVisible();
  expect(await page.locator('pixeltronic-avatar').evaluate(el=>el.micCount)).toBe(0);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('button',{name:'Use voice',exact:true})).toBeFocused();
  await activate(page);
  await page.getByRole('textbox').fill('A live question'); await page.getByRole('textbox').press('Enter');
  await page.locator('pixeltronic-avatar').evaluate(el=>el.reply('Partial response'));
  await expect(page.locator('#transcript')).toContainText('Partial response');
  await page.locator('pixeltronic-avatar').evaluate(el=>el.reply('Complete response with [unsafe](javascript:alert) and <script>bad</script>',true));
  await expect(page.locator('#transcript .user-message')).toHaveCount(1);
  await expect(page.locator('#transcript a[href^="javascript"]')).toHaveCount(0);
  await expect(page.locator('#transcript script')).toHaveCount(0);
  await page.getByRole('button',{name:'Live AI guide',exact:true}).click(); await page.getByRole('button',{name:'End live session',exact:true}).click();
  await expect(page.locator('#transcript')).toContainText('Complete response');
  await activate(page);
  await page.locator('pixeltronic-avatar').evaluate(el=>el.reply('Second session reply',true));
  await expect(page.locator('#transcript')).toContainText('Complete response');
  await expect(page.locator('#transcript')).toContainText('Second session reply');
});

test('voice uses native recording/send actions and live errors offer prewritten recovery', async ({context,page}) => {
  await mockWidget(context); await page.goto('/'); await activate(page);
  await page.getByRole('textbox').fill('Draft survives voice');
  await page.getByRole('button',{name:'Use voice',exact:true}).click();
  await expect(page.getByRole('button',{name:'Send voice recording'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Send voice recording'}).click();
  expect(await page.locator('pixeltronic-avatar').evaluate(el=>el.micCount)).toBe(2);
  await page.locator('pixeltronic-avatar').evaluate(el=>el.fail('Voice unavailable. Please type.'));
  await expect(page.getByRole('textbox')).toHaveValue('Draft survives voice');
  await expect(page.locator('#notice')).toContainText('Voice unavailable');
  await page.getByRole('textbox').fill('What have you built?'); await page.getByRole('textbox').press('Enter');
  await page.getByRole('textbox').fill('Next draft');
  await page.locator('pixeltronic-avatar').evaluate(el=>el.fail('Reply failed. Try again.'));
  await page.getByRole('button',{name:'Show prewritten answer'}).click();
  await expect(page.locator('#transcript')).toContainText('charge-portal');
  await expect(page.getByRole('textbox')).toHaveValue('Next draft');
});

test('no JavaScript still exposes the welcome, project and contact', async ({ browser, baseURL }) => {
  const context = await browser.newContext({javaScriptEnabled:false});
  await context.route('**/*', route=>new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  const page = await context.newPage(); await page.goto(baseURL);
  await expect(page.getByRole('link',{name:'public projects',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox')).toBeDisabled();
  await context.close();
});
