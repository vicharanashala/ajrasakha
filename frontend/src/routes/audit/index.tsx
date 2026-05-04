import AuditPage from '@/components/AuditPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/audit/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <AuditPage />;
}
