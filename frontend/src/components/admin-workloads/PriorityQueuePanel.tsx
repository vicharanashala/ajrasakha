import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms/card';
import { Badge } from '@/components/atoms/badge';
import { QueueEntry } from '@/hooks/services/assignmentService';

interface PriorityQueuePanelProps {
  entries: QueueEntry[];
  isLoading: boolean;
}

const priorityColors = {
  high: 'destructive' as const,
  medium: 'secondary' as const,
  low: 'outline' as const,
};

export const PriorityQueuePanel = ({ entries, isLoading }: PriorityQueuePanelProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading queue...
        </CardContent>
      </Card>
    );
  }

  if (!entries.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Queue is empty — no questions waiting.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Waiting Queue ({entries.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry._id}
              className="flex items-center justify-between p-2 rounded border"
            >
              <div className="flex items-center gap-2">
                <Badge variant={priorityColors[entry.priority]}>
                  {entry.priority.toUpperCase()}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground">
                  {entry.questionId}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{entry.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.enqueuedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
