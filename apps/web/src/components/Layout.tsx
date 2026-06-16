import { UserButton } from '@clerk/clerk-react';
import { MessageSquare } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'text-sm font-medium transition-colors hover:text-foreground',
    isActive ? 'text-foreground' : 'text-muted-foreground',
  );
}

export function Layout() {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <MessageSquare className="h-5 w-5" />
              text-them
            </Link>
            <nav className="flex items-center gap-4">
              <NavLink to="/" end className={navClass}>
                Groups
              </NavLink>
              <NavLink to="/history" className={navClass}>
                History
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
