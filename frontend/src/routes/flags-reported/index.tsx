import { RequestsPage } from '@/components/FlagsReported'
import { useSelectedQuestion } from '@/hooks/api/question/useSelectedQuestion';
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/flags-reported/')({
  component: RouteComponent,
})

function RouteComponent() {
      const {selectedRequestId} = useSelectedQuestion();
  return (
    <RequestsPage autoSelectId={selectedRequestId} />
  )
}
