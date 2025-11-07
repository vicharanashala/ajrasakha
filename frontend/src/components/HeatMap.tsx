import { ResponsiveHeatMap } from "@nivo/heatmap";
import { useRef, useLayoutEffect, useState } from "react";

interface HeatMapRow {
  reviewerId: string;
  reviewerName: string;
  counts: Record<string, number>;
}

export default function HeatMap({
  heatMapResults = [],
}: {
  heatMapResults: HeatMapRow[];
}) {
 


  const data = heatMapResults.map((r) => ({
    id: r.reviewerName,
    data: [
      { x: "0–6", y: r.counts?.["0_6"] ?? 0 },
      { x: "6–12", y: r.counts?.["6_12"] ?? 0 },
      { x: "12–18", y: r.counts?.["12_18"] ?? 0 },
      { x: "18–24", y: r.counts?.["18_24"] ?? 0 },
      { x: "24–30", y: r.counts?.["24_30"] ?? 0 },
      { x: "30–36", y: r.counts?.["30_36"] ?? 0 },
      { x: "36–42", y: r.counts?.["36_42"] ?? 0 },
    ],
  }));

  return (
    <div className="min-w-[70vw] border rounded-lg overflow-auto">
    {/* This inner div must NOT be flex centered. It must be inline-block. */}
    <div className="min-w-[80vw] min-h-[450px]">
      <ResponsiveHeatMap
        data={data}
        margin={{ top: 60, right: 80, bottom: 60, left: 190 }}
        colors={{ type: "sequential", scheme: "greens" }}
        emptyColor="#f5f5f5"
        enableLabels={true}
        labelTextColor="#000"
        label={(d) => `${d.data.y}`}
        theme={{
          axis: {
            legend: {
              text: {
                fontSize: 18,
                fontWeight: 700,   // <--- BOLD
                fill: "#000000",
              },
            },
            ticks: {
              text: {
                fontSize: 13,
                fontWeight: 400,   // Optional: bold tick labels too
                fill: "#000",
              },
            },
          },
          labels: {
            text: {
              fontSize: 12,
              fontWeight: 600,
            },
          },
        }}
       
        axisRight={null}
        axisTop={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: "Reviewers vs. Turnaround Time",
          legendPosition: "start",
          legendOffset: -40, // move text UP so it's visible above ticks
        }}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: "Average Turnaround Time (hrs)",
          legendPosition: "middle",
          legendOffset: 40,
        }}
        axisLeft={{
          tickSize: 15,
          tickPadding: 5,
          tickRotation: 0,
          legend: "Reviewer",
          legendPosition: "middle",
          legendOffset: -150,
        }}
        legends={[
          {
            anchor: "right",
            direction: "column",
            translateX: 40,
           
            
            
          },
        ]}
        animate={true}
      />
    </div>
   

  </div>
  
  
  );
}
