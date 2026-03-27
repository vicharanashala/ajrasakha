import { useState, useRef, useEffect, useCallback } from "react";

// ─── MOCK DATA (replace with your real data structure) ───────────────────────
const DASHBOARD_DATA = {
  meta: { season: "Kharif 2025", lastSync: "2 min ago", datasetVersion: "GD-2025-Q3.14", llmVersion: "v2.4.1", p0Bugs: 3 },
  kpiRow1: [
    { id: "dau", label: "Active farmers (DAU)", value: "4.82 L", delta: "+18% vs last month", deltaDir: "up", accentColor: "#3AAA5A", sparkPoints: [22,20,22,18,19,15,13,14,10,11,8,7,5] },
    { id: "queries", label: "Daily queries", value: "1.24 L", delta: "+31% week-on-week", deltaDir: "up", accentColor: "#378ADD", sparkPoints: [24,22,20,22,18,20,16,18,14,12,10,8,6] },
    { id: "session", label: "Avg session duration", value: "6.4 min", delta: "Stable this week", deltaDir: "neutral", accentColor: "#EF9F27", sparkPoints: [14,12,15,13,12,14,13,14,12,13,14,12,13] },
    { id: "bugs", label: "Critical bugs open", value: "7", delta: "Needs immediate action", deltaDir: "down", accentColor: "#E24B4A", badges: [{ label: "3 P0", variant: "red" }, { label: "4 P1", variant: "amber" }] },
  ],
  kpiRow2: [
    { id: "csat", label: "CSAT rating", value: "4.2 ★", delta: "+0.3 pts this month", deltaDir: "up", accentColor: "#1D9E75" },
    { id: "repeatQuery", label: "Repeat query rate", value: "28%", delta: "Target: <10% · gap", deltaDir: "down", accentColor: "#EF9F27", valueColor: "#854F0B" },
    { id: "voice", label: "Voice usage share", value: "61%", delta: "Primary mode", deltaDir: "up", accentColor: "#378ADD" },
    { id: "states", label: "States active", value: "19 / 28", delta: "3 new states added", deltaDir: "up", accentColor: "#7C6FD4" },
  ],
  channelSplit: [
    { label: "Voice", pct: 61, color: "#3AAA5A" },
    { label: "Text app", pct: 24, color: "#378ADD" },
    { label: "KCC agent", pct: 9, color: "#EF9F27" },
    { label: "IVRS call", pct: 6, color: "#7C6FD4" },
  ],
  voiceAccuracy: [
    { lang: "Hindi", pct: 84, color: "#3AAA5A" },
    { lang: "Telugu", pct: 79, color: "#3AAA5A" },
    { lang: "Marathi", pct: 72, color: "#EF9F27" },
    { lang: "Bhojpuri", pct: 51, color: "#E24B4A" },
  ],
  queryCategories: [
    { label: "Pest & disease", pct: 34, color: "#E24B4A", valueColor: "#A32D2D" },
    { label: "Fertilizer dosage", pct: 28, color: "#EF9F27", valueColor: "#633806" },
    { label: "Irrigation timing", pct: 18, color: "#378ADD" },
    { label: "Crop selection", pct: 12, color: "#3AAA5A" },
    { label: "Govt. schemes", pct: 8, color: "#7C6FD4" },
  ],
  farmerSegments: [
    { id: "power", label: "Power farmers", users: "82,400", status: "Active", statusVariant: "green", description: "High-frequency users querying 5+ times/week. Core advocates.", dau: 82400, retention: 91, queryRate: 8.2, topCrop: "Paddy" },
    { id: "casual", label: "Casual seekers", users: "2.14 L", status: "Core", statusVariant: "blue", description: "Majority segment. 2–4 queries/week. Good retention.", dau: 214000, retention: 74, queryRate: 3.1, topCrop: "Cotton" },
    { id: "repeat", label: "Repeat askers", users: "54,300", status: "Gap", statusVariant: "amber", description: "Same query repeated — answers not resonating. UX gap.", dau: 54300, retention: 48, queryRate: 4.8, topCrop: "Maize" },
    { id: "silent", label: "Silent lurkers", users: "98,700", status: "Re-engage", statusVariant: "red", description: "Opened app but rarely ask. Need push nudges.", dau: 98700, retention: 22, queryRate: 0.4, topCrop: "Wheat" },
    { id: "churned", label: "Churned users", users: "31,200", status: "Win-back", statusVariant: "red", description: "No activity 30+ days. Requires win-back campaign.", dau: 31200, retention: 0, queryRate: 0, topCrop: "—" },
    { id: "institutional", label: "Institutional", users: "1,600", status: "B2G", statusVariant: "blue", description: "Government & extension officers. B2G relationship.", dau: 1600, retention: 88, queryRate: 12.4, topCrop: "All" },
  ],
  alerts: [
    { id: 1, level: "critical", title: "LLM dosage hallucination · ACE-079", desc: "Wrong pesticide dosage for paddy BLB · 612 farmers affected" },
    { id: 2, level: "critical", title: "Voice crash Android 10 (2G)", desc: "18,000 users in UP, MP · 34% crash rate per session" },
    { id: 3, level: "warn", title: "Dataset staleness · 9 days", desc: "Crop calendar showing last year's sowing dates for 6 crops" },
    { id: 4, level: "info", title: "Push notification delivery at 38%", desc: "Firebase token refresh failure · seasonal alerts missed" },
  ],
  geoStates: [
    { abbr: "UP", val: "1.2L", opacity: 0.9 }, { abbr: "MH", val: "94k", opacity: 0.8 }, { abbr: "MP", val: "86k", opacity: 0.75 },
    { abbr: "AP", val: "74k", opacity: 0.65 }, { abbr: "TN", val: "62k", opacity: 0.55 }, { abbr: "RJ", val: "58k", opacity: 0.48 },
    { abbr: "HR", val: "52k", opacity: 0.42 }, { abbr: "KA", val: "48k", opacity: 0.38 }, { abbr: "WB", val: "44k", opacity: 0.32 },
    { abbr: "GJ", val: "42k", opacity: 0.28 }, { abbr: "PB", val: "36k", opacity: 0.22 }, { abbr: "BR", val: "31k", opacity: 0.15 },
  ],
  healthPillars: [
    { label: "Advisory accuracy", score: 82, color: "#3AAA5A" },
    { label: "App stability", score: 74, color: "#3AAA5A" },
    { label: "User retention", score: 61, color: "#EF9F27" },
    { label: "Geo reach", score: 58, color: "#EF9F27" },
    { label: "Content coverage", score: 66, color: "#EF9F27" },
    { label: "UX satisfaction", score: 68, color: "#EF9F27" },
  ],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const badgeStyles = {
  green:  { background: "#EAF3DE", color: "#3B6D11" },
  red:    { background: "#FCEBEB", color: "#A32D2D" },
  amber:  { background: "#FAEEDA", color: "#633806" },
  blue:   { background: "#E6F1FB", color: "#0C447C" },
};

function Badge({ label, variant = "green" }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 7px", borderRadius:20, fontSize:10, fontWeight:500, ...badgeStyles[variant] }}>
      {label}
    </span>
  );
}

