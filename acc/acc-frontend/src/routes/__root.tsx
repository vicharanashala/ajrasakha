import { Outlet, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster as SonnerToast } from "sonner";
import { NotFound } from "@/components/NotFound";

export const queryClient = new QueryClient();

export const Route = createRootRoute({
  component: () => (
    <>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SonnerToast richColors position="bottom-right" />
          <Outlet />
        </QueryClientProvider>
      </ThemeProvider>
    </>
  ),
  notFoundComponent: () => {
    return <NotFound />;
  },
});
