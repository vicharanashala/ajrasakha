import { Button } from "@/components/atoms/button";
import { useFetchAnswer } from "@/hooks/api/answer/useGetAiInitialAnswer";
import {
  useEditGdbFlag,
  useEditGdbSources,
  useGdbDecision,
  useGdbItem,
  usePushToGdb,
  useSaveGdbCorrection,
} from "@/hooks/api/gdbCleaning/useGdbCleaning";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { GdbDetailView } from "./GdbDetailView";

interface GdbDetailPageProps {
  id: string;
  onBack: () => void;
}

// loads one answer and passes the reviewer's actions to the server
export const GdbDetailPage = ({ id, onBack }: GdbDetailPageProps) => {
  const { data: item, isLoading, error } = useGdbItem(id);
  const saveCorrection = useSaveGdbCorrection(id);
  const decision = useGdbDecision(id);
  const editFlag = useEditGdbFlag(id);
  const editSources = useEditGdbSources(id);
  const push = usePushToGdb(id);
  // the AI draft the author page uses: it returns an answer in the predefined structure
  const aiDraft = useFetchAnswer();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading the answer...</p>;
  }

  if (error || !item) {
    return (
      <div className="space-y-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to list
        </Button>
        <p className="text-sm text-red-700 dark:text-red-400">
          Could not load this answer{error ? `: ${(error as Error).message}` : "."}
        </p>
      </div>
    );
  }

  return (
    <GdbDetailView
      key={item.id}
      item={item}
      busy={saveCorrection.isPending || decision.isPending || editFlag.isPending || editSources.isPending || push.isPending}
      drafting={aiDraft.isPending}
      onDraftWithAi={async () => {
        try {
          const result = await aiDraft.mutateAsync({
            query: item.question,
            crop: item.crop,
            state: item.state,
          });
          if (!result?.answer) {
            toast.error("The AI did not return an answer.");
            return null;
          }
          return String(result.answer);
        } catch {
          toast.error("Failed to draft the answer with AI.");
          return null;
        }
      }}
      onBack={onBack}
      onAccept={(comment) => decision.mutate({ action: "accept", comment })}
      onDismiss={(comment) => decision.mutate({ action: "dismiss", comment })}
      onSaveCorrection={(text) => saveCorrection.mutateAsync({ questionId: item.questionId, correctedAnswer: text })}
      onEditFlag={(parameter, result, comment) => editFlag.mutateAsync({ parameter, result, comment })}
      onSaveSources={(sources) => editSources.mutateAsync({ questionId: item.questionId, sources })}
      onPush={() => push.mutateAsync()}
    />
  );
};
