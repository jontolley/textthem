import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { PLATFORM_LEGAL_UPDATED, PLATFORM_NAME, orgPath } from '@/config/org';
import { useDocumentTitle } from '@/lib/document-title';
import { OrgContext } from '@/lib/org-context';

/**
 * Shared chrome + prose styling for the public legal pages. Children should be
 * plain semantic HTML (h2 / p / ul / li / a); this applies the typography.
 * Inside <OrgRoute> it brands the page for that org; outside it (Text Them's
 * own /privacy and /terms) it brands it for the platform.
 * The browser tab shows `documentTitle`, or the heading followed by the brand name.
 */
export function LegalLayout({
  title,
  documentTitle,
  children,
}: {
  title: string;
  documentTitle?: string;
  children: React.ReactNode;
}) {
  const org = useContext(OrgContext);
  const brand = org
    ? {
        name: org.name,
        lastUpdated: org.lastUpdated,
        home: { label: 'Join', to: orgPath(org, 'join') },
        privacy: orgPath(org, 'privacy'),
        terms: orgPath(org, 'terms'),
      }
    : {
        name: PLATFORM_NAME,
        lastUpdated: PLATFORM_LEGAL_UPDATED,
        home: { label: 'Home', to: '/' },
        privacy: '/privacy',
        terms: '/terms',
      };
  useDocumentTitle(documentTitle ?? `${title} · ${brand.name}`);
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="container flex h-14 items-center">
          <Link to={brand.home.to} className="flex items-center gap-2 font-semibold">
            <AppIcon />
            {brand.name}
          </Link>
        </div>
      </header>

      <main className="container max-w-3xl py-10">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {brand.lastUpdated}</p>

        <div className="mt-8 space-y-1 [&_a]:text-primary [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:text-muted-foreground [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
          {children}
        </div>

        <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          <Link to={brand.home.to}>{brand.home.label}</Link>
          {' · '}
          <Link to={brand.privacy}>Privacy Policy</Link>
          {' · '}
          <Link to={brand.terms}>Terms of Service</Link>
        </footer>
      </main>
    </div>
  );
}
