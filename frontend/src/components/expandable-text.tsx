import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export const ExpandableText = ({
  text,
  maxLength = 150,
  isExpanded,
  onToggle,
}: {
  text: string;
  maxLength?: number;
  isExpanded?: boolean;
  onToggle?: () => void;
}) => {
  if (text.length <= maxLength) {
    return <span>{text}</span>;
  }

  return (
    <div className="space-y-2">
      <p>{isExpanded ? text : `${text.substring(0, maxLength)}...`}</p>
      <button
        onClick={onToggle}
        className="text-sm text-primary hover:underline flex items-center gap-1"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="w-3 h-3" />
            View Less
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" />
            View More
          </>
        )}
      </button>
    </div>
  );
};