function ProgressBar({ label, pct, color, valueColor, value }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#888", marginBottom:4 }}>
        <span>{label}</span>
        <span style={{ color: valueColor || "#888", fontWeight: valueColor ? 500 : 400 }}>{value || `${pct}%`}</span>
      </div>
      <div style={{ height:5, background:"#f0f0f0", borderRadius:4, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:4, transition:"width 0.6s ease" }} />
      </div>
    </div>
  );
}

function Sparkline({ points, color }) {
  const max = Math.max(...points), min = Math.min(...points);
  const W = 120, H = 28;
  const px = (i) => (i / (points.length - 1)) * W;
  const py = (v) => H - ((v - min) / (max - min || 1)) * H;
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(v)}`).join(" ");
  const fill = d + ` L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:52 }} preserveAspectRatio="none">
      <path d={fill} fill={color} fillOpacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeltaIcon({ dir }) {
  if (dir === "up") return <svg width={10} height={10} viewBox="0 0 10 10"><path d="M5 2l3 4H2z" fill="#1E7A3C" /></svg>;
  if (dir === "down") return <svg width={10} height={10} viewBox="0 0 10 10"><path d="M5 8l3-4H2z" fill="#A32D2D" /></svg>;
  return <span style={{ fontSize:10 }}>→</span>;
}

