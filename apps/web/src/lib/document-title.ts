import { createContext, useContext, useEffect } from 'react';

/** Collects the page title while prerendering to static HTML, where effects don't run. */
export const TitleCollectorContext = createContext<{ title?: string } | null>(null);

/** Sets the browser tab title. While prerendering, records it for the static page. */
export function useDocumentTitle(title: string): void {
  const collector = useContext(TitleCollectorContext);
  if (collector) collector.title = title;
  useEffect(() => {
    document.title = title;
  }, [title]);
}
