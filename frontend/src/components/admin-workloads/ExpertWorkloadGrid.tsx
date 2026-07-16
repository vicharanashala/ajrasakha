import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms/card';
import { Badge } from '@/components/atoms/badge';
import { WorkloadSnapshot } from '@/hooks/services/assignmentService';

interface ExpertWorkloadGridProps {
  workloads: WorkloadSnapshot[];
}

const priorityColors = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

export const ExpertWorkloadGrid = ({ workloads }: ExpertWorkloadGridProps) => {
  if (!workloads.length) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No expert workload data available.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {workloads.map((workload) => (
        <Card key={workload.expertId}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {workload.expertName || workload.expertId}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(['high', 'medium', 'low'] as const).map((priority) => (
                <div key={priority} className="flex items-center justify-between">
                  <Badge className={priorityColors[priority]} variant="outline">
                    {priority.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {workload[priority] ? workload[priority]!.slice(0, 8) + '...' : 'Empty'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
