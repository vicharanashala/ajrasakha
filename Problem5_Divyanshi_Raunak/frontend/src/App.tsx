import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store, useAppDispatch, useAppSelector } from './store';
import { fetchDashboardData, checkBackendHealth } from './store/slices/feedbackSlice';
import { removeToast } from './store/slices/toastSlice';
import { Header } from './components/Header';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { FlaggedPage } from './pages/FlaggedPage';
import { WhatsAppPage } from './pages/WhatsAppPage';
import { GdbPage } from './pages/GdbPage';
import { DigestPage } from './pages/DigestPage';
import { WeatherPage } from './pages/WeatherPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

function ToastContainer() {
  const dispatch = useAppDispatch();
  const toasts = useAppSelector((state) => state.toast.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 p-3.5 rounded-xl text-sm bg-slate-900/95 backdrop-blur-md border border-white/10 shadow-2xl text-slate-100 toast-slide-in ${toast.type === 'success' ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-rose-500'
            }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle size={18} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle size={18} className="text-rose-400 shrink-0" />
          )}
          <span className="flex-1 font-medium">{toast.message}</span>
          <button
            onClick={() => dispatch(removeToast(toast.id))}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function MainLayout() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(fetchDashboardData());
    const interval = setInterval(() => {
      dispatch(checkBackendHealth());
    }, 30000);
    return () => clearInterval(interval);
  }, [dispatch]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 pb-12">
        <Routes>
          <Route path="/" element={<AnalyticsPage />} />
          <Route path="/analytics" element={<Navigate to="/" replace />} />
          <Route path="/flagged" element={<FlaggedPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
          <Route path="/gdb" element={<GdbPage />} />
          <Route path="/digest" element={<DigestPage />} />
          <Route path="/weather" element={<WeatherPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <ToastContainer />
    </div>
  );
}

export function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    </Provider>
  );
}

export default App;
