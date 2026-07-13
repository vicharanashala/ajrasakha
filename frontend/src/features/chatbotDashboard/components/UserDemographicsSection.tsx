import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import type { UserDemographics } from "../types";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X, InfoIcon, RefreshCw } from "lucide-react";
import { MissingDemographicsModal } from "./MissingDemographicsModal";
import { UsersListModal } from "./UsersListModal";
import { useUserMertices } from "../hooks/useDashboardData";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

const AGE_COLORS: Record<string, string> = {
  "Less than 16": "#2DD4BF",
  "16-30": "#3AAA5A",
  "18-30": "#3AAA5A",
  "30-45": "#378ADD",
  "45-60": "#EF9F27",
  "60+": "#8B5CF6",
};
const GENDER_COLORS: Record<string, string> = { Male: "#378ADD", Female: "#E879A0", Others: "#A0845C" };
const EXP_COLORS = ["#1E3A5F", "#378ADD", "#60A5FA", "#38BDF8", "#94A3B8"];
const LAND_COLORS: Record<string, string> = { Small: "#3AAA5A", Medium: "#EF9F27", Large: "#378ADD" };

const formatCount = (count?: number | null): string => {
  if (count === null || count === undefined || isNaN(count)) return "0";
  return count.toLocaleString('en-US');
};