function KpiCard({ kpi }) {
  const deltaColor = kpi.deltaDir === "up" ? "#1E7A3C" : kpi.deltaDir === "down" ? "#A32D2D" : "#888";
  return (
    <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:12, padding:"14px 16px", position:"relative", overflow:"hidden", flex:1, minWidth:0 }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:kpi.accentColor, borderRadius:"12px 12px 0 0" }} />
      <div style={{ fontSize:11, color:"#888", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px", fontWeight:500 }}>{kpi.label}</div>
      <div style={{ fontSize:22, fontWeight:500, color: kpi.valueColor || "#1a1a1a", lineHeight:1 }}>{kpi.value}</div>
      <div style={{ fontSize:11, marginTop:5, display:"flex", alignItems:"center", gap:3, color:deltaColor }}>
        <DeltaIcon dir={kpi.deltaDir} /> {kpi.delta}
      </div>
      {kpi.sparkPoints && <div style={{ marginTop:10 }}><Sparkline points={kpi.sparkPoints} color={kpi.accentColor} /></div>}
      {kpi.badges && <div style={{ marginTop:8, display:"flex", gap:4 }}>{kpi.badges.map(b => <Badge key={b.label} label={b.label} variant={b.variant} />)}</div>}
    </div>
  );
}

function Card({ title, subtitle, action, children }) {
  return (
    <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:12, padding:16, display:"flex", flexDirection:"column" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:500, color:"#1a1a1a" }}>{title}</div>
          {subtitle && <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{subtitle}</div>}
        </div>
        {action && <span style={{ fontSize:11, color:"#3AAA5A", cursor:"pointer", whiteSpace:"nowrap" }}>{action}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── SEGMENT ROW with highlight ───────────────────────────────────────────────
function SegmentRow({ seg, isHighlighted, onClick }) {
  return (
    <tr
      onClick={onClick}
      style={{
        cursor: "pointer",
        background: isHighlighted ? "#EAF6EC" : "transparent",
        outline: isHighlighted ? "2px solid #3AAA5A" : "none",
        outlineOffset: -1,
        transition: "background 0.25s, outline 0.25s",
      }}
    >
      <td style={{ padding:"9px 10px", fontSize:12, color:"#1a1a1a", borderBottom:"0.5px solid #f0f0f0", fontWeight: isHighlighted ? 500 : 400 }}>
        {isHighlighted && <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:"#3AAA5A", marginRight:6, verticalAlign:"middle" }} />}
        {seg.label}
      </td>
      <td style={{ padding:"9px 10px", fontSize:12, color:"#1a1a1a", borderBottom:"0.5px solid #f0f0f0" }}>{seg.users}</td>
      <td style={{ padding:"9px 10px", borderBottom:"0.5px solid #f0f0f0" }}><Badge label={seg.status} variant={seg.statusVariant} /></td>
    </tr>
  );
}

