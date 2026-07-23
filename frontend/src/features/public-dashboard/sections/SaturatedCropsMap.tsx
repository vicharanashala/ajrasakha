/* ============================================================
   SATURATED CROPS MAP — the same India choropleth as the coverage map,
   but coloured by crop saturation, with a scrollable state list on the left.
   Live data from /dashboard/stats (saturatedCropsByState).
============================================================ */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import AnalyticsMap from "@/features/chatbotDashboard/components/map/AnalyticsMap";
import { SectionHead } from "../components/SectionHead";
import { Counter } from "../components/Counter";
import { Loader2, X } from "lucide-react";
import type { SaturatedCropState } from "@/hooks/services/publicStatsService";

interface SaturatedCropsMapProps {
  /** Per state, the crops whose question count exceeds the admin's threshold. */
  saturatedCropsByState?: SaturatedCropState[];
  /** The threshold a crop's count must exceed to count as saturated. */
  saturationThreshold?: number;
  /** True while the live stats are still loading. */
  loading?: boolean;
}

export const SaturatedCropsMap = ({
  saturatedCropsByState = [],
  saturationThreshold,
  loading = false,
}: SaturatedCropsMapProps) => {
  // The state whose full crop breakdown is shown in the modal (null = closed).
  const [modalState, setModalState] = useState<SaturatedCropState | null>(null);

  // States sorted by saturated-question volume (highest first) for the left-hand list.
  const states = useMemo(
    () => [...saturatedCropsByState].sort((a, b) => b.total - a.total),
    [saturatedCropsByState],
  );

  // The choropleth colours each state by `_analytics.questions`, which useMapAnalytics
  // reads from `item.totalQuestions`. Shape the saturated data into those records so the
  // existing map renders it with no internal changes. State keys are matched
  // case-insensitively downstream, so "MADHYA PRADESH" lines up with "Madhya Pradesh".
  const allStatesData = useMemo(
    () =>
      states.map((s) => ({
        state: s.state,
        totalQuestions: s.total, // drives the colour scale
        closedQuestions: s.crops.length, // saturated-crop count
        totalUsers: 0,
        activeUsers: 0,
        coordinators: 0,
        avgCloseTimeHours: 0,
      })),
    [states],
  );

  const totalCrops = useMemo(
    () => states.reduce((sum, s) => sum + s.crops.length, 0),
    [states],
  );

  return (
    <section className="wrap" id="saturated-map" style={{ marginTop: 44 }}>
      <SectionHead title="Saturated Crops by State" />
      <p className="sec-desc">
        Interactive map of crop saturation across Indian states — a crop is “saturated” once
        its validated-question count exceeds
        {typeof saturationThreshold === "number"
          ? ` ${saturationThreshold.toLocaleString("en-IN")}`
          : " the threshold"}
        . Darker shades indicate more saturated questions in that state.
      </p>

      <div className="sat-map-layout">
        {/* ── Left: scrollable state → saturated-crop-count list ── */}
        <aside className="sat-map-list">
          <div className="sat-map-list-head">
            <span>State</span>
            <span>Saturated crops</span>
          </div>

          <div className="sat-map-list-scroll">
            {loading ? (
              <div className="sat-loading">
                <Loader2 className="sat-spinner" />
                <span>Loading…</span>
              </div>
            ) : states.length === 0 ? (
              <p className="sec-desc" style={{ padding: "12px 4px" }}>
                No crops have crossed the saturation threshold yet.
              </p>
            ) : (
              states.map((s) => (
                <button
                  type="button"
                  key={s.state}
                  className="sat-map-row"
                  onClick={() => setModalState(s)}
                  title="View all crops"
                >
                  <div className="sat-map-row-main">
                    <span className="sat-map-row-state">{s.state}</span>
                    {/* Animated, attention-drawing count of saturated crops. */}
                    <span className="sat-map-row-count mono">
                      <Counter value={s.crops.length} />
                    </span>
                  </div>
                  <div className="sat-map-row-sub">
                    {s.total.toLocaleString("en-IN")} saturated questions · tap for details
                  </div>
                </button>
              ))
            )}
          </div>

          {!loading && states.length > 0 && (
            <div className="sat-map-list-foot">
              {states.length} state{states.length === 1 ? "" : "s"} ·{" "}
              {totalCrops.toLocaleString("en-IN")} saturated crops
            </div>
          )}
        </aside>

        {/* ── Right: the India choropleth ── */}
        <div className="sat-map-canvas">
          <AnalyticsMap
            source="all"
            userType="all"
            todayActiveFarmersData={undefined}
            allStatesData={allStatesData}
            isPublic
            hideMetricToggle
            hideDetailSidebar
            questionStatusData={undefined}
            allUsers={undefined}
          />
        </div>
      </div>

      <CropsModal state={modalState} onClose={() => setModalState(null)} />
    </section>
  );
};

/** Modal listing every saturated crop for a state, with a count-up bar per crop. */
const CropsModal = ({
  state,
  onClose,
}: {
  state: SaturatedCropState | null;
  onClose: () => void;
}) => {
  // Drive an enter/exit animation independent of mount, and lock body scroll while open.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!state) return;
    setOpen(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [state, onClose]);

  if (!state) return null;

  const max = Math.max(...state.crops.map((c) => c.count), 1);

  return createPortal(
    <div
      className={`sat-modal-overlay${open ? " open" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Saturated crops in ${state.state}`}
    >
      <div className="sat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sat-modal-head">
          <div>
            <h3 className="sat-modal-title">{state.state}</h3>
            <p className="sat-modal-sub">
              {state.crops.length} saturated crop{state.crops.length === 1 ? "" : "s"} ·{" "}
              {state.total.toLocaleString("en-IN")} questions
            </p>
          </div>
          <button
            type="button"
            className="sat-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </button>
        </div>

        <div className="sat-modal-body">
          {state.crops.map((c, i) => (
            <div
              className="sat-modal-crop"
              key={c.crop}
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <div className="sat-modal-crop-top">
                <span className="sat-modal-crop-name">{c.crop}</span>
                <span className="sat-modal-crop-count mono">
                  <Counter value={c.count} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};
