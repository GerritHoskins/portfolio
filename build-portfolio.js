import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(root, 'dist');
const sources = new Map([
  ['index.html', 'portfolio-template.html'],
  ['styles.css', 'styles.css'],
  ['access.html', 'access.html'],
  ['privacy.html', 'privacy.html'],
  ['og-image.png', 'og-image.png'],
  ['avatar-poster.jpg', 'avatar-poster.jpg'],
]);

// Read every required input before touching the last successful build. Missing,
// unreadable or invalid source files must leave both output locations unchanged.
const inputs = new Map();
for (const [output, source] of sources) {
  try {
    const sourcePath = path.join(root, source);
    if (!fs.statSync(sourcePath).isFile()) throw new Error('not a file');
    inputs.set(output, fs.readFileSync(sourcePath));
  } catch (error) {
    throw new Error(`Required portfolio input ${source} could not be read.`, { cause: error });
  }
}

function attributes(tag) {
  return new Map([...tag.matchAll(/\s([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)]
    .map(([, name, , value]) => [name.toLowerCase(), value]));
}

const documents = new Map();
for (const [output, bytes] of inputs) {
  if (!output.endsWith('.html')) continue;
  const source = sources.get(output);
  const html = bytes.toString('utf8');
  // These are structural guards for the authored static pages, not an HTML parser.
  // Ignore comments and script/style contents so examples cannot create fake IDs.
  const markup = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<(?:script|style)\b[^>]*>)[\s\S]*?(<\/(?:script|style)>)/gi, '$1$2');
  if (!/^<!doctype html>/i.test(markup.trimStart())) {
    throw new Error(`${source} must be a complete HTML document.`);
  }
  for (const element of ['html', 'head', 'body']) {
    if ((markup.match(new RegExp(`<${element}\\b[^>]*>`, 'gi')) || []).length !== 1
      || (markup.match(new RegExp(`</${element}>`, 'gi')) || []).length !== 1) {
      throw new Error(`${source} must contain exactly one opening and closing ${element} tag.`);
    }
  }
  const htmlTag = markup.match(/<html\b[^>]*>/i)[0];
  if (attributes(htmlTag).get('lang') !== 'en') {
    throw new Error(`${source} must declare its document language as en.`);
  }
  const tags = [...markup.matchAll(/<[a-z][^>]*>/gi)].map(([tag]) => ({ tag, attrs: attributes(tag) }));
  if (!tags.some(({ tag, attrs }) => /^<link\b/i.test(tag)
    && attrs.get('rel')?.split(/\s+/).includes('stylesheet') && attrs.get('href') === 'styles.css')) {
    throw new Error(`${source} must reference styles.css as a stylesheet.`);
  }
  const ids = tags.filter(({ attrs }) => attrs.has('id')).map(({ attrs }) => attrs.get('id'));
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${source} contains duplicate element IDs.`);
  }
  documents.set(output, { ids: new Set(ids), tags });
}

for (const [output, { tags }] of documents) {
  for (const { attrs } of tags) {
    for (const attribute of ['href', 'src', 'poster']) {
      const reference = attrs.get(attribute);
      if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) continue;
      const url = new URL(reference, `https://portfolio.invalid/${output}`);
      const target = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      if (!inputs.has(target)) {
        throw new Error(`${sources.get(output)} references an unshipped local file: ${reference}`);
      }
      if (url.hash && documents.has(target)
        && !documents.get(target).ids.has(decodeURIComponent(url.hash.slice(1)))) {
        throw new Error(`${sources.get(output)} links to a missing section: ${reference}`);
      }
    }
  }
}

fs.mkdirSync(distPath, { recursive: true });
fs.writeFileSync(path.join(root, 'index.html'), inputs.get('index.html'));
for (const [output, bytes] of inputs) {
  fs.writeFileSync(path.join(distPath, output), bytes);
}

console.log('Portfolio built from validated sources into the workspace and dist/.');
