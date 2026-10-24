import { SignIn } from '@clerk/clerk-react';
import { ArrowRight, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ORGS, PLATFORM_NAME, PLATFORM_OPERATOR, orgPath } from '@/config/org';
import { useDocumentTitle } from '@/lib/document-title';

/**
 * Signed-out home page: what Text Them is, where members go to join or stop,
 * and organizer sign-in. Carrier reviewers may land here from the campaign
 * description, so it stays plain about how people opt in.
 */
export function LandingPage() {
  useDocumentTitle(PLATFORM_NAME);

  return (
    <div className="flex min-h-screen flex-wrap">
      <section className="flex min-w-0 flex-[1_1_520px] flex-col justify-between gap-10 bg-primary px-6 py-10 text-primary-foreground sm:px-12">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-lg font-semibold">
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
            {PLATFORM_NAME}
          </div>
          {/* On narrow screens the sign-in form sits below this panel. A button, not a
              #hash link, because Clerk's sign-in uses the URL hash for its own steps. */}
          <button
            type="button"
            onClick={() => document.getElementById('signin-title')?.scrollIntoView()}
            className="min-h-11 rounded-md px-3 text-sm font-semibold underline underline-offset-4 lg:hidden"
          >
            Organizer sign in
          </button>
        </div>

        <div className="flex max-w-xl flex-col gap-6">
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Group texts people sign up for themselves.
          </h1>
          <p className="text-lg leading-relaxed text-teal-50">
            {PLATFORM_NAME} sends announcements and reminders to small community groups. People join
            by texting a keyword, and leave anytime by replying STOP.
          </p>

          <div className="flex flex-col gap-3.5 rounded-xl border border-white/25 bg-white/10 p-5">
            <h2 className="font-semibold">Joining a group?</h2>
            <p className="text-[15px] leading-relaxed text-teal-50">
              Get the keyword from your organizer, or open your program&apos;s page for its keywords
              and a QR code.
            </p>
            {ORGS.map((org) => (
              <Link
                key={org.slug}
                to={orgPath(org, 'join')}
                className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3.5 text-foreground transition-colors hover:bg-teal-50"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{org.name}</span>
                  <span className="text-sm text-muted-foreground">
                    Keywords {org.groups.map((g) => g.keyword).join(', ')}
                  </span>
                </span>
                <ArrowRight className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
              </Link>
            ))}
            <p className="text-sm leading-relaxed text-teal-50">
              Already getting texts? Reply <strong className="text-white">HELP</strong> for help or{' '}
              <strong className="text-white">STOP</strong> to stop them.
            </p>
          </div>
        </div>

        <footer className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-teal-50">
          <span>
            {PLATFORM_NAME} is owned and operated by {PLATFORM_OPERATOR}.
          </span>
          {ORGS.map((org) => (
            <span key={org.slug} className="flex gap-4">
              {ORGS.length > 1 && <span>{org.name}:</span>}
              <Link to={orgPath(org, 'privacy')} className="text-white underline underline-offset-2">
                Privacy
              </Link>
              <Link to={orgPath(org, 'terms')} className="text-white underline underline-offset-2">
                Terms
              </Link>
            </span>
          ))}
        </footer>
      </section>

      <section
        aria-labelledby="signin-title"
        className="flex min-w-0 flex-[1_1_420px] items-center justify-center bg-background px-6 py-12"
      >
        <div className="flex w-full max-w-sm flex-col gap-5">
          <div className="space-y-1.5">
            <h2 id="signin-title" className="text-2xl font-bold tracking-tight">
              Organizer sign in
            </h2>
            <p className="text-muted-foreground">Accounts are by invitation.</p>
          </div>
          <SignIn
            routing="hash"
            appearance={{
              elements: {
                rootBox: { width: '100%' },
                cardBox: { width: '100%', boxShadow: 'none', border: '1px solid #e2e8f0' },
                // Our heading above replaces Clerk's, and accounts are invite-only.
                header: { display: 'none' },
                footerAction: { display: 'none' },
              },
            }}
          />
        </div>
      </section>
    </div>
  );
}
