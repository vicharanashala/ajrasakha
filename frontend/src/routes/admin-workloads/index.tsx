import { createFileRoute } from '@tanstack/react-router';
import { useGetWorkloads } from '@/hooks/api/assignment/useGetWorkloads';
import { useGetQueue } from '@/hooks/api/assignment/useGetQueue';
import { useGetQueueEntries } from '@/hooks/api/assignment/useGetQueueEntries';
import { ExpertWorkloadGrid } from '@/components/admin-workloads/ExpertWorkloadGrid';
import { PriorityQueuePanel } from '@/components/admin-workloads/PriorityQueuePanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/atoms/card';
import { Badge } from '@/components/atoms/badge';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/admin-workloads/')({
  component: AdminWorkloadDashboard,
});

function AdminWorkloadDashboard() {
  const { data: workloads, isLoading: workloadsLoading } = useGetWorkloads();
  const { data: queue, isLoading: queueLoading } = useGetQueue();
  const { data: queueEntries, isLoading: entriesLoading } = useGetQueueEntries();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Workload Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor expert assignments and queue status
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Experts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workloads?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Queue Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{queue?.total || 0}</div>
            <div className="flex gap-2 mt-1">
              <Badge variant="destructive">H: {queue?.high || 0}</Badge>
              <Badge variant="secondary">M: {queue?.medium || 0}</Badge>
              <Badge variant="outline">L: {queue?.low || 0}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Loaded Experts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {workloads?.filter((w) => w.high || w.medium || w.low).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {workloadsLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ExpertWorkloadGrid workloads={workloads || []} />
      )}

      <PriorityQueuePanel entries={queueEntries || []} isLoading={entriesLoading} />
    </div>
  );
}
