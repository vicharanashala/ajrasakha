import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import "./public-dashboard.css";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HeroCarousel, type CarouselStatItem } from "./components/HeroCarousel";
import { OutreachGallery } from "./components/OutreachGallery";
import { TabPlaceholder } from "./components/TabPlaceholder";
import {
  AnalyticsMapPublic,
  Channels,
  CropMatrix,
  GrowthTimeline,
  CoverageOverview,
  ImpactOutreach,
  Integrations,
  KnowledgeEngine,
  Learning,
  Multilingual,
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
import { useGetMedia } from "@/hooks/api/media/useMedia";
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
  const { data: live } = useGetPublicStats();
  const { data: counts } = useGetPublicCounts(); // seeded by fetch, kept live by the socket
  usePublicCountsSocket(); // pushes count updates into the query above (change-stream driven)
  const { data: carouselImages } = useGetMedia("carousel");
  const { data: outreachImages } = useGetMedia("outreach_image");
  const { data: outreachVideos } = useGetMedia("outreach_video");

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
      experts: findStatItem(content?.stats, "expert", "Experts engaged"),
      kvks: findStatItem(content?.stats, "kvk", "KVKs mapped"),
      saus: findStatItem(content?.stats, "sau", "SAUs collaborating"),
      states: findStatItem(content?.stats, "state", "States covered"),
      districts: findStatItem(content?.stats, "district", "Districts covered"),
      villages: findStatItem(content?.stats, "village", "Villages covered"),
    }),
    [content?.stats],
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
          <HeroCarousel
            stats={{
              totalQuestions: headline?.totalQuestions ?? 0,
              validatedQAPairs: headline?.validatedQAPairs ?? 0,
              questionsToday: headline?.questionsToday ?? 0,
              questionsThisMonth: headline?.questionsThisMonth ?? 0,
              ...editorial,
            }}
            loading={figuresLoading}
            images={carouselImages ?? []}
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
            <KnowledgeEngine />
            {/* HumanNetwork now renders inside NarrativeSection's right column, above. */}
            <Integrations />
            <ImpactOutreach />
            <OutreachGallery images={outreachImages ?? []} videos={outreachVideos ?? []} />
            <TechShowcase />
            <Roadmap />
            <Multilingual />
            <Channels />
            <Learning />
            <ReviewWorkflow />
            <CropMatrix />
            <GrowthTimeline />
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
