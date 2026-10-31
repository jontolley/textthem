import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import { ThemeProvider, useTheme } from './lib/theme';
import './index.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable');
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

// Clerk's sign-in and user menu follow the app's theme, in the green and font.
function ThemedApp() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      afterSignOutUrl="/"
      appearance={{
        variables: {
          colorPrimary: '#0f766e',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          borderRadius: '0.5rem',
          ...(dark && {
            colorBackground: '#0b1120',
            colorText: '#f8fafc',
            colorTextSecondary: '#94a3b8',
            colorInputBackground: '#020817',
            colorInputText: '#f8fafc',
            colorNeutral: '#ffffff',
          }),
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster richColors theme={theme} />
        </BrowserRouter>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  </React.StrictMode>,
);
