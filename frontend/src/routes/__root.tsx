import { Outlet, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "react-hot-toast";

export const queryClient = new QueryClient();

export const Route = createRootRoute({
  component: () => (
    <>
      <ThemeProvider >
        <QueryClientProvider client={queryClient}>
          <Toaster position="bottom-right" reverseOrder={false} />
          <Outlet />
        </QueryClientProvider>
      </ThemeProvider>
    </>
  ),
});
