import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { Navigate, Route, Routes, useRoutes } from 'react-router-dom';
import { AccessGate } from './components/AccessGate';
import { Layout } from './components/Layout';
import { GroupsPage } from './pages/GroupsPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { HelpPage } from './pages/HelpPage';
import { HistoryPage } from './pages/HistoryPage';
import { LandingPage } from './pages/LandingPage';
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
        <LandingPage />
      </SignedOut>

      <SignedIn>
        <AccessGate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<GroupsPage />} />
              <Route path="groups/:id" element={<GroupDetailPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="help" element={<HelpPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AccessGate>
      </SignedIn>
    </>
  );
}
