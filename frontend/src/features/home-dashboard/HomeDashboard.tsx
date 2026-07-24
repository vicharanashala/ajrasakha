import { useNavigate } from "@tanstack/react-router";
import "./home-dashboard.css";

/**
 * A simple public dashboard used as the app's landing page (route "/").
 * No authentication required — shows a welcome hero with a Login action in the top bar.
 */
export const HomeDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="home-dash">
      {/* Top bar with Login button */}
      <header className="home-dash-header">
        <div className="home-dash-brand">ANNAM.AI</div>
        <button
          className="home-dash-login"
          onClick={() => navigate({ to: "/auth" })}
        >
          Login
        </button>
      </header>

      {/* Hero / welcome */}
      <main className="home-dash-main">
        <h1 className="home-dash-title">Hello</h1>
        <p className="home-dash-subtitle">
          Welcome to the public dashboard.
        </p>
      </main>
    </div>
  );
};

export default HomeDashboard;
