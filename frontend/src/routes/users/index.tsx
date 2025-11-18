import { UsersPage } from '@/components/users-page'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/users/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <UsersPage/>
}
