import React, { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Globe,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  X,
  Menu,
  Check,
  CloudSun,
  BookOpen,
  Sprout,
  ShieldCheck,
  Award,
  Layers,
  MapPin,
  FileCheck,
  FlaskConical,
  Landmark,
  MessageSquare,
  Lock,
  Loader2,
  Monitor,
  MessageCircle,
  Cloud,
  LineChart,
  Calendar,
  Shield,
  Cpu,
  Smartphone,
  Trophy,
} from "lucide-react";
import {
  FARMERS_FRIDAY_IMAGE_NAME,
  FARMERS_FRIDAY_VIDEO_NAME,
  OUTREACH_IMAGE_NAME,
  OUTREACH_VIDEO_NAME,
} from "@/hooks/services/publicDashboardService";
import "./home-dashboard.css";
import CinematicHero from "./components/hero/CinematicHero";
import IndiaCoverageMap from "./components/IndiaCoverageMap";
import ReviewWorkflowCanvas from "./components/ReviewWorkflowCanvas";

// Lazy-load heavy components — deferred until they near the viewport
const KnowledgeRootsCanvas = lazy(() => import("./components/KnowledgeRootsCanvas").then((m) => ({ default: m.KnowledgeRootsCanvas })));
const ExpertNetworkMap = lazy(() =>
  import("./components/ExpertNetworkMap").then((m) => ({ default: m.ExpertNetworkMap }))
);
import {
  usePublicDashboardItems,
  usePublicDashboardUsers,
  usePublicDashboardSaturatedCrops,
} from "../../hooks/api/public-dashboard/usePublicDashboardConfig";
import {
  STAT_QUESTIONS_COLLECTED,
  STAT_QUESTIONS_REFINED,
  STAT_LANGUAGES_SUPPORTED,
  STAT_AGROCLIMATIC_ZONES,
} from "../../hooks/services/publicDashboardService";

/** Helper to convert YouTube video URL into an embedded YouTube player URL. Returns null if invalid or not YouTube. */
const getYouTubeEmbedUrl = (url?: string): string | null => {
  if (!url) return null;

  const ytMatch = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
  }

  if (url.includes("youtube.com/embed/")) {
    return url;
  }

  return null;
};

// Defined outside the component — never recreated on re-render
const FUTURE_SLIDES = [
  {
    id: "khc-agent-interface",
    title: "KHC Agent Interface",
    subtitle: "Knowledge Hub Center Workflow",
    tag: "AGENT WORKFLOW",
    image: "/assets/learning-campus.png",
    description: "Unified expert desk interface for organizing, reviewing, and approving agricultural advisory datasets.",
  },
  {
    id: "annadatha-app",
    title: "AnnaDatha - Question Collection",
    subtitle: "Farmer Query Intake App",
    tag: "QUERY COLLECTION",
    image: "/assets/farmer-network.png",
    description: "Multilingual voice and text mobile application for collecting ground-level farmer questions across India.",
  },
  {
    id: "npk-calculator",
    title: "NPK Calculator",
    subtitle: "Precision Soil Nutrient Balancing",
    tag: "AGRI CALCULATOR",
    image: "/assets/future-crops.png",
    description: "Smart fertilizer dosage engine calculating optimal Nitrogen, Phosphorus, and Potassium ratios per crop type.",
  },
  {
    id: "soil-health-card-reader",
    title: "Soil Health Card Reader",
    subtitle: "AI Optical Document Scanner",
    tag: "SMART SCANNER",
    image: "/assets/green-field.jpg",
    description: "Instant OCR scanner extracting soil parameters from physical Soil Health Cards into digital recommendations.",
  },
  {
    id: "predictive-analysis-engine",
    title: "Predictive Analysis Engine",
    subtitle: "Crop & Weather Risk Modeling",
    tag: "PREDICTIVE AI",
    image: "/assets/future-crops.png",
    description: "Advanced forecasting engine predicting pest infestation, disease outbreaks, and yield trajectories.",
  },
];

