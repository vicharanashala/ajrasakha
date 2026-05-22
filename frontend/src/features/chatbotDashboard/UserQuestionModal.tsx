import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";

import { Badge } from "@/components/atoms/badge";

import { Button } from "@/components/atoms/button";

import { useUserQuestionsData } from "./hooks/useUserQuestionData";

import { useEffect, useMemo, useState } from "react";

interface UserQuestionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  source: string;
  userType: string;
}

const UserQuestionsModal = ({
  open,
  onOpenChange,
  user,
  source,
  userType,
}: UserQuestionsModalProps) => {

  const [currentPage, setCurrentPage] = useState(1);

  const [viewType, setViewType] = useState<
    "messages" | "questions"
  >("messages");

  // Reset page when modal closes or user changes
  useEffect(() => {
    setCurrentPage(1);
  }, [user?.email, viewType]);

  const {
    data: fullData,
    isLoading,
  } = useUserQuestionsData(
    user?.email || "",
    source as any,
    userType as any,
    currentPage,
    10,
  );
  console.log("UserQuestionsModal data:", fullData);
  const activeData = useMemo(() => {
    return viewType === "questions"
      ? fullData?.questions
      : fullData?.messages;
  }, [viewType, fullData]);

  const items = useMemo(() => {
    return viewType === "questions"
      ? activeData?.questions || []
      : activeData?.messages || [];
  }, [viewType, activeData]);

  const totalCount =
    viewType === "questions"
      ? fullData?.questions?.totalQuestions ?? 0
      : user?.totalQuestions?.toLocaleString() ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">

        {/* Header */}

        <DialogHeader>
          <DialogTitle>
            User Activity
          </DialogTitle>
        </DialogHeader>

        {/* Toggle */}

        <div className="flex items-center gap-2 border-b pb-4">

          <Button
            variant={
              viewType === "messages"
                ? "default"
                : "outline"
            }
            onClick={() => {
              setCurrentPage(1);
              setViewType("messages");
            }}
          >
            Messages
          </Button>

          <Button
            variant={
              viewType === "questions"
                ? "default"
                : "outline"
            }
            onClick={() => {
              setCurrentPage(1);
              setViewType("questions");
            }}
          >
            Questions
          </Button>

        </div>

        {/* User Details */}

        {user && (
          <div className="space-y-2 border-b pb-4">

            <div>
              <span className="font-semibold">
                Name:
              </span>{" "}
              {user.name}
            </div>

            <div>
              <span className="font-semibold">
                Email:
              </span>{" "}
              {user.email}
            </div>

            <div>
              <span className="font-semibold">
                {viewType === "questions"
                  ? "Total Questions:"
                  : "Total Messages:"}
              </span>{" "}
              {totalCount}
            </div>

          </div>
        )}

        {/* Content */}

        <div className="flex-1 overflow-y-auto mt-4 space-y-4">

          {isLoading ? (

            <div className="text-center py-10">
              Loading {viewType}...
            </div>

          ) : items.length === 0 ? (

            <div className="text-center py-10 text-muted-foreground">
              No {viewType} found.
            </div>

          ) : (

            items.map((item: any, idx: number) => (

              <div
                key={idx}
                className="border rounded-lg p-4 space-y-3"
              >

                {/* Top Section */}

                <div className="flex items-start justify-between gap-4">

                  <div className="font-medium break-words flex-1">

                    {viewType === "questions"
                      ? item.question
                      : item.message}

                  </div>

                  <div className="flex items-center gap-2 flex-wrap">

                    {/* Question Status */}

                    {viewType === "questions" && (
                      <Badge
                        variant={
                          item.status === "duplicate"
                            ? "destructive"
                            : item.status === "closed"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {item.status}
                      </Badge>
                    )}

                    {/* Duplicate Badge */}

                    {item.isDuplicate && (
                      <Badge variant="outline">

                        Repeated{" "}
                        {item.repeatedCount}{" "}
                        {item.repeatedCount > 1
                          ? "times"
                          : "time"}

                      </Badge>
                    )}

                  </div>

                </div>

                {/* Dates */}

                <div className="text-sm text-muted-foreground flex flex-wrap gap-4">

                  <div>
                    Created:{" "}
                    {item.createdAt
                      ? new Date(
                          item.createdAt,
                        ).toLocaleString()
                      : "—"}
                  </div>

                  <div>
                    Updated:{" "}
                    {item.updatedAt
                      ? new Date(
                          item.updatedAt,
                        ).toLocaleString()
                      : "—"}
                  </div>

                </div>

              </div>

            ))
          )}

        </div>

        {/* Pagination */}

        {activeData?.totalPages > 1 && (

          <div className="flex items-center justify-between pt-4 border-t">

            <Button
              variant="outline"
              disabled={currentPage === 1}
              onClick={() =>
                setCurrentPage((p) => p - 1)
              }
            >
              Previous
            </Button>

            <div className="text-sm text-muted-foreground">

              Page {currentPage} of{" "}
              {activeData?.totalPages}

            </div>

            <Button
              variant="outline"
              disabled={
                currentPage ===
                activeData?.totalPages
              }
              onClick={() =>
                setCurrentPage((p) => p + 1)
              }
            >
              Next
            </Button>

          </div>
        )}

      </DialogContent>
    </Dialog>
  );
};

export default UserQuestionsModal;