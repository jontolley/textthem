import { MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ORG, LAST_UPDATED } from '@/config/org';

/**
 * Shared chrome + prose styling for the public legal pages. Children should be
 * plain semantic HTML (h2 / p / ul / li / a); this applies the typography.
 */
export function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-14 items-center">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <MessageSquare className="h-5 w-5" />
            {ORG.name}
          </Link>
        </div>
      </header>

      <main className="container max-w-3xl py-10">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-1 [&_a]:text-primary [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:text-muted-foreground [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
          {children}
        </div>

        <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          <Link to="/privacy">Privacy Policy</Link>
          {' · '}
          <Link to="/terms">Terms of Service</Link>
        </footer>
      </main>
    </div>
  );
}
