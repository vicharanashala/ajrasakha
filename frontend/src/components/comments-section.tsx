import { useAddComment } from "@/hooks/api/comment/useAddComment";
import { useGetComments } from "@/hooks/api/comment/useGetComments";
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./atoms/accordion";
import { Loader2, MessageSquare } from "lucide-react";
import { Badge } from "./atoms/badge";
import { ScrollArea } from "./atoms/scroll-area";
import { formatDate } from "@/utils/formatDate";
import { Textarea } from "./atoms/textarea";
import { Button } from "./atoms/button";

interface CommentsSectionProps {
  questionId: string;
  answerId: string;
  isMine: boolean;
}

export const CommentsSection = forwardRef(
  ({ questionId, answerId, isMine }: CommentsSectionProps, ref) => {
    const LIMIT = 1;

    const {
      data: commentsData,
      refetch,
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
      isLoading,
    } = useGetComments(LIMIT, questionId, answerId);

    const comments =
      commentsData?.pages.flatMap((p) => p?.comments ?? []) ?? [];
    const totalComments = commentsData?.pages?.[0]?.total ?? 0;
    const displayCount = totalComments > 99 ? "99+" : totalComments;

    const [comment, setComment] = useState("");
    const observer = useRef<IntersectionObserver | null>(null);
    const { mutateAsync: addComment, isPending: isAddingComment } =
      useAddComment();

    useImperativeHandle(ref, () => ({
      refetchComments: refetch,
    }));

    const submitComment = async () => {
      if (!comment.trim()) return;
      try {
        await addComment({
          questionId,
          answerId,
          text: comment.trim(),
        });
        setComment("");
      } catch (err) {
        console.error("Failed to submit comment:", err);
      }
    };

    const lastCommentRef = useCallback(
      (node: HTMLDivElement | null) => {
        if (isFetchingNextPage) return;
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting && hasNextPage) {
            fetchNextPage();
          }
        });

        if (node) observer.current.observe(node);
      },
      [isFetchingNextPage, fetchNextPage, hasNextPage]
    );

    return (
      <div className="w-full sm:w-auto">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="comments" className="border-none">
            <AccordionTrigger className="flex items-center gap-2 text-sm font-medium p-3 hover:bg-muted/50 rounded-lg shadow-md">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>Comments</span>
                {totalComments > 0 && (
                  <Badge className="h-6 w-6 p-0 flex items-center justify-center text-xs no-underline">
                    {displayCount}
                  </Badge>
                )}
              </div>
            </AccordionTrigger>

            <AccordionContent className="p-4">
              <div className="space-y-4">
                {/* Loading */}
                {isLoading ? (
                  <div className="flex justify-center items-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {isMine
                      ? "You haven't received any comments yet."
                      : "No comments yet. Be the first to add one!"}
                  </p>
                ) : (
                  <ScrollArea className="h-[40vh] pe-2">
                    <div className="space-y-3 p-2">
                      {comments.map((c, idx) => {
                        const isLast = idx === comments.length - 1;

                        return (
                          <div
                            key={c._id}
                            ref={isLast ? lastCommentRef : null}
                            className={`rounded-lg border bg-muted/30 p-3 ${
                              idx % 2 === 0 ? "bg-secondary/80" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-muted-foreground">
                                {c.userName || "Unknown User"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(new Date(c.createdAt))}
                              </span>
                            </div>
                            <p className="text-sm ms-2 leading-relaxed">
                              {c.text}
                            </p>
                          </div>
                        );
                      })}

                      {isFetchingNextPage && (
                        <div className="text-center text-sm text-muted-foreground py-2">
                          Loading more...
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}

                {/* Add comment */}
                {!isMine && (
                  <div className="space-y-3 border-t-2 pt-3">
                    <Textarea
                      placeholder="Add your comment here..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      className="resize-none h-[8vh] md:h-[20vh]"
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={submitComment}
                        size="sm"
                        disabled={!comment.trim() || isAddingComment}
                        className="md:p-2"
                      >
                        {isAddingComment ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />{" "}
                            Submitting...
                          </>
                        ) : (
                          "Submit"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  }
);
