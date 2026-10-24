import { Button } from "@/components/atoms/button";
import {
  useEditGdbFlag,
  useEditGdbSources,
  useGdbDecision,
  useGdbItem,
  usePushToGdb,
  useSaveGdbCorrection,
} from "@/hooks/api/gdbCleaning/useGdbCleaning";
import { ArrowLeft } from "lucide-react";
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
      onBack={onBack}
      onAccept={(comment) => decision.mutate({ action: "accept", comment })}
      onDismiss={(comment) => decision.mutate({ action: "dismiss", comment })}
      onSaveCorrection={(text) => saveCorrection.mutateAsync(text)}
      onEditFlag={(parameter, result, comment) => editFlag.mutateAsync({ parameter, result, comment })}
      onSaveSources={(sources) => editSources.mutateAsync(sources)}
      onPush={() => push.mutateAsync()}
    />
  );
};
