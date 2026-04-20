import type { IUser } from "@/types";
import UserActivityHistory from "./ExpertHistory";

export const FullSubmissionHistory = ({
  selectedHistoryId,
}: {
  currentUser: IUser;
  selectedHistoryId: string | null;
}) => {
  return <UserActivityHistory selectedHistoryId={selectedHistoryId} />;
};
