import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar with Login button */}
      <header
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "16px 24px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <button
          onClick={() => navigate({ to: "/auth" })}
          style={{
            padding: "8px 20px",
            borderRadius: "8px",
            border: "none",
            background: "#178a48",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Login
        </button>
      </header>

      {/* Hello content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1 style={{ fontSize: "48px", fontWeight: 700 }}>Hello</h1>
      </main>
    </div>
  );
}
