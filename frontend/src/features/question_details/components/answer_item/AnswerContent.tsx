import type { IAnswer } from "@/types";

interface AnswerContentProps {
  answer: IAnswer;
}

export const AnswerContent = ({ answer }: AnswerContentProps) => {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="whitespace-pre-wrap leading-relaxed line-clamp-4 text-card-foreground px-5">
        {answer.answer}
      </p>
    </div>
  );
};
