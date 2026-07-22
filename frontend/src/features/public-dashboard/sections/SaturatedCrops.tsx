import { useState } from "react";
import { Counter } from "../components/Counter";
import { SectionHead } from "../components/SectionHead";
import { useInView } from "../utils";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { SaturatedCropState } from "@/hooks/services/publicStatsService";

/**
 * Saturated crops by state — lifted out of KnowledgeEngine so it can be shown on its own.
 * KnowledgeEngine also carries hard-coded demo content (the 41.2M KCC figures and the
 * state-maturity bars); this section is entirely live data from /dashboard/stats.
 */

/** How many state cards are visible at once; the rest page in via the arrows. */
const SAT_PAGE_SIZE = 4;

interface SaturatedCropsProps {
  /** Per state, the crops whose question count exceeds the admin's threshold. */
  saturatedCropsByState?: SaturatedCropState[];
  /** The threshold a crop's count must exceed to count as saturated. */
  saturationThreshold?: number;
  /** True while the live stats are still loading — show a spinner instead of "no crops". */
  loading?: boolean;
}

export const SaturatedCrops = ({
  saturatedCropsByState = [],
  saturationThreshold,
  loading = false,
}: SaturatedCropsProps) => {
  const [satPage, setSatPage] = useState(0);
  const { ref: cropsRef, inView: cropsInView } = useInView(0.1);

  const satPageCount = Math.ceil(saturatedCropsByState.length / SAT_PAGE_SIZE);
  const satVisible = saturatedCropsByState.slice(
    satPage * SAT_PAGE_SIZE,
    satPage * SAT_PAGE_SIZE + SAT_PAGE_SIZE,
  );

  return (
    <section className="wrap" id="saturated-crops">
      <SectionHead title="Saturated Crops by State" />

      {/* SectionHead already carries the title, so this row is just the counts. */}
      <div className="sat-head">
        <div className="sat-head-title">
          {!loading && saturatedCropsByState.length > 0 && (
            <span className="sat-states-badge">
              {saturatedCropsByState.length} state
              {saturatedCropsByState.length === 1 ? "" : "s"} covered
            </span>
          )}
        </div>
        {!loading && satPageCount > 1 && (
          <span className="sat-nav-count mono">
            {satPage + 1} / {satPageCount}
          </span>
        )}
      </div>

      <p className="sec-desc" style={{ marginBottom: 14 }}>
        Crops whose validated-question count exceeds
        {typeof saturationThreshold === "number"
          ? ` ${saturationThreshold.toLocaleString("en-IN")}`
          : " the"}{" "}
        {typeof saturationThreshold === "number" ? "questions" : "saturation threshold"} in
        each state, ranked by volume.
      </p>

      {loading ? (
        <div className="sat-loading">
          <Loader2 className="sat-spinner" />
          <span>Loading saturated crops…</span>
        </div>
      ) : saturatedCropsByState.length === 0 ? (
        <p className="sec-desc">No crops have crossed the saturation threshold yet.</p>
      ) : (
        <div className="sat-carousel">
          {satPageCount > 1 && (
            <button
              type="button"
              className="sat-arrow sat-arrow-left"
              onClick={() => setSatPage((p) => Math.max(0, p - 1))}
              disabled={satPage === 0}
              aria-label="Previous states"
            >
              <ChevronLeft />
            </button>
          )}
          <div
            ref={cropsRef}
            key={satPage}
            className={`sat-grid${cropsInView ? " in-view" : ""}`}
          >
            {satVisible.map((st, si) => (
              <SaturatedStateCard
                key={st.state}
                state={st}
                index={si}
                animate={cropsInView}
              />
            ))}
          </div>
          {satPageCount > 1 && (
            <button
              type="button"
              className="sat-arrow sat-arrow-right"
              onClick={() => setSatPage((p) => Math.min(satPageCount - 1, p + 1))}
              disabled={satPage >= satPageCount - 1}
              aria-label="Next states"
            >
              <ChevronRight />
            </button>
          )}
        </div>
      )}
    </section>
  );
};

/** One state's card: shows the top crop, with a "+N" pill that expands the rest. */
const SaturatedStateCard = ({
  state,
  index,
  animate,
}: {
  state: SaturatedCropState;
  index: number;
  animate: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [lead, ...rest] = state.crops;
  const chip = (c: { crop: string; count: number }) => (
    <span className="sat-chip" key={c.crop}>
      <span className="sat-chip-name">{c.crop}</span>
      <span className="sat-chip-count mono">{animate ? <Counter value={c.count} /> : 0}</span>
    </span>
  );

  return (
    <div className="sat-card" style={{ transitionDelay: `${index * 70}ms` }}>
      <div className="sat-card-head">
        <h4>{state.state}</h4>
        <span className="sat-count-badge">
          {state.crops.length} crop{state.crops.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="sat-chips">
        {lead && chip(lead)}
        {rest.length > 0 && (
          <button
            type="button"
            className={`sat-more${expanded ? " open" : ""}`}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Show less" : `+${rest.length}`}
          </button>
        )}
      </div>
      {rest.length > 0 && (
        <div className={`sat-rest${expanded ? " open" : ""}`}>
          <div className="sat-rest-inner sat-chips">{rest.map(chip)}</div>
        </div>
      )}
    </div>
  );
};
