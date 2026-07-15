import { Card, CardContent } from '@/components/atoms/card';
import { Button } from '@/components/atoms/button';
import { Badge } from '@/components/atoms/badge';
import { CheckCircle } from 'lucide-react';
import { useCompleteQuestion } from '@/hooks/api/assignment/useCompleteQuestion';
import { QuestionSlotCardProps } from './types';

export const QuestionSlotCard = ({ questionId, expertId, priority, onComplete }: QuestionSlotCardProps) => {
  const completeMutation = useCompleteQuestion();

  const handleComplete = () => {
    completeMutation.mutate(
      { questionId, expertId },
      {
        onSuccess: () => {
          onComplete(questionId);
        },
      },
    );
  };

  const priorityColors = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-green-100 text-green-800',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge className={priorityColors[priority]}>{priority.toUpperCase()}</Badge>
        <span className="text-xs text-muted-foreground font-mono truncate">{questionId}</span>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-2">
        Question assigned — open to view details
      </p>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={handleComplete}
        disabled={completeMutation.isPending}
      >
        <CheckCircle className="w-4 h-4 mr-2" />
        {completeMutation.isPending ? 'Completing...' : 'Mark Complete'}
      </Button>
    </div>
  );
};
