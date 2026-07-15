import { createFileRoute } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth-store';
import { useGetWorkloads } from '@/hooks/api/assignment/useGetWorkloads';
import { useGetQueue } from '@/hooks/api/assignment/useGetQueue';
import { useRealtime } from '@/hooks/useRealtime';
import { useEffect, useCallback } from 'react';
import { WorkloadSlots } from '@/components/expert-workspace/WorkloadSlots';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms/card';
import { Badge } from '@/components/atoms/badge';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/expert-workspace/')({
  component: ExpertWorkspace,
});

function ExpertWorkspace() {
  const { user } = useAuthStore();
  const { data: workloads, isLoading: workloadsLoading } = useGetWorkloads(!!user);
  const { data: queue } = useGetQueue(!!user);
  const realtime = useRealtime();

  useEffect(() => {
    realtime.connect();
    return () => realtime.disconnect();
  }, [realtime.connect, realtime.disconnect]);

  const handleComplete = useCallback((_questionId: string, _expertId: string) => {
    // Workload query will auto-refetch via React Query
  }, []);

  if (workloadsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const myWorkload = workloads?.find((w) => w.expertId === user?.uid);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expert Workspace</h1>
          <p className="text-muted-foreground">
            Your assigned questions by priority
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={realtime.isConnected ? 'default' : 'destructive'}>
            {realtime.isConnected ? 'Live' : 'Offline'}
          </Badge>
        </div>
      </div>

      {queue && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Queue Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Badge variant="destructive">High: {queue.high}</Badge>
              <Badge variant="secondary">Medium: {queue.medium}</Badge>
              <Badge variant="outline">Low: {queue.low}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {myWorkload ? (
        <WorkloadSlots
          workloads={workloads || []}
          expertId={myWorkload.expertId}
          onComplete={handleComplete}
        />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No active assignments. You'll be assigned questions automatically.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
