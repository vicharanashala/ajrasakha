import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const links = [
  { to: '/', label: 'Overview' },
  { to: '/domains', label: 'Domains' },
  { to: '/languages', label: 'Languages' },
  { to: '/states', label: 'States' },
  { to: '/flagged', label: 'Flagged' },
  { to: '/digest', label: 'Digest' },
  { to: '/test', label: '🧪 Test Panel' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  return (
    <nav className="bg-green-800 text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-bold text-lg">🌾 Feedback Dashboard</span>
        <button
          className="md:hidden text-white text-2xl"
          onClick={() => setOpen(!open)}
        >
          {open ? '✕' : '☰'}
        </button>
        <div className="hidden md:flex gap-4">
          {links.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm px-2 py-1 rounded hover:bg-green-700 ${
                location.pathname === link.to ? 'bg-green-600 font-bold' : ''
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      {open && (
        <div className="md:hidden flex flex-col px-4 pb-3 gap-2">
          {links.map(link => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className={`text-sm px-3 py-2 rounded hover:bg-green-700 ${
                location.pathname === link.to ? 'bg-green-600 font-bold' : ''
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}
