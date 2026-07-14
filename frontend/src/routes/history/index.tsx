import { FullSubmissionHistory } from "@/components/submission-history";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useCoordinatorRedirect } from "@/hooks/useCoordinatorRedirect";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const Route = createFileRoute("/history/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isCheckingCoordinator, isCoordinator } = useCoordinatorRedirect();
  const { data: user } = useGetCurrentUser({});
  const {
    selectedHistoryId,
  } = useSelectedQuestion();
  const { expertId } = useSearch({ strict: false });
  if (isCheckingCoordinator || isCoordinator) return null;

  return (
    <div>
      <Breadcrumbs />
      <FullSubmissionHistory
        currentUser={user!}
        selectedHistoryId={selectedHistoryId}
        expertId={expertId ?? null}
      />
    </div>
  );
}