function DonutSegments({ segments, onSegmentClick, onDemographicItemClick }: { segments: { label: string; count: number; pct: number; color: string }[], onSegmentClick?: () => void; onDemographicItemClick?: (segment: { label: string }) => void }) {
  const [hoveredSeg, setHoveredSeg] = useState<{ label: string; count: number } | null>(null);
  const displayTotal = segments.reduce((s, x) => s + x.count, 0);
  const totalCount = displayTotal || 1;
  const r = 32, cx = 44, cy = 44, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-row flex-wrap 2xl:flex-nowrap items-center justify-center sm:justify-start gap-4 w-full">
      <div className="relative flex-shrink-0">
      <svg width={88} height={88} viewBox="0 0 88 88" className="flex-shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={14} strokeLinecap="butt" />
        {segments.map((seg) => {
          const dash = (seg.count / totalCount) * circ;
          const isClickable = seg.label !== 'Not Provided' && Boolean(onDemographicItemClick);
          const el = (
            <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color}
              strokeWidth={14} strokeLinecap="butt"
              strokeDasharray={`${dash} ${circ * 10}`}
              strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`}
                className={`transition-opacity duration-200 hover:opacity-80 ${isClickable ? 'cursor-pointer hover:stroke-gray-500' : seg.label === 'Not Provided' && onSegmentClick ? 'cursor-pointer hover:stroke-gray-500' : 'cursor-default'}`}
                onMouseEnter={() => setHoveredSeg(seg)}
                onMouseLeave={() => setHoveredSeg(null)}
                onClick={() => {
                  if (seg.label === 'Not Provided' && onSegmentClick) {
                    onSegmentClick();
                  } else if (isClickable) {
                    onDemographicItemClick?.(seg);
                  }
                }}
              />
          );
          offset += dash;
          return el;
        })}
      </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          {hoveredSeg ? (
            <>
              <span className="text-[10px] text-gray-800 dark:text-gray-200 max-w-[50px] truncate">{hoveredSeg.label}</span>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{formatCount(hoveredSeg.count)}</span>
            </>
          ) : (
            <>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{formatCount(displayTotal)}</span>
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">Total</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-[120px] w-full">
        {segments.map((s) => {
          const isClickable = s.label !== 'Not Provided' && Boolean(onDemographicItemClick);
          return (
          <div 
            key={s.label} 
            className={`flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 ${isClickable || (s.label === 'Not Provided' && onSegmentClick) ? 'cursor-pointer hover:opacity-80' : ''}`}
            onClick={() => {
              if (s.label === 'Not Provided' && onSegmentClick) {
                onSegmentClick();
              } else if (isClickable) {
                onDemographicItemClick?.(s);
              }
            }}
          >
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="font-medium text-gray-700 dark:text-gray-200 min-w-[32px] text-right flex-shrink-0">{formatCount(s.count)}</span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function EnlargedDonutSegments({
  segments,
  onSegmentClick,
  onDemographicItemClick,
}: {
  segments: { label: string; count: number; pct: number; color: string }[];
  onSegmentClick?: () => void;
  onDemographicItemClick?: (segment: { label: string }) => void;
}) {
  const [hoveredSeg, setHoveredSeg] = useState<{
    label: string;
    count: number;
  } | null>(null);
  const displayTotal = segments.reduce((s, x) => s + x.count, 0);
  const totalCount = displayTotal || 1;
  const r = 80,
    cx = 100,
    cy = 100,
    circ = 2 * Math.PI * r;
  const GAP = 2; // px gap between arcs
  let offset = 0;

  return (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full">
      <div className="relative flex-shrink-0">
        <svg
          width={200}
          height={200}
          viewBox="0 0 200 200"
          className="flex-shrink-0"
        >
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            className="stroke-gray-100 dark:stroke-white/5"
            strokeWidth={28}
          />

          {segments.map((seg) => {
            const full = (seg.count / totalCount) * circ;
            const dash = Math.max(0, full - GAP); // shorten to create gap
            const isInteractive =
              seg.label === "Not Provided" && onSegmentClick || Boolean(onDemographicItemClick && seg.label !== 'Not Provided');
            const el = (
              <circle
                key={seg.label}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={28}
                strokeLinecap="butt"
                strokeDasharray={`${dash} ${circ}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                className={`transition-all duration-200 hover:opacity-90 ${
                  isInteractive ? "cursor-pointer" : "cursor-default"
                }`}
                onMouseEnter={() => setHoveredSeg(seg)}
                onMouseLeave={() => setHoveredSeg(null)}
                onClick={() => {
                  if (seg.label === 'Not Provided' && onSegmentClick) {
                    onSegmentClick();
                  } else if (onDemographicItemClick && seg.label !== 'Not Provided') {
                    onDemographicItemClick(seg);
                  }
                }}
              />
            );
            offset += full;
            return el;
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          {hoveredSeg ? (
            <>
              <span className="text-sm text-gray-800 dark:text-gray-200 max-w-[120px] truncate mb-1">
                {hoveredSeg.label}
              </span>
              <span className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">
                {formatCount(hoveredSeg.count)}
              </span>
            </>
          ) : (
            <>
              <span className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-1 tabular-nums">
                {formatCount(displayTotal)}
              </span>
              <span className="text-sm text-gray-500 uppercase tracking-wider">
                Total
              </span>
            </>
          )}
        </div>
      </div>

      {/* Legend with colored swatches that match each segment */}
      <div className="flex flex-col gap-3 w-full max-w-md">
        {segments.map((s) => {
          const isClickable = s.label !== 'Not Provided' && Boolean(onDemographicItemClick);
          return (
          <div
            key={s.label}
            className={`flex items-center gap-3 text-base text-gray-600 dark:text-gray-300 ${
              isClickable || (s.label === "Not Provided" && onSegmentClick)
                ? "cursor-pointer hover:opacity-80"
                : ""
            }`}
            onClick={() => {
              if (s.label === "Not Provided" && onSegmentClick) {
                onSegmentClick();
              } else if (isClickable) {
                onDemographicItemClick?.(s);
              }
            }}
          >
            <span
              className="w-4 h-4 rounded-sm flex-shrink-0 ring-1 ring-black/5"
              style={{ background: s.color }}
            />
            <span className="flex-1">{s.label}</span>
            <span className="font-semibold text-gray-800 dark:text-gray-100 text-lg min-w-[60px] text-right flex-shrink-0 tabular-nums">
              {formatCount(s.count)}
            </span>
          </div>
          );
        })}
      </div>
    </div>
  );
}



function HorizontalBars({ segments, onSegmentClick, onDemographicItemClick }: { segments: { label: string; count: number; pct: number; color: string }[], onSegmentClick?: () => void; onDemographicItemClick?: (segment: { label: string }) => void }) {
  return (
    <div className="flex flex-col gap-2.5 w-full">
      {segments.map((s) => {
        const isClickable = s.label !== 'Not Provided' && Boolean(onDemographicItemClick);
        return (
        <div key={s.label} className="flex items-center gap-2">
          <span 
            className={`text-xs text-gray-500 dark:text-gray-400 w-20 sm:w-24 flex-shrink min-w-0 truncate ${isClickable || (s.label === 'Not Provided' && onSegmentClick) ? 'cursor-pointer hover:opacity-80' : ''}`}
            onClick={() => {
              if (s.label === 'Not Provided' && onSegmentClick) {
                onSegmentClick();
              } else if (isClickable) {
                onDemographicItemClick?.(s);
              }
            }}
          >{s.label}</span>
          <div className="flex-1 min-w-[24px] h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${isClickable || (s.label === 'Not Provided' && onSegmentClick) ? 'cursor-pointer hover:opacity-80' : ''}`}
              style={{ width: `${s.pct}%`, background: s.color }}
              onClick={() => {
                if (s.label === 'Not Provided' && onSegmentClick) {
                  onSegmentClick();
                } else if (isClickable) {
                  onDemographicItemClick?.(s);
                }
              }}
            />
          </div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 min-w-[32px] w-auto text-right flex-shrink-0">
            {formatCount(s.count)}
          </span>
        </div>
        );
      })}
    </div>
  );
}

function EnlargedHorizontalBars({ segments, onSegmentClick, onDemographicItemClick }: { segments: { label: string; count: number; pct: number; color: string }[], onSegmentClick?: () => void; onDemographicItemClick?: (segment: { label: string }) => void }) {
  return (
    <div className="flex flex-col gap-5 w-full max-w-2xl mx-auto">
      {segments.map((s) => {
        const isClickable = s.label !== 'Not Provided' && Boolean(onDemographicItemClick);
        return (
        <div key={s.label} className="flex items-center gap-4">
          <span 
            className={`text-base text-gray-600 dark:text-gray-300 w-32 flex-shrink-0 ${isClickable || (s.label === 'Not Provided' && onSegmentClick) ? 'cursor-pointer hover:opacity-80' : ''}`}
            onClick={() => {
              if (s.label === 'Not Provided' && onSegmentClick) {
                onSegmentClick();
              } else if (isClickable) {
                onDemographicItemClick?.(s);
              }
            }}
          >{s.label}</span>
          <div className="flex-1 h-6 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${isClickable || (s.label === 'Not Provided' && onSegmentClick) ? 'cursor-pointer hover:opacity-80' : ''}`}
              style={{ width: `${s.pct}%`, background: s.color }}
              onClick={() => {
                if (s.label === 'Not Provided' && onSegmentClick) {
                  onSegmentClick();
                } else if (isClickable) {
                  onDemographicItemClick?.(s);
                }
              }}
            />
          </div>
          <span className="text-base font-semibold text-gray-800 dark:text-gray-100 min-w-[60px] w-auto text-right flex-shrink-0">
            {formatCount(s.count)}
          </span>
        </div>
        );
      })}
    </div>
  );
}

interface Props {
  source: "vicharanashala" | "annam" | "whatsapp";
  userType: "all" | "external" | "internal";
  shouldLoadUserDemographics?: boolean;
}

function DemographicCard({
  title,
  segments,
  type,
  infoText,
  onSegmentClick,
  onDemographicItemClick,
}: {
  title: string;
  segments: { label: string; count: number; pct: number; color: string }[];
  type: "donut" | "bar";
  infoText?: string;
  onSegmentClick?: () => void;
  onDemographicItemClick?: (segment: { label: string }) => void;
}) {
  const [isMaximized, setIsMaximized] = useState(false);
  const queryClient = useQueryClient();
  const [dataRefreshing, setDataRefreshing] = useState(false);
  const handleRefresh = async ()=>{
    setDataRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["user-metrices"] });
    setDataRefreshing(false);
  }
  return (
    <>
      <Card className="group relative h-full overflow-hidden border-border/60 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300">
        {/* Accent bar */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <button
          onClick={handleRefresh}
          className="absolute top-3 right-13 z-20 rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200 "
          title="Refresh"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              dataRefreshing ? "animate-spin" : ""
            }`}
          />
        </button>
        {/* Maximize Button */}
        {segments.length > 0 && (
          <button
            onClick={() => setIsMaximized(true)}
            className="absolute top-3 right-3 p-1.5 rounded-md bg-background/60 hover:bg-background ring-1 ring-border/60 opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm z-20"
            title="Maximize chart"
          >
            <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}

        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />

            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground/90">
                {title}
              </CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground">
                    <InfoIcon className="w-3.5 h-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {title === "Age Group" && "Distribution of chatbot users across different age categories."}
                  {title === "Gender Split" && "Breakdown of chatbot users by gender."}
                  {title === "Farming Experience" && "Farming experience duration breakdown among chatbot users."}
                  {title === "Land Holding" && (
                    <div className="space-y-1">
                      <p>Classification of users based on land holding size:</p>
                      <p><span className="font-semibold">Small:</span> 0 to &lt; 2 acres</p>
                      <p><span className="font-semibold">Medium:</span> 2 to &lt; 10 acres</p>
                      <p><span className="font-semibold">Large:</span> ≥ 10 acres</p>
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {(!dataRefreshing && (segments.length > 0)) ? (
            type === "donut" ? (
              <DonutSegments segments={segments} onSegmentClick={onSegmentClick} onDemographicItemClick={onDemographicItemClick} />
            ) : (
              <HorizontalBars segments={segments} onSegmentClick={onSegmentClick} onDemographicItemClick={onDemographicItemClick} />
            )
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-muted-foreground italic">
               {dataRefreshing ? "Loading": "No data available"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maximized Modal */}
      {isMaximized &&
        segments.length > 0 &&
        createPortal(
          <AnimatePresence>
            <motion.div
              key="chart-modal-overlay"
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
              onClick={() => setIsMaximized(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-[#111] shadow-[0_20px_70px_-15px_rgba(0,0,0,0.45)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 8 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              >
                {/* Accent gradient bar */}
                <div className="h-1 w-full bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

                <div className="p-8">
                  {/* Close */}
                  <motion.button
                    onClick={() => setIsMaximized(false)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.92 }}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </motion.button>

                  {/* Header */}
                  <motion.div
                    className="mb-8 flex items-center gap-3"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                  >
                    <span className="h-5 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {title}
                    </h3>
                  </motion.div>

                  {/* Enlarged chart */}
                  <motion.div
                    className="rounded-xl bg-gray-50/60 dark:bg-white/5 p-6 ring-1 ring-black/5 dark:ring-white/10"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.3 }}
                  >
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={type}
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.22 }}
                      >
                        {type === "donut" ? (
                          <EnlargedDonutSegments segments={segments} onSegmentClick={onSegmentClick} onDemographicItemClick={onDemographicItemClick} />
                        ) : (
                          <EnlargedHorizontalBars segments={segments} onSegmentClick={onSegmentClick} onDemographicItemClick={onDemographicItemClick} />
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

 function UserDemographicsSection({ source, userType, shouldLoadUserDemographics }: Props) {
    const { data: userMetricesData, isLoading: usermetricsLoading, isFetching: usermetricsFetching } = useUserMertices(source, userType, shouldLoadUserDemographics);
  const [selectedMissingField, setSelectedMissingField] = useState<{ title: string; key: string } | null>(null);
  const [selectedDemographicUsers, setSelectedDemographicUsers] = useState<{
    title: string;
    category: string;
    value: string;
    dynamicFieldLabel: string;
  } | null>(null);

  const ageSegments = (userMetricesData?.userDemographics?.ageGroups ?? []).map((d) => ({ ...d, color: AGE_COLORS[d.label] ?? "#6B7280" }));
  const genderSegments = (userMetricesData?.userDemographics?.genderSplit ?? []).map((d) => ({ ...d, color: GENDER_COLORS[d.label] ?? "#6B7280" }));
  const expSegments = (userMetricesData?.userDemographics?.farmingExperience ?? []).map((d, i) => ({ ...d, color: EXP_COLORS[i % EXP_COLORS.length] }));
  const landSegments = (userMetricesData?.userDemographics?.landHolding ?? []).map((d) => ({ ...d, color: LAND_COLORS[d.label] ?? "#6B7280" }));

  const handleDemographicItemClick = (title: string, label: string, category: string, dynamicFieldLabel: string) => {
    if (!label || label === 'Not Provided') return;
    setSelectedDemographicUsers({
      title: `${title} - ${label}`,
      category,
      value: label,
      dynamicFieldLabel,
    });
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <DemographicCard 
          title="Age Group" 
          segments={ageSegments} 
          type="donut" 
          onSegmentClick={() => setSelectedMissingField({ title: "Age Group", key: "age" })}
          onDemographicItemClick={(segment) => handleDemographicItemClick("Age Group", segment.label, "age", "Age")}
        />
        <DemographicCard 
          title="Gender Split" 
          segments={genderSegments} 
          type="donut" 
          onSegmentClick={() => setSelectedMissingField({ title: "Gender Split", key: "gender" })}
          onDemographicItemClick={(segment) => handleDemographicItemClick("Gender Split", segment.label, "gender", "Gender")}
        />
        <DemographicCard 
          title="Farming Experience" 
          segments={expSegments} 
          type="bar" 
          onSegmentClick={() => setSelectedMissingField({ title: "Farming Experience", key: "yearsOfExperience" })}
          onDemographicItemClick={(segment) => handleDemographicItemClick("Farming Experience", segment.label, "experience", "Farming Experience")}
        />
        <DemographicCard
          title="Land Holding"
          segments={landSegments}
          type="donut"
          infoText="Land holding size classification"
          onSegmentClick={() => setSelectedMissingField({ title: "Land Holding", key: "landhold" })}
          onDemographicItemClick={(segment) => handleDemographicItemClick("Land Holding", segment.label, "landholding", "Land Holding")}
        />    
      </div>
      
      {selectedMissingField && (
        <MissingDemographicsModal
          fieldTitle={selectedMissingField.title}
          fieldKey={selectedMissingField.key}
          source={source}
          userType={userType}
          onClose={() => setSelectedMissingField(null)}
        />
      )}

      {selectedDemographicUsers && (
        <UsersListModal
          isOpen={Boolean(selectedDemographicUsers)}
          onClose={() => setSelectedDemographicUsers(null)}
          title={selectedDemographicUsers.title}
          source={source}
          userType={userType}
          dynamicFieldLabel={selectedDemographicUsers.dynamicFieldLabel}
          dynamicFieldKey={selectedDemographicUsers.category === 'age' ? 'age' : selectedDemographicUsers.category === 'gender' ? 'gender' : selectedDemographicUsers.category === 'experience' ? 'yearsOfExperience' : 'landhold'}
          category={selectedDemographicUsers.category}
          value={selectedDemographicUsers.value}
        />
      )}
    </>
  );
}
export default UserDemographicsSection;