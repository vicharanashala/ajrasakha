import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

const isLikelyObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value);

export function QuestionIdLink({
  questionId,
  children,
  className = "",
}: {
  questionId?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();

  if (!questionId || !isLikelyObjectId(String(questionId))) {
    return <span className={className}>{children}</span>;
  }

  const validQuestionId = String(questionId);

  return (
    <button
      type="button"
      className={`text-left text-primary hover:underline ${className}`}
      onClick={() =>
        navigate({
          to: "/home",
          search: (prev: any) => ({ ...prev, question: validQuestionId }),
        })
      }
    >
      {children}
    </button>
  );
}