// ─── SEGMENT DETAIL CARD (shown when segment is active) ──────────────────────
function SegmentDetailBanner({ seg, onClose }) {
  return (
    <div style={{
      background: "#EAF6EC", border: "1.5px solid #3AAA5A", borderRadius: 12, padding: "14px 16px",
      marginBottom: 16, display: "flex", gap: 24, alignItems: "flex-start",
      animation: "slideIn 0.25s ease",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#1E7A3C" }}>{seg.label}</span>
          <Badge label={seg.status} variant={seg.statusVariant} />
        </div>
        <div style={{ fontSize: 11, color: "#3B6D11", marginBottom: 10 }}>{seg.description}</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 10, color: "#3B6D11", textTransform: "uppercase", letterSpacing: "0.4px" }}>Users</div><div style={{ fontSize: 16, fontWeight: 500, color: "#1E7A3C" }}>{seg.users}</div></div>
          <div><div style={{ fontSize: 10, color: "#3B6D11", textTransform: "uppercase", letterSpacing: "0.4px" }}>Retention</div><div style={{ fontSize: 16, fontWeight: 500, color: "#1E7A3C" }}>{seg.retention}%</div></div>
          <div><div style={{ fontSize: 10, color: "#3B6D11", textTransform: "uppercase", letterSpacing: "0.4px" }}>Queries/day</div><div style={{ fontSize: 16, fontWeight: 500, color: "#1E7A3C" }}>{seg.queryRate}</div></div>
          <div><div style={{ fontSize: 10, color: "#3B6D11", textTransform: "uppercase", letterSpacing: "0.4px" }}>Top crop</div><div style={{ fontSize: 16, fontWeight: 500, color: "#1E7A3C" }}>{seg.topCrop}</div></div>
        </div>
      </div>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#3AAA5A", fontSize: 18, lineHeight: 1, padding: "0 4px", fontWeight: 300 }}>×</button>
    </div>
  );
}

