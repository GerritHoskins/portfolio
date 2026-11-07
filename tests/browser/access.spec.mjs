import { test, expect } from '@playwright/test';

const api = 'https://avatar.pixeltronic.dev/api/access-request';
const details = { name: 'Audit Visitor', reply: 'audit@example.invalid', message: 'A synthetic guide question.' };

test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL).origin;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.abort());
});

async function fillRequest(page) {
  await page.getByLabel('Your name', { exact: true }).fill(details.name);
  await page.getByLabel('How can I reach you?').fill(details.reply);
  await page.getByLabel('What would you like to ask the guide?').fill(details.message);
}

async function mockApi(context, handler) {
  // Registered after the deny-by-default route. No request reaches the live API.
  await context.route(api, async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    await handler(route);
  });
}

const cors = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

async function respond(route, status = 202) {
  await route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps all request controls disabled and offers a usable contact fallback', async ({ page }) => {
    await page.goto('/access.html');
    await expect(page.getByLabel('Your name', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('How can I reach you?')).toBeDisabled();
    await expect(page.getByLabel('What would you like to ask the guide?')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled();
    // Playwright's text selector skips noscript subtrees, even when the browser
    // parses and displays them with JavaScript disabled. Inspect the real paragraph.
    await expect(page.locator('noscript p')).toBeVisible();
    await expect(page.locator('noscript p')).toHaveText('JavaScript is required to send this form. You can request access by email instead.');
    await expect(page.getByRole('link', { name: 'contact@pixeltronic.dev' })).toHaveAttribute('href', 'mailto:contact@pixeltronic.dev');
    await expect(page.getByRole('link', { name: 'privacy information' })).toHaveAttribute('href', '/privacy.html');
    await page.keyboard.press('Enter');
    expect(new URL(page.url()).search).toBe('');
  });

  test('the native form fallback never puts contact details in the URL', async ({ page }) => {
    let nativeSubmission;
    await page.route('**/access.html', async route => {
      if (route.request().method() === 'POST') {
        nativeSubmission = route.request();
        await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Synthetic POST accepted.' });
      } else await route.fallback();
    });
    await page.goto('/access.html');
    await expect(page.locator('#request-form')).toHaveAttribute('method', 'post');
    // Exercise the defensive native method even if an extension or future edit
    // bypasses the disabled-controls guard. This still sends only to the local fixture.
    await page.evaluate(values => {
      document.querySelector('#request-fields').disabled = false;
      for (const [name, value] of Object.entries(values)) document.querySelector(`[name="${name}"]`).value = value;
      document.querySelector('#request-form').submit();
    }, details);
    await expect(page.getByText('Synthetic POST accepted.')).toBeVisible();
    expect(nativeSubmission.method()).toBe('POST');
    expect(new URL(nativeSubmission.url()).search).toBe('');
    expect(new URL(page.url()).search).toBe('');
    const body = new URLSearchParams(nativeSubmission.postData());
    for (const [name, value] of Object.entries(details)) expect(body.get(name)).toBe(value);
  });
});

