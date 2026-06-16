import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { GroupsPage } from './pages/GroupsPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';

export default function App() {
  return (
    <Routes>
      {/* Public legal pages — must be reachable without signing in. */}
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      {/* Everything else requires authentication. */}
      <Route path="/*" element={<DashboardApp />} />
    </Routes>
  );
}

function DashboardApp() {
  return (
    <>
      <SignedOut>
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30">
          <div className="text-center">
            <h1 className="text-2xl font-bold">text-them</h1>
            <p className="text-sm text-muted-foreground">Sign in to manage your SMS groups</p>
          </div>
          <SignIn routing="hash" />
          <footer className="text-sm text-muted-foreground">
            <Link to="/privacy" className="underline">
              Privacy Policy
            </Link>
            {' · '}
            <Link to="/terms" className="underline">
              Terms of Service
            </Link>
          </footer>
        </div>
      </SignedOut>

      <SignedIn>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<GroupsPage />} />
            <Route path="groups/:id" element={<GroupDetailPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </SignedIn>
    </>
  );
}