// ─── NAV ITEM ─────────────────────────────────────────────────────────────────
function NavItem({ label, icon, badge, badgeVariant = "red", active, onClick, isSegment, isActiveSegment }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 9, padding: "8px 16px", cursor: "pointer",
        fontSize: 13, borderLeft: `2px solid ${active || isActiveSegment ? "#3AAA5A" : "transparent"}`,
        background: active ? "#EAF6EC" : isActiveSegment ? "#f0faf2" : "transparent",
        color: active || isActiveSegment ? "#1E7A3C" : "#666",
        fontWeight: active || isActiveSegment ? 500 : 400,
        transition: "all 0.15s",
        paddingLeft: isSegment ? 32 : 16,
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{ fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 10, ...(badgeVariant === "amber" ? { background: "#BA7517", color: "#fff" } : { background: "#E24B4A", color: "#fff" }) }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export  function AnnamDashboard() {
  const [activeSegment, setActiveSegment] = useState(null);
  const [sidebarSegmentsOpen, setSidebarSegmentsOpen] = useState(false);
  const segmentsRef = useRef(null);
  const segmentRowRefs = useRef({});
  const data = DASHBOARD_DATA;

  const handleSegmentClick = useCallback((seg) => {
    if (activeSegment?.id === seg.id) {
      setActiveSegment(null);
      return;
    }
    setActiveSegment(seg);
    setSidebarSegmentsOpen(true);

    // Scroll to segments card first, then highlight row
    setTimeout(() => {
      segmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, [activeSegment]);

  // When clicking from sidebar, also scroll to row
  const handleSidebarSegmentClick = useCallback((seg) => {
    handleSegmentClick(seg);
    setTimeout(() => {
      segmentRowRefs.current[seg.id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 350);
  }, [handleSegmentClick]);

  const clearSegment = () => setActiveSegment(null);

  return (
    <div style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", background: "#f5f5f3", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .segment-card-highlight { box-shadow: 0 0 0 2.5px #3AAA5A, 0 4px 24px rgba(58,170,90,0.18) !important; }
        @keyframes slideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 2.5px #3AAA5A,0 4px 24px rgba(58,170,90,0.18)} 50%{box-shadow:0 0 0 4px #3AAA5A,0 4px 32px rgba(58,170,90,0.28)} }
        .seg-pulse { animation: pulse 1.2s ease 2; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }
      `}</style>

      {/* TOP NAV */}
      <div style={{ background: "#0F4A24", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 52, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ background: "#3AAA5A", color: "#fff", fontSize: 13, fontWeight: 500, padding: "4px 10px", borderRadius: 6 }}>ACE</span>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 500 }}>ANNAM.AI · Agri Intelligence Platform</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(74,220,100,0.15)", color: "#4adc64", fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 20 }}>
            <span style={{ width: 5, height: 5, background: "#4adc64", borderRadius: "50%" }} />Live
          </span>
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>Kharif 2025 · Q3</span>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1E7A3C", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 500 }}>PK</div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* SIDEBAR */}
        <div style={{ width: 210, background: "#fff", borderRight: "0.5px solid #e5e5e5", flexShrink: 0, overflowY: "auto", padding: "16px 0", position: "relative", paddingBottom: 80 }}>
          <div style={{ padding: "0 16px 12px", borderBottom: "0.5px solid #e5e5e5" }}>
            <div style={{ fontSize: 11, color: "#aaa" }}>Season filter</div>
            <select style={{ width: "100%", marginTop: 4, fontSize: 12, padding: "5px 8px", border: "0.5px solid #ddd", borderRadius: 6, background: "#fafafa", color: "#333" }}>
              <option>Kharif 2025</option><option>Rabi 2024</option><option>All seasons</option>
            </select>
          </div>

          <SidebarLabel>Core views</SidebarLabel>
          <NavItem label="Overview" active icon={<GridIcon />} />
          <div>
            <NavItem
              label="Farmer segments"
              icon={<UserIcon />}
              onClick={() => { setSidebarSegmentsOpen(o => !o); if (!sidebarSegmentsOpen) { segmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); } }}
            />
            {sidebarSegmentsOpen && (
              <div>
                {data.farmerSegments.map(seg => (
                  <NavItem
                    key={seg.id} label={seg.label} isSegment
                    isActiveSegment={activeSegment?.id === seg.id}
                    onClick={() => handleSidebarSegmentClick(seg)}
                  />
                ))}
              </div>
            )}
          </div>
          <NavItem label="Usage patterns" icon={<ChartLineIcon />} />
          <NavItem label="Geo intelligence" icon={<GlobeIcon />} />

          <SidebarLabel>Quality</SidebarLabel>
          <NavItem label="Feedback & sentiment" icon={<StarIcon />} />
          <NavItem label="Bugs & UX issues" icon={<BugIcon />} badge="7" />

          <SidebarLabel>Intelligence</SidebarLabel>
          <NavItem label="Query analysis" icon={<ListIcon />} badge="28%" badgeVariant="amber" />
          <NavItem label="App health score" icon={<SunIcon />} />

          <div style={{ position: "absolute", bottom: 0, left: 0, width: 210, padding: "12px 16px", borderTop: "0.5px solid #e5e5e5", background: "#fff" }}>
            <div style={{ fontSize: 11, color: "#aaa" }}>Health score</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <div style={{ flex: 1, height: 4, background: "#f0f0f0", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: "70%", height: "100%", background: "#3AAA5A", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#1E7A3C" }}>70</span>
            </div>
            <div style={{ fontSize: 10, color: "#BA7517", marginTop: 2 }}>Moderate · needs improvement</div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

          {/* Page header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 500, color: "#1a1a1a" }}>National overview</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Real-time platform health · Updated every 15 min · Kharif 2025</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ fontSize: 12, padding: "6px 12px", border: "0.5px solid #ddd", borderRadius: 6, background: "#fff", color: "#666", cursor: "pointer" }}>Export PDF</button>
              <button style={{ fontSize: 12, padding: "6px 12px", border: "0.5px solid #3AAA5A", borderRadius: 6, background: "#EAF6EC", color: "#1E7A3C", cursor: "pointer" }}>Share report</button>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {["All states", "Uttar Pradesh", "Maharashtra", "Madhya Pradesh"].map((f, i) => (
              <FilterChip key={f} label={f} active={i === 0} />
            ))}
            <div style={{ width: 1, height: 20, background: "#e5e5e5" }} />
            {["All crops", "Paddy", "Cotton", "Maize"].map((f, i) => (
              <FilterChip key={f} label={f} active={i === 0} />
            ))}
            <div style={{ width: 1, height: 20, background: "#e5e5e5" }} />
            <FilterChip label="Last 30 days" icon />
          </div>

          {/* Active segment banner */}
          {activeSegment && <SegmentDetailBanner seg={activeSegment} onClose={clearSegment} />}

          {/* KPI Row 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 10 }}>
            {data.kpiRow1.map(k => <KpiCard key={k.id} kpi={k} />)}
          </div>

          {/* KPI Row 2 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
            {data.kpiRow2.map(k => <KpiCard key={k.id} kpi={k} />)}
          </div>

          {/* Chart row: DAU trend + Channel split */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 16 }}>
            <DauTrendChart />
            <Card title="Channel split" subtitle="How farmers access ACE">
              <DonutChart segments={data.channelSplit} />
              <div style={{ marginTop: 14, paddingTop: 10, borderTop: "0.5px solid #f0f0f0" }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 500 }}>Voice accuracy by language</div>
                {data.voiceAccuracy.map(v => <ProgressBar key={v.lang} label={v.lang} pct={v.pct} color={v.color} />)}
              </div>
            </Card>
          </div>

          {/* 3-col row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
            <Card title="Query categories" subtitle="This week · all channels" action="See all ↗">
              {data.queryCategories.map(q => <ProgressBar key={q.label} label={q.label} pct={q.pct} color={q.color} valueColor={q.valueColor} />)}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid #f0f0f0" }}>
                <div style={{ fontSize: 11, color: "#888" }}>Top unanswered cluster</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#A32D2D", marginTop: 2 }}>Mandi pricing · 8,400 queries</div>
              </div>
            </Card>

            {/* FARMER SEGMENTS CARD — the key interactive section */}
            <div
              ref={segmentsRef}
              style={{
                background: "#fff",
                border: "0.5px solid #e5e5e5",
                borderRadius: 12,
                padding: 16,
                transition: "box-shadow 0.3s",
              }}
              className={activeSegment ? "seg-pulse" : ""}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a" }}>Farmer segments</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {activeSegment ? <span style={{ color: "#1E7A3C" }}>Viewing: {activeSegment.label}</span> : "Click a row to inspect segment"}
                  </div>
                </div>
                {activeSegment && (
                  <button onClick={clearSegment} style={{ fontSize: 11, color: "#888", background: "none", border: "0.5px solid #ddd", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                    Clear
                  </button>
                )}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    <th style={{ textAlign: "left", fontSize: 10, fontWeight: 500, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.4px", padding: "6px 10px", borderBottom: "0.5px solid #f0f0f0" }}>Segment</th>
                    <th style={{ textAlign: "left", fontSize: 10, fontWeight: 500, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.4px", padding: "6px 10px", borderBottom: "0.5px solid #f0f0f0" }}>Users</th>
                    <th style={{ textAlign: "left", fontSize: 10, fontWeight: 500, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.4px", padding: "6px 10px", borderBottom: "0.5px solid #f0f0f0" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.farmerSegments.map(seg => (
                    <tr
                      key={seg.id}
                      ref={el => { segmentRowRefs.current[seg.id] = el; }}
                      onClick={() => handleSegmentClick(seg)}
                      style={{
                        cursor: "pointer",
                        background: activeSegment?.id === seg.id ? "#EAF6EC" : "transparent",
                        transition: "background 0.2s",
                      }}
                    >
                      <td style={{ padding: "9px 10px", color: "#1a1a1a", borderBottom: "0.5px solid #f0f0f0", fontWeight: activeSegment?.id === seg.id ? 500 : 400 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {activeSegment?.id === seg.id && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3AAA5A", flexShrink: 0, display: "inline-block" }} />}
                          {seg.label}
                        </span>
                      </td>
                      <td style={{ padding: "9px 10px", color: "#1a1a1a", borderBottom: "0.5px solid #f0f0f0" }}>{seg.users}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "0.5px solid #f0f0f0" }}><Badge label={seg.status} variant={seg.statusVariant} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Alerts */}
            <Card title="Active alerts" subtitle="Requires leadership action" action={<Badge label="3 critical" variant="red" />}>
              {data.alerts.map(a => (
                <AlertItem key={a.id} level={a.level} title={a.title} desc={a.desc} />
              ))}
            </Card>
          </div>

          {/* Geo + Health */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
            <Card title="Geographic concentration" subtitle="Active users by state · darker = higher" action="Full geo view ↗">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 4 }}>
                {data.geoStates.map(s => (
                  <div key={s.abbr} style={{ borderRadius: 5, padding: "8px 6px", textAlign: "center", background: `rgba(30,122,60,${s.opacity})` }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: s.opacity > 0.5 ? "#fff" : "#0e4a22" }}>{s.abbr}</div>
                    <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2, color: s.opacity > 0.5 ? "rgba(255,255,255,0.85)" : "#1e7a3c" }}>{s.val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 12, paddingTop: 10, borderTop: "0.5px solid #f0f0f0", fontSize: 11, color: "#888", flexWrap: "wrap" }}>
                <span>Top district: <strong style={{ color: "#1a1a1a" }}>Vidisha, MP</strong></span>
                <span>Fastest growing: <strong style={{ color: "#1E7A3C" }}>MP +62% MoM</strong></span>
                <span>Gap states: <strong style={{ color: "#A32D2D" }}>NE States &lt;200</strong></span>
              </div>
            </Card>

            <Card title="Platform health score" subtitle="Six-pillar composite · weekly">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, marginTop: -28 }}>
                <div />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 26, fontWeight: 500, color: "#1E7A3C", lineHeight: 1 }}>70</div>
                  <div style={{ fontSize: 10, color: "#BA7517", fontWeight: 500 }}>MODERATE</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
                {data.healthPillars.map(p => (
                  <div key={p.label} style={{ border: "0.5px solid #e5e5e5", borderRadius: 8, padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 500, color: p.score >= 75 ? "#1E7A3C" : "#854F0B" }}>{p.score}</div>
                    <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{p.label}</div>
                    <div style={{ height: 4, borderRadius: 2, background: "#f0f0f0", marginTop: 6, overflow: "hidden" }}>
                      <div style={{ width: `${p.score}%`, height: "100%", background: p.color, borderRadius: 2, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 10, background: "#FAEEDA", borderRadius: 8, fontSize: 11, color: "#633806" }}>
                <span style={{ fontWeight: 500 }}>Action needed:</span> Geo reach + Retention below 65 — assign sprint owners this week
              </div>
            </Card>
          </div>

        </div>
      </div>

      {/* STATUS BAR */}
      <div style={{ background: "#fff", borderTop: "0.5px solid #e5e5e5", display: "flex", alignItems: "center", gap: 16, padding: "8px 20px", fontSize: 11, color: "#aaa", flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3AAA5A", display: "inline-block" }} />
        <span>All systems operational</span>
        <Sep /><span>Last sync: {data.meta.lastSync}</span>
        <Sep /><span>Dataset: {data.meta.datasetVersion}</span>
        <Sep /><span>Agri-LLM: {data.meta.llmVersion}</span>
        <Sep /><span style={{ color: "#A32D2D", fontWeight: 500 }}>{data.meta.p0Bugs} P0 bugs open · action required</span>
      </div>
    </div>
  );
}

// ─── SMALL HELPERS ────────────────────────────────────────────────────────────
function Sep() { return <span style={{ width: 1, height: 12, background: "#e5e5e5", display: "inline-block" }} />; }
function SidebarLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 500, color: "#aaa", padding: "0 16px", margin: "16px 0 6px", textTransform: "uppercase", letterSpacing: "0.6px" }}>{children}</div>;
}
function FilterChip({ label, active, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, background: active ? "#EAF6EC" : "#fff", border: `0.5px solid ${active ? "#3AAA5A" : "#ddd"}`, borderRadius: 6, padding: "5px 10px", fontSize: 12, color: active ? "#1E7A3C" : "#666", cursor: "pointer", fontWeight: active ? 500 : 400 }}>
      {icon && <svg viewBox="0 0 12 12" fill="none" width={12} height={12}><rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth={1} /><path d="M1 5h10M4 1v2M8 1v2" stroke="currentColor" strokeWidth={1} strokeLinecap="round" /></svg>}
      {label}
    </div>
  );
}
function AlertItem({ level, title, desc }) {
  const styles = { critical: { bg: "#FCEBEB", border: "#E24B4A" }, warn: { bg: "#FAEEDA", border: "#EF9F27" }, info: { bg: "#E6F1FB", border: "#3D8DE0" } };
  const s = styles[level];
  return (
    <div style={{ background: s.bg, borderLeft: `3px solid ${s.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 7 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "#1a1a1a" }}>{title}</div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}
function DonutChart({ segments }) {
  const total = segments.reduce((s, x) => s + x.pct, 0);
  let offset = 0;
  const r = 30, cx = 40, cy = 40, circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width={80} height={80} viewBox="0 0 80 80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" strokeWidth={14} />
        {segments.map((seg) => {
          const dash = (seg.pct / total) * circ;
          const el = (
            <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={14}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} />
          );
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={500} fill="#1E7A3C">{segments[0].pct}%</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#666" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0, display: "inline-block" }} />{s.label} · {s.pct}%
          </div>
        ))}
      </div>
    </div>
  );
}
function DauTrendChart() {
  const bars = [40,45,42,50,48,55,62,60,65,70,66,72,75,78,76,82,80,85,88,86,90,93,89,95,98,100,96,100,98,60];
  const colors = ["#C0DD97","#C0DD97","#C0DD97","#C0DD97","#97C459","#97C459","#97C459","#639922","#639922","#639922","#639922","#639922","#3B6D11","#3B6D11","#3B6D11","#3B6D11","#3B6D11","#27500A","#27500A","#27500A","#27500A","#27500A","#27500A","#173404","#173404","#173404","#173404","#173404","#173404","#EF9F27"];
  return (
    <Card title="Daily active users — 30 day trend" subtitle="Farmers + KCC agents + agri experts" action="Drill down ↗">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, paddingTop: 4 }}>
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, background: colors[i], borderRadius: "2px 2px 0 0", outline: i === 29 ? "1.5px solid #BA7517" : "none" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#aaa", marginTop: 4, padding: "0 1px" }}>
        <span>Day 1</span><span>Day 10</span><span>Day 20</span><span>Today</span>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 10, borderTop: "0.5px solid #f0f0f0" }}>
        <div style={{ fontSize: 11, color: "#888" }}>Peak: <span style={{ fontWeight: 500, color: "#1a1a1a" }}>Day 26 · 98,400</span></div>
        <div style={{ fontSize: 11, color: "#888" }}>Avg: <span style={{ fontWeight: 500, color: "#1a1a1a" }}>71,200 / day</span></div>
        <div style={{ fontSize: 11, color: "#888" }}>Growth: <span style={{ fontWeight: 500, color: "#1E7A3C" }}>+18% MoM</span></div>
      </div>
    </Card>
  );
}

