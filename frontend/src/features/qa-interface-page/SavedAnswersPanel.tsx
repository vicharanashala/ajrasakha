import { Card, CardContent, CardHeader, CardTitle } from "../../components/atoms/card";
import { Button } from "../../components/atoms/button";
import { useSavedAnswers, useRemoveSavedAnswer } from "@/hooks/api/answer/useSavedAnswers";

export const SavedAnswersPanel = ({ onUse }: { onUse: (answerText: string) => void }) => {
  const { data: savedAnswers, isLoading } = useSavedAnswers();
  const removeSaved = useRemoveSavedAnswer();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading saved answers…</p>;
  if (!savedAnswers?.length) return <p className="text-sm text-muted-foreground">No saved answers yet.</p>;

  return (
    <Card>
      <CardHeader><CardTitle>Saved Answers</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {savedAnswers.map((item) => (
          <div key={item._id} className="border rounded-md p-3 space-y-2">
            {item.question?.text && (
              <p className="text-xs text-muted-foreground">{item.question.text}</p>
            )}
            <p className="text-sm line-clamp-3">{item.answer?.answer}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => item.answer && onUse(item.answer.answer)}>
                Use this
              </Button>
              <Button size="sm" variant="ghost" onClick={() => removeSaved.mutate(item._id)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};