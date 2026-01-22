
import type {
  IReviewParmeters,
} from "@/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/atoms/tooltip";
import {
 Info,
} from "lucide-react";
import { Switch } from "../../components/atoms/switch";
import { Label } from "../../components/atoms/label";
interface ReviewChecklistProps {
  value: IReviewParmeters;
  onChange: (values: IReviewParmeters) => void;
}

export const ReviewChecklist = ({ value, onChange }: ReviewChecklistProps) => {
  const handleToggle = (key: keyof IReviewParmeters) => {
    onChange({
      ...value,
      [key]: !value[key],
    });
  };

  const items = [
    {
      key: "contextRelevance",
      label: "Context & Relevance",
      desc: "Checks whether the response directly addresses the question, stays on topic, and provides contextually appropriate information.",
    },
    {
      key: "technicalAccuracy",
      label: "Technical Accuracy",
      desc: "Ensures the explanation, data, and facts are correct and technically sound without misinformation.",
    },
    {
      key: "practicalUtility",
      label: "Practical Utility",
      desc: "Verifies whether the answer provides actionable, useful, and implementable guidance for real-world scenarios.",
    },
    {
      key: "valueInsight",
      label: "Value Addition / Insight",
      desc: "Evaluates whether the response goes beyond basics by offering insights, examples, or additional meaningful knowledge.",
    },
    {
      key: "credibilityTrust",
      label: "Credibility & Trust",
      desc: "Checks for reliability, neutrality, proper reasoning, and whether the tone conveys trustworthiness and unbiased information.",
    },
    {
      key: "readabilityCommunication",
      label: "Readability & Communication",
      desc: "Ensures the answer is easy to read, well-structured, grammatically clear, and effectively communicates the intended message.",
    },
  ] as const;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger className="cursor-pointer">
                  <Info className="w-4 h-4 text-primary" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs p-3 text-sm">
                  {item.desc}
                </TooltipContent>
              </Tooltip>
              <Label className="text-sm font-medium">{item.label}</Label>
            </div>

            <Switch
              checked={value[item.key]}
              onCheckedChange={() => handleToggle(item.key)}
            />
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
};