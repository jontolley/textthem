/**
 * Writes static HTML for every public page (Join, Privacy, Terms) into dist/,
 * so carrier reviewers and crawlers that don't run JavaScript see the full
 * content. Each page gets its own canonical link, and dist/sitemap.xml lists
 * them for Google. Runs after `vite build` and the SSR build of src/prerender.tsx
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
const SITE = 'https://textthem.app';
const ROOT_DIV = '<div id="root"></div>';
const TITLE = /<title>[^<]*<\/title>/;
const CANONICAL = `<link rel="canonical" href="${SITE}/" />`;
if (!template.includes(ROOT_DIV) || !TITLE.test(template) || !template.includes(CANONICAL)) {
  throw new Error(
    `dist/index.html is missing ${ROOT_DIV}, <title> or ${CANONICAL}; update scripts/prerender.js`,
  );
}

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

for (const url of publicPaths()) {
  const { html, title } = render(url);
  if (!title) throw new Error(`${url} rendered without a page title`);
  // Function replacements, so "$" sequences in the content are left alone.
  const page = template
    .replace(TITLE, () => `<title>${escapeHtml(title)}</title>`)
    .replace(CANONICAL, () => `<link rel="canonical" href="${SITE}${url}" />`)
    .replace(ROOT_DIV, () => `<div id="root">${html}</div>`);
  const file = path.join(dist, `${url.slice(1)}.html`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, page);
  console.log(`prerendered ${url} -> ${path.relative(root, file)}`);
}

// The home page is index.html itself (not prerendered), so list it first.
const urls = ['/', ...publicPaths()]
  .map((url) => `  <url><loc>${escapeHtml(SITE + url)}</loc></url>`)
  .join('\n');
await fs.writeFile(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log('wrote sitemap.xml');
