import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => fs.readFileSync(path.join(root, name));

test('checked-in generated files match their sources', () => {
  for (const [source, output] of [
    ['portfolio-template.html', 'index.html'],
    ['portfolio-template.html', 'dist/index.html'],
    ...['styles.css', 'orbit.css', 'orbit.js', 'avatar-adapter.js', 'portfolio-content.js', 'access.html', 'privacy.html', 'og-image.png', 'avatar-poster.jpg', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'access.js', '404.html', 'robots.txt', 'sitemap.xml'].map(name => [name, `dist/${name}`]),
  ]) assert.deepEqual(read(output), read(source), `${output} is stale; run npm run build:portfolio`);
});

for (const filename of ['portfolio-template.html', 'access.html', 'privacy.html', '404.html']) {
  test(`${filename} has valid inline scripts, unique IDs and working local references`, () => {
    const html = read(filename).toString();
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'duplicate ID');
    for (const [, attributes, script] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (attributes.includes('application/ld+json')) JSON.parse(script);
      else if (!attributes.includes('src=')) new vm.Script(script, { filename });
    }
    for (const [, reference] of html.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)) {
      if (reference.startsWith('#')) assert.ok(ids.includes(reference.slice(1)), `missing target ${reference}`);
      else if (!/^(?:[a-z][\w+.-]*:|\/\/)/i.test(reference)) {
        const local = reference.replace(/^\//, '').split(/[?#]/)[0] || 'index.html';
        assert.ok(fs.existsSync(path.join(root, 'dist', local)), `missing shipped file ${reference}`);
      }
    }
  });
}

for (const filename of ['portfolio-template.html', 'access.html', 'privacy.html', '404.html']) {
  test(`${filename} has a CSP that allows each inline script by hash and nothing else inline`, () => {
    const html = read(filename).toString();
    const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
    assert.ok(policy, 'missing CSP meta');
    const directives = new Map(policy.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
    const scriptSrc = directives.get('script-src');
    assert.ok(scriptSrc, 'missing script-src');
    assert.ok(!scriptSrc.includes("'unsafe-inline'") && !scriptSrc.includes("'unsafe-eval'"), 'script-src must not allow unsafe inline or eval');
    assert.deepEqual(directives.get('object-src'), ["'none'"]);
    assert.deepEqual(directives.get('base-uri'), ["'none'"]);
    for (const [, attributes, script] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (attributes.includes('src=') || attributes.includes('application/ld+json')) continue;
      const hash = `'sha256-${crypto.createHash('sha256').update(script).digest('base64')}'`;
      assert.ok(scriptSrc.includes(hash), `inline script is not allowed by its hash ${hash}; update the CSP`);
    }
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline event handlers are blocked by the CSP');
  });
}