export const HomeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { data: publicUsers, isLoading: isUsersLoading } =
    usePublicDashboardUsers();
  const { data: publicItems, isLoading: isItemsLoading } =
    usePublicDashboardItems();
  const { data: saturatedCrops, isLoading: isSaturatedLoading } =
    usePublicDashboardSaturatedCrops();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState("English");
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
  const [activeStoryIdx, setActiveStoryIdx] = useState(0);
  const [activeFarmersFridayIdx, setActiveFarmersFridayIdx] = useState(0);
  const [activeFutureSlideIdx, setActiveFutureSlideIdx] = useState(0);
  const [reviewStage, setReviewStage] = useState(0);
  const [reviewProgress, setReviewProgress] = useState(0);
  const [activeStatesCount, setActiveStatesCount] = useState<number | null>(null);
  const [activeNetworkTab, setActiveNetworkTab] = useState<"experts" | "kvk" | "sau">("experts");
  const [hoveredKvkIdx, setHoveredKvkIdx] = useState<number | null>(null);
  const [isNavScrolled, setIsNavScrolled] = useState(false);

  // Mount / Unmount lifecycle hook to isolate Home Dashboard global styles from the rest of the application
  useEffect(() => {
    document.documentElement.classList.add("home-dashboard-active");
    document.body.classList.add("home-dashboard-active");
    return () => {
      document.documentElement.classList.remove("home-dashboard-active");
      document.body.classList.remove("home-dashboard-active");
    };
  }, []);

  // Intersection Observer: Detach navbar when #knowledge section enters view (0% scroll overhead)
  useEffect(() => {
    const knowledgeEl = document.getElementById("knowledge");
    if (!knowledgeEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNavScrolled(entry.isIntersecting);
      },
      {
        rootMargin: "0px 0px -15% 0px",
        threshold: 0,
      }
    );
    observer.observe(knowledgeEl);
    return () => observer.disconnect();
  }, []);

  const futureSlides = FUTURE_SLIDES;

  // Pinned Sticky Scroll Listener for Review Workflow Stages (Section 4)
  // Uses IntersectionObserver to restrict scroll handler execution only when section is visible
  useEffect(() => {
    const section = document.getElementById("engine");
    if (!section) return;

    let isVisible = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    io.observe(section);

    let rafId: number | null = null;
    const handleScroll = () => {
      if (!isVisible) return;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const rect = section.getBoundingClientRect();
        const sectionHeight = section.offsetHeight;
        const windowHeight = window.innerHeight;
        const scrolled = -rect.top;
        const maxScroll = sectionHeight - windowHeight;

        let nextStage: number;
        let progress = 0;
        if (scrolled <= 0) {
          nextStage = 0;
          progress = 0;
        } else if (scrolled >= maxScroll * 0.98) {
          nextStage = 4;
          progress = 1;
        } else {
          progress = Math.max(0, Math.min(1, scrolled / maxScroll));
          nextStage = Math.min(4, Math.floor(progress * 5));
        }
        setReviewProgress(progress);
        setReviewStage((prev) => (prev !== nextStage ? nextStage : prev));
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const scrollToStage = (stageIdx: number) => {
    const section = document.getElementById("engine");
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const sectionTop = rect.top + window.scrollY;
    const sectionHeight = section.offsetHeight;
    const windowHeight = window.innerHeight;
    const maxScroll = sectionHeight - windowHeight;

    const targets = [0.05, 0.25, 0.45, 0.65, 0.88];
    const targetScroll = sectionTop + targets[stageIdx] * maxScroll;
    window.scrollTo({ top: targetScroll, behavior: "smooth" });
  };

  const navLinks = [
    ["Overview", "overview"],
    ["India Map", "india-map"],
    ["Knowledge Engine", "knowledge"],
    ["Experts", "experts"],
    ["Intelligence", "intelligence"],
    ["Outreach", "outreach"],
    ["Learning", "learning"],
  ];

  const languages = ["English", "हिन्दी", "ਪੰਜਾਬੀ", "বাংলা", "தமிழ்"];

  /** Read an admin-editable stat item by its canonical name, falling back to a default. */
  const readStat = (name: string, fallback: string): string => {
    const item = publicItems?.find(
      (it) => it.name?.toLowerCase() === name.toLowerCase()
    );
    if (item == null || item.value == null || item.value === "") return fallback;
    return String(item.value);
  };

  // Derive Crops/States covered from the saturated-crops endpoint. The response is either
  // { states: [...] } or a raw states array — normalise, then count distinct states and
  // distinct crop names across all states.
  const coverage = React.useMemo(() => {
    const states = Array.isArray(saturatedCrops)
      ? saturatedCrops
      : saturatedCrops?.states ?? [];
    const stateNames = new Set<string>();
    const cropNames = new Set<string>();
    let closedTotal = 0;
    let inProgressTotal = 0;
    for (const s of states) {
      const stateName = s.state?.trim();
      if (stateName) stateNames.add(stateName.toLowerCase());
      closedTotal += s.closed ?? 0;
      inProgressTotal += s.inProgress ?? 0;
      for (const c of s.crops ?? []) {
        const crop = c?.crop != null ? String(c.crop).trim() : "";
        if (crop) cropNames.add(crop.toLowerCase());
      }
    }
    return {
      statesCovered: stateNames.size,
      cropsCovered: cropNames.size,
      closedTotal,
      inProgressTotal,
    };
  }, [saturatedCrops]);

  // "SAUs collaborated with" = number of distinct universities among active pae_expert users.
  const sauCount = React.useMemo(() => {
    const universities = new Set<string>();
    for (const u of publicUsers ?? []) {
      if (u.role?.toLowerCase() !== "pae_expert") continue;
      const uni = u.university?.trim();
      if (uni) universities.add(uni.toLowerCase());
    }
    return universities.size;
  }, [publicUsers]);

  // SAU-network breakdown: pae_expert users grouped by university (case-insensitive, so
  // "Lallu" and "lallu" collapse into one), keeping the first-seen casing as the label.
  const sauUniversities = React.useMemo<{ university: string; count: number }[]>(() => {
    const groups = new Map<string, { university: string; count: number }>();
    for (const u of publicUsers ?? []) {
      if (u.role?.toLowerCase() !== "pae_expert") continue;
      const uni = u.university?.trim();
      if (!uni) continue;
      const key = uni.toLowerCase();
      const existing = groups.get(key);
      if (existing) existing.count += 1;
      else groups.set(key, { university: uni, count: 1 });
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [publicUsers]);

  // Coerce a user's kvkCovered into a clean list of KVK names. Handles the current
  // { state, district, name } object entries as well as legacy shapes (string[] and
  // { number, name: [] }).
  const getKvks = (u: { kvkCovered?: unknown }): string[] => {
    const v = u.kvkCovered;
    if (Array.isArray(v)) {
      return v
        .map((k) => {
          if (typeof k === "string") return k.trim();
          if (k && typeof k === "object" && typeof (k as any).name === "string")
            return (k as any).name.trim();
          return "";
        })
        .filter(Boolean);
    }
    // Legacy { number, name: [] }.
    if (v && typeof v === "object" && Array.isArray((v as any).name)) {
      return (v as any).name
        .map((n: unknown) => (typeof n === "string" ? n.trim() : ""))
        .filter(Boolean);
    }
    return [];
  };

  // "KVKs covered" = number of distinct KVK names across all users (case-insensitive).
  const kvkCount = React.useMemo(() => {
    const kvks = new Set<string>();
    for (const u of publicUsers ?? []) {
      for (const k of getKvks(u)) kvks.add(k.toLowerCase());
    }
    return kvks.size;
  }, [publicUsers]);

  // KVK-network breakdown: each user who covers KVKs, with their name and KVK list.
  const kvkUsers = React.useMemo<{ name: string; kvks: string[] }[]>(() => {
    const list: { name: string; kvks: string[] }[] = [];
    for (const u of publicUsers ?? []) {
      const kvks = getKvks(u);
      if (kvks.length === 0) continue;
      const name =
        [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || "Unnamed";
      list.push({ name, kvks });
    }
    return list.sort((a, b) => b.kvks.length - a.kvks.length);
  }, [publicUsers]);

  const spinner = <Loader2 className="inline-block h-4 w-4 animate-spin" aria-label="Loading" />;

  const heroMetrics = [
    { value: isItemsLoading ? spinner : readStat(STAT_QUESTIONS_COLLECTED, "45M+"), label: "Questions collected", icon: MessageSquare },
    { value: isItemsLoading ? spinner : readStat(STAT_QUESTIONS_REFINED, "70,741"), label: "Questions refined", icon: FileCheck },
    { value: isItemsLoading ? spinner : readStat(STAT_LANGUAGES_SUPPORTED, "22"), label: "Languages Supported", icon: Globe },
    { value: isSaturatedLoading ? spinner : String(coverage.cropsCovered), label: "Crops Covered", icon: Sprout },
    { value: isSaturatedLoading ? spinner : String(coverage.statesCovered), label: "States covered", icon: MapPin },
    { value: isUsersLoading ? spinner : String(kvkCount), label: "KVKs covered", icon: Landmark },
    { value: isUsersLoading ? spinner : String(sauCount), label: "SAUs collaborated with", icon: BookOpen },
    { value: isItemsLoading ? spinner : readStat(STAT_AGROCLIMATIC_ZONES, "126"), label: "Agroclimatic Zones", icon: CloudSun },
  ];

  const reviewStages = [
    {
      stageNum: "01",
      kicker: "Stage 01 · The Seed",
      label: "Question Submitted",
      body: "A farmer's query enters the system in regional text or voice dialect, carrying location coordinates, soil parameters, weather conditions, and seasonal crop context.",
      icon: Sprout,
      badge: "Voice & Text Intake",
      metrics: [
        { label: "Intake Latency", value: "< 1.2s" },
        { label: "Dialects Supported", value: "22 Languages" },
      ],
    },
    {
      stageNum: "02",
      kicker: "Stage 02 · The First Shoot",
      label: "AI Enrichment",
      body: "ACE Engine processes intent, cleans noise, extracts entities, and cross-references trusted scientific evidence from ICAR & SAU knowledge bases.",
      icon: Cpu,
      badge: "ACE Engine v2.4",
      metrics: [
        { label: "Intent Confidence", value: "99.4%" },
        { label: "Evidence Sources", value: "14 Datasets" },
      ],
    },
    {
      stageNum: "03",
      kicker: "Stage 03 · The Branches",
      label: "Expert Peer Review",
      body: "Multiple anonymous domain agronomists evaluate contextual relevance, scientific dosage safety, practical feasibility, and communication clarity across 4 review tracks.",
      icon: ShieldCheck,
      badge: "4-Track Peer Review",
      metrics: [
        { label: "Safety Score", value: "100 / 100" },
        { label: "Avg Review SLA", value: "< 4 mins" },
      ],
    },
    {
      stageNum: "04",
      kicker: "Stage 04 · The Flower",
      label: "Moderator Approval",
      body: "A senior ICAR / KVK moderator inspects the complete audit trail, resolves cross-disciplinary consensus, and applies the official quality assurance seal.",
      icon: Award,
      badge: "Senior Moderator Seal",
      metrics: [
        { label: "Consensus Score", value: "98.6%" },
        { label: "Audit Verification", value: "Passed" },
      ],
    },
    {
      stageNum: "05",
      kicker: "Stage 05 · The Fruit",
      label: "Golden Database",
      body: "The validated answer becomes a part of the Golden Database (GDB), India's growing national repository of expert-reviewed agricultural advisories for instant zero-latency retrieval.",
      icon: Layers,
      badge: "Golden Database (GDB)",
      metrics: [
        { label: "Trusted Records", value: "3.2M+" },
        { label: "National Sync", value: "Realtime" },
      ],
    },
  ];

  const integrations = [
    // Live Deployed Features (1-7)
    { name: "Advisory Engine", cadence: "v2.4 Core", icon: Layers, isLive: true },
    { name: "Web Application", cadence: "v1.8 Portal", icon: Monitor, isLive: true },
    { name: "Whatsapp bot", cadence: "24/7 Active", icon: MessageCircle, isLive: true },
    { name: "Weather", cadence: "Realtime", icon: Cloud, isLive: true },
    { name: "Market", cadence: "Hourly updates", icon: LineChart, isLive: true },
    { name: "Schemes", cadence: "Daily sync", icon: FileCheck, isLive: true },
    { name: "Irrigation advisory", cadence: "Realtime", icon: Sprout, isLive: true },

    // Under Development / Pipeline Features (8-11)
    { name: "Crop calendar", cadence: "Q3 Release", icon: Calendar, isLive: false },
    { name: "Soil health intelligence", cadence: "In Pipeline", icon: FlaskConical, isLive: false },
    { name: "Predictive analysis", cadence: "R&D Phase", icon: LineChart, isLive: false },
    { name: "Pests & disease alerts", cadence: "In Training", icon: Shield, isLive: false },
  ];

  const expertCounts = React.useMemo<[string, string, string][]>(() => {
    // Friendly display labels for known role keys; anything else is prettified below.
    const ROLE_LABELS: Record<string, string> = {
      expert: "Agronomists / Experts",
      agronomist: "Agronomists / Experts",
      pae_expert: "PAE Experts",
      moderator: "Moderators",
      auditor: "Auditors",
      gate_keeper: "Gate Keepers",
      gatekeeper: "Gate Keepers",
      reviewer: "Reviewers",
      author: "Authors",
      district_coordinator: "District Coordinators",
      block_coordinator: "Block Coordinators",
      village_volunteer: "Village Volunteers",
      call_agent: "Call Agents",
    };
    const ROLE_COLORS = ["#2b7050", "#6d9a57", "#d3ad5e", "#8c79a4", "#a76455", "#4e8ca6", "#b07d3b", "#5a8f74"];

    // Count active users per role, excluding admins.
    const counts: Record<string, number> = {};
    for (const u of publicUsers ?? []) {
      const role = u.role?.trim().toLowerCase();
      if (!role || role === "admin") continue;
      counts[role] = (counts[role] || 0) + 1;
    }

    // Highest count first; label unknown roles by title-casing their key.
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([role, count], i) => {
        const label =
          ROLE_LABELS[role] ??
          role.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
        return [label, count.toLocaleString(), ROLE_COLORS[i % ROLE_COLORS.length]];
      });
  }, [publicUsers]);

  const outreachStories = React.useMemo(() => {
    if (publicItems && publicItems.length > 0) {
      const items = publicItems.filter(
        (it) =>
          it.name === OUTREACH_VIDEO_NAME ||
          it.name === OUTREACH_IMAGE_NAME ||
          it.name?.toLowerCase().includes("outreach")
      );

      const presets = [
        {
          place: "PHASE 1: LISTEN",
          title: "Ground-Zero Connect",
          body: "Agriculture doesn't happen in dashboards — it happens in fields, villages and communities. We start there, meeting farmers where they live and work, to understand not just what they grow, but the realities and decisions that shape every season.",
          reach: "4,200+",
          outcome: "1,150",
          url: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?q=80&w=1200&auto=format&fit=crop",
        },
        {
          place: "PHASE 2: DEMO",
          title: "Cotton Pink Bollworm Pheromone Trap Alert",
          body: "Automated phone IVR in Marathi alerted 8,500 cotton growers to deploy pheromone lures 7 days prior to moth emergence, averting crop loss across 12,000 acres.",
          reach: "8,500+",
          outcome: "3,200",
          url: "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?q=80&w=1200&auto=format&fit=crop",
        },
        {
          place: "PHASE 3: SCALE",
          title: "Micro-Irrigation & Tensiometer Scheduling",
          body: "Precision soil moisture sensor advisories reduced canal water consumption by 32% while boosting wheat grain weight by 4.8 quintals per hectare.",
          reach: "3,100+",
          outcome: "980",
          url: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=1200&auto=format&fit=crop",
        },
      ];

      if (items.length > 0) {
        return items.map((it, idx) => {
          const val = typeof it.value === "object" && it.value !== null ? (it.value as any) : {};
          const rawUrl = typeof it.value === "string" ? it.value : val.url || val.videoUrl || val.imageUrl || "";
          const preset = presets[idx % presets.length];

          return {
            id: it.id || `outreach-${idx}`,
            place: val.place || preset.place,
            title: val.title || (it.name === OUTREACH_VIDEO_NAME || it.name === OUTREACH_IMAGE_NAME ? preset.title : it.name),
            body: val.body || val.description || preset.body,
            reach: val.reach || preset.reach,
            outcome: val.outcome || preset.outcome,
            url: rawUrl || preset.url,
            videoUrl: rawUrl,
          };
        });
      }
    }

    return [
      {
        id: "default-story-1",
        place: "PHASE 1: LISTEN",
        title: "Ground-Zero Connect",
        body: "Agriculture doesn't happen in dashboards — it happens in fields, villages and communities. We start there, meeting farmers where they live and work, to understand not just what they grow, but the realities and decisions that shape every season.",
        reach: "4,200+",
        outcome: "1,150",
        url: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?q=80&w=1200&auto=format&fit=crop",
        videoUrl: "",
      },
      {
        id: "default-story-2",
        place: "PHASE 2: DEMO",
        title: "Cotton Pink Bollworm Pheromone Trap Alert",
        body: "Automated phone IVR in Marathi alerted 8,500 cotton growers to deploy pheromone lures 7 days prior to moth emergence, averting crop loss across 12,000 acres.",
        reach: "8,500+",
        outcome: "3,200",
        url: "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?q=80&w=1200&auto=format&fit=crop",
        videoUrl: "",
      },
      {
        id: "default-story-3",
        place: "PHASE 3: SCALE",
        title: "Micro-Irrigation & Tensiometer Scheduling",
        body: "Precision soil moisture sensor advisories reduced canal water consumption by 32% while boosting wheat grain weight by 4.8 quintals per hectare.",
        reach: "3,100+",
        outcome: "980",
        url: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=1200&auto=format&fit=crop",
        videoUrl: "",
      },
    ];
  }, [publicItems]);

  const farmersFridayStories = React.useMemo(() => {
    if (publicItems && publicItems.length > 0) {
      const items = publicItems.filter(
        (it) =>
          it.name === FARMERS_FRIDAY_IMAGE_NAME ||
          it.name === FARMERS_FRIDAY_VIDEO_NAME ||
          it.name?.toLowerCase().includes("farmers friday")
      );

      if (items.length > 0) {
        return items.map((it, idx) => {
          const val = typeof it.value === "object" && it.value !== null ? (it.value as any) : {};
          const rawUrl = typeof it.value === "string" ? it.value : val.url || val.imageUrl || val.videoUrl || "";
          return {
            id: it.id || `ff-${idx}`,
            title: val.title || `Farmers' Friday Session #${idx + 1}`,
            url: rawUrl,
            isVideo: it.name === FARMERS_FRIDAY_VIDEO_NAME || !!getYouTubeEmbedUrl(rawUrl),
          };
        });
      }
    }

    return [
      {
        id: "ff-1",
        title: "Farmers' Friday Workshop",
        url: "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?q=80&w=1200&auto=format&fit=crop",
        isVideo: false,
      },
      {
        id: "ff-2",
        title: "Practical Learning & Demonstration",
        url: "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?q=80&w=1200&auto=format&fit=crop",
        isVideo: false,
      },
      {
        id: "ff-3",
        title: "Digital Adoption Guidance",
        url: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=1200&auto=format&fit=crop",
        isVideo: false,
      },
      {
        id: "ff-4",
        title: "Field Advisory Interaction",
        url: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?q=80&w=1200&auto=format&fit=crop",
        isVideo: false,
      },
      {
        id: "ff-5",
        title: "Cohort Learning Session",
        url: "https://images.unsplash.com/photo-1586771107445-d3ca888129ff?q=80&w=1200&auto=format&fit=crop",
        isVideo: false,
      },
    ];
  }, [publicItems]);

  return (
    <div className="home-dash-app">
      {/* Scroll Progress Bar */}
      <div className="page-progress" style={{ transformOrigin: "left" }} />

      {/* 1. Header / Navbar */}
      <header className={`site-header ${isNavScrolled ? "is-scrolled" : ""}`}>
        {/* Brand Logo */}
        <a
          href="#overview"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <div className="brand-mark">
            <img src="/logo.png" alt="ANNAM.AI Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <span>
            <strong>ANNAM.AI</strong>
            <small>ACE</small>
          </span>
        </a>

        {/* Desktop Navigation Links */}
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navLinks.map(([label, href], idx) => (
            <a key={href} href={`#${href}`} className={idx === 0 ? "active" : ""}>
              {label}
            </a>
          ))}
        </nav>

        {/* Header Actions */}
        <div className="header-actions">
          {/* Language Selector */}
          <div className="language-picker">
            <button
              type="button"
              className="language-button"
              aria-expanded={isLangOpen}
              onClick={() => setIsLangOpen(!isLangOpen)}
            >
              <Globe size={15} />
              <span>{selectedLang}</span>
              <ChevronDown size={12} />
            </button>

            {isLangOpen && (
              <div className="language-menu">
                {languages.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      setSelectedLang(lang);
                      setIsLangOpen(false);
                    }}
                  >
                    <span>{lang}</span>
                    {lang === selectedLang && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Login Button */}
          <button
            onClick={() => navigate({ to: "/auth" })}
            style={{
              background: "var(--forest)",
              color: "#faf8f1",
              border: "1px solid rgba(255,255,255,0.2)",
              padding: "8px 18px",
              borderRadius: "20px",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              marginLeft: "12px",
              boxShadow: "0 4px 14px rgba(12, 58, 42, 0.25)",
              transition: "transform 0.2s ease",
            }}
          >
            Login
          </button>

          {/* Mobile menu toggle */}
          <button
            className="mobile-menu-button"
            type="button"
            aria-label="Open navigation"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* Mobile Nav Drawer */}
      {isMobileMenuOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navLinks.map(([label, href]) => (
            <a key={href} href={`#${href}`} onClick={() => setIsMobileMenuOpen(false)}>
              <span>{label}</span>
              <ArrowRight size={16} />
            </a>
          ))}
        </nav>
      )}

      {/* 2. Cinematic Hero — scroll-driven 68-frame image sequence */}
      <CinematicHero
        heroMetrics={heroMetrics}
        onWatchStory={() => setIsStoryModalOpen(true)}
      />

      {/* 3. Knowledge Engine & Data Sources — Sapta Nadi Knowledge River */}
      <Suspense fallback={<div style={{ height: "100vh", background: "#06140b" }} />}>
        <KnowledgeRootsCanvas />
      </Suspense>

      {/* 4. Review & Validation Workflow — The Evolution of Knowledge */}
      <section className="review-growth" id="engine">
        <div className="review-sticky">

          {/* Section Background Elements */}
          <div className="evo-bg-gradient" />
          <div className="evo-bg-grid" />
          <div className="evo-bg-fog" />

          <div className="page-shell evo-shell">

            {/* ── Top heading row ── */}
            <div className="evo-topbar">
              <div className="evo-topbar-left">
                <span className="eyebrow">
                  <span className="evo-live-dot" />
                  Review &amp; validation workflow
                </span>
                <h2 className="evo-headline">
                  The evolution of<br />
                  <em>trusted knowledge</em>
                </h2>
              </div>

              {/* Stage counter + stepper */}
              <div className="evo-topbar-right">
                <div className="evo-stage-counter">
                  <div>
                    <span className="evo-stage-label">ACTIVE STAGE</span>
                    <span className="evo-stage-num">0{reviewStage + 1}<small>/05</small></span>
                  </div>
                  <div className="evo-stage-counter-divider" />
                  <div>
                    <span className="evo-stage-label">CURRENT PHASE</span>
                    <span className="evo-stage-name">{reviewStages[reviewStage].label}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Main evolution stage panel ── */}
            <div className="evo-main-panel">

              {/* Left: Clean Stage Copy Pane */}
              <div key={reviewStage} className="evo-copy-pane">
                <div className="evo-copy-header">
                  {React.createElement(reviewStages[reviewStage].icon, {
                    size: 16,
                    className: "evo-copy-icon",
                  })}
                  <span className="evo-copy-kicker">{reviewStages[reviewStage].kicker}</span>
                </div>
                <h3 className="evo-copy-title">{reviewStages[reviewStage].label}</h3>
                <p className="evo-copy-body">{reviewStages[reviewStage].body}</p>

                {/* Inline stage list navigation */}
                <nav className="evo-stage-nav" aria-label="All stages">
                  {reviewStages.map((stage, idx) => (
                    <button
                      key={stage.label}
                      className={`evo-stage-row ${idx === reviewStage ? "current" : idx < reviewStage ? "visited" : ""}`}
                      onClick={() => scrollToStage(idx)}
                      type="button"
                    >
                      <span className="evo-row-dot" />
                      <span className="evo-row-num">0{idx + 1}</span>
                      <span className="evo-row-name">{stage.label}</span>
                      {idx === reviewStage && <ChevronRight size={13} className="evo-row-arrow" />}
                    </button>
                  ))}
                </nav>

                {/* Prev/Next controls */}
                <div className="evo-nav-controls">
                  <button
                    type="button"
                    className="evo-ctrl-btn evo-ctrl-prev"
                    disabled={reviewStage === 0}
                    onClick={() => scrollToStage(Math.max(0, reviewStage - 1))}
                    aria-label="Previous stage"
                  >
                    <ChevronLeft size={18} />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    className="evo-ctrl-btn evo-ctrl-next"
                    disabled={reviewStage === 4}
                    onClick={() => scrollToStage(Math.min(4, reviewStage + 1))}
                    aria-label="Next stage"
                  >
                    <span style={{ color: "#ffffff", fontWeight: 700 }}>Next</span>
                    <ChevronRight size={18} style={{ color: "#ffffff" }} />
                  </button>
                </div>
              </div>

              {/* Right: Full-bleed 130-frame canvas animation with internal progress spine & badges */}
              <ReviewWorkflowCanvas
                progress={reviewProgress}
                reviewStage={reviewStage}
                onSelectStage={scrollToStage}
                totalFrames={130}
              />

            </div>
          </div>
        </div>
      </section>

      {/* 5. Pan-India Coverage Layer */}
      <section className="coverage-section" id="india-map">
        <div className="page-shell coverage-layout">
          <div className="coverage-intro">
            <span className="eyebrow">India coverage · Knowledge without boundaries</span>
            <h2>Knowledge spanning across state and district.</h2>
            <p>
              From crops to geographies, discover the breadth of our advisory coverage.
            </p>
            <div className="coverage-stats">
              <div>
                <strong>{activeStatesCount !== null ? activeStatesCount : "—"}</strong>
                <span>States & UTs</span>
              </div>
              <div>
                <strong>{isSaturatedLoading ? spinner : coverage.closedTotal}</strong>
                <span>Closed Questions Count</span>
              </div>
              <div>
                <strong>{isSaturatedLoading ? spinner : coverage.inProgressTotal}</strong>
                <span>In-Progress Count</span>
              </div>
            </div>
          </div>

          <IndiaCoverageMap
            saturatedCrops={saturatedCrops}
            isLoading={isSaturatedLoading}
            onStatesCountChange={setActiveStatesCount}
          />
        </div>
      </section>

      {/* 6. Live Intelligence & Integrations */}
      <section className="integrations-section" id="intelligence">
        <div className="integration-stars" />
        <div className="page-shell">
          <div className="integration-heading">
            <div>
              <span className="eyebrow">Live intelligence · Integrations</span>
              <h2>Real-time data. Smarter decisions. Stronger impact.</h2>
            </div>
            <button type="button" className="outline-button">
              View all integrations
            </button>
          </div>

          {/* Game Level Unlocking Dashboard Roadmap */}
          <div className="game-roadmap-shell">
            <div className="roadmap-header-legend">
              <span className="legend-tag live-tag">
                <i className="live-dot-pulse" /> Live Deployed (7)
              </span>
              <div className="dotted-separator-line" />
              <span className="legend-tag dev-tag">
                <Lock size={12} /> Under Development (4)
              </span>
            </div>

            <div className="integration-flow game-dashboard-flow">
              {integrations.map(({ name, cadence, icon: Icon, isLive }, idx) => (
                <React.Fragment key={name}>
                  {/* Dotted separator between live and under dev features */}
                  {idx === 7 && <div className="game-level-divider" title="Under Development Horizon" />}

                  <div className={`integration-node game-node ${isLive ? "node-live" : "node-locked"}`}>
                    <div className="integration-icon-wrap">
                      <span className="integration-icon">
                        <Icon size={26} />
                      </span>
                      {!isLive && (
                        <span className="lock-overlay-badge">
                          <Lock size={12} />
                        </span>
                      )}
                    </div>

                    <strong>{name}</strong>
                    <small>
                      {cadence}
                      <i className={isLive ? "status-live" : "status-locked"}>
                        {isLive ? "Live" : "In Pipeline"}
                      </i>
                    </small>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7. Human Intelligence Network */}
      <section className="human-section" id="experts">
        <div className="page-shell human-grid">
          <div className="expert-copy">
            <span className="eyebrow">Human intelligence network</span>
            <h2>A nationwide network of agricultural experts and institutions.</h2>

            <div className="network-tabs">
              <button
                className={activeNetworkTab === "experts" ? "active" : ""}
                type="button"
                onMouseEnter={() => setActiveNetworkTab("experts")}
                onClick={() => setActiveNetworkTab("experts")}
              >
                Experts map
              </button>
              <button
                className={activeNetworkTab === "kvk" ? "active" : ""}
                type="button"
                onMouseEnter={() => setActiveNetworkTab("kvk")}
                onClick={() => setActiveNetworkTab("kvk")}
              >
                KVK network
              </button>
              <button
                className={activeNetworkTab === "sau" ? "active" : ""}
                type="button"
                onMouseEnter={() => setActiveNetworkTab("sau")}
                onClick={() => setActiveNetworkTab("sau")}
              >
                SAU network
              </button>
            </div>

            {activeNetworkTab === "sau" ? (
              <ul className="expert-counts">
                {sauUniversities.length > 0 ? (
                  sauUniversities.map(({ university, count }) => (
                    <li key={university.toLowerCase()}>
                      <span>
                        <i style={{ background: "#2b7050" }} />
                        {university}
                      </span>
                      <strong>{count.toLocaleString()}</strong>
                    </li>
                  ))
                ) : (
                  <li>
                    <span>No SAU (pae_expert) universities yet</span>
                  </li>
                )}
              </ul>
            ) : activeNetworkTab === "kvk" ? (
              <ul className="expert-counts">
                {kvkUsers.length > 0 ? (
                  kvkUsers.map((u, i) => (
                    <li key={`${u.name}-${i}`}>
                      <span>
                        <i style={{ background: "#6d9a57" }} />
                        {u.name}
                      </span>
                      {/* Hover the count to reveal the user's KVK names. */}
                      <strong
                        style={{ position: "relative", cursor: "pointer" }}
                        onMouseEnter={() => setHoveredKvkIdx(i)}
                        onMouseLeave={() => setHoveredKvkIdx(null)}
                      >
                        {u.kvks.length.toLocaleString()}
                        {hoveredKvkIdx === i && (
                          <span
                            style={{
                              position: "absolute",
                              bottom: "calc(100% + 8px)",
                              right: 0,
                              zIndex: 20,
                              minWidth: "180px",
                              maxWidth: "260px",
                              padding: "8px 10px",
                              borderRadius: "8px",
                              background: "#173326",
                              color: "#faf8f1",
                              fontSize: "12px",
                              fontWeight: 500,
                              lineHeight: 1.5,
                              textAlign: "left",
                              whiteSpace: "normal",
                              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                            }}
                          >
                            {u.kvks.join(", ")}
                          </span>
                        )}
                      </strong>
                    </li>
                  ))
                ) : (
                  <li>
                    <span>No KVKs covered yet</span>
                  </li>
                )}
              </ul>
            ) : (
              <ul className="expert-counts">
                {expertCounts.map(([label, count, color]) => (
                  <li key={label}>
                    <span>
                      <i style={{ background: color }} />
                      {label}
                    </span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="expert-map-card">
            <div className="night-map" style={{ padding: "8px", overflow: "visible" }}>
              <Suspense fallback={<div style={{ height: 540, borderRadius: 18, background: "#061710" }} />}>
                <ExpertNetworkMap publicUsers={publicUsers} mode={activeNetworkTab} />
              </Suspense>
              <div className="night-map-label" style={{ marginTop: "12px" }}>
                <span className="live-dot" />
                <span>
                  {`${(publicUsers?.filter((u) => u.role?.toLowerCase() !== "admin").length ?? 0).toLocaleString()} active experts registered`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Outreach Stories & Farmers' Friday Section */}
      <section className="outreach-section">
        <div className="page-shell">
          {/* Outreach Panel (Redesigned) */}
          <div className="outreach-dark-panel" id="outreach">
            <div className="outreach-dark-header">
              <div className="outreach-dark-badge-group">
                <span className="outreach-dark-tag">ON-GROUND CAMPAIGNS</span>
              </div>
              <div className="outreach-dark-step-indicator">
                <span className="outreach-step-text">
                  <strong className="outreach-step-current">
                    {String(Math.min(activeStoryIdx + 1, outreachStories.length)).padStart(2, "0")}
                  </strong>{" "}
                  / {String(outreachStories.length).padStart(2, "0")}
                </span>
                <div className="outreach-step-bars">
                  {outreachStories.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`outreach-step-bar ${idx === activeStoryIdx ? "active" : ""}`}
                      onClick={() => setActiveStoryIdx(idx)}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
                {outreachStories.length > 1 && (
                  <div className="outreach-header-nav" style={{ display: "flex", gap: "6px", marginLeft: "6px" }}>
                    <button
                      type="button"
                      className="farmers-friday-nav-btn"
                      style={{ position: "static", transform: "none", width: "32px", height: "32px" }}
                      aria-label="Previous story"
                      onClick={() =>
                        setActiveStoryIdx(
                          (prev) => (prev - 1 + outreachStories.length) % outreachStories.length
                        )
                      }
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      className="farmers-friday-nav-btn"
                      style={{ position: "static", transform: "none", width: "32px", height: "32px" }}
                      aria-label="Next story"
                      onClick={() =>
                        setActiveStoryIdx((prev) => (prev + 1) % outreachStories.length)
                      }
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <h2 className="outreach-dark-title">Outreach & Engagement</h2>

            <div className="outreach-dark-body">
              <div className="outreach-dark-info">
                <span className="outreach-dark-phase">
                  — {outreachStories[activeStoryIdx]?.place || "PHASE 1: LISTEN"}
                </span>
                <h3 className="outreach-dark-heading">
                  {outreachStories[activeStoryIdx]?.title}
                </h3>
                <p className="outreach-dark-desc">
                  {outreachStories[activeStoryIdx]?.body}
                </p>
                {outreachStories[activeStoryIdx]?.reach && (
                  <div className="outreach-dark-metrics">
                    <div>
                      <strong>{outreachStories[activeStoryIdx]?.reach}</strong>
                      <small>FARMERS REACHED</small>
                    </div>
                    {outreachStories[activeStoryIdx]?.outcome && (
                      <div>
                        <strong>{outreachStories[activeStoryIdx]?.outcome}</strong>
                        <small>ACTIONS COMPLETED</small>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="outreach-dark-media" style={{ position: "relative" }}>
                {(() => {
                  const story = outreachStories[activeStoryIdx];
                  const mediaUrl = story?.url || story?.videoUrl;
                  const embedUrl = getYouTubeEmbedUrl(mediaUrl);
                  if (embedUrl) {
                    return (
                      <iframe
                        src={embedUrl}
                        title={story?.title || "Outreach Video"}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    );
                  }
                  return (
                    <img
                      src={mediaUrl || "/assets/farmer-network.png"}
                      alt={story?.title || "Outreach Story"}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = "/assets/farmer-network.png";
                      }}
                    />
                  );
                })()}

                {outreachStories.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="farmers-friday-nav-btn prev"
                      aria-label="Previous story"
                      onClick={() =>
                        setActiveStoryIdx(
                          (prev) => (prev - 1 + outreachStories.length) % outreachStories.length
                        )
                      }
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      type="button"
                      className="farmers-friday-nav-btn next"
                      aria-label="Next story"
                      onClick={() =>
                        setActiveStoryIdx((prev) => (prev + 1) % outreachStories.length)
                      }
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Farmers' Friday Panel */}
          <div className="farmers-friday-panel" id="farmers-friday">
            <div className="farmers-friday-hero-grid">
              <div className="farmers-friday-info">
                <div className="farmers-friday-badge-group">
                  <span className="farmers-friday-tag">SUSTAINED ON-GROUND MODEL</span>
                </div>
                <h2 className="farmers-friday-title">Farmers' Friday</h2>
                <div className="farmers-friday-subtag">
                  RECURRING ENGAGEMENT (3 FRIDAYS / MONTH)
                </div>

                <div className="farmers-friday-objectives">
                  <span className="farmers-friday-obj-label">OBJECTIVES</span>
                  <p className="farmers-friday-obj-text">
                    Strengthening village-level outreach through recurring one-on-one interactions, demonstrating agricultural technologies in a farmer-friendly manner, facilitating cohort-based learning, capturing real-time feedback, and validating AI advisories across districts.
                  </p>
                </div>
              </div>

              <div className="farmers-friday-slider-wrap">
                <div className="farmers-friday-slider">
                  <span className="farmers-friday-slider-counter">
                    {activeFarmersFridayIdx + 1} / {farmersFridayStories.length}
                  </span>

                  {(() => {
                    const currentMedia = farmersFridayStories[activeFarmersFridayIdx];
                    const embedUrl = currentMedia?.isVideo ? getYouTubeEmbedUrl(currentMedia.url) : null;

                    if (embedUrl) {
                      return (
                        <iframe
                          src={embedUrl}
                          title={currentMedia?.title || "Farmers Friday Video"}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      );
                    }

                    return (
                      <img
                        src={currentMedia?.url || "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?q=80&w=1200&auto=format&fit=crop"}
                        alt={currentMedia?.title || "Farmers Friday"}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?q=80&w=1200&auto=format&fit=crop";
                        }}
                      />
                    );
                  })()}

                  <button
                    type="button"
                    className="farmers-friday-nav-btn prev"
                    aria-label="Previous photo"
                    onClick={() =>
                      setActiveFarmersFridayIdx(
                        (prev) => (prev - 1 + farmersFridayStories.length) % farmersFridayStories.length
                      )
                    }
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <button
                    type="button"
                    className="farmers-friday-nav-btn next"
                    aria-label="Next photo"
                    onClick={() =>
                      setActiveFarmersFridayIdx(
                        (prev) => (prev + 1) % farmersFridayStories.length
                      )
                    }
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                <div className="farmers-friday-dots">
                  {farmersFridayStories.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`farmers-friday-dot ${idx === activeFarmersFridayIdx ? "active" : ""}`}
                      onClick={() => setActiveFarmersFridayIdx(idx)}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Core Components */}
            <div className="farmers-friday-components">
              <span className="farmers-friday-comp-label">
                CORE COMPONENTS OF FARMERS' FRIDAY
              </span>

              <div className="farmers-friday-comp-grid">
                <div className="farmers-friday-comp-card">
                  <div className="farmers-friday-icon-box">
                    <span className="farmers-friday-icon">&gt;_</span>
                  </div>
                  <h3>Technology Spotlight</h3>
                  <p>
                    Focused demonstrations of developed agricultural tech, including voice-enabled AI advisors and decision-support systems relevant to day-to-day farming needs.
                  </p>
                </div>

                <div className="farmers-friday-comp-card">
                  <div className="farmers-friday-icon-box">
                    <BookOpen size={20} />
                  </div>
                  <h3>Practical Learning Modules</h3>
                  <p>
                    Interactive sessions designed to show farmers how to access digital tools and utilize data-driven insights to plan crops, reduce risks, and boost yields.
                  </p>
                </div>

                <div className="farmers-friday-comp-card">
                  <div className="farmers-friday-icon-box">
                    <Smartphone size={20} />
                  </div>
                  <h3>Digital Adoption in Farming</h3>
                  <p>
                    Simplifying onboarding pathways, overcoming accessibility barriers, and building digital literacy through guided support and localized dialects.
                  </p>
                </div>

                <div className="farmers-friday-comp-card">
                  <div className="farmers-friday-icon-box">
                    <Trophy size={20} />
                  </div>
                  <h3>Success Stories from the Field</h3>
                  <p>
                    Highlighting tangible benefits and case studies where farmers used data-driven advisories to mitigate pest damage or optimize inputs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="learning-section" id="learning">
        <div className="page-shell learning-grid">
          <article className="learning-card" style={{ gridColumn: "1 / -1" }}>
            <img src="/assets/learning-campus.png" alt="Agricultural science student studying field data" />
            <div className="learning-card-content">
              <span className="eyebrow">Learning ecosystem</span>
              <h3>Building the next generation of agri-professionals.</h3>
              <div className="learning-tiers" style={{ display: "flex", alignItems: "center", gap: "12px", margin: "20px 0", fontSize: "14px", fontWeight: "700", color: "#173326" }}>
                <span>Cornerstone</span>
                <span style={{ color: "#d4ac57", opacity: 0.7 }}>|</span>
                <span>Launchpad</span>
                <span style={{ color: "#d4ac57", opacity: 0.7 }}>|</span>
                <span>Pioneer</span>
              </div>
               <a
                className="explore-course-btn"
                href="https://vibe.vicharanashala.ai/student/course-registration/6a2be954ca990e71be4e3752"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: "fit-content",
                  minHeight: "42px",
                  padding: "0 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  border: "0",
                  borderRadius: "9px",
                  background: "var(--forest)",
                  color: "#fff",
                  fontSize: "9px",
                  fontWeight: "700",
                  cursor: "pointer",
                  gap: "16px",
                }}
              >
                Explore the Course <ArrowRight size={16} />
              </a>
            </div>
          </article>
        </div>
      </section>

      {/* 9. Future Innovations Ecosystem (3D Coverflow Slider & Innovations Card Below) */}
      <section className="future-section" id="future">
        <div className="page-shell">
          <div className="future-section-header">
            <span className="eyebrow">The Future is Growing</span>
            <h2>Innovations Showcase</h2>
          </div>

          {/* 3D Coverflow Image Slider */}
          <div className="coverflow-slider-container">
            <button
              type="button"
              className="coverflow-nav-prev"
              aria-label="Previous slide"
              onClick={() =>
                setActiveFutureSlideIdx(
                  (prev) => (prev - 1 + futureSlides.length) % futureSlides.length
                )
              }
            >
              <ChevronLeft size={28} />
            </button>

            <div className="coverflow-track">
              {futureSlides.map((slide, idx) => {
                const offset = idx - activeFutureSlideIdx;
                const absOffset = Math.abs(offset);

                let transform = "";
                let zIndex = 1;
                let opacity = 0;
                let filter = "none";

                if (offset === 0) {
                  transform = "translateX(0%) scale(1.15) translateZ(80px)";
                  zIndex = 10;
                  opacity = 1;
                  filter = "brightness(1.05) drop-shadow(0 25px 40px rgba(0,0,0,0.6))";
                } else if (offset === -1 || (activeFutureSlideIdx === 0 && idx === futureSlides.length - 1)) {
                  transform = "translateX(-68%) scale(0.86) rotateY(22deg) translateZ(-40px)";
                  zIndex = 5;
                  opacity = 0.72;
                  filter = "brightness(0.68) blur(0.5px)";
                } else if (offset === 1 || (activeFutureSlideIdx === futureSlides.length - 1 && idx === 0)) {
                  transform = "translateX(68%) scale(0.86) rotateY(-22deg) translateZ(-40px)";
                  zIndex = 5;
                  opacity = 0.72;
                  filter = "brightness(0.68) blur(0.5px)";
                } else if (offset === -2 || (activeFutureSlideIdx <= 1 && idx >= futureSlides.length - 2 + activeFutureSlideIdx)) {
                  transform = "translateX(-115%) scale(0.7) rotateY(36deg) translateZ(-100px)";
                  zIndex = 2;
                  opacity = 0.38;
                  filter = "brightness(0.4) blur(1.5px)";
                } else if (offset === 2 || (activeFutureSlideIdx >= futureSlides.length - 2 && idx <= 1)) {
                  transform = "translateX(115%) scale(0.7) rotateY(-36deg) translateZ(-100px)";
                  zIndex = 2;
                  opacity = 0.38;
                  filter = "brightness(0.4) blur(1.5px)";
                } else {
                  transform = `translateX(${offset > 0 ? 150 : -150}%) scale(0.5)`;
                  opacity = 0;
                  zIndex = 0;
                }

                const isActive = offset === 0;

                return (
                  <div
                    key={slide.id}
                    className={`coverflow-card ${isActive ? "active" : ""}`}
                    style={{
                      transform,
                      zIndex,
                      opacity,
                      filter,
                      pointerEvents: absOffset <= 2 ? "auto" : "none",
                    }}
                    onClick={() => setActiveFutureSlideIdx(idx)}
                  >
                    <img
                      src={slide.image}
                      alt={slide.title}
                      className="coverflow-card-img"
                    />
                    <div className="coverflow-card-overlay">
                      <span className="coverflow-card-tag">{slide.tag}</span>
                      <div className="coverflow-card-content">
                        <h3>{slide.title}</h3>
                        <p>{slide.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="coverflow-nav-next"
              aria-label="Next slide"
              onClick={() =>
                setActiveFutureSlideIdx((prev) => (prev + 1) % futureSlides.length)
              }
            >
              <ChevronRight size={28} />
            </button>
          </div>
        </div>
      </section>

      {/* 9. Site Footer */}
      <footer className="site-footer">
        <div className="footer-image" />
        <div className="page-shell footer-layout">
          <p>
            When intelligence grows, agriculture thrives.<br />
            When farmers thrive, India prospers.
          </p>

          <div className="institution">
            <span className="institution-seal">
              <Award size={26} />
            </span>
            <span>
              <small>A national mission by</small>
              <strong>IIT Ropar</strong>
            </span>
          </div>

          <div className="footer-brand">
            <div className="brand">
              <div className="brand-mark">
                <img src="/logo.png" alt="ANNAM.AI Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
              <span>
                <strong>ANNAM.AI</strong>
                <small>ACE</small>
              </span>
            </div>
            <span>Building India’s Agricultural Intelligence Infrastructure.</span>
          </div>

          <div className="footer-links">
            <a href="#overview">Overview</a>
            <a href="#engine">Knowledge engine</a>
            <a href="#india-map">Coverage</a>
            <a href="#outreach">Outreach</a>
          </div>
        </div>

        <div className="page-shell footer-bottom">
          <span>© 2026 ANNAM.AI ACE</span>
          <span>Map visuals use India-only boundary data; Survey of India remains the authoritative source.</span>
        </div>
      </footer>

      {/* Watch Story Modal with YouTube Video */}
      {isStoryModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsStoryModalOpen(false)}>
          <div
            className="story-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(960px, 94vw)",
              height: "min(540px, 80vh)",
              display: "flex",
              flexDirection: "column",
              borderRadius: "24px",
              overflow: "hidden",
              background: "#061923",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              boxShadow: "0 40px 140px rgba(0,0,0,0.6)",
            }}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setIsStoryModalOpen(false)}
              style={{ zIndex: 10, top: "12px", right: "12px" }}
            >
              <X size={20} />
            </button>
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              <iframe
                src="https://www.youtube.com/embed/kpnUke-KMEw?autoplay=1"
                title="ANNAM.AI ACE - The Story"
                style={{ width: "100%", height: "100%", border: "0" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeDashboard;
