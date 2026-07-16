import { Counter } from "./Counter";
import { NAV } from "../data/nav";

interface HeaderProps {
  /** Section currently in view — highlights the matching nav link. */
  activeNav: string;
  onLogin: () => void;
  /** Ticker: questions that entered the database today / this month (IST). */
  today: number;
  thisMonth: number;
}

/** Scroll to a section by id without putting the hash in the URL. */
function scrollToSection(id: string, e: React.MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

/**
 * GoI-style banner (brand + section nav) and, below it, a light utility bar carrying
 * the ticker and the right-aligned Login button. Sticky — stays at the top on scroll.
 */
export const Header = ({ activeNav, onLogin, today, thisMonth }: HeaderProps) => (
  <>
    <header className="top">
      <div className="top-bar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div className="brand-text">
            <div className="name">annam.ai</div>
            <div className="tag">ACE — National Public Dashboard</div>
          </div>
        </div>
        <nav className="nav-links">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className={activeNav === n.id ? "active" : ""}
              onClick={(e) => scrollToSection(n.id, e)}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </div>
    </header>

    <div className="util-bar">
      <div className="util-inner">
        <div className="ticker">
          {/* LIVE badge */}
          <div className="ticker-live">
            <span className="status-dot" />
            <span className="ticker-live-text">Live</span>
          </div>

          {/* Divider */}
          <div className="ticker-divider" />

          {/* Today */}
          <div className="ticker-stat">
            <span className="ticker-stat-label">Questions today</span>
            <span className="ticker-stat-value"><Counter value={today} /></span>
          </div>

          {/* Divider */}
          <div className="ticker-divider" />

          {/* This month */}
          <div className="ticker-stat">
            <span className="ticker-stat-label">This month</span>
            <span className="ticker-stat-value"><Counter value={thisMonth} /></span>
          </div>
        </div>

        <button className="login-btn" onClick={onLogin}>
          Login
        </button>
      </div>
    </div>
  </>
);
