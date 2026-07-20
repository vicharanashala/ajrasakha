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
    <div className="min-h-screen bg-slate-50/50 dark:bg-background">
      <div className="bg-gradient-to-r from-green-600 to-emerald-800 text-white pb-24 pt-12 px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-extrabold tracking-tight">GDB Coverage Gap Detector</h1>
          <p className="mt-4 text-green-100 text-lg max-w-2xl">
            Analyze disclaimer-triggered queries and surface coverage gaps across regions and crops. 
            Identify what farmers are asking that we can't answer yet.
          </p>
        </div>
      </div>
      
      <div className="w-full max-w-7xl mx-auto px-8 -mt-16 mb-20 space-y-8">
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
    </div>
  )
}
