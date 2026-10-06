import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(root, 'portfolio-template.html');
const sourceStylesPath = path.join(root, 'styles.css');
const outputPath = path.join(root, 'index.html');
const distPath = path.join(root, 'dist');

const html = fs.readFileSync(templatePath, 'utf8');
if (!/^<!doctype html>/i.test(html.trimStart())) {
  throw new Error('portfolio-template.html must be a complete HTML document.');
}
if (!/<html\b[^>]*\blang="en"/i.test(html)) {
  throw new Error('The portfolio template must declare its document language.');
}
if (!/<link\b[^>]*href="styles\.css"/i.test(html)) {
  throw new Error('The portfolio template must reference styles.css.');
}
if ((html.match(/<\/html>/gi) || []).length !== 1) {
  throw new Error('The portfolio template must contain exactly one closing html tag.');
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
if (new Set(ids).size !== ids.length) {
  throw new Error('The portfolio template contains duplicate element IDs.');
}
for (const [, target] of html.matchAll(/\bhref="#([^"]+)"/g)) {
  if (!ids.includes(target)) {
    throw new Error(`The portfolio template links to a missing section: #${target}`);
  }
}
if (!fs.existsSync(sourceStylesPath)) {
  throw new Error('styles.css is missing.');
}

fs.mkdirSync(distPath, { recursive: true });
fs.writeFileSync(outputPath, html);
fs.copyFileSync(templatePath, path.join(distPath, 'index.html'));
fs.copyFileSync(sourceStylesPath, path.join(distPath, 'styles.css'));

console.log('Portfolio built from portfolio-template.html into the workspace and dist/.');
