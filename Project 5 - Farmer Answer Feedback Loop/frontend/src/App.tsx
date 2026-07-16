import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Overview from './pages/Overview'
import GDBEntries from './pages/GDBEntries'
import DomainAnalysis from './pages/DomainAnalysis'
import StateLanguage from './pages/StateLanguage'
import FlaggedEntries from './pages/FlaggedEntries'
import WeeklyDigest from './pages/WeeklyDigest'
import WhatsAppSim from './pages/WhatsAppSim'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/gdb-entries" element={<GDBEntries />} />
            <Route path="/domain-analysis" element={<DomainAnalysis />} />
            <Route path="/state-language" element={<StateLanguage />} />
            <Route path="/flagged" element={<FlaggedEntries />} />
            <Route path="/weekly-digest" element={<WeeklyDigest />} />
            <Route path="/whatsapp-sim" element={<WhatsAppSim />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
