import { RequestsPage } from '@/components/request-page'
import { useSelectedQuestion } from '@/hooks/api/question/useSelectedQuestion';
import { useCoordinatorRedirect } from '@/hooks/useCoordinatorRedirect';
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/flags-reported/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { isCheckingCoordinator, isCoordinator } = useCoordinatorRedirect();
  const {selectedRequestId} = useSelectedQuestion();
  if (isCheckingCoordinator || isCoordinator) return null;

  return (
    <RequestsPage autoSelectId={selectedRequestId} />
  )
}
