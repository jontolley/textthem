import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { Navigate, Route, Routes, useRoutes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { GroupsPage } from './pages/GroupsPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { HelpPage } from './pages/HelpPage';
import { HistoryPage } from './pages/HistoryPage';
import { publicRoutes } from './routes/public';

export default function App() {
  return useRoutes([
    ...publicRoutes,
    // Everything else requires authentication.
    { path: '/*', element: <DashboardApp /> },
  ]);
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
            <Route path="help" element={<HelpPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </SignedIn>
    </>
  );
}
