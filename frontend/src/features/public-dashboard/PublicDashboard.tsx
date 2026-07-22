import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import "./public-dashboard.css";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HeroCarousel, type CarouselStatItem } from "./components/HeroCarousel";
import { LiveBadge } from "./components/LiveBadge";
import { OutreachGallery } from "./components/OutreachGallery";
import { TabPlaceholder } from "./components/TabPlaceholder";
import {
  AnalyticsMapPublic,
  // GrowthTimeline,   // temporarily hidden
  CoverageOverview,
  // ImpactOutreach,   // temporarily hidden
  Integrations,
  // KnowledgeEngine,  // temporarily hidden (demo KCC + maturity content)
  SaturatedCrops,
  NarrativeSection,
  ReviewWorkflow,
  Roadmap,
  TechShowcase,
} from "./sections";
import { defaultBlocks } from "./data/contentDefaults";
import { crops, domains, heroStats } from "./data/dashboardData";
import { DASHBOARD_TABS, DEFAULT_TAB } from "./data/tabs";
import { useGetDashboardContent } from "@/hooks/api/dashboard/useDashboardContent";
import { useGetPublicCounts, useGetPublicStats } from "@/hooks/api/dashboard/usePublicStats";
import { usePublicCountsSocket } from "@/hooks/api/dashboard/usePublicCountsSocket";
import type { PublicDashboardStats } from "@/hooks/services/publicStatsService";
import type { DashboardStat } from "@/hooks/services/dashboardContentService";

/**
 * Public ACE dashboard (ANNAM.AI) — no login required. A national, multi-layer
 * transparency portal. Government register: dark ink on a light plane, restrained
 * forest-green identity, tricolour accents.
 *
 * This container is the ONLY place that talks to the API. Every section below it is
 * presentational and receives what it needs through props, so there is one place to look
 * when asking "where does this number come from?".
 */
export const PublicDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);

  // ---- live data -----------------------------------------------------------
  const { data: content } = useGetDashboardContent();
  // isLoading is only consumed by KnowledgeEngine, which is temporarily hidden — keep the
  // destructure (prefixed) so re-enabling that section needs no change here.
  const { data: live, isLoading: _statsLoading } = useGetPublicStats();
  const { data: counts } = useGetPublicCounts(); // seeded by fetch, kept live by the socket
  // Pushes count updates into the query above (change-stream driven); the returned
  // status drives the live indicator between the header and the carousel.
  const { status: liveStatus, lastUpdateAt } = usePublicCountsSocket();

  // Media is stored inline in the content doc (URLs already signed server-side), so there's
  // no separate /media fetch — everything comes from /content.
  const media = content?.media ?? [];
  const carouselImages = media.filter((m) => m.kind === "carousel");
  const outreachImages = media.filter((m) => m.kind === "outreach_image");
  const outreachVideos = media.filter((m) => m.kind === "outreach_video");

  // Admin-authored narrative, falling back to the seed blocks until something is saved.
  const blocks = content?.blocks?.length ? content.blocks : defaultBlocks;

  // The polled counts are the fresh source for the headline figures; the heavy /stats call
  // supplies the coverage breakdowns and seeds the counts until the first poll lands.
  const headline = counts ?? live;

  // Until the first stats/counts response lands, show a spinner in place of the live
  // figures instead of a hard 0 (which flashed on initial load before the data arrived).
  const figuresLoading = !headline;

  const domainData = useMemo(() => buildDomainSlices(live), [live]);
  const cropData = useMemo(() => buildCropSlices(live), [live]);

  // Carousel figures that aren't derivable from the questions collection — an admin
  // maintains them (label AND value) as headline stats in Edit Dashboard.
  const editorial = useMemo(
    () => ({
      languages: findStatItem(content?.stats, "language", "Languages supported"),
      // Experts engaged (PAE count) and SAUs collaborated come live from the users
      // collection; fall back to the admin-edited stat only until the API responds.
      experts: liveStatItem(
        live?.expertsEngaged,
        findStatItem(content?.stats, "expert", "Experts engaged"),
      ),
      kvks: findStatItem(content?.stats, "kvk", "KVKs mapped"),
      saus: liveStatItem(
        live?.sausCollaborated,
        findStatItem(content?.stats, "sau", "SAUs collaborating"),
      ),
      // States / districts covered are derived from the questions themselves (grouped on
      // details.state and details.district), so they track real coverage rather than an
      // admin-maintained figure.
      states: liveStatItem(
        live?.statesCovered,
        findStatItem(content?.stats, "state", "States covered"),
      ),
      districts: liveStatItem(
        live?.districtsCovered,
        findStatItem(content?.stats, "district", "Districts covered"),
      ),
      villages: findStatItem(content?.stats, "village", "Villages covered"),
    }),
    [
      content?.stats,
      live?.expertsEngaged,
      live?.sausCollaborated,
      live?.statesCovered,
      live?.districtsCovered,
    ],
  );

  const activeTabLabel =
    DASHBOARD_TABS.find((t) => t.id === activeTab)?.label ?? "Coming soon";

  return (
    <div className="ace-dash">
      <Header
        tabs={DASHBOARD_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogin={() => navigate({ to: "/auth" })}
      />

      {activeTab === "ace" ? (
        <>
          <LiveBadge status={liveStatus} lastUpdateAt={lastUpdateAt} />
          <HeroCarousel
            stats={{
              totalQuestions: headline?.totalQuestions ?? 0,
              validatedQAPairs: headline?.validatedQAPairs ?? 0,
              questionsToday: headline?.questionsToday ?? 0,
              questionsThisMonth: headline?.questionsThisMonth ?? 0,
              ...editorial,
            }}
            loading={figuresLoading}
            images={carouselImages}
          />
          <main>
            {/* 60-second overview carousel (left) + Human Intelligence Network (right) */}
            <NarrativeSection blocks={blocks} roles={live?.userRoleOverview} />
            <AnalyticsMapPublic />
            <CoverageOverview
              cropData={cropData}
              domainData={domainData}
              cropsCovered={live?.cropsCovered}
              domainsCovered={live?.domainsCovered}
            />
            {/* Temporarily hidden — re-enable when the content is ready.
            <KnowledgeEngine
              saturatedCropsByState={live?.saturatedCropsByState}
              saturationThreshold={live?.saturationThreshold}
              loading={_statsLoading || !live}
            />
            */}
            {/* Saturated Crops was inside KnowledgeEngine (hidden above); it is live data,
                so it now renders as its own section. */}
            <SaturatedCrops
              saturatedCropsByState={live?.saturatedCropsByState}
              saturationThreshold={live?.saturationThreshold}
              loading={_statsLoading || !live}
            />
            {/* HumanNetwork now renders inside NarrativeSection's right column, above. */}
            <Integrations />
            {/* Temporarily hidden — re-enable when the content is ready.
            <ImpactOutreach />
            */}
            <OutreachGallery images={outreachImages} videos={outreachVideos} />
            <TechShowcase />
            <Roadmap />
            <ReviewWorkflow />
            {/* Temporarily hidden — re-enable when the content is ready.
            <GrowthTimeline />
            */}
          </main>
        </>
      ) : (
        // Question Collection + future tabs aren't built yet.
        <main>
          <TabPlaceholder label={activeTabLabel} />
        </main>
      )}

      <Footer />
    </div>
  );
};

