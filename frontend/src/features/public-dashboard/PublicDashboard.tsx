import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import "./public-dashboard.css";
import { Counter } from "./components/Counter";
import { HeroCarousel } from "./components/HeroCarousel";
import { OutreachGallery } from "./components/OutreachGallery";
import { DomainDoughnut, GrowthLine } from "./components/charts";
import { useGetDashboardContent } from "@/hooks/api/dashboard/useDashboardContent";
import { defaultBlocks } from "./data/contentDefaults";
import { useCountUp } from "./utils";
import {
  channels,
  crops,
  heroStats,
  integrations,
  langCoverage,
  networkRoles,
  roadmap,
  states,
  techs,
  workflowSteps,
} from "./data/dashboardData";

const NAV = [
  { id: "about", label: "Overview" },
  { id: "layer1", label: "Snapshot" },
  { id: "layer2", label: "Coverage Map" },
  { id: "layer3", label: "Knowledge Engine" },
  { id: "layer4", label: "Expert Network" },
  { id: "layer5", label: "Integrations" },
  { id: "layer6", label: "Impact" },
];

/**
 * Public ACE dashboard (ANNAM.AI) — no login required. A national, multi-layer
 * transparency portal. Government register: dark ink on a light plane, restrained
 * forest-green identity, tricolour accents. Demo data only.
 */
export const PublicDashboard = () => {
  const navigate = useNavigate();
  const [activeState, setActiveState] = useState(0);
  const [activeNav, setActiveNav] = useState("layer1");

  // Lightweight scroll-spy for the six layer sections.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveNav(visible[0].target.id);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="ace-dash">
      <Header activeNav={activeNav} onLogin={() => navigate({ to: "/auth" })} />
      <HeroCarousel />
      <main>
        <NarrativeSection />
        <HeroSnapshot />
        <GeographicIntelligence active={activeState} setActive={setActiveState} />
        <KnowledgeEngine />
        <HumanNetwork />
        <Integrations />
        <ImpactOutreach />
        <OutreachGallery />
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

/* ------------------------------------------------------------------ Header */
const Header = ({ activeNav, onLogin }: { activeNav: string; onLogin: () => void }) => (
  <>
    <header className="top">
      <div className="top-bar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div className="brand-text">
            <div className="name">annam.ai</div>
            <div className="tag">ACE — National Public Dashboard</div>
          </div>
        </div>
        <nav className="nav-links">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className={activeNav === n.id ? "active" : ""}>
              {n.label}
            </a>
          ))}
        </nav>
      </div>
    </header>

    {/* Light utility bar — ticker / demo badge / login, right-aligned below the banner */}
    <div className="util-bar">
      <div className="util-inner">
        <div className="ticker">
          <span>
            <span className="status-dot" />
            Today <b><Counter value={9840} /></b>
          </span>
          <span>
            This month <b><Counter value={238600} /></b>
          </span>
        </div>
        <span className="demo-badge">Demo data</span>
        <button className="login-btn" onClick={onLogin}>
          Login
        </button>
      </div>
    </div>
  </>
);

/* ------------------------------------------------------------ Section head */
const SectionHead = ({ num, title }: { num: string; title: string }) => (
  <div className="sec-head">
    <span className="sec-num">{num}</span>
    <h2>{title}</h2>
  </div>
);

