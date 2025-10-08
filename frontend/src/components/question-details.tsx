import type { IAnswer, IQuestionFullData, ISubmission } from "@/types";
import { useMemo, useState } from "react";
import { Badge } from "./atoms/badge";
import { Card } from "./atoms/card";
import { Separator } from "./atoms/separator";
import { Textarea } from "./atoms/textarea";
import { Button } from "./atoms/button";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./atoms/dialog";
import { ScrollArea } from "./atoms/scroll-area";

interface QuestionDetailProps {
  question: IQuestionFullData;
  currentUserId: string;
}

const flattenAnswers = (submission: ISubmission): IAnswer[] => {
  const answers: IAnswer[] = [];
  for (const h of submission.history) {
    if (h.answer) {
      answers.push(h.answer);
    }
  }
  return answers.sort((a, b) => {
    const aT = a.updatedAt
      ? +new Date(a.updatedAt)
      : a.createdAt
      ? +new Date(a.createdAt)
      : 0;
    const bT = b.updatedAt
      ? +new Date(b.updatedAt)
      : b.createdAt
      ? +new Date(b.createdAt)
      : 0;
    return bT - aT;
  });
};

export const QuestionDetails = ({
  question,
  currentUserId,
}: QuestionDetailProps) => {
  const answers = useMemo(
    () => flattenAnswers(question?.submissions),
    [question.submissions]
  );

  return (
    <main className="mx-auto p-6 grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold text-pretty">
          {question.question}
        </h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{question.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {"Total answers: "}
            {question.totalAnswersCount}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {"Created: "}
          {new Date(question.createdAt).toLocaleString()}
          {" • Updated: "}
          {new Date(question.updatedAt).toLocaleString()}
        </div>
      </header>

      <ScrollArea className="h-[55vh] rounded-md border">
        <div className="px-4 py-2 grid gap-6">
          <Card className="p-4 grid gap-2">
            <p className="text-sm font-medium">Details</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">State:</span>{" "}
                {question.details.state}
              </div>
              <div>
                <span className="text-muted-foreground">District:</span>{" "}
                {question.details.district}
              </div>
              <div>
                <span className="text-muted-foreground">Crop:</span>{" "}
                {question.details.crop}
              </div>
              <div>
                <span className="text-muted-foreground">Season:</span>{" "}
                {question.details.season}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Domain:</span>{" "}
                {question.details.domain}
              </div>
            </div>
            <Separator />
            <div className="text-sm">
              <span className="text-muted-foreground">Source:</span>{" "}
              {question.source}
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Answers</h2>
            <SubmitAnswerDialog
              questionId={question._id}
              isAlreadySubmitted={question.isAlreadySubmitted}
              currentUserId={currentUserId}
              onSubmitted={() => {
                // Refetch logic can go here
              }}
            />
          </div>

          {answers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No answers yet.</p>
          ) : (
            <div className="grid gap-4">
              {answers.map((ans: any) => (
                <AnswerItem
                  key={`${ans._id}-${ans.answerIteration}`}
                  answer={ans}
                  currentUserId={currentUserId}
                  questionId={question._id}
                />
              ))}
            </div>
          )}

          <div className="pt-4">
            <h3 className="text-lg font-semibold">Submission history</h3>
            <div className="grid gap-3 mt-2">
              <Card key={question.submissions._id} className="p-4 grid gap-2">
                <div className="text-sm text-muted-foreground">
                  {"Submission updated: "}
                  {new Date(question.submissions.updatedAt).toLocaleString()}
                </div>
                <div className="grid gap-2">
                  {question.submissions.history.map((h: any, idx: number) => (
                    <div
                      key={`${question.submissions._id}-${idx}`}
                      className="rounded-md border p-2"
                    >
                      <div className="text-xs text-muted-foreground">
                        {"Updated at "}
                        {new Date(h.updatedAt).toLocaleString()}
                        {h.isFinalAnswer ? " • Final" : ""}
                        {h.updatedBy ? ` • By ${h.updatedBy.name}` : ""}
                      </div>
                      {h.answer && (
                        <div className="mt-2 text-sm whitespace-pre-wrap leading-relaxed">
                          {h.answer.answer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </ScrollArea>
    </main>
  );
};

interface AnswerItemProps {
  answer: IAnswer;
  currentUserId: string;
  questionId: string;
}

export const AnswerItem = ({
  answer,
  currentUserId,
  questionId,
}: AnswerItemProps) => {
  const isMine = answer.authorId === currentUserId;
  const [comment, setComment] = useState("");

  type Comment = {
    _id: string;
    questionId: string;
    answerId: string;
    authorId: string;
    text: string;
    createdAt: string;
  };
  const comments: Comment[] = [
    {
      _id: "67050a1f9f1b6d0012a7c1a1",
      questionId: "670509c29f1b6d0012a7c19b",
      answerId: "67050a009f1b6d0012a7c1a0",
      authorId: "670507f49f1b6d0012a7c190",
      text: "I think you could also mention the role of soil microbes here.",
      createdAt: "2025-10-08T12:45:21.000Z",
    },
    {
      _id: "67050a2f9f1b6d0012a7c1a2",
      questionId: "670509c29f1b6d0012a7c19b",
      answerId: "67050a009f1b6d0012a7c1a0",
      authorId: "670507f49f1b6d0012a7c191",
      text: "Good point! Maybe include a reference to recent studies on regenerative practices.",
      createdAt: "2025-10-08T12:47:10.000Z",
    },
    {
      _id: "67050a3e9f1b6d0012a7c1a3",
      questionId: "670509c29f1b6d0012a7c19b",
      answerId: "67050a1c9f1b6d0012a7c1a1",
      authorId: "670507f49f1b6d0012a7c192",
      text: "Can you clarify what you mean by 'minimal tillage'?",
      createdAt: "2025-10-08T12:49:05.000Z",
    },
    {
      _id: "67050a4d9f1b6d0012a7c1a4",
      questionId: "670509c29f1b6d0012a7c19c",
      answerId: "67050a009f1b6d0012a7c1a0",
      authorId: "670507f49f1b6d0012a7c193",
      text: "I appreciate the explanation — it helped clarify the process.",
      createdAt: "2025-10-08T12:50:30.000Z",
    },
    {
      _id: "67050a5e9f1b6d0012a7c1a5",
      questionId: "670509c29f1b6d0012a7c19d",
      answerId: "67050a009f1b6d0012a7c1a0",
      authorId: "670507f49f1b6d0012a7c194",
      text: "This seems accurate. You could also add an example for better clarity.",
      createdAt: "2025-10-08T12:52:15.000Z",
    },
  ];

  async function submitComment() {}

  return (
    <Card className="p-4 grid gap-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {"Iteration "}
          {answer.answerIteration}
          {answer.isFinalAnswer ? " • Final" : ""}
        </div>
        <div className="text-xs text-muted-foreground">
          {answer.updatedAt
            ? new Date(answer.updatedAt).toLocaleString()
            : answer.createdAt
            ? new Date(answer.createdAt).toLocaleString()
            : ""}
        </div>
      </div>
      <div className={"rounded-md p-3 bg-secondary text-secondary-foreground"}>
        <p className="whitespace-pre-wrap leading-relaxed">{answer.answer}</p>
      </div>

      {!isMine && (
        <div className="mt-2 grid gap-2">
          <p className="text-sm font-medium">Comments</p>

          <div className="grid gap-2">
            {false ? (
              <p className="text-sm text-muted-foreground">
                Loading comments...
              </p>
            ) : (comments.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No comments yet</p>
            ) : (
              <ul className="grid gap-2">
                {comments.map((c) => (
                  <li key={c._id} className="rounded-md border p-2">
                    <p className="text-sm">{c.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-2">
            <Textarea
              placeholder="Write a comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button onClick={submitComment} disabled={!comment.trim()}>
                Submit comment
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

interface SubmitAnswerDialogProps {
  questionId: string;
  isAlreadySubmitted: boolean;
  currentUserId: string;
  onSubmitted?: (answer: IAnswer) => void;
}

export const SubmitAnswerDialog = ({
  questionId,
  isAlreadySubmitted,
  onSubmitted,
}: SubmitAnswerDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");

  const triggerLabel = isAlreadySubmitted
    ? "Already submitted"
    : "Submit answer";

  async function handleSubmit() {
    if (!answer.trim()) {
      toast.error("Please write your answer before submitting.");
      return;
    }
    try {
      setLoading(true);
      //
      toast.success("Answer submitted");
      //   onSubmitted?.(data.data);
      setOpen(false);
      setAnswer("");
    } catch (e: any) {
      toast.error("Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" disabled={isAlreadySubmitted}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isAlreadySubmitted ? "Submit a new answer" : "Submit your answer"}
          </DialogTitle>
          <DialogDescription>
            {isAlreadySubmitted
              ? "You have already submitted an answer. Submitting again will create a new iteration."
              : "Provide your answer below to submit."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="answer">
            Your answer
          </label>
          <Textarea
            id="answer"
            placeholder="Write your answer..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={6}
          />
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Submitting..." : triggerLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
