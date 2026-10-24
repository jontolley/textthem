import { SignOutButton, useUser } from '@clerk/clerk-react';
import { AppIcon } from '@/components/AppIcon';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useMe } from '@/lib/hooks';

/**
 * Shows the dashboard only to organizers. The API answers 403 for any other
 * signed-in account, and those see a no-access screen with a way to sign out.
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const { isLoading, error } = useMe();

  if (isLoading) return null;
  if (error instanceof ApiError && error.status === 403) return <NoAccess />;
  // Other failures (API down, network) fall through to the pages' own error states.
  return <>{children}</>;
}

function NoAccess() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border bg-background p-8 text-center shadow-sm">
        <AppIcon className="mx-auto h-12 w-12 rounded-[10px]" />
        <div className="space-y-2">
          <h1 className="text-xl font-bold">This account doesn&apos;t have access</h1>
          <p className="text-sm text-muted-foreground">
            Text Them is invite-only.
            {email && (
              <>
                {' '}
                You&apos;re signed in as{' '}
                <span className="font-medium text-foreground">{email}</span>.
              </>
            )}{' '}
            If you should have access, ask the person who invited you.
          </p>
        </div>
        <SignOutButton>
          <Button variant="outline">Sign out</Button>
        </SignOutButton>
      </div>
    </div>
  );
}
