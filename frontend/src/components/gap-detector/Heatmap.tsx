import { ResponsiveHeatMap } from '@nivo/heatmap'

interface HeatmapProps {
  data: any[]
}

export function Heatmap({ data }: HeatmapProps) {
  if (!data || data.length === 0) return <div>No heatmap data available</div>

  // Transform data for Nivo HeatMap
  // We need data in the format: [{ id: "State", data: [{ x: "Crop", y: value }] }]
  const states = Array.from(new Set(data.map(d => d.state)))
  
  const nivoData = states.map(state => {
    const stateData = data.filter(d => d.state === state)
    return {
      id: state,
      data: stateData.map(d => ({
        x: d.crop,
        y: d.value
      }))
    }
  })

  return (
    <div className="h-[400px] w-full border rounded-xl bg-card p-4 shadow-sm">
      <h3 className="font-semibold mb-4 text-lg">Coverage Gaps by Region & Crop</h3>
      <ResponsiveHeatMap
          data={nivoData}
          margin={{ top: 60, right: 90, bottom: 60, left: 90 }}
          valueFormat=">-.2s"
          axisTop={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: -90,
              legend: '',
              legendOffset: 46
          }}
          axisRight={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'state',
              legendPosition: 'middle',
              legendOffset: 70
          }}
          axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'state',
              legendPosition: 'middle',
              legendOffset: -72
          }}
          colors={{
              type: 'diverging',
              scheme: 'red_yellow_blue',
              divergeAt: 0.5,
              minValue: 0,
              maxValue: 100
          }}
          emptyColor="#555555"
          borderWidth={1}
          borderColor="#ffffff"
          labelTextColor={{
              from: 'color',
              modifiers: [
                  [
                      'darker',
                      1.8
                  ]
              ]
          }}
          legends={[
              {
                  anchor: 'bottom',
                  translateX: 0,
                  translateY: 30,
                  length: 400,
                  thickness: 8,
                  direction: 'row',
                  tickPosition: 'after',
                  tickSize: 3,
                  tickSpacing: 4,
                  tickOverlap: false,
                  tickFormat: '>-.2s',
                  title: 'Gap Frequency →',
                  titleAlign: 'start',
                  titleOffset: 4
              }
          ]}
      />
    </div>
  )
}
