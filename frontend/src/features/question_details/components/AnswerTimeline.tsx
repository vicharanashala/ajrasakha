import { AnswerItem } from "./AnswerItem";
import type {
  IAnswer,
  IQuestionFullData,
  IRerouteHistoryResponse,
  ISubmission,
  UserRole,
} from "@/types";
import { Badge } from "@/components/atoms/badge";
import { Timeline } from "primereact/timeline";

interface IAnswerTimelineProps {
  answers: IAnswer[];
  currentUserId: string | undefined;
  question: IQuestionFullData;
  answerVisibleCount: number;
  commentRef: React.RefObject<HTMLDivElement>;
  userRole: UserRole;
  queue: ISubmission["queue"];
  rerouteQuestion?: IRerouteHistoryResponse[];
}
export const AnswerTimeline = ({
  answers,
  currentUserId,
  question,
  answerVisibleCount,
  commentRef,
  userRole,
  queue,
  rerouteQuestion,
}: IAnswerTimelineProps) => {
  // map answers to timeline events
  const events = answers.slice(0, answerVisibleCount).map((ans) => {
    const submission = question.submission.history.find(
      (h) => h.answer?._id === ans?._id
    );

    return {
      lastAnswerId: answers[0]?._id, // first one will be the last one
      firstAnswerId: answers[answers?.length - 1]?._id, // last one will be the first one
      answer: ans,
      submission,
      createdAt: new Date(ans.createdAt || "").toLocaleString(),
    };
  });

  return (
    <div className="w-full">
      <Timeline
        value={events}
        align="alternate"
        opposite={(item) => (
          <div className="ml-5 flex flex-col gap-1 ">
            {item.submission?.updatedBy && (
              <div className="text-xs text-foreground px-2 py-1 rounded-md">
                <span className="font-medium">By:</span>{" "}
                {item?.submission?.updatedBy?.name}
                {item?.submission?.updatedBy?.email && (
                  <> ({item.submission.updatedBy.email})</>
                )}
                {item?.submission?.updatedBy?.email &&
                  item?.firstAnswerId === item?.submission?.answer?._id && (
                    <span className="ml-2 px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 font-semibold">
                      Author
                    </span>
                  )}
              </div>
            )}

            <small className="text-xs text-muted-foreground mt-1">
              {item.createdAt}
            </small>
            <div>
              {item?.submission?.isReroute && (
                <Badge
                  variant="outline"
                  className="text-green-600 border-green-600"
                >
                  ReRouted
                </Badge>
              )}
            </div>
          </div>
        )}
        content={(item) => (
          <div className="flex-1 mb-5">
            <AnswerItem
              answer={item.answer}
              lastAnswerId={item.lastAnswerId}
              firstAnswerId={item.firstAnswerId}
              submissionData={item.submission}
              currentUserId={currentUserId}
              questionStatus={question.status}
              questionId={question._id}
              ref={commentRef}
              userRole={userRole}
              queue={queue}
              rerouteQuestion={rerouteQuestion}
            />
          </div>
        )}
      />
    </div>
  );
};
