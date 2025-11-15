import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export const ExpandableText = ({
  text,
  maxLength = 150,
}: {
  text: string;
  maxLength?: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (text.length <= maxLength) {
    return <span>{text}</span>;
  }

  return (
    <div className="space-y-2">
      <p>{isExpanded ? text : `${text.substring(0, maxLength)}...`}</p>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
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
