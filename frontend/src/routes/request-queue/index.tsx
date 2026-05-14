import { RequestsPage } from '@/components/request-page'
import { useSelectedQuestion } from '@/hooks/api/question/useSelectedQuestion';
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/request-queue/')({
  component: RouteComponent,
})

function RouteComponent() {
      const {selectedRequestId} = useSelectedQuestion();
  return (
    <RequestsPage autoSelectId={selectedRequestId} />
  )
}
