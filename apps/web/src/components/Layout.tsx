import { UserButton } from '@clerk/clerk-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { useLiveUpdates } from '@/lib/hooks';
import { cn } from '@/lib/utils';

// Links sit on the green header bar; the active one is underlined in white.
function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'border-b-2 py-[18px] text-sm font-medium transition-colors',
    isActive ? 'border-white text-white' : 'border-transparent text-white/90 hover:text-white',
  );
}

export function Layout() {
  useLiveUpdates();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-primary text-primary-foreground">
        <div className="container flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-4 sm:gap-6">
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <AppIcon />
              {/* Phones only have room for the icon beside four nav links. */}
              <span className="sr-only sm:not-sr-only">Text Them</span>
            </Link>
            <nav className="flex items-center gap-4">
              <NavLink to="/" end className={navClass}>
                Groups
              </NavLink>
              <NavLink to="/history" className={navClass}>
                History
              </NavLink>
              <NavLink to="/replies" className={navClass}>
                Replies
              </NavLink>
              <NavLink to="/help" className={navClass}>
                Help
              </NavLink>
            </nav>
          </div>
          <UserButton />
        </div>
      </header>
      <main className="container py-8">
        <Outlet />
      </main>
    </div>
  );
}
