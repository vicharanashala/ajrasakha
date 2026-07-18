import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { DashboardTab } from "../data/tabs";

interface HeaderProps {
  tabs: DashboardTab[];
  /** Currently selected top-level tab. */
  activeTab: string;
  onTabChange: (id: string) => void;
  onLogin: () => void;
}

/**
 * GoI-style banner: brand + top-level tabs + Login button, all in the green header.
 * Sticky — stays at the top on scroll. The tabs switch between separate views (ACE
 * Dashboard, Question Collection, and future ones); on narrow screens they collapse behind
 * a hamburger button.
 */
export const Header = ({ tabs, activeTab, onTabChange, onLogin }: HeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const onTabClick = (tab: DashboardTab) => {
    if (tab.comingSoon) return;
    onTabChange(tab.id);
    setMenuOpen(false); // collapse the mobile menu after choosing a tab
  };

  return (
    <header className="top">
      <div className="top-bar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div className="brand-text">
            <div className="name">annam.ai</div>
            <div className="tag">ACE — National Public Dashboard</div>
          </div>
        </div>

        <button
          className="nav-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <nav className={`nav-links tab-bar${menuOpen ? " open" : ""}`} role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              disabled={t.comingSoon}
              className={`tab${activeTab === t.id ? " active" : ""}${t.comingSoon ? " coming-soon" : ""}`}
              onClick={() => onTabClick(t)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <button className="login-btn header-login" onClick={onLogin}>
          Login
        </button>
      </div>
    </header>
  );
};
