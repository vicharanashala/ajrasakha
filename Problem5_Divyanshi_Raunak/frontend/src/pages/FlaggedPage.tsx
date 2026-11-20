import { useAppContext } from '../context/AppContext';
import { FlaggedQueueView } from '../components/FlaggedQueueView';
import { BackendOfflineError } from '../components/BackendOfflineError';

export function FlaggedPage() {
  const { 
    isOnline,
    flaggedQueue, 
    flaggedTotal, 
    flaggedConfig, 
    isRefreshing, 
    refreshAll, 
    resolveFlagged, 
    updateConfig 
  } = useAppContext();

  if (!isOnline && flaggedQueue.length === 0) {
    return (
      <BackendOfflineError 
        title="Flagged Responses Queue Offline"
        message="Unable to fetch flagged questions from the backend. The queue requires an active connection to the feedback analysis engine."
        onRetry={refreshAll}
      />
    );
  }

  return (
    <FlaggedQueueView
      queue={flaggedQueue}
      total={flaggedTotal}
      config={flaggedConfig}
      isLoading={isRefreshing}
      onRefresh={refreshAll}
      onResolve={resolveFlagged}
      onUpdateConfig={updateConfig}
    />
  );
}

export default FlaggedPage;
