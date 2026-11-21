import { useGet } from "./api";
import { GapsPage } from "./pages/GapsPage";

export default function App() {
  const health = useGet<{ status: string; profile: string }>("/health");
  return (
    <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">ACE Insights — GDB coverage gaps</h1>
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>
            Which farmer questions the Golden DB cannot answer yet, and where to grow it next.
          </p>
        </div>
        {health.data && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            profile {health.data.profile}
          </span>
        )}
      </header>
      <GapsPage />
      <footer className="mt-8 text-xs" style={{ color: "var(--muted)" }}>
        ACE Insights · companion analytics for the AjraSakha farmer-advisory bot · data refreshed by the weekly pipeline.
      </footer>
    </div>
  );
}
