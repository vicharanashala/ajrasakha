// import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardBlock } from "@/hooks/services/dashboardContentService";
import type { RoleCount } from "@/hooks/services/publicStatsService";
// import { SectionHead } from "../components/SectionHead";
import { HumanNetwork } from "./HumanNetwork";
import { AnimatedStatValue } from "../components/AnimatedStatValue";

// const INTERVAL = 6000;

/**
 * NarrativeSection (now a premium Synced Double Tabbed Panel + Human Network stacked below).
 *
 * Users can switch tabs dynamically inside this panel using the pill tab bar on top,
 * and selections are automatically synchronized with the Hero Section tab states.
 */
export const NarrativeSection = ({
  blocks,
  roles,
  activeTabIndex,
  setActiveTabIndex,
  stats,
}: {
  blocks: DashboardBlock[];
  roles?: RoleCount[];
  activeTabIndex: number;
  setActiveTabIndex: (index: number) => void;
  stats: any;
}) => {
  // Group blocks by categories, with index-based fallback if IDs don't match standard defaults
  const intellMatches = blocks.filter((b) => ["what-is-ace", "why-it-matters", "technology"].includes(b.id));
  const intelligenceBlocks = intellMatches.length ? intellMatches : [blocks[0], blocks[1], blocks[4]].filter(Boolean);

  const expMatches = blocks.filter((b) => ["how-large"].includes(b.id));
  const expertBlocks = expMatches.length ? expMatches : [blocks[2]].filter(Boolean);

  const outMatches = blocks.filter((b) => ["coverage", "impact", "whats-next"].includes(b.id));
  const outreachBlocks = outMatches.length ? outMatches : [blocks[3], blocks[5], blocks[6]].filter(Boolean);

  return (
    <section className="wrap-wide" id="about">
      <div className="overview-split-vertical">
        {/* ── Single Tabbed Detailing Container ── */}
        <div className="detail-section" id="sec-details-container">
          
          {/* Floating Left Navigation Arrow to cycle smoothly backward */}
          <button
            className="detail-nav-arrow prev"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTabIndex((activeTabIndex + 3 - 1) % 3);
            }}
            aria-label="Previous Section"
          >
            ‹
          </button>

          {/* Floating Right Navigation Arrow to cycle smoothly forward */}
          <button
            className="detail-nav-arrow next"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTabIndex((activeTabIndex + 1) % 3);
            }}
            aria-label="Next Section"
          >
            ›
          </button>

          {/* Active Pane Content with Entry Slide Transition (via key re-render) */}
          <div className="tab-pane-content" key={activeTabIndex}>
            {activeTabIndex === 0 && (
              <>
                <div className="detail-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
                  <h3>
                    Agricultural Intelligence Infrastructure
                    <span className="live-pulse-dot" />
                  </h3>
                  <p>A trusted, multilingual cognitive ecosystem built to turn raw agricultural transcripts into science-backed farmer advisories.</p>
                </div>

                <div className="detail-metrics-grid cols-4">
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.questionsToday} />
                    </div>
                    <div className="label">Questions received today</div>
                  </div>
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.questionsThisMonth} />
                    </div>
                    <div className="label">This month</div>
                  </div>
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.validatedQAPairs} />
                    </div>
                    <div className="label">Validated Q&A pairs</div>
                  </div>
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.totalQuestions} />
                    </div>
                    <div className="label">Questions processed</div>
                  </div>
                </div>
              </>
            )}

            {activeTabIndex === 1 && (
              <>
                <div className="detail-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
                  <h3>
                    Nationwide Expert Network
                    <span className="live-pulse-dot" />
                  </h3>
                  <p>A cooperative human-in-the-loop validation chain ensuring absolute scientific accuracy for every advisory.</p>
                </div>

                <div className="detail-metrics-grid cols-3">
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.experts?.value} />
                    </div>
                    <div className="label">{stats.experts?.label || "Experts engaged"}</div>
                  </div>
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.kvks?.value} />
                    </div>
                    <div className="label">{stats.kvks?.label || "KVKs mapped"}</div>
                  </div>
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.saus?.value} />
                    </div>
                    <div className="label">{stats.saus?.label || "SAUs collaborating"}</div>
                  </div>
                </div>
              </>
            )}

            {activeTabIndex === 2 && (
              <>
                <div className="detail-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
                  <h3>
                    Outreach & Geographic Coverage
                    <span className="live-pulse-dot" />
                  </h3>
                  <p>Scaling advisory reach across administrative boundaries, connected mandis, and local dialects to support the smallest holding.</p>
                </div>

                <div className="detail-metrics-grid cols-4">
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.states?.value} />
                    </div>
                    <div className="label">{stats.states?.label || "States covered"}</div>
                  </div>
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.districts?.value} />
                    </div>
                    <div className="label">{stats.districts?.label || "Districts covered"}</div>
                  </div>
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.villages?.value} />
                    </div>
                    <div className="label">{stats.villages?.label || "Villages covered"}</div>
                  </div>
                  <div className="detail-metric-card">
                    <div className="num">
                      <AnimatedStatValue value={stats.languages?.value} />
                    </div>
                    <div className="label">{stats.languages?.label || "Languages supported"}</div>
                  </div>
                </div>
              </>
            )}

            {/* Page Indicator Progress Dots at the bottom of the container */}
            <div className="detail-progress-dots-container">
              <div className="detail-progress-dots">
                <button
                  className={`detail-progress-dot ${activeTabIndex === 0 ? "active" : ""}`}
                  onClick={() => setActiveTabIndex(0)}
                />
                <button
                  className={`detail-progress-dot ${activeTabIndex === 1 ? "active" : ""}`}
                  onClick={() => setActiveTabIndex(1)}
                />
                <button
                  className={`detail-progress-dot ${activeTabIndex === 2 ? "active" : ""}`}
                  onClick={() => setActiveTabIndex(2)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom: Distributed Human Intelligence Network ── */}
        <HumanNetwork roles={roles} />
      </div>
    </section>
  );
};
