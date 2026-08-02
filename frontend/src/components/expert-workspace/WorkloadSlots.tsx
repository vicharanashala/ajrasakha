import { useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms/card';
import { Badge } from '@/components/atoms/badge';
import { WorkloadSlotsProps } from './types';
import { QuestionSlotCard } from './QuestionSlotCard';

const PRIORITY_CONFIG = {
  high: { label: 'High Priority', color: 'bg-red-500', borderColor: 'border-red-200' },
  medium: { label: 'Medium Priority', color: 'bg-yellow-500', borderColor: 'border-yellow-200' },
  low: { label: 'Low Priority', color: 'bg-green-500', borderColor: 'border-green-200' },
} as const;

export const WorkloadSlots = ({ workloads, expertId, onComplete }: WorkloadSlotsProps) => {
  const workload = workloads.find((w) => w.expertId === expertId);

  const handleComplete = useCallback(
    (questionId: string) => {
      onComplete(questionId, expertId);
    },
    [expertId, onComplete],
  );

  if (!workload) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No workload data available for this expert.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {(['high', 'medium', 'low'] as const).map((priority) => {
        const config = PRIORITY_CONFIG[priority];
        const questionId = workload[priority];

        return (
          <Card key={priority} className={`border-2 ${config.borderColor}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
                <Badge variant={questionId ? 'destructive' : 'secondary'}>
                  {questionId ? 'Assigned' : 'Empty'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {questionId ? (
                <QuestionSlotCard
                  questionId={questionId}
                  expertId={expertId}
                  priority={priority}
                  onComplete={handleComplete}
                />
              ) : (
                <div className="text-center text-muted-foreground py-4 text-sm">
                  No question assigned
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
