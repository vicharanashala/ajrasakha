import { ResponsiveHeatMap } from "@nivo/heatmap";
import { useGetHeapMap } from "@/hooks/api/performance/useGetHeatMap";

// interface HeatMapRow {
//   reviewerId: string;
//   reviewerName: string;
//   counts: Record<string, number>;
// }

export default function HeatMap() {
  const { data: heatMapData, isLoading } = useGetHeapMap();

  if (isLoading) return <div>Loading heatmap...</div>;

  if (!heatMapData || heatMapData.length === 0) {
    return <div>No reviewer performance data found.</div>;
  }

  const allBuckets = [
    "0_1",
    "1_2",
    "2_3",
    "3_4",
    "4_5",
    "5_6",
    "6_7",
    "7_8",
    "8_9",
    "9_10",
    "10_11",
    "11_12",
    "12_plus",
  ];

  const formatBucket = (bucket: string) =>
    bucket === "12_plus" ? "12+" : bucket.replace("_", "–");

  const data = heatMapData.map((r) => ({
    id: r.reviewerName,
    data: allBuckets.map((bucket) => ({
      x: formatBucket(bucket),
      y: r.counts?.[bucket] ?? 0,
    })),
  }));
  // const timeBuckets = [
  //   "0_1",
  //   "1_2",
  //   "2_3",
  //   "3_4",
  //   "4_5",
  //   "5_6",
  //   "6_12",
  //   "12_plus",
  // ];
  const getBackground = (value: number) => {
    if (value === 0) return "bg-gray-200 dark:bg-gray-900";

    if (value <= 2) return "bg-green-200 dark:bg-green-800";
    if (value <= 4) return "bg-green-400 dark:bg-green-700";
    if (value <= 6) return "bg-green-600 dark:bg-green-600";

    if (value <= 8) return "bg-green-700 dark:bg-green-500";
    if (value <= 10) return "bg-green-800 dark:bg-green-400";
    if (value <= 12) return "bg-green-900 dark:bg-green-300";

    return "bg-green-900 dark:bg-green-200"; // for 12+ bucket
  };

  return (
    <div className="  min-w-[80vw] border rounded-lg overflow-auto text-gray-900 dark:text-white">
      {/* This inner div must NOT be flex centered. It must be inline-block. */}
      <div className="min-w-[80vw] min-h-[450px] hidden md:block text-black dark:text-white">
        <ResponsiveHeatMap
          data={data}
          margin={{ top: 60, right: 80, bottom: 60, left: 190 }}
          colors={{ type: "sequential", scheme: "greens" }}
          emptyColor="#f5f5f5"
          enableLabels={true}
          labelTextColor="#000"
          label={(d) => `${d.data.y}`}
          theme={{
            tooltip: {
              container: {
                background: "var(--tooltip-bg, #1f2937)",
                color: "var(--tooltip-text, #f9fafb)",
                fontSize: 12,
                borderRadius: "6px",
                padding: "6px 10px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              },
            },
            axis: {
              legend: {
                text: { fill: "currentColor", fontSize: 16, fontWeight: 600 },
              },
              ticks: { text: { fill: "currentColor", fontSize: 13 } },
            },
            labels: { text: { fill: "currentColor", fontSize: 12 } },
            legends: {
              title: {
                text: {
                  fill: "currentColor",
                  fontSize: 13,
                  fontWeight: 700,
                },
              },
              ticks: {
                text: {
                  fill: "currentColor",
                  fontSize: 12,
                  fontWeight: 600,
                },
              },
            },
          }}
          axisRight={null}
          axisTop={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: "Experts vs Turnaround Time",
            legendPosition: "start",
            legendOffset: -40, // move text UP so it's visible above ticks
          }}
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: "Turnaround Time (hrs)",
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{
            tickSize: 15,
            tickPadding: 5,
            tickRotation: 0,
            legend: "Experts",
            legendPosition: "middle",
            legendOffset: -150,
          }}
          legends={[
            {
              anchor: "right",
              translateX: 40,
              translateY: 0,
              direction: "column",
              length: 200, // width/height of color bar
              thickness: 12, // thickness of color bar
              tickSize: 3,
              tickSpacing: 4,
              title: "Turnaround (hrs)",
              titleAlign: "start",
              titleOffset: 6,
            },
          ]}
          animate={false}
        />
      </div>
      <div>
        <div className="md:hidden mt-10">Experts vs Turnaround Time</div>
      </div>
      <div className="overflow-x-auto w-[80vw] mt-4 border rounded-lg md:hidden ">
        <table className="min-w-[90vw] border-collapse w-full text-sm">
          {/* Header */}
          <thead>
            <tr className="bg-gray-200 text-gray-800">
              <th className="p-3 text-left left-0 bg-gray-200 z-10">
                Reviewer
              </th>
              {allBuckets.map((bucket) => (
                <th
                  key={bucket}
                  className="px-4 py-2 whitespace-nowrap text-center"
                >
                  {bucket.replace("_", "–").replace("plus", "+")} hrs
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {heatMapData.map((row) => (
              <tr key={row.reviewerId} className="border-t">
                <td className="px-4 py-2 font-medium  left-0  z-10">
                  {row.reviewerName}
                </td>

                {allBuckets.map((bucket) => {
                  const value = row.counts?.[bucket] ?? 0;
                  return (
                    <td
                      key={bucket}
                      className={`px-4 py-2 text-center font-semibold ${getBackground(
                        value
                      )}`}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
