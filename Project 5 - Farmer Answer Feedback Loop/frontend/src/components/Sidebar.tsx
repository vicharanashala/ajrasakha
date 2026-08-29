import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getFlaggedEntries } from '../client/api'
import { FiBarChart2, FiDatabase, FiGrid, FiMap, FiFlag, FiFileText, FiMessageCircle, FiFeather } from 'react-icons/fi'

const navItems = [
  { to: '/overview', icon: <FiBarChart2 />, label: 'Overview' },
  { to: '/gdb-entries', icon: <FiDatabase />, label: 'GDB Entries' },
  { to: '/domain-analysis', icon: <FiGrid />, label: 'Domain Analysis' },
  { to: '/state-language', icon: <FiMap />, label: 'State & Language' },
]

export default function Sidebar() {
  const location = useLocation()
  const [flaggedCount, setFlaggedCount] = useState(0)

  useEffect(() => {
    getFlaggedEntries({ status: 'flagged' })
      .then(d => setFlaggedCount(d.total || 0))
      .catch(() => {})
  }, [location.pathname])

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-badge">
          <div className="logo-icon"><FiFeather /></div>
          <div className="logo-text">
            <span className="app-name">ACE Feedback</span>
            <span className="app-sub">GDB Quality Monitor</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <span className="nav-section-title">Analytics</span>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        <span className="nav-section-title" style={{ marginTop: '0.5rem' }}>Management</span>
        <NavLink
          to="/flagged"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span className="nav-icon"><FiFlag /></span>
          Flagged Entries
          {flaggedCount > 0 && (
            <span className="nav-badge">{flaggedCount}</span>
          )}
        </NavLink>
        <NavLink
          to="/weekly-digest"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span className="nav-icon"><FiFileText /></span>
          Weekly Digest
          <span className="nav-badge green">AI</span>
        </NavLink>

        <span className="nav-section-title" style={{ marginTop: '0.5rem' }}>Demo</span>
        <NavLink
          to="/whatsapp-sim"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span className="nav-icon"><FiMessageCircle /></span>
          WhatsApp Sim
          <span className="nav-badge amber">LIVE</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-status">
          <div className="status-dot" />
          <span>API Connected</span>
        </div>
      </div>
    </aside>
  )
}
