import { FullSubmissionHistory } from "@/components/submission-history";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/history/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: user } = useGetCurrentUser({});
  const {
    selectedHistoryId,
  } = useSelectedQuestion();
  return (
    <FullSubmissionHistory
      currentUser={user!}
      selectedHistoryId={selectedHistoryId}
    />
  );
}