test('keeps the fallback safe when page scripts cannot initialize', async ({ page }) => {
  await page.route('**/access.html', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "script-src 'none'" } });
  });
  await page.goto('/access.html');
  await expect(page.getByLabel('Your name', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'contact@pixeltronic.dev' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('does not enable a form when required browser request APIs are unavailable', async ({ page }) => {
  await page.addInitScript(() => { window.fetch = undefined; });
  await page.goto('/access.html');
  await expect(page.getByLabel('Your name', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'contact@pixeltronic.dev' })).toBeVisible();
});

test('invalid input focuses the first invalid field without making a request', async ({ page, context }) => {
  let requests = 0;
  await mockApi(context, async route => { requests++; await respond(route); });
  await page.goto('/access.html');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('status')).toContainText('Please fill in your name');
  await expect(page.getByLabel('Your name', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Your name', { exact: true }).fill(details.name);
  await page.getByLabel('How can I reach you?').fill('x');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByLabel('How can I reach you?')).toBeFocused();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveAttribute('aria-invalid', 'false');
  expect(requests).toBe(0);
  expect(new URL(page.url()).search).toBe('');
});

test('sends the JSON contract without URL or referrer leakage and resets on success', async ({ page, context }) => {
  let sent;
  await mockApi(context, async route => { sent = route.request(); await respond(route); });
  await page.goto('/access.html');
  await fillRequest(page);
  await page.getByLabel('Your name', { exact: true }).fill(`  ${details.name}  `);
  await expect(page.locator('#f-count')).toHaveText(`${details.message.length} / 500`);
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('status')).toContainText('Request sent.');
  expect(sent.method()).toBe('POST');
  expect(sent.url()).toBe(api);
  expect(sent.postDataJSON()).toEqual({ ...details, website: '' });
  expect(sent.headers()['content-type']).toBe('application/json');
  expect(sent.headers().referer).toBeUndefined();
  expect(new URL(page.url()).search).toBe('');
  for (const field of ['#f-name', '#f-reply', '#f-message']) await expect(page.locator(field)).toHaveValue('');
  await expect(page.locator('#f-count')).toHaveText('0 / 500');
  await expect(page.getByRole('button', { name: 'Send request' })).toBeEnabled();
  await expect(page.locator('#request-form')).not.toHaveAttribute('aria-busy', 'true');
});

test('permits only one submission while a response is pending', async ({ page, context }) => {
  let requests = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await mockApi(context, async route => { requests++; await pending; await respond(route); });
  await page.goto('/access.html');
  await fillRequest(page);
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled();
  await expect(page.locator('#request-form')).toHaveAttribute('aria-busy', 'true');
  await page.locator('#request-form').evaluate(form => form.requestSubmit());
  release();
  await expect(page.getByRole('status')).toContainText('Request sent.');
  expect(requests).toBe(1);
});

for (const failure of [
  { label: 'rate limiting', code: 429, message: 'Too many requests' },
  { label: 'server failure', code: 500, message: 'The request could not be sent.' },
  { label: 'network failure', code: null, message: 'The request could not be confirmed.' },
]) {
  test(`${failure.label} preserves entered details and permits retry`, async ({ page, context }) => {
    let requests = 0;
    await mockApi(context, async route => {
      requests++;
      if (requests > 1) await respond(route);
      else if (failure.code) await respond(route, failure.code);
      else await route.abort('failed');
    });
    await page.goto('/access.html');
    await fillRequest(page);
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('status')).toContainText(failure.message);
    for (const [name, value] of Object.entries(details)) await expect(page.locator(`[name="${name}"]`)).toHaveValue(value);
    await expect(page.getByRole('button', { name: 'Send request' })).toBeEnabled();
    await expect(page.locator('#request-form')).not.toHaveAttribute('aria-busy', 'true');
    expect(new URL(page.url()).search).toBe('');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('status')).toContainText('Request sent.');
    expect(requests).toBe(2);
  });
}

test('a stalled request times out without losing details or leaving the form busy', async ({ page, context }) => {
  let requests = 0;
  let stalledRoute;
  await mockApi(context, async route => {
    requests++;
    if (requests === 1) stalledRoute = route;
    else await respond(route);
  });
  await page.clock.install();
  await page.goto('/access.html');
  await fillRequest(page);
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect.poll(() => requests).toBe(1);
  await page.clock.fastForward(15_001);
  await expect(page.getByRole('status')).toContainText('The server did not respond in time.');
  await expect(page.getByRole('status')).toContainText('Your request may have arrived.');
  await expect(page.getByRole('button', { name: 'Send request' })).toBeEnabled();
  await expect(page.locator('#request-form')).not.toHaveAttribute('aria-busy', 'true');
  for (const [name, value] of Object.entries(details)) await expect(page.locator(`[name="${name}"]`)).toHaveValue(value);
  await stalledRoute.abort().catch(() => {});
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('status')).toContainText('Request sent.');
  expect(requests).toBe(2);
});
