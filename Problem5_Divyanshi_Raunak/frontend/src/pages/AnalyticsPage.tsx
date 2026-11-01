import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { AnalyticsView } from '../components/AnalyticsView';
import { BackendOfflineError } from '../components/BackendOfflineError';

export function AnalyticsPage() {
  const navigate = useNavigate();
  const { overview, domains, states, rootCauses, isLoading, isOnline, refreshAll } = useAppContext();

  if (!isOnline && !overview) {
    return (
      <BackendOfflineError 
        onRetry={refreshAll}
        title="Executive Analytics Unavailable"
        message="Unable to load real-time farmer feedback KPIs and quality analytics from the FastAPI backend."
      />
    );
  }

  return (
    <AnalyticsView
      overview={overview}
      domains={domains}
      states={states}
      rootCauses={rootCauses}
      isLoading={isLoading}
      onNavigateToFlagged={() => navigate('/flagged')}
    />
  );
}

export default AnalyticsPage;
