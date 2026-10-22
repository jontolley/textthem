/**
 * Writes static HTML for every public page (Join, Privacy, Terms) into dist/,
 * so carrier reviewers and crawlers that don't run JavaScript see the full
 * content. Runs after `vite build` and the SSR build of src/prerender.tsx
 * (`npm run prerender`); in the browser the SPA then takes over as usual.
 *
 * Cloudflare Pages serves dist/<path>.html for /<path>. With no 404.html it
 * treats the site as an SPA and serves index.html for every other path, which
 * covers the dashboard routes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const { render, publicPaths } = await import(
  pathToFileURL(path.join(root, 'dist-ssr', 'prerender.js')).href
);

const template = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const ROOT_DIV = '<div id="root"></div>';
const TITLE = /<title>[^<]*<\/title>/;
if (!template.includes(ROOT_DIV) || !TITLE.test(template)) {
  throw new Error(`dist/index.html is missing ${ROOT_DIV} or <title>; update scripts/prerender.js`);
}

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

for (const url of publicPaths()) {
  const { html, title } = render(url);
  if (!title) throw new Error(`${url} rendered without a page title`);
  // Function replacements, so "$" sequences in the content are left alone.
  const page = template
    .replace(TITLE, () => `<title>${escapeHtml(title)}</title>`)
    .replace(ROOT_DIV, () => `<div id="root">${html}</div>`);
  const file = path.join(dist, `${url.slice(1)}.html`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, page);
  console.log(`prerendered ${url} -> ${path.relative(root, file)}`);
}
