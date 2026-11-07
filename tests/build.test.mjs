import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceNames = ['portfolio-template.html', 'styles.css', 'access.html', 'privacy.html', 'og-image.png', 'avatar-poster.jpg'];
const outputNames = ['index.html', ...sourceNames.slice(1)];
const snapshot = new Map([...sourceNames, 'build-portfolio.js', 'package.json']
  .map((name) => [name, fs.readFileSync(path.join(root, name))]));

function fixture(t, withOutputs = true) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-build-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('portfolio-build-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  for (const [name, bytes] of snapshot) fs.writeFileSync(path.join(directory, name), bytes);
  if (withOutputs) {
    fs.mkdirSync(path.join(directory, 'dist'));
    fs.writeFileSync(path.join(directory, 'index.html'), 'previous root output');
    for (const name of outputNames) fs.writeFileSync(path.join(directory, 'dist', name), `previous ${name}`);
  }
  return directory;
}

function build(directory) {
  return spawnSync(process.execPath, ['build-portfolio.js'], { cwd: directory, encoding: 'utf8' });
}

function previousOutputsAreUntouched(directory) {
  assert.equal(fs.readFileSync(path.join(directory, 'index.html'), 'utf8'), 'previous root output');
  assert.deepEqual(fs.readdirSync(path.join(directory, 'dist')).sort(), [...outputNames].sort());
  for (const name of outputNames) {
    assert.equal(fs.readFileSync(path.join(directory, 'dist', name), 'utf8'), `previous ${name}`);
  }
}

for (const missing of sourceNames) {
  test(`missing ${missing} leaves the previous build untouched`, (t) => {
    const directory = fixture(t);
    fs.unlinkSync(path.join(directory, missing));
    const result = build(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`Required portfolio input ${missing.replaceAll('.', '\\.')}`));
    previousOutputsAreUntouched(directory);
  });
}

test('a non-file input is rejected before writing', (t) => {
  const directory = fixture(t);
  fs.unlinkSync(path.join(directory, 'avatar-poster.jpg'));
  fs.mkdirSync(path.join(directory, 'avatar-poster.jpg'));
  assert.notEqual(build(directory).status, 0);
  previousOutputsAreUntouched(directory);
});

test('an invalid fresh build does not create outputs', (t) => {
  const directory = fixture(t, false);
  fs.unlinkSync(path.join(directory, 'privacy.html'));
  assert.notEqual(build(directory).status, 0);
  assert.equal(fs.existsSync(path.join(directory, 'dist')), false);
  assert.equal(fs.existsSync(path.join(directory, 'index.html')), false);
});

const invalidPages = [
  ['portfolio-template.html', 'missing doctype', (html) => html.replace(/<!doctype html>/i, ''), /complete HTML document/],
  ['portfolio-template.html', 'missing language', (html) => html.replace('lang="en"', ''), /document language/],
  ['portfolio-template.html', 'missing stylesheet', (html) => html.replace('href="styles.css"', 'href="other.css"'), /reference styles.css/],
  ['portfolio-template.html', 'duplicate ID', (html) => html.replace('</body>', '<div id="main"></div></body>'), /duplicate element IDs/],
  ['portfolio-template.html', 'missing fragment', (html) => html.replace('href="#work"', 'href="#not-a-section"'), /missing section/],
  ['access.html', 'missing body close', (html) => html.replace('</body>', ''), /opening and closing body/],
  ['privacy.html', 'duplicate html close', (html) => `${html}</html>`, /opening and closing html/],
  ['privacy.html', 'unshipped local link', (html) => html.replace('href="/access.html"', 'href="/missing.html"'), /unshipped local file/],
  ['privacy.html', 'broken cross-page fragment', (html) => html.replace('href="/access.html"', 'href="/access.html#missing"'), /missing section/],
  ['portfolio-template.html', 'unshipped poster', (html) => html.replace('poster="avatar-poster.jpg"', 'poster="missing.jpg"'), /unshipped local file/],
];

for (const [name, issue, mutate, message] of invalidPages) {
  test(`${issue} in ${name} leaves previous outputs untouched`, (t) => {
    const directory = fixture(t);
    fs.writeFileSync(path.join(directory, name), mutate(snapshot.get(name).toString('utf8')));
    const result = build(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
    previousOutputsAreUntouched(directory);
  });
}

test('build emits every shipped file byte-for-byte and is repeatable', (t) => {
  const directory = fixture(t);
  for (let run = 0; run < 2; run += 1) {
    const result = build(directory);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'index.html')), snapshot.get('portfolio-template.html'));
    assert.deepEqual(fs.readdirSync(path.join(directory, 'dist')).sort(), [...outputNames].sort());
    for (let i = 0; i < outputNames.length; i += 1) {
      assert.deepEqual(fs.readFileSync(path.join(directory, 'dist', outputNames[i])), snapshot.get(sourceNames[i]));
    }
  }
});

test('valid single-quoted links, root links, queries and cross-page fragments are accepted', (t) => {
  const directory = fixture(t);
  const html = snapshot.get('privacy.html').toString('utf8')
    .replace('</body>', '<a href="/access.html?from=privacy#main">Access</a><a href=\'/\'>Home</a></body>');
  fs.writeFileSync(path.join(directory, 'privacy.html'), html);
  const result = build(directory);
  assert.equal(result.status, 0, result.stderr);
});

test('comments and script strings do not create fake IDs or local references', (t) => {
  const directory = fixture(t);
  const html = snapshot.get('privacy.html').toString('utf8').replace('</body>', `
    <!-- <div id="main"><a href="missing.html">Example</a></div> -->
    <script>const example = '<div id="main"><a href="missing.html">Example</a></div>';</script>
    </body>`);
  fs.writeFileSync(path.join(directory, 'privacy.html'), html);
  const result = build(directory);
  assert.equal(result.status, 0, result.stderr);
});
