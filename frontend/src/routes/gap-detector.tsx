import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Heatmap } from '../components/gap-detector/Heatmap'
import { GapList } from '../components/gap-detector/GapList'

export const Route = createFileRoute('/gap-detector')({
  component: GapDetectorDashboard,
})

function GapDetectorDashboard() {
  const [data, setData] = useState<any>(null)
  const [heatmapData, setHeatmapData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clustersRes, heatmapRes] = await Promise.all([
          fetch('http://localhost:8000/api/v1/clusters'),
          fetch('http://localhost:8000/api/v1/heatmap')
        ])
        
        setData(await clustersRes.json())
        setHeatmapData(await heatmapRes.json())
      } catch (error) {
        console.error("Failed to fetch gap detector data:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <div className="p-8 w-full max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">GDB Coverage Gap Detector</h1>
      </div>
      <p className="text-muted-foreground">
        Analyze disclaimer-triggered queries and surface coverage gaps across regions and crops.
      </p>
      
      {loading ? (
        <div className="animate-pulse flex space-x-4">
          <div className="h-10 bg-slate-200 rounded w-1/4"></div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="p-6 border rounded-xl bg-card text-card-foreground shadow-sm">
              <h3 className="tracking-tight text-sm font-medium">Total Queries Analyzed</h3>
              <div className="text-2xl font-bold">{data?.total_queries_analyzed || 0}</div>
            </div>
            <div className="p-6 border rounded-xl bg-card text-card-foreground shadow-sm">
              <h3 className="tracking-tight text-sm font-medium">Clusters Found</h3>
              <div className="text-2xl font-bold">{data?.total_clusters_found || 0}</div>
            </div>
          </div>

          {/* Heatmap visualization */}
          {heatmapData && <Heatmap data={heatmapData.heatmap} />}

          {/* Prioritized Gap List */}
          {data?.top_gaps && <GapList topGaps={data.top_gaps} />}
        </div>
      )}
    </div>
  )
}
