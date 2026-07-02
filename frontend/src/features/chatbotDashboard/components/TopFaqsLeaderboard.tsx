import { useState } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { MessageSquare, Award, MessageCircle, RefreshCw, BarChart2, Maximize2, X, CalendarIcon, RefreshCcw, InfoIcon } from "lucide-react";
import { Calendar } from "@/components/atoms/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { Button } from "@/components/atoms/button";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/atoms/skeleton";
import { TranslatableText } from "./TranslatableText";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

interface TopFaqEntry {
  question: string;
  count: number;
}

interface TopFaqsLeaderboardProps {
  faqs?: TopFaqEntry[];
  topQuestionsFromCollection?: TopFaqEntry[];
  repeatQueryCount?: number;
  repeatQueryRatePct?: number;
  avgQuestionsPerUserDay?: number;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoading?: boolean;
}

export function TopFaqsLeaderboard({
  faqs = [],
  topQuestionsFromCollection = [],
  repeatQueryCount = 0,
  repeatQueryRatePct = 0,
  avgQuestionsPerUserDay = 0,
  dateRange,
  onDateRangeChange,
  isLoading = false,
}: TopFaqsLeaderboardProps) {
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);

  const leaderboardList = topQuestionsFromCollection;
  // Find the maximum count to calculate relative intensities
  const maxCount = leaderboardList.length > 0 ? leaderboardList[0].count : 1;
  
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async ()=>{
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["top-faqs"] });
    setRefreshing(false);
  }

  // Render a badge based on rank (1st, 2nd, 3rd get special colors)
  const getRankBadge = (index: number) => {
    const rank = index + 1;
    switch (rank) {
      case 1:
        return (
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#3AAA5A]/20 border border-[#3AAA5A]/30 text-[#3AAA5A] font-bold text-xs shadow-inner">
            1
          </div>
        );
      case 2:
        return (
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#378ADD]/20 border border-[#378ADD]/30 text-[#378ADD] font-bold text-xs shadow-inner">
            2
          </div>
        );
      case 3:
        return (
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-300/20 border border-slate-300/30 text-slate-350 font-bold text-xs shadow-inner">
            3
          </div>
        );
      default:
        return (
          <div
            className="
    flex items-center justify-center
    w-8 h-8 shrink-0
    rounded-full
    border border-slate-200 dark:border-white/[0.08]
    bg-gradient-to-br
    from-white to-slate-100
    dark:from-[#232323] dark:to-[#1a1a1a]
    text-slate-700 dark:text-gray-300
    font-semibold text-xs
    shadow-sm
    transition-all duration-200
    group-hover:border-slate-300
    group-hover:shadow-md
    dark:group-hover:border-white/[0.12]
  "
          >
            {rank}
          </div>
        );
    }
  };

  return (
    <Card
      className="border border-border/60 backdrop-blur-md rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl flex flex-col h-auto sm:h-[500px]           bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     
"
    >
      <CardHeader className="pb-3 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <Award className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <CardTitle className="text-base font-semibold tracking-wide text-foreground flex items-center gap-1.5">
              <span>Top 10 FAQ Leaderboard</span>
              <button
                onClick={handleRefresh}
                className="absolute top-8 right-55 rounded-lg border border-gray-200/60 p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white hover:shadow-md dark:border-[#333]"
                title="Refresh"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 bg-background ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground">
                    <InfoIcon className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Lists the top 10 most common queries received by the chatbot,
                  ranked by total count.
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Most frequently asked questions from user chat messages
            </p>
          </div>
        </div>

        {/* Calendar Picker */}
        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="
    h-9 w-full sm:w-[190px] shrink-0
    justify-start rounded-xl
    border border-slate-200/80 dark:border-white/[0.08]
    bg-white/90 dark:bg-white/[0.04]
    px-3
    text-left font-medium
    text-slate-700 dark:text-gray-200
    shadow-sm backdrop-blur-sm
    transition-all duration-200
    hover:bg-slate-50 hover:border-slate-300 hover:shadow-md
    dark:hover:bg-white/[0.07]
    dark:hover:border-white/[0.12]
  "
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5 text-[#3AAA5A] shrink-0" />

                <span className="truncate text-xs tracking-tight">
                  {dateRange?.from
                    ? dateRange.to
                      ? `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd")}`
                      : format(dateRange.from, "MMM dd")
                    : "All time"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0 border-border bg-[#18181b]"
              align="end"
            >
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from ?? new Date()}
                selected={dateRange}
                onSelect={onDateRangeChange}
                numberOfMonths={1}
              />
            </PopoverContent>
          </Popover>
          {dateRange && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDateRangeChange?.(undefined)}
              title="Clear date filter"
              className="h-8 w-8 shrink-0 bg-[#27272a]/10 border-border/40 text-gray-200 hover:bg-[#27272a]/20"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>

      {/* Dynamic Summary Cards Row */}
      <div className="grid grid-cols-2 gap-2 px-6 py-2 border-b border-border/40 bg-muted/5 shrink-0">
        <div
          className="relative group/repeat flex items-center gap-3 p-2 rounded-lg border border-border/30 bg-card/20 hover:bg-card/40 transition-all duration-200"
          title={
            repeatQueryRatePct > 0
              ? `Total count: ${repeatQueryCount.toLocaleString()}`
              : "No data available"
          }
        >
          <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0 pr-5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Repeat Query Percentage
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span
                className={`text-base font-bold leading-tight ${repeatQueryRatePct > 0 ? "text-amber-400" : "text-muted-foreground/50"}`}
              >
                {repeatQueryRatePct > 0
                  ? `${Number(repeatQueryRatePct).toFixed(1)}%`
                  : "—"}
              </span>

              <span
                className={`text-[9px] font-normal leading-tight truncate ${repeatQueryRatePct > 0 ? "text-muted-foreground/80" : "text-muted-foreground/40"}`}
              >
                {repeatQueryRatePct > 0
                  ? "of queries asked more than once"
                  : "no data"}
              </span>
            </div>
          </div>
          {repeatQueryRatePct > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFaqModalOpen(true);
              }}
              className="absolute top-1 right-1 p-1 rounded bg-zinc-850 hover:bg-zinc-700 text-muted-foreground hover:text-amber-400 opacity-0 group-hover/repeat:opacity-100 transition-all duration-200"
              title="Show Frequently Asked Messages"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 p-2 rounded-lg border border-border/30 bg-card/20 hover:bg-card/40 transition-all duration-200">
          <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shrink-0">
            <BarChart2 className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Average User Queries
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span
                className={`text-base font-bold leading-tight ${avgQuestionsPerUserDay > 0 ? "text-emerald-400" : "text-muted-foreground/50"}`}
              >
                {avgQuestionsPerUserDay > 0
                  ? Math.round(Number(avgQuestionsPerUserDay))
                  : "—"}
              </span>

              <span
                className={`text-[9px] font-normal leading-tight truncate ${avgQuestionsPerUserDay > 0 ? "text-muted-foreground/80" : "text-muted-foreground/40"}`}
              >
                {avgQuestionsPerUserDay > 0
                  ? "Messages per user each day"
                  : "no data"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="pt-3 flex-1 min-h-0 pr-1 pb-3 relative">
        {(refreshing || isLoading) && (
          <div className="absolute inset-0 z-10 rounded-b-xl bg-background/70 p-4 backdrop-blur-[1px]">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        )}

        {leaderboardList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <MessageCircle className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground/70">
              No frequently asked questions found
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              Try adjusting the date range to see results
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full w-full pr-3">
            <div className="space-y-1.5 pb-2">
              {leaderboardList.map((item, index) => {
                const intensity = Math.max(
                  0.04,
                  (item.count / maxCount) * 0.15,
                );
                return (
                  <div
                    key={index}
                    className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-white/[0.03] transition-colors duration-200 group"
                  >
                    {getRankBadge(index)}

                    <div className="flex-1 min-w-0">
                      {/* Chat bubble */}
                      <div
                        className="relative rounded-xl rounded-tl-sm px-3 py-1.5 border border-border/30"
                        style={{
                          backgroundColor: `rgba(55, 138, 221, ${intensity})`,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <TranslatableText
                            text={item.question}
                            showTooltip
                            textClassName="text-xs line-clamp-2"
                          />

                          <span
                            className="
      inline-flex items-center gap-1
      shrink-0 mt-0.5
      rounded-full
      border border-[#378ADD]/20
      bg-[#378ADD]/10
      px-2 py-1
      text-[10px] font-semibold
      text-[#378ADD]
      shadow-sm
    "
                          >
                            <MessageSquare className="w-2.5 h-2.5" />
                            {item.count.toLocaleString()}
                          </span>
                        </div>
                        {/* Bubble tail */}
                        <div
                          className="absolute -left-1.5 top-2.5 w-3 h-3 rotate-45 border-l border-b border-border/30"
                          style={{
                            backgroundColor: `rgba(55, 138, 221, ${intensity})`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {isFaqModalOpen &&
        // createPortal(
        //   <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
        //     {/* Modal Container */}
        //     <div className="relative w-full max-w-4xl h-[78vh] overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_80px_rgba(15,23,42,0.18)] dark:border-white/[0.06] dark:bg-[#121212] dark:from-[#18181b] dark:via-[#161616] dark:to-[#121212] dark:shadow-black/40 flex flex-col animate-in zoom-in-95 duration-200">
        //       {/* Glow Layer */}
        //       <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(58,170,90,0.08),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(55,138,221,0.08),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(58,170,90,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(55,138,221,0.12),transparent_28%)]" />

        //       {/* Header */}
        //       <div className="relative z-10 flex items-center justify-between border-b border-slate-200/70 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl px-6 py-5">
        //         <div className="flex items-center gap-4">
        //           <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-500 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10">
        //             <RefreshCw className="w-5 h-5" />
        //           </div>

        //           <div>
        //             <h3 className="text-lg font-semibold tracking-tight text-slate-800 dark:text-gray-100">
        //               Frequently Asked Queries
        //             </h3>

        //             <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-muted-foreground">
        //               Top chatbot messages ranked by occurrence
        //               <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">
        //                 ({Number(repeatQueryRatePct).toFixed(1)}% repeat rate)
        //               </span>
        //             </p>
        //           </div>
        //         </div>

        //         {/* Close Button */}
        //         <button
        //           onClick={() => setIsFaqModalOpen(false)}
        //           className="
        //   flex items-center justify-center
        //   h-10 w-10
        //   rounded-xl
        //   border border-slate-200
        //   bg-white/80
        //   text-slate-500
        //   shadow-sm
        //   transition-all duration-200
        //   hover:bg-slate-100
        //   hover:text-slate-900
        //   hover:shadow-md
        //   dark:border-white/[0.06]
        //   dark:bg-white/[0.04]
        //   dark:text-gray-400
        //   dark:hover:bg-white/[0.08]
        //   dark:hover:text-white
        // "
        //         >
        //           <X className="w-4 h-4" />
        //         </button>
        //       </div>

        //       {/* Content */}
        //       <div className="relative z-10 flex-1 overflow-hidden p-6">
        //         {faqs.length === 0 ? (
        //           <div className="flex flex-col items-center justify-center h-full text-center">
        //             <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/[0.06] dark:bg-white/[0.03]">
        //               <MessageCircle className="w-7 h-7 text-slate-400 dark:text-muted-foreground/30" />
        //             </div>

        //             <p className="mt-5 text-sm font-semibold text-slate-700 dark:text-muted-foreground/70">
        //               No frequently asked messages found
        //             </p>

        //             <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground/40">
        //               Try adjusting the date range to see results
        //             </p>
        //           </div>
        //         ) : (
        //           <ScrollArea className="h-full w-full pr-4">
        //             <div className="space-y-4 pb-2">
        //               {faqs.map((item, index) => {
        //                 const faqMaxCount = faqs.length > 0 ? faqs[0].count : 1;

        //                 const heatAlpha = Math.max(
        //                   0.06,
        //                   (item.count / faqMaxCount) * 0.18,
        //                 );

        //                 const isTop3 = index < 3;

        //                 return (
        //                   <div
        //                     key={index}
        //                     className="
        //             group relative
        //             flex items-start gap-4
        //             rounded-2xl
        //             border border-slate-200/70
        //             bg-white/80
        //             p-4
        //             shadow-sm
        //             transition-all duration-200
        //             hover:-translate-y-[1px]
        //             hover:border-slate-300
        //             hover:bg-white
        //             hover:shadow-lg
        //             dark:border-white/[0.06]
        //             dark:bg-white/[0.03]
        //             dark:hover:border-white/[0.10]
        //             dark:hover:bg-white/[0.05]
        //           "
        //                   >
        //                     {/* soft hover glow */}
        //                     <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(58,170,90,0.05),transparent_35%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(58,170,90,0.08),transparent_35%)]" />

        //                     {getRankBadge(index)}

        //                     <div className="relative z-10 flex-1 min-w-0">
        //                       {/* Bubble */}
        //                       <div
        //                         className="relative rounded-2xl rounded-tl-sm border border-slate-200/70 px-4 py-3 dark:border-white/[0.06]"
        //                         style={{
        //                           backgroundColor: `rgba(58, 170, 90, ${heatAlpha})`,
        //                         }}
        //                       >
        //                         <div className="flex items-start justify-between gap-3">
        //                           <TranslatableText
        //                             text={item.question}
        //                             textClassName="text-sm text-slate-700 dark:text-gray-100"
        //                             translateButtonClassName="h-8 text-xs"
        //                           />

        //                           <span
        //                             className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold shadow-sm ${
        //                               isTop3
        //                                 ? "border-[#3AAA5A]/25 bg-[#3AAA5A]/10 text-[#3AAA5A]"
        //                                 : "border-[#378ADD]/20 bg-[#378ADD]/10 text-[#378ADD]"
        //                             }`}
        //                           >
        //                             <MessageSquare className="w-3.5 h-3.5" />
        //                             {item.count.toLocaleString()}
        //                           </span>
        //                         </div>

        //                         {/* Bubble Tail */}
        //                         <div
        //                           className="absolute -left-2 top-3 h-4 w-4 rotate-45 border-b border-l border-slate-200/70 dark:border-white/[0.06]"
        //                           style={{
        //                             backgroundColor: `rgba(58, 170, 90, ${heatAlpha})`,
        //                           }}
        //                         />
        //                       </div>
        //                     </div>
        //                   </div>
        //                 );
        //               })}
        //             </div>
        //           </ScrollArea>
        //         )}
        //       </div>
        //     </div>
        //   </div>,
        //   document.body,
        // )
        createPortal(
          <AnimatePresence>
            {isFaqModalOpen && (
              <motion.div
                key="faq-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
              >
                {/* Modal Container */}
                <motion.div
                  key="faq-modal"
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 4 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="relative w-full max-w-4xl h-[78vh] overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.18)] dark:border-white/[0.06] dark:bg-[#121212] dark:shadow-black/40 flex flex-col"
                >


                  {/* Header */}
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.05 }}
                    className="relative z-10 flex items-center justify-between border-b border-slate-200/70 dark:border-white/[0.06] bg-white dark:bg-[#121212] px-6 py-5"
                  >
                    <div className="flex items-center gap-4">
                      <motion.div
                        initial={{ scale: 0.8, rotate: -15, opacity: 0 }}
                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
                        transition={{
                          duration: 0.35,
                          delay: 0.1,
                          ease: "backOut",
                        }}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-500 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10"
                      >
                        <RefreshCw className="w-5 h-5" />
                      </motion.div>

                      <div>
                        <h3 className="text-lg font-semibold tracking-tight text-slate-800 dark:text-gray-100">
                          Frequently Asked Queries
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-muted-foreground">
                          Top chatbot messages ranked by occurrence
                          <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">
                            ({Number(repeatQueryRatePct).toFixed(1)}% repeat
                            rate)
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Close Button */}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setIsFaqModalOpen(false)}
                      className="flex items-center justify-center h-10 w-10 rounded-xl border border-slate-200 bg-white/80 text-slate-500 shadow-sm transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 hover:shadow-md dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </motion.div>

                  {/* Content */}
                  <div className="relative z-10 flex-1 overflow-hidden p-6">
                    {faqs.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                        className="flex flex-col items-center justify-center h-full text-center"
                      >
                        <motion.div
                          initial={{ scale: 0.85, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{
                            duration: 0.35,
                            delay: 0.15,
                            ease: "backOut",
                          }}
                          className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/[0.06] dark:bg-white/[0.03]"
                        >
                          <MessageCircle className="w-7 h-7 text-slate-400 dark:text-muted-foreground/30" />
                        </motion.div>
                        <p className="mt-5 text-sm font-semibold text-slate-700 dark:text-muted-foreground/70">
                          No frequently asked messages found
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground/40">
                          Try adjusting the date range to see results
                        </p>
                      </motion.div>
                    ) : (
                      <ScrollArea className="h-full w-full pr-4">
                        <motion.div
                          initial="hidden"
                          animate="visible"
                          variants={{
                            hidden: {},
                            visible: {
                              transition: {
                                staggerChildren: 0.04,
                                delayChildren: 0.08,
                              },
                            },
                          }}
                          className="space-y-4 pb-2"
                        >
                          {faqs.map((item, index) => {
                            const faqMaxCount =
                              faqs.length > 0 ? faqs[0].count : 1;
                            const heatAlpha = Math.max(
                              0.06,
                              (item.count / faqMaxCount) * 0.18,
                            );
                            const isTop3 = index < 3;

                            return (
                              <motion.div
                                key={index}
                                variants={{
                                  hidden: { opacity: 0, y: 10 },
                                  visible: { opacity: 1, y: 0 },
                                }}
                                transition={{ duration: 0.25, ease: "easeOut" }}
                                whileHover={{ y: -1 }}
                                className="group relative flex items-start gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition-colors duration-200 hover:border-slate-300 hover:shadow-lg dark:border-white/[0.06] dark:bg-[#1a1a1a] dark:hover:border-white/[0.10]"
                              >
                                

                                {getRankBadge(index)}

                                <div className="relative z-10 flex-1 min-w-0">
                                  <div
                                    className="relative rounded-2xl rounded-tl-sm border border-slate-200/70 px-4 py-3 bg-slate-50 dark:border-white/[0.06] dark:bg-[#222]"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <TranslatableText
                                        text={item.question}
                                        textClassName="text-sm text-slate-700 dark:text-gray-100"
                                        translateButtonClassName="h-8 text-xs"
                                      />

                                      <motion.span
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{
                                          duration: 0.25,
                                          delay: 0.05,
                                          ease: "backOut",
                                        }}
                                        className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold shadow-sm ${
                                          isTop3
                                            ? "border-[#3AAA5A]/25 bg-[#3AAA5A]/10 text-[#3AAA5A]"
                                            : "border-[#378ADD]/20 bg-[#378ADD]/10 text-[#378ADD]"
                                        }`}
                                      >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        {item.count.toLocaleString()}
                                      </motion.span>
                                    </div>

                                    <div
                                      className="absolute -left-2 top-3 h-4 w-4 rotate-45 border-b border-l border-slate-200/70 bg-slate-50 dark:border-white/[0.06] dark:bg-[#222]"
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      </ScrollArea>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </Card>
  );
}

