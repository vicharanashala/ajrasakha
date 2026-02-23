import { ResponsiveHeatMap } from "@nivo/heatmap";
import { useGetHeapMap } from "@/hooks/api/performance/useGetHeatMap";
import type { DateRange } from "./dashboard/questions-analytics";
import { useState, useEffect } from "react";
import { Button } from "./atoms/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

// interface HeatMapRow {
//   reviewerId: string;
//   reviewerName: string;
//   counts: Record<string, number>;
// }

export default function HeatMap({ heatMapDate }: { heatMapDate: DateRange }) {

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const { data: heatMapData, isLoading } = useGetHeapMap({
    startTime: heatMapDate.startTime,
    endTime: heatMapDate.endTime,
    page:currentPage,
    limit:itemsPerPage
  });

  // Reset to page 1 when date range changes
  useEffect(() => {
    setCurrentPage(1);
  }, [heatMapDate.startTime?.getTime(), heatMapDate.endTime?.getTime()]);
  

  if (isLoading) {
    return (
      <div className="min-w-[80vw] border rounded-lg overflow-auto text-gray-900 dark:text-white">
        <div className="flex items-center justify-center min-h-[450px]">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">Loading heatmap data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!heatMapData || heatMapData.data.length === 0) {
    return (
      <div className="min-w-[80vw] border rounded-lg overflow-auto text-gray-900 dark:text-white">
        <div className="flex items-center justify-center min-h-[450px]">
          <p className="text-sm text-muted-foreground">No reviewer performance data found.</p>
        </div>
      </div>
    );
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

  // Pagination logic
  const totalItems = heatMapData?.total??0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedData = heatMapData?.data??[];

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);


  const data = paginatedData.map((r, idx) => ({
    id: `${r.reviewerName}_${idx}`,
    reviewerName: r.reviewerName,
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
            format: (value) => {
              // Extract reviewer name from "name_idx" format
              const parts = value.toString().split('_');
              parts.pop(); // Remove the index
              return parts.join('_');
            },
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
              {allBuckets.map((bucket, index) => (
                <th
                  key={`${bucket}-${index}`}
                  className="px-4 py-2 whitespace-nowrap text-center"
                >
                  {bucket.replace("_", "–").replace("plus", "+")} hrs
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {paginatedData.map((row, idx) => (
              <tr
                key={`${row.reviewerId}_${idx}`}
                className="border-t"
              >
                <td className="px-4 py-2 font-medium  left-0  z-10">
                  {row.reviewerName}
                </td>

                {allBuckets.map((bucket, index) => {
                  const value = row.counts?.[bucket] ?? 0;
                  return (
                    <td
                      key={`${bucket}-${index}`}
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

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Showing {startItem}-{endItem} of{" "}
            {totalItems} experts
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Rows per page:
            </span>
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(value) => {
                setItemsPerPage(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div> 
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3"
          >
            Previous
          </Button>
          
          {/* Page Numbers */}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
            const showPage =
              page === 1 ||
              page === totalPages ||
              (page >= currentPage - 1 && page <= currentPage + 1);

            const showEllipsisBefore =
              page === currentPage - 2 && currentPage > 3;
            const showEllipsisAfter =
              page === currentPage + 2 && currentPage < totalPages - 2;

            if (showEllipsisBefore || showEllipsisAfter) {
              return (
                <span
                  key={page}
                  className="px-2 text-gray-700 dark:text-gray-300"
                >
                  ...
                </span>
              );
            }

            if (!showPage) return null;

            return (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 ${
                  currentPage === page
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : ""
                }`}
              >
                {page}
              </Button>
            );
          })}

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="px-3"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
