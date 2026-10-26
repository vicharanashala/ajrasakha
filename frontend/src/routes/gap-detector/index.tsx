import { createFileRoute } from "@tanstack/react-router";
import { GapDetectorDashboard } from "@/features/gapDetector/GapDetectorDashboard";
import { useEffect } from "react";

// Inject a demo user into the auth store so Firebase redirect doesn't fire
function useDemoAuthBypass() {
  useEffect(() => {
    const key = "auth-storage";
    try {
      const existing = localStorage.getItem(key);
      const parsed = existing ? JSON.parse(existing) : {};
      if (!parsed?.state?.user) {
        const demo = {
          state: {
            user: {
              uid: "demo-intern-iitropar",
              email: "intern@iitropar.ac.in",
              name: "IIT Ropar Intern",
              avatar: "",
            },
            isAuthenticated: true,
            loading: false,
            error: null,
            firebaseUser: null,
          },
          version: 0,
        };
        localStorage.setItem(key, JSON.stringify(demo));
      }
    } catch (_) {}
  }, []);
}

export const Route = createFileRoute("/gap-detector/")({
  component: RouteComponent,
});

function RouteComponent() {
  useDemoAuthBypass();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Standalone top bar — no Firebase/auth dependency */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
            A
          </div>
          <span className="font-semibold text-foreground text-sm">Annam</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="text-muted-foreground text-sm">GDB Coverage Gap Detector</span>
        <span className="ml-auto text-xs text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-medium">
          IIT Ropar Internship · Project 6
        </span>
      </header>
      <main>
        <GapDetectorDashboard />
      </main>
    </div>
  );
}
