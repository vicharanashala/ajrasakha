import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Overview from './pages/Overview'
import Domains from './pages/Domains'
import Languages from './pages/Languages'
import States from './pages/States'
import Flagged from './pages/Flagged'
import Digest from './pages/Digest'
import TestPanel from './pages/TestPanel'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-5xl mx-auto">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/domains" element={<Domains />} />
            <Route path="/languages" element={<Languages />} />
            <Route path="/states" element={<States />} />
            <Route path="/flagged" element={<Flagged />} />
            <Route path="/digest" element={<Digest />} />
            <Route path="/test" element={<TestPanel />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
