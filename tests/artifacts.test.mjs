import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => fs.readFileSync(path.join(root, name));

test('checked-in generated files match their sources', () => {
  for (const [source, output] of [
    ['portfolio-template.html', 'index.html'],
    ['portfolio-template.html', 'dist/index.html'],
    ...['styles.css', 'orbit.css', 'orbit.js', 'avatar-adapter.js', 'portfolio-content.js', 'access.html', 'privacy.html', 'og-image.png', 'avatar-poster.jpg'].map(name => [name, `dist/${name}`]),
  ]) assert.deepEqual(read(output), read(source), `${output} is stale; run npm run build:portfolio`);
});

for (const filename of ['portfolio-template.html', 'access.html', 'privacy.html']) {
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
