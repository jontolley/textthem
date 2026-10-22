import { renderToString } from 'react-dom/server';
import { useRoutes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { TitleCollectorContext } from './lib/document-title';
import { publicPaths, publicRoutes } from './routes/public';

/**
 * Server entry used only at build time (scripts/prerender.js) to write the
 * public pages as static HTML. Renders just the public routes, so none of the
 * dashboard's Clerk or API code runs here.
 */
export { publicPaths };

function PublicPages() {
  return useRoutes(publicRoutes);
}

export function render(url: string): { html: string; title?: string } {
  const head: { title?: string } = {};
  const html = renderToString(
    <TitleCollectorContext.Provider value={head}>
      <StaticRouter location={url}>
        <PublicPages />
      </StaticRouter>
    </TitleCollectorContext.Provider>,
  );
  return { html, title: head.title };
}
