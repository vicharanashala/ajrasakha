import { Outlet, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster as SonnerToast } from "sonner";
import { NotFound } from "@/components/NotFound";
import { BulkUploadProgressTracker } from "@/components/BulkUploadProgressTracker";

export const queryClient = new QueryClient();

export const Route = createRootRoute({
  component: () => (
    <>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          {/* <ReactHotToast position="bottom-right" reverseOrder={false} /> */}
          <SonnerToast richColors position="bottom-right" />
          <BulkUploadProgressTracker />
          <Outlet />
        </QueryClientProvider>
      </ThemeProvider>
    </>
  ),
  notFoundComponent: () => {
    return <NotFound />;
  },
});
