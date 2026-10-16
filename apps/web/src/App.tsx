import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { OrgRoute } from './components/OrgRoute';
import { GroupsPage } from './pages/GroupsPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import { JoinPage } from './pages/JoinPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';

export default function App() {
  return (
    <Routes>
      {/* Public per-org pages — must be reachable without signing in (carrier review). */}
      <Route
        path="/:orgSlug/join"
        element={
          <OrgRoute>
            <JoinPage />
          </OrgRoute>
        }
      />
      <Route
        path="/:orgSlug/privacy"
        element={
          <OrgRoute>
            <PrivacyPage />
          </OrgRoute>
        }
      />
      <Route
        path="/:orgSlug/terms"
        element={
          <OrgRoute>
            <TermsPage />
          </OrgRoute>
        }
      />
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
