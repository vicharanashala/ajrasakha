import { Outlet, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
// import { Toaster as ReactHotToast } from "react-hot-toast";
import { Toaster as SonnerToast } from "sonner";
import { NotFound } from "@/components/NotFound";
import { ErrorBoundary, NetworkStatus } from "@/shared/components";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Slightly more aggressive defaults so the UI feels snappy
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error: any) => {
        // Don't retry 4xx errors
        const status = error?.response?.status ?? error?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Inner AppShell — wrapped by ErrorBoundary + NetworkStatus so that any
 * crash is contained, and connectivity state is visible across the app.
 */
function AppShell() {
  return (
    <>
      <NetworkStatus />
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SonnerToast richColors position="bottom-right" />
          <Outlet />
        </QueryClientProvider>
      </ThemeProvider>
    </>
  );
}

export const Route = createRootRoute({
  component: () => (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  ),
  notFoundComponent: () => {
    return <NotFound />;
  },
});