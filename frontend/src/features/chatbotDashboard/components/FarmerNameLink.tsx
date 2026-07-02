import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

const isLikelyObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value);

export function FarmerNameLink({
  userId,
  children,
  className = "",
}: {
  userId?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();

  if (!userId || !isLikelyObjectId(String(userId))) {
    return <span className={className}>{children}</span>;
  }

  const validUserId = String(userId);

  return (
    <button
      type="button"
      className={`text-left text-primary hover:underline ${className}`}
      onClick={() =>
        navigate({
          to: "/user/$userId",
          params: { userId: validUserId },
        })
      }
    >
      {children}
    </button>
  );
}