// ─── ICONS ────────────────────────────────────────────────────────────────────
const GridIcon = () => <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="#3AAA5A"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="#3AAA5A" opacity=".5"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="#3AAA5A" opacity=".5"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="#3AAA5A" opacity=".3"/></svg>;
const UserIcon = () => <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="6" r="3" stroke="#888" strokeWidth="1.2"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#888" strokeWidth="1.2" strokeLinecap="round"/></svg>;
const ChartLineIcon = () => <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M2 12l3-4 3 2 3-5 3 3" stroke="#888" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const GlobeIcon = () => <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#888" strokeWidth="1.2"/><path d="M8 2v6l3 3" stroke="#888" strokeWidth="1.2" strokeLinecap="round"/></svg>;
const StarIcon = () => <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5 6.5 5z" stroke="#888" strokeWidth="1.2" strokeLinejoin="round"/></svg>;
const BugIcon = () => <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#888" strokeWidth="1.2"/><path d="M8 5v4M8 11v.5" stroke="#888" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const ListIcon = () => <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h5" stroke="#888" strokeWidth="1.2" strokeLinecap="round"/></svg>;
const SunIcon = () => <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="#888" strokeWidth="1.2" strokeLinecap="round"/><circle cx="8" cy="8" r="2.5" stroke="#888" strokeWidth="1.2"/></svg>;
