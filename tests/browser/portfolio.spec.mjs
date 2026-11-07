import { test, expect } from '@playwright/test';

const widths = [320, 390, 641, 768, 1024, 1440];

function tab(page, browserName, reverse = false) {
  // WebKit's macOS defaults omit links on plain Tab. Option/Alt+Tab
  // enables link traversal, as documented by the Playwright maintainers:
  // https://github.com/microsoft/playwright/issues/5609#issuecomment-832750880
  const modifiers = browserName === 'webkit' && process.platform === 'darwin' ? ['Alt'] : [];
  if (reverse) modifiers.push('Shift');
  return page.keyboard.press([...modifiers, 'Tab'].join('+'));
}

test.beforeEach(async ({ context, page, baseURL }) => {
  // Default deny: tests never depend on, submit to, or pay for external services.
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL
    ? route.continue() : route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.__runtimeErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.__runtimeErrors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`${theme}: all pages fit phone, tablet and desktop widths`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('pxt-theme', value), theme);
    for (const path of ['/', '/access.html', '/privacy.html']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      for (const width of widths) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} at ${width}`).toBeLessThanOrEqual(width);
      }
    }
  });
}

for (const width of [390, 1440]) {
  test(`skip link is visible above the header and moves focus at ${width}px`, async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows WebKit omits anchors from keyboard traversal; required on Linux CI.');
    await page.setViewportSize({ width, height: 844 });
    for (const [path, firstTarget] of [['/', '.hero-actions a'], ['/access.html', '#f-name'], ['/privacy.html', 'main a']]) {
      await page.goto(path);
      await tab(page, browserName);
      const skip = page.getByRole('link', { name: 'Skip to content' });
      await expect(skip).toBeFocused();
      expect(await skip.evaluate(element => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.locator('main')).toBeFocused();
      await tab(page, browserName);
      await expect(page.locator(firstTarget).first()).toBeFocused();
    }
  });
}

test('mobile disclosure closes when keyboard focus leaves, on Escape, navigation and resize', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows WebKit omits anchors from keyboard traversal; required on Linux CI.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.locator('.nav-toggle');
  const header = page.locator('.site-header');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // Traverse the real tab order rather than directly focusing the destination.
  for (let i = 0; i < 8; i++) {
    await tab(page, browserName);
    if (!await header.evaluate(element => element.contains(document.activeElement))) break;
  }
  await expect(page.getByRole('link', { name: 'View my work' })).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.locator('.wordmark').focus();
  await tab(page, browserName, true);
  await expect(page.locator('.skip-link')).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.getByRole('navigation').getByRole('link', { name: 'Selected work' }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('mobile menu remains usable at short viewport heights', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 300 });
  await page.goto('/');
  await page.locator('.nav-toggle').click();
  const last = page.getByRole('navigation').getByRole('link', { name: 'GitHub profile' });
  await last.focus();
  expect(await last.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight;
  })).toBe(true);
});

test('theme choice survives reload and remains accessible with unavailable storage', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Dark theme' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } }));
  await page.reload();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

// Compute rendered foreground/background contrast, including translucent cards.
// Skip decorative artwork and disabled controls, which carry no required content.
test('content text meets contrast and essential metadata has a readable size in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.goto('/');
    await page.evaluate(value => localStorage.setItem('pxt-theme', value), theme);
    for (const path of ['/', '/access.html', '/privacy.html']) {
      await page.goto(path);
      if (theme === 'dark') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      else await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const failures = await page.evaluate(() => {
          const rgba = color => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
            return [r, g, b, a / 255];
          };
          const over = (fg, bg) => fg.slice(0, 3).map((channel, i) => channel * fg[3] + bg[i] * (1 - fg[3])).concat(1);
          const background = element => {
            const chain = []; for (let node = element; node; node = node.parentElement) chain.unshift(node);
            return chain.reduce((color, node) => over(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255, 1]);
          };
          const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
            .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
          const failures = [];
          for (const element of document.querySelectorAll('body *')) {
            if (element.closest('[aria-hidden="true"], .sr-only, .skip-link, .project-visual, :disabled') || !element.checkVisibility()) continue;
            if (![...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) continue;
            const style = getComputedStyle(element);
            const bg = background(element), fg = over(rgba(style.color), bg);
            const a = luminance(fg), b = luminance(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            const size = parseFloat(style.fontSize);
            const required = size >= 24 || size >= 18.66 && parseFloat(style.fontWeight) >= 700 ? 3 : 4.5;
            if (ratio + .02 < required) failures.push({ text: element.textContent.trim().slice(0, 50), ratio: +ratio.toFixed(2), required });
            if (size < 12 && !element.closest('.orbit-center')) failures.push({ text: element.textContent.trim().slice(0, 50), size });
          }
          return failures;
        });
        expect(failures, `${theme} ${path} ${width}px`).toEqual([]);
      }
    }
  }
});

test('local links and the privacy notice work without the optional guide', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#guide-cta')).toBeHidden();
  await expect(page.locator('.now-strip')).toContainText('Building fullstack TypeScript');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy.html$/);
  await expect(page.locator('h1')).toHaveText('Privacy information');
  await page.getByRole('link', { name: 'Back to portfolio' }).click();
  await expect(page.locator('h1')).toContainText('I build digital products');
});

test('guide state integration and narrow-panel layout work with an offline widget contract', async ({ context, page }) => {
  await context.route('https://avatar.pixeltronic.dev/widget/avatar.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `customElements.define('pixeltronic-avatar', class extends HTMLElement {
      state = 'off';
      setState(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
      start() { this.setAttribute('data-panel', ''); }
      playIntro() { this.dataset.introPlayed = 'true'; }
      ask(question) { this.dataset.question = question; }
    });`,
  }));
  await page.goto('/');
  const avatar = page.locator('pixeltronic-avatar');
  const cta = page.locator('#guide-cta');
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(avatar).toHaveAttribute('data-panel', '');
  for (const [state, mode] of [['connecting', 'connecting'], ['ready', 'live'], ['textOnly', 'dim'], ['ended', 'dim'], ['lost', 'dim']]) {
    await avatar.evaluate((element, value) => element.setState(value), state);
    await expect(page.locator('.hero')).toHaveAttribute('data-guide', mode);
  }
  await avatar.evaluate(element => element.setState('ready'));
  await page.getByRole('button', { name: 'Web', exact: true }).click();
  await expect(avatar).toHaveAttribute('data-question', 'Tell me about your web development experience.');
  await cta.click();
  await expect(avatar).toHaveAttribute('data-intro-played', 'true');
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.locator('.now-strip')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await avatar.evaluate(element => element.removeAttribute('data-panel'));
  await expect(page.locator('.now-strip')).toBeVisible();
});
