import React from 'react'

interface GapListProps {
  topGaps: any[]
}

export function GapList({ topGaps }: GapListProps) {
  if (!topGaps || topGaps.length === 0) return null

  return (
    <div className="w-full border rounded-xl bg-card p-6 shadow-sm">
      <h3 className="font-semibold mb-6 text-xl">Top Prioritized Coverage Gaps</h3>
      <div className="space-y-4">
        {topGaps.map((gap, idx) => (
          <div key={gap.cluster_id} className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg bg-background hover:bg-accent/50 transition-colors">
            <div className="flex items-center space-x-4 mb-4 md:mb-0">
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
                #{idx + 1}
              </div>
              <div>
                <p className="font-medium text-sm text-muted-foreground">Cluster Size: {gap.size} queries</p>
                <h4 className="font-semibold text-lg leading-tight mt-1">
                  {gap.sample_queries && gap.sample_queries[0] ? gap.sample_queries[0] : "Unknown Query Type"}
                </h4>
              </div>
            </div>
            
            <div className="flex flex-col space-y-2 md:w-1/3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Related Queries</span>
              <ul className="text-sm list-disc pl-4 space-y-1 text-muted-foreground">
                {gap.sample_queries && gap.sample_queries.slice(1, 4).map((q: string, i: number) => (
                  <li key={i} className="truncate">{q}</li>
                ))}
              </ul>
            </div>
            
            <div className="mt-4 md:mt-0 flex flex-col items-end">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                Urgency: {gap.urgency_score}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