/* ------------------------------------------------------- Layer 1: Snapshot */
const HeroSnapshot = () => {
  const { value: cov, ref } = useCountUp(72.4);
  const [barW, setBarW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBarW(72.4), 100);
    return () => clearTimeout(t);
  }, []);
  return (
    <section className="hero wrap" id="layer1">
      <SectionHead num="LAYER 01" title="National Mission Snapshot" />
      <div className="hero-top">
        <div>
          <h1>
            India's Agricultural
            <br />
            Intelligence Infrastructure.
          </h1>
          <p className="lede">
            A real-time, public record of how ANNAM.AI is building validated agricultural
            knowledge, a distributed expert network, and AI-powered advisory reach across
            every state, district and village in India.
          </p>
        </div>
        <div className="coverage-score">
          <div className="num">
            <span ref={ref}>{cov.toFixed(1)}</span>%
          </div>
          <div className="label">National Knowledge Coverage</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${barW}%` }} />
          </div>
        </div>
      </div>
      <div className="stat-grid">
        {heroStats.map((s) => (
          <div className="stat-cell" key={s.label}>
            <div className="val">
              <Counter value={s.count} suffix={s.suffix} />
            </div>
            <div className="lab">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

/* ------------------------------------ Overview (admin-editable narrative) */
const NarrativeSection = () => {
  const { data } = useGetDashboardContent();
  // Fall back to the seed blocks until an admin has saved custom content.
  const blocks = data?.blocks?.length ? data.blocks : defaultBlocks;
  return (
    <section className="wrap" id="about">
      <SectionHead num="OVERVIEW" title="Understand ACE in 60 seconds" />
      <p className="sec-desc">
        What ACE is, why it matters, how large the mission is, and the impact so far.
      </p>
      <div className="narrative-grid">
        {blocks.map((b) => (
          <div className="narrative-block" key={b.id}>
            <h3>{b.heading}</h3>
            {b.body && <p>{b.body}</p>}
            {b.figures?.length > 0 && (
              <div className="narrative-figs">
                {b.figures.map((f, i) => (
                  <div className="nf" key={i}>
                    <div className="v">{f.value}</div>
                    <div className="l">{f.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

/* --------------------------------------------------- Layer 2: Geographic */
const GeographicIntelligence = ({
  active,
  setActive,
}: {
  active: number;
  setActive: (i: number) => void;
}) => {
  const s = states[active];
  const idxLabels = ["Knowledge Density", "Expert Density", "Outreach Density", "Data Availability"];
  const idxColors = ["var(--navy)", "var(--saffron)", "var(--green)", "var(--red-flag)"];
  return (
    <section className="wrap" id="layer2">
      <SectionHead num="LAYER 02" title="Geographic Intelligence" />
      <p className="sec-desc">
        Select a state to inspect its agro-climatic coverage — validated Q&amp;A volume,
        expert density, outreach reach and market integration. Density indices summarise
        where the knowledge base is strongest and where it is still thin.
      </p>
      <div className="geo-layout">
        <div className="state-list">
          {states.map((st, i) => (
            <div
              key={st.name}
              className={`state-item${i === active ? " active" : ""}`}
              onClick={() => setActive(i)}
            >
              <span>
                <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                {st.name}
              </span>
              <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>
                {st.crops} crops
              </span>
            </div>
          ))}
        </div>
        <div className="state-detail">
          <h3>{s.name}</h3>
          <div className="zone">
            {s.zone} · Dominant crops: {s.dominant} · Languages: {s.langs}
          </div>
          <div className="metric-mini-grid">
            <MM v={s.crops} l="Crops saturated" />
            <MM v={`${(s.qas / 1000).toFixed(0)}K`} l="Validated QAs" />
            <MM v={s.experts} l="Experts" />
            <MM v={s.districts} l="Districts covered" />
            <MM v={s.kvks} l="KVKs" />
            <MM v={s.saus} l="SAUs" />
            <MM v={s.villages.toLocaleString("en-IN")} l="Outreach villages" />
            <MM v={`${(s.queries / 1000).toFixed(0)}K`} l="Queries collected" />
            <MM v={s.markets} l="Market integrations" />
            <MM v={`${(s.farmers / 1000).toFixed(0)}K`} l="Farmers reached" />
          </div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            DENSITY INDICES
          </div>
          <div className="index-row">
            {s.idx.map((v, ix) => (
              <div className="index-item" key={ix}>
                <span>{idxLabels[ix]}</span>
                <span className="idx-track">
                  <span className="idx-fill" style={{ width: `${v}%`, background: idxColors[ix] }} />
                </span>
                <span className="mono">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const MM = ({ v, l }: { v: string | number; l: string }) => (
  <div className="mm-cell">
    <div className="v">{v}</div>
    <div className="l">{l}</div>
  </div>
);

/* ------------------------------------------------ Layer 3: Knowledge Engine */
const KnowledgeEngine = () => {
  const [kccW, setKccW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setKccW((41.2 / 45) * 100), 120);
    return () => clearTimeout(t);
  }, []);
  const maturity = [...states].sort((a, b) => b.crops - a.crops).slice(0, 5);
  return (
    <section className="wrap" id="layer3">
      <SectionHead num="LAYER 03" title="Agricultural Knowledge Engine" />
      <p className="sec-desc">
        Crop-wise and state-wise saturation of the golden knowledge base, sourced from
        Kisan Call Centre (KCC) transcripts and expert-validated Q&amp;A pairs.
      </p>
      <div className="kcc-grid">
        <div className="chart-box">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            KCC DATASET ANALYSIS
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 28, fontWeight: 700, color: "var(--navy-deep)" }}>
              <Counter value={41.2} suffix="M" />
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>of 45M record target</span>
          </div>
          <div className="bar-track" style={{ width: "100%" }}>
            <div className="bar-fill" style={{ width: `${kccW}%`, background: "var(--saffron)" }} />
          </div>
          <div className="metric-mini-grid" style={{ marginTop: 22 }}>
            <MMCount value={41.2} suffix="M" l="KCC records analysed" />
            <MMCount value={18.6} suffix="M" l="Unique questions generated" />
            <MMCount value={6.3} suffix="M" l="Rephrased questions" />
            <MMCount value={4.1} suffix="M" l="Expert-validated answers" />
          </div>
        </div>
        <div className="chart-box">
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            STATE MATURITY (TOP 5)
          </div>
          {maturity.map((st) => {
            const pct = Math.round((st.crops / 32) * 100);
            return (
              <div
                key={st.name}
                style={{ display: "grid", gridTemplateColumns: "110px 1fr 34px", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 12.5 }}
              >
                <span>{st.name}</span>
                <span className="idx-track">
                  <span className="idx-fill" style={{ width: `${pct}%`, background: "var(--green)" }} />
                </span>
                <span className="mono">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        SATURATED CROPS
      </div>
      <div className="card-grid grid-4">
        {crops.map((c) => (
          <div className="card" key={c.name}>
            <h4>{c.name}</h4>
            <div className="meta">
              {c.qa.toLocaleString("en-IN")} validated QAs · {c.maturity} maturity
            </div>
            <div className="crop-bar-track">
              <div className="crop-bar-fill" style={{ width: `${c.pct}%` }} />
            </div>
            <div className="meta mono" style={{ marginTop: 6 }}>
              {c.pct}% saturated
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const MMCount = ({ value, suffix, l }: { value: number; suffix?: string; l: string }) => (
  <div className="mm-cell">
    <div className="v">
      <Counter value={value} suffix={suffix} />
    </div>
    <div className="l">{l}</div>
  </div>
);

/* -------------------------------------------------- Layer 4: Human Network */
const HumanNetwork = () => (
  <section className="wrap" id="layer4">
    <SectionHead num="LAYER 04" title="Human Intelligence Network" />
    <p className="sec-desc">
      ANNAM.AI's knowledge base is validated by a distributed network of Post-graduate
      Agri Experts (PAEs), reviewers, moderators, authors, gatekeepers and auditors,
      anchored by KVKs and State Agricultural Universities.
    </p>
    <div className="stat-grid" style={{ marginBottom: 28 }}>
      {networkRoles.map((r) => (
        <div className="stat-cell" key={r.label}>
          <div className="val">
            <Counter value={r.count} />
          </div>
          <div className="lab">{r.label}</div>
        </div>
      ))}
    </div>
    <div className="two-col">
      <div className="chart-box">
        <h4 style={{ fontSize: 16, marginBottom: 14 }}>KVK Mapping</h4>
        <div className="metric-mini-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <MMCount value={731} l="KVKs mapped" />
          <MMCount value={4.8} suffix="M" l="Farmers serviced" />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 16, lineHeight: 1.6 }}>
          Each KVK carries a defined coverage responsibility — assigned human resources,
          block-level jurisdiction, and a live farmer-servicing count — forming the ground
          layer of the distributed intelligence network.
        </p>
      </div>
      <div className="chart-box">
        <h4 style={{ fontSize: 16, marginBottom: 14 }}>SAU Collaboration Network</h4>
        <div className="metric-mini-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <MMCount value={63} l="SAUs onboarded" />
          <MMCount value={29} l="States contributing" />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 16, lineHeight: 1.6 }}>
          State Agricultural Universities contribute domain experts and validate
          region-specific advisory content, anchoring coverage in local agro-climatic reality.
        </p>
      </div>
    </div>
  </section>
);

/* --------------------------------------------------- Layer 5: Integrations */
const Integrations = () => (
  <section className="wrap" id="layer5">
    <SectionHead num="LAYER 05" title="Live Intelligence Integrations" />
    <p className="sec-desc">
      Dynamic data sources feeding real-time advisory into the ecosystem, each with a
      declared refresh cadence and operational status.
    </p>
    <div className="card-grid grid-3">
      {integrations.map((it) => (
        <div className="card" key={it.name}>
          <h4>{it.name}</h4>
          <div className="meta">Source: {it.src}</div>
          <div className="meta">Refresh: {it.freq}</div>
          <div className="meta">Coverage: {it.geo}</div>
          <span className={`pill ${it.status === "live" ? "live" : "soon"}`}>
            {it.status === "live" ? "Operational" : "Coming soon"}
          </span>
        </div>
      ))}
    </div>
  </section>
);

/* ------------------------------------------------ Layer 6: Impact & Outreach */
const ImpactOutreach = () => (
  <section className="wrap" id="layer6">
    <SectionHead num="LAYER 06" title="Impact & Outreach" />
    <p className="sec-desc">
      Ground activity from the Punjab outreach programme, weekly Farmer Friday artefacts,
      and the domain distribution of every question collected.
    </p>
    <div className="two-col" style={{ marginBottom: 28 }}>
      <div className="chart-box">
        <h4 style={{ fontSize: 16, marginBottom: 6 }}>Punjab Outreach</h4>
        <div className="metric-mini-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
          <MMCount value={214} l="Villages visited" />
          <MMCount value={58600} l="Farmers reached" />
          <MMCount value={112000} l="Queries collected" />
          <MMCount value={340} l="Demonstrations conducted" />
        </div>
      </div>
      <div className="chart-box">
        <h4 style={{ fontSize: 16, marginBottom: 14 }}>Farmer Friday</h4>
        <div className="metric-mini-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <MMCount value={46} l="Weekly artefacts published" />
          <MMCount value={128} l="Success stories" />
          <MMCount value={89} l="Field videos" />
          <MMCount value={312} l="Farmer interactions" />
        </div>
      </div>
    </div>
    <div className="chart-box">
      <h4 style={{ fontSize: 16, marginBottom: 10 }}>Domains of Questions</h4>
      <DomainDoughnut />
    </div>
  </section>
);

/* ------------------------------------------------------- Simple card grids */
const TechShowcase = () => (
  <section className="wrap" id="tech">
    <SectionHead num="SYSTEM" title="Technology Showcase" />
    <p className="sec-desc">
      The AI stack underneath the advisory layer — every capability currently deployed in
      production.
    </p>
    <div className="card-grid grid-4">
      {techs.map((t) => (
        <div className="card" key={t.name}>
          <h4 style={{ fontSize: 14.5 }}>{t.name}</h4>
          <div className="meta">{t.note}</div>
        </div>
      ))}
    </div>
  </section>
);

const Roadmap = () => (
  <section className="wrap" id="roadmap">
    <SectionHead num="ROADMAP" title="Coming Soon" />
    <p className="sec-desc">
      Modules currently in development, scheduled for phased public rollout.
    </p>
    <div className="card-grid grid-4">
      {roadmap.map((r) => (
        <div className="card" key={r.name}>
          <h4 style={{ fontSize: 14.5 }}>{r.name}</h4>
          <div className="meta">{r.note}</div>
          <span className="pill soon">Coming soon</span>
        </div>
      ))}
    </div>
  </section>
);

const Multilingual = () => (
  <section className="wrap" id="lang">
    <SectionHead num="REACH" title="Multilingual Capability" />
    <p className="sec-desc">Coverage across text, audio and regional dialect, mapped by state.</p>
    <div className="stat-grid" style={{ marginBottom: 24 }}>
      <div className="stat-cell"><div className="val"><Counter value={22} /></div><div className="lab">Text languages supported</div></div>
      <div className="stat-cell"><div className="val"><Counter value={16} /></div><div className="lab">Audio languages supported</div></div>
      <div className="stat-cell"><div className="val"><Counter value={47} /></div><div className="lab">Dialects supported</div></div>
    </div>
    <div className="chart-box">
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        STATE-WISE LANGUAGE COVERAGE
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
        {langCoverage.map((l) => (
          <div key={l.name} style={{ border: "1px solid var(--line)", padding: "10px 12px", background: "var(--paper)", borderRadius: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{l.name}</div>
            <div className="meta mono" style={{ marginTop: 4 }}>
              Text {l.text} · Audio {l.audio}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Channels = () => (
  <section className="wrap" id="channels">
    <SectionHead num="ACCESS" title="Communication Channels" />
    <p className="sec-desc">Where farmers reach ANNAM.AI, and how much each channel carries.</p>
    <div className="card-grid grid-4">
      {channels.map((c) => (
        <div className="card" key={c.name}>
          <h4 style={{ fontSize: 14.5 }}>{c.name}</h4>
          <div className="meta">{c.note}</div>
          <div className="meta mono" style={{ marginTop: 8 }}>
            {c.usage}
          </div>
          <span className="pill live">Active</span>
        </div>
      ))}
    </div>
  </section>
);

const Learning = () => (
  <section className="wrap" id="learning">
    <SectionHead num="CAPACITY" title="Learning Ecosystem" />
    <p className="sec-desc">The Agri AI Course and the institutions building on it.</p>
    <div className="stat-grid">
      <div className="stat-cell"><div className="val"><Counter value={1} /></div><div className="lab">Agri AI Course live</div></div>
      <div className="stat-cell"><div className="val"><Counter value={24600} /></div><div className="lab">Learners enrolled</div></div>
      <div className="stat-cell"><div className="val"><Counter value={6800} /></div><div className="lab">Certificates issued</div></div>
      <div className="stat-cell"><div className="val"><Counter value={118} /></div><div className="lab">Institutions onboarded</div></div>
    </div>
  </section>
);

const ReviewWorkflow = () => (
  <section className="wrap" id="workflow">
    <SectionHead num="PROCESS" title="Review Workflow" />
    <p className="sec-desc">
      Every question submitted to ANNAM.AI passes through this validation chain before it
      enters the golden database.
    </p>
    <div className="workflow">
      {workflowSteps.map((w, i) => (
        <div className="wf-step" key={w}>
          <div className="n">{String(i + 1).padStart(2, "0")}</div>
          <div className="t">{w}</div>
          {i < workflowSteps.length - 1 && <span className="wf-arrow">→</span>}
        </div>
      ))}
    </div>
  </section>
);

/* ------------------------------------------------------------ Crop Matrix */
const CropMatrix = () => {
  const matrixStates = states.slice(0, 8).map((s) => s.name);
  const matrixCrops = crops.map((c) => c.name);
  // Compute saturation once so it stays stable across re-renders.
  const cells = useMemo(
    () => matrixStates.map(() => matrixCrops.map(() => Math.round(40 + Math.random() * 58))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <section className="wrap" id="matrix">
      <SectionHead num="COVERAGE" title="National Crop Coverage Matrix" />
      <p className="sec-desc">
        Saturation maturity by state and crop — darker fill indicates a more complete
        validated knowledge base.
      </p>
      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th>State</th>
              {matrixCrops.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixStates.map((sName, r) => (
              <tr key={sName}>
                <td>{sName}</td>
                {matrixCrops.map((c, ci) => {
                  const v = cells[r][ci];
                  const alpha = (v / 100) * 0.85 + 0.1;
                  return (
                    <td key={c} style={{ background: `rgba(31,110,69,${alpha.toFixed(2)})`, color: v > 60 ? "#fff" : "#1a1a1a" }}>
                      {v}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

/* --------------------------------------------------------- Growth Timeline */
const GrowthTimeline = () => (
  <section className="wrap" id="timeline">
    <SectionHead num="TRAJECTORY" title="Knowledge Growth Timeline" />
    <p className="sec-desc">
      Cumulative growth of questions, experts, states and integrations since programme
      inception.
    </p>
    <div className="chart-box">
      <GrowthLine />
    </div>
  </section>
);

/* ---------------------------------------------------------------- Footer */
const Footer = () => (
  <footer>
    <div className="wrap">
      <div className="col">
        <h5>ANNAM.AI · ACE</h5>
        <p>Agricultural Cognitive Ecosystem</p>
        <p>IIT Ropar</p>
      </div>
      <div className="col">
        <h5>About this dashboard</h5>
        <p style={{ maxWidth: 340 }}>
          A public, no-login transparency portal. Figures shown here are illustrative
          placeholders for design review and are not live production data.
        </p>
      </div>
      <div className="col">
        <h5>Mission</h5>
        <p>Digital Public Infrastructure for Indian Agriculture</p>
      </div>
    </div>
    <div className="wrap">
      <div className="flag-bar" style={{ marginTop: 34 }}>
        <div style={{ background: "var(--saffron)" }} />
        <div style={{ background: "#edede6" }} />
        <div style={{ background: "var(--green)" }} />
      </div>
    </div>
  </footer>
);
