import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import "./public-dashboard.css";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HeroCarousel, type CarouselStatItem } from "./components/HeroCarousel";
import { OutreachGallery } from "./components/OutreachGallery";
import {
  AnalyticsMapPublic,
  Channels,
  CropMatrix,
  GeographicIntelligence,
  GrowthTimeline,
  HeroSnapshot,
  ImpactOutreach,
  Integrations,
  KnowledgeEngine,
  Learning,
  Multilingual,
  NarrativeSection,
  ReviewWorkflow,
  Roadmap,
  TechShowcase,
  type StatCell,
} from "./sections";
import { defaultBlocks } from "./data/contentDefaults";
import { crops, domains, heroStats } from "./data/dashboardData";
import { NAV } from "./data/nav";
import { useScrollSpy } from "./utils";
import { useGetDashboardContent } from "@/hooks/api/dashboard/useDashboardContent";
import { useGetPublicCounts, useGetPublicStats } from "@/hooks/api/dashboard/usePublicStats";
import { usePublicCountsSocket } from "@/hooks/api/dashboard/usePublicCountsSocket";
import { useGetMedia } from "@/hooks/api/media/useMedia";
import type { PublicDashboardStats } from "@/hooks/services/publicStatsService";
import type { DashboardStat } from "@/hooks/services/dashboardContentService";

const NAV_IDS = NAV.map((n) => n.id);

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
  const activeNav = useScrollSpy(NAV_IDS, "layer1");

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

  // Coverage from /stats, but the counts overridden by the polled values so the stat grid's
  // "Total Validated Question-Answer Pairs" tracks new questions too.
  const liveForStats = useMemo(
    () => (live ? { ...live, ...(counts ?? {}) } : live),
    [live, counts],
  );

  const stats = useMemo(
    () => buildStatCells(liveForStats, content?.stats),
    [liveForStats, content?.stats],
  );
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

  return (
    <div className="ace-dash">
      <Header
        activeNav={activeNav}
        onLogin={() => navigate({ to: "/auth" })}
        today={headline?.questionsToday ?? 0}
        thisMonth={headline?.questionsThisMonth ?? 0}
        loading={figuresLoading}
      />
      <HeroCarousel
        stats={{
          totalQuestions: headline?.totalQuestions ?? 0,
          validatedQAPairs: headline?.validatedQAPairs ?? 0,
          ...editorial,
        }}
        loading={figuresLoading}
        images={carouselImages ?? []}
      />
      <main>
        {/* 60-second overview carousel (left) + Human Intelligence Network (right) */}
        <NarrativeSection blocks={blocks} roles={live?.userRoleOverview} />
        <AnalyticsMapPublic />
        <HeroSnapshot stats={stats} />
        <GeographicIntelligence />
        <KnowledgeEngine />
        {/* HumanNetwork now renders inside NarrativeSection's right column, above. */}
        <Integrations />
        <ImpactOutreach domainData={domainData} cropData={cropData} />
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
      <Footer />
    </div>
  );
};

/**
 * Headline figures = LIVE numbers from the database first, then the admin-edited stats
 * (or the built-in defaults when an admin hasn't saved any).
 *
 * The live block is computed server-side from the questions collection, so it is always
 * true: validated Q&A pairs (closed / dynamic_closed / duplicate_closed) plus the states,
 * crops and domains actually covered. Admin-edited stats that duplicate a live label are
 * dropped, so a stale hand-typed number can never shadow the real one.
 */
function buildStatCells(
  live: PublicDashboardStats | null | undefined,
  adminStats: DashboardStat[] | undefined,
): StatCell[] {
  const liveStats: StatCell[] = live
    ? [
        { label: "Crops Covered", value: String(live.cropsCovered) },
        { label: "Domains Covered", value: String(live.domainsCovered) },
      ]
    : [];

  const liveLabels = new Set(liveStats.map((s) => s.label.toLowerCase()));

  const editorial: StatCell[] = adminStats?.length
    ? adminStats.map((s) => ({ label: s.label, value: s.value }))
    : heroStats.map((s) => ({ label: s.label, value: String(s.count) }));

  // Drop anything already shown in the hero carousel (the 9 figures below) or already in the
  // live block above, so the snapshot grid only shows what ISN'T covered elsewhere — e.g.
  // Markets connected, Dynamic tools integrated, Outreach events conducted.
  return [
    ...liveStats,
    ...editorial.filter(
      (s) =>
        !liveLabels.has(s.label.trim().toLowerCase()) && !isCarouselStat(s.label),
    ),
  ];
}

/** Label fragments for the figures the hero carousel already displays. */
const CAROUSEL_STAT_FRAGMENTS = [
  "question", // Agricultural questions processed
  "q&a", // Validated Q&A pairs
  "language",
  "expert",
  "kvk",
  "sau",
  "state",
  "district",
  "village",
];

const isCarouselStat = (label: string): boolean => {
  const l = label.toLowerCase();
  return CAROUSEL_STAT_FRAGMENTS.some((f) => l.includes(f));
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