/**
 * Look up an admin-edited headline figure by a fragment of its label ("language" matches
 * both "Languages supported" and "Total Languages Supported", so an admin can rename the
 * stat without breaking the carousel). Returns BOTH the label and the value: when the admin
 * has saved a matching stat, the carousel shows the admin's wording and number; otherwise it
 * falls back to `fallbackLabel` and the seed default value.
 */
function findStatItem(
  adminStats: DashboardStat[] | undefined,
  labelFragment: string,
  fallbackLabel: string,
): CarouselStatItem {
  const needle = labelFragment.toLowerCase();

  const saved = adminStats?.find((s) => s.label.toLowerCase().includes(needle));
  if (saved?.value?.trim()) {
    return { label: saved.label.trim() || fallbackLabel, value: saved.value.trim() };
  }

  const seed = heroStats.find((s) => s.label.toLowerCase().includes(needle));
  return { label: fallbackLabel, value: seed ? String(seed.count) : "" };
}

/**
 * Prefers a live numeric count for a carousel stat, keeping the admin/seed item's label.
 * Falls back entirely to `fallback` until the API responds (live is undefined).
 */
function liveStatItem(
  live: number | undefined,
  fallback: CarouselStatItem,
): CarouselStatItem {
  if (typeof live !== "number") return fallback;
  return { label: fallback.label, value: String(live) };
}

/** Top 10 domains by question volume; the demo figures until the API answers. */
function buildDomainSlices(live: PublicDashboardStats | null | undefined) {
  if (!live?.domainData?.length) return domains;
  return [...live.domainData]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((d) => ({ label: d.name, value: d.count }));
}

/** Top 10 crops by question volume; the demo figures until the API answers. */
function buildCropSlices(live: PublicDashboardStats | null | undefined) {
  if (!live?.cropData?.length) return crops.map((c) => ({ label: c.name, value: c.qa }));
  return [...live.cropData]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((c) => ({ label: c.name, value: c.count }));
}
