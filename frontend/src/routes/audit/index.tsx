import AuditPage from '@/components/AuditPage'
import { useCoordinatorRedirect } from '@/hooks/useCoordinatorRedirect'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/audit/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { isCheckingCoordinator, isCoordinator } = useCoordinatorRedirect();
  if (isCheckingCoordinator || isCoordinator) return null;

  return <AuditPage />;
}
