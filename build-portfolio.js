import fs from 'fs';
import { marked } from 'marked';

const markdown = fs.readFileSync('C:\\Users\\Gerrit\\job-search\\career-ops\\cv.md', 'utf-8');
// Convert pandoc-style "::: name ... :::" fences into divs (marked ignores them)
const fenced = markdown.replace(
  /^::: *(\w+)[ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/gm,
  (_, name, body) => `<div class="${name}">\n\n${body}\n</div>`
);
const html = marked.parse(fenced);
const template = fs.readFileSync('portfolio-template.html', 'utf-8');

if (!template.includes('{CONTENT}')) {
  throw new Error('portfolio-template.html has no {CONTENT} placeholder');
}
// Function replacer: avoids "$&"-style patterns in the content being interpreted
const output = template.replace('{CONTENT}', () => html);

if ((output.match(/<\/html>/gi) || []).length !== 1) {
  throw new Error('Build output must contain exactly one </html>');
}

fs.writeFileSync(
  'C:\\Users\\Gerrit\\job-search\\portfolio\\index.html',
  output
);

console.log('✓ Portfolio built');
