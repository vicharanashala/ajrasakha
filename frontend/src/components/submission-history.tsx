import type { IUser } from "@/types";
import UserActivityHistory from "./ExpertHistory";

export const FullSubmissionHistory = ({
  selectedHistoryId,
  expertId,
}: {
  currentUser: IUser;
  selectedHistoryId: string | null;
  expertId?: string | null;
}) => {
  return (
    <UserActivityHistory
      selectedHistoryId={selectedHistoryId}
      expertId={expertId}
    />
  );
};
