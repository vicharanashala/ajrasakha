import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import "./public-dashboard.css";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HeroCarousel } from "./components/HeroCarousel";
import { OutreachGallery } from "./components/OutreachGallery";
import {
  Channels,
  CropMatrix,
  GeographicIntelligence,
  GrowthTimeline,
  HeroSnapshot,
  HumanNetwork,
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
import { domains, heroStats } from "./data/dashboardData";
import { NAV } from "./data/nav";
import { useScrollSpy } from "./utils";
import { useGetDashboardContent } from "@/hooks/api/dashboard/useDashboardContent";
import { useGetPublicStats } from "@/hooks/api/dashboard/usePublicStats";
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
  const { data: carouselImages } = useGetMedia("carousel");
  const { data: outreachImages } = useGetMedia("outreach_image");
  const { data: outreachVideos } = useGetMedia("outreach_video");

  // Admin-authored narrative, falling back to the seed blocks until something is saved.
  const blocks = content?.blocks?.length ? content.blocks : defaultBlocks;

  const stats = useMemo(() => buildStatCells(live, content?.stats), [live, content?.stats]);
  const domainData = useMemo(() => buildDomainSlices(live), [live]);

  return (
    <div className="ace-dash">
      <Header
        activeNav={activeNav}
        onLogin={() => navigate({ to: "/auth" })}
        today={9840}
        thisMonth={238600}
      />
      <HeroCarousel images={carouselImages ?? []} />
      <main>
        <NarrativeSection blocks={blocks} />
        <HeroSnapshot stats={stats} />
        <GeographicIntelligence />
        <KnowledgeEngine />
        <HumanNetwork />
        <Integrations />
        <ImpactOutreach domainData={domainData} />
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
        { label: "Total Validated Question-Answer Pairs", value: String(live.validatedQAPairs) },
        { label: "States Covered", value: String(live.statesCovered) },
        { label: "Crops Covered", value: String(live.cropsCovered) },
        { label: "Domains Covered", value: String(live.domainsCovered) },
      ]
    : [];

  const liveLabels = new Set(liveStats.map((s) => s.label.toLowerCase()));

  const editorial: StatCell[] = adminStats?.length
    ? adminStats.map((s) => ({ label: s.label, value: s.value }))
    : heroStats.map((s) => ({ label: s.label, value: String(s.count) }));

  return [...liveStats, ...editorial.filter((s) => !liveLabels.has(s.label.trim().toLowerCase()))];
}

/** Top 10 domains by question volume; the demo figures until the API answers. */
function buildDomainSlices(live: PublicDashboardStats | null | undefined) {
  if (!live?.domainData?.length) return domains;
  return [...live.domainData]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((d) => ({ label: d.name, value: d.count }));
}
