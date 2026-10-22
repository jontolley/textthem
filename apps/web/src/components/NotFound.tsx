import { useDocumentTitle } from '@/lib/document-title';

/** Shown for unknown public URLs rather than falling back to another org's or group's page. */
export function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-muted-foreground">Check the link you were given and try again.</p>
    </div>
  );
}
