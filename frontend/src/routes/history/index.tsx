import { FullSubmissionHistory } from "@/components/submission-history";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useCoordinatorRedirect } from "@/hooks/useCoordinatorRedirect";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/history/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isCheckingCoordinator, isCoordinator } = useCoordinatorRedirect();
  const { data: user } = useGetCurrentUser({});
  const {
    selectedHistoryId,
  } = useSelectedQuestion();
  if (isCheckingCoordinator || isCoordinator) return null;

  return (
    <FullSubmissionHistory
      currentUser={user!}
      selectedHistoryId={selectedHistoryId}
    />
  );
}
