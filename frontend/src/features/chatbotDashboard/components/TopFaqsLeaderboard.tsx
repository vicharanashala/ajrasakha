import { useState } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { MessageSquare, Award, MessageCircle, RefreshCw, BarChart2, Maximize2, X } from "lucide-react";

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
}

export function TopFaqsLeaderboard({
  faqs = [],
  topQuestionsFromCollection = [],
  repeatQueryCount = 0,
  repeatQueryRatePct = 0,
  avgQuestionsPerUserDay = 0,
}: TopFaqsLeaderboardProps) {
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);

  const leaderboardList = topQuestionsFromCollection;
  // Find the maximum count to calculate relative intensities
  const maxCount = leaderboardList.length > 0 ? leaderboardList[0].count : 1;

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
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#27272a]/40 border border-[#27272a]/60 text-gray-400 font-medium text-xs">
            {rank}
          </div>
        );
    }
  };

  return (
    <Card className="border border-border/60 dark:bg-card/40 backdrop-blur-md rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl flex flex-col h-[900px]">
      <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center gap-2.5 shrink-0">
        <Award className="w-5 h-5 text-amber-500" />
        <div>
          <CardTitle className="text-base font-semibold tracking-wide text-foreground">
            Top 10 FAQ Leaderboard
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Most frequently asked questions from user chat messages
          </p>
        </div>
      </CardHeader>

      {/* Dynamic Summary Cards Row */}
      <div className="grid grid-cols-2 gap-2.5 px-6 py-2.5 border-b border-border/40 bg-muted/5 shrink-0">
        <div className="relative group/repeat flex items-center gap-3 p-2 rounded-lg border border-border/30 bg-card/20 hover:bg-card/40 transition-all duration-200" title={repeatQueryRatePct > 0 ? `Total count: ${repeatQueryCount.toLocaleString()}` : "No data available"}>
          <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0 pr-5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Repeat Query Percentage
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
  <span className={`text-base font-bold leading-tight ${repeatQueryRatePct > 0 ? 'text-amber-400' : 'text-muted-foreground/50'}`}>
    {repeatQueryRatePct > 0 ? `${Number(repeatQueryRatePct).toFixed(1)}%` : '—'}
  </span>

  <span className={`text-[9px] font-normal leading-tight truncate ${repeatQueryRatePct > 0 ? 'text-muted-foreground/80' : 'text-muted-foreground/40'}`}>
    {repeatQueryRatePct > 0 ? 'of queries asked more than once' : 'no data'}
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
  <span className={`text-base font-bold leading-tight ${avgQuestionsPerUserDay > 0 ? 'text-emerald-400' : 'text-muted-foreground/50'}`}>
    {avgQuestionsPerUserDay > 0 ? Math.round(Number(avgQuestionsPerUserDay)) : '—'}
  </span>

  <span className={`text-[9px] font-normal leading-tight truncate ${avgQuestionsPerUserDay > 0 ? 'text-muted-foreground/80' : 'text-muted-foreground/40'}`}>
    {avgQuestionsPerUserDay > 0 ? 'Messages per user each day' : 'no data'}
  </span>
</div>
          </div>
        </div>
      </div>

      <CardContent className="pt-4 flex-1 min-h-0 pr-1 pb-4">
        {leaderboardList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <MessageCircle className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground/70">No frequently asked questions found</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Try adjusting the date range to see results</p>
          </div>
        ) : (
          <ScrollArea className="h-full w-full pr-3">
            <div className="space-y-2 pb-2">
              {leaderboardList.map((item, index) => {
                const intensity = Math.max(0.04, (item.count / maxCount) * 0.15);
                return (
                  <div
                    key={index}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors duration-200 group"
                  >
                    {getRankBadge(index)}

                    <div className="flex-1 min-w-0">
                      {/* Chat bubble */}
                      <div
                        className="relative rounded-xl rounded-tl-sm px-3 py-2 border border-border/30"
                        style={{ backgroundColor: `rgba(55, 138, 221, ${intensity})` }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-gray-200 font-medium leading-relaxed break-words line-clamp-2">
                            {item.question}
                          </p>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#378ADD] bg-[#378ADD]/10 border border-[#378ADD]/20 px-1.5 py-0.5 rounded-full shrink-0 mt-0.5">
                            <MessageSquare className="w-2.5 h-2.5" />
                            {item.count.toLocaleString()}
                          </span>
                        </div>
                        {/* Bubble tail */}
                        <div
                          className="absolute -left-1.5 top-2.5 w-3 h-3 rotate-45 border-l border-b border-border/30"
                          style={{ backgroundColor: `rgba(55, 138, 221, ${intensity})` }}
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
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#121212] border border-border dark:border-[#2a2a2a] rounded-2xl w-full max-w-4xl h-[75vh] flex flex-col shadow-2xl animate-in scale-in duration-200 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-[#1a1a1a]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500">
                    <RefreshCw className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-100">
                      Frequently Asked Queries
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Top chatbot messages ranked by occurrence (Query Repeat Rate: {Number(repeatQueryRatePct).toFixed(1)}%)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsFaqModalOpen(false)}
                  className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden p-6 bg-[#161616]">
                {faqs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageCircle className="w-10 h-10 text-muted-foreground/25 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground/60">No frequently asked messages found</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">Try adjusting the date range to see results</p>
                  </div>
                ) : (
                  <ScrollArea className="h-full w-full pr-4">
                    <div className="space-y-4">
                      {faqs.map((item, index) => {
                        const faqMaxCount = faqs.length > 0 ? faqs[0].count : 1;
                        const heatAlpha = Math.max(0.06, (item.count / faqMaxCount) * 0.2);
                        const isTop3 = index < 3;
                        return (
                          <div
                            key={index}
                            className="flex items-start gap-4 p-4 rounded-xl border border-[#2a2a2a] bg-[#1d1d1d] hover:bg-[#232323] transition-all duration-200 group"
                          >
                            {getRankBadge(index)}

                            <div className="flex-1 min-w-0">
                              {/* Speech bubble style message */}
                              <div
                                className="relative rounded-2xl rounded-tl-sm px-4 py-3 border border-white/[0.06]"
                                style={{ backgroundColor: `rgba(58, 170, 90, ${heatAlpha})` }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-sm text-gray-100 font-medium leading-relaxed break-words">
                                    {item.question}
                                  </p>
                                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 mt-0.5 ${isTop3
                                    ? 'bg-[#3AAA5A]/10 border-[#3AAA5A]/25 text-[#3AAA5A]'
                                    : 'bg-[#378ADD]/10 border-[#378ADD]/25 text-[#378ADD]'
                                    }`}>
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    {item.count.toLocaleString()}
                                  </span>
                                </div>
                                {/* Bubble tail */}
                                <div
                                  className="absolute -left-2 top-3 w-4 h-4 rotate-45 border-l border-b border-white/[0.06]"
                                  style={{ backgroundColor: `rgba(58, 170, 90, ${heatAlpha})` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </Card>
  );
}

