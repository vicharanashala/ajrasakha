import { Card, CardContent } from "@/components/atoms/card";

type BadgeVariant = "green" | "red" | "amber" | "blue";

type KpiCardData = {
	id: string;
	label: string;
	value: string;
	delta: string;
	deltaDir: "up" | "down" | "neutral";
	accentColor: string;
	valueColor?: string;
	sparkPoints?: number[];
	badges?: { label: string; variant: BadgeVariant }[];
};

const DASHBOARD_DATA: { kpiRow1: KpiCardData[]; kpiRow2: KpiCardData[] } = {
	kpiRow1: [
		{
			id: "dau",
			label: "Active farmers (DAU)",
			value: "4.82 L",
			delta: "+18% vs last month",
			deltaDir: "up",
			accentColor: "#3AAA5A",
			sparkPoints: [22, 20, 22, 18, 19, 15, 13, 14, 10, 11, 8, 7, 5],
		},
		{
			id: "queries",
			label: "Daily queries",
			value: "1.24 L",
			delta: "+31% week-on-week",
			deltaDir: "up",
			accentColor: "#378ADD",
			sparkPoints: [24, 22, 20, 22, 18, 20, 16, 18, 14, 12, 10, 8, 6],
		},
		{
			id: "session",
			label: "Avg session duration",
			value: "6.4 min",
			delta: "Stable this week",
			deltaDir: "neutral",
			accentColor: "#EF9F27",
			sparkPoints: [14, 12, 15, 13, 12, 14, 13, 14, 12, 13, 14, 12, 13],
		},
		{
			id: "bugs",
			label: "Critical bugs open",
			value: "7",
			delta: "Needs immediate action",
			deltaDir: "down",
			accentColor: "#E24B4A",
			badges: [
				{ label: "3 P0", variant: "red" },
				{ label: "4 P1", variant: "amber" },
			],
		},
	],
	kpiRow2: [
		{
			id: "csat",
			label: "CSAT rating",
			value: "4.2 ★",
			delta: "+0.3 pts this month",
			deltaDir: "up",
			accentColor: "#1D9E75",
		},
		{
			id: "repeatQuery",
			label: "Repeat query rate",
			value: "28%",
			delta: "Target: <10% · gap",
			deltaDir: "down",
			accentColor: "#EF9F27",
			valueColor: "#854F0B",
		},
		{
			id: "voice",
			label: "Voice usage share",
			value: "61%",
			delta: "Primary mode",
			deltaDir: "up",
			accentColor: "#378ADD",
		},
		{
			id: "states",
			label: "Villages active",
			value: "19 / 28",
			delta: "3 new villages added",
			deltaDir: "up",
			accentColor: "#7C6FD4",
		},
	],
};

const badgeStyles: Record<BadgeVariant, { background: string; color: string }> = {
	green: { background: "#EAF3DE", color: "#3B6D11" },
	red: { background: "#FCEBEB", color: "#A32D2D" },
	amber: { background: "#FAEEDA", color: "#633806" },
	blue: { background: "#E6F1FB", color: "#0C447C" },
};

function SmallBadge({ label, variant = "green" }: { label: string; variant?: BadgeVariant }) {
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				padding: "2px 7px",
				borderRadius: 20,
				fontSize: 10,
				fontWeight: 500,
				...badgeStyles[variant],
			}}
		>
			{label}
		</span>
	);
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
	const max = Math.max(...points);
	const min = Math.min(...points);
	const width = 120;
	const height = 28;
	const px = (i: number) => (i / (points.length - 1)) * width;
	const py = (v: number) => height - ((v - min) / (max - min || 1)) * height;
	const d = points.map((v, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(v)}`).join(" ");
	const fill = `${d} L ${width} ${height} L 0 ${height} Z`;

	return (
		<svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 52 }} preserveAspectRatio="none">
			<path d={fill} fill={color} fillOpacity={0.08} />
			<path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function DeltaIcon({ dir }: { dir: KpiCardData["deltaDir"] }) {
	if (dir === "up") {
		return (
			<svg width={10} height={10} viewBox="0 0 10 10">
				<path d="M5 2l3 4H2z" fill="#1E7A3C" />
			</svg>
		);
	}

	if (dir === "down") {
		return (
			<svg width={10} height={10} viewBox="0 0 10 10">
				<path d="M5 8l3-4H2z" fill="#A32D2D" />
			</svg>
		);
	}

	return <span style={{ fontSize: 10 }}>→</span>;
}

function KpiCard({ kpi }: { kpi: KpiCardData }) {
	const deltaColor = kpi.deltaDir === "up" ? "#1E7A3C" : kpi.deltaDir === "down" ? "#A32D2D" : "#888";

	return (
		<Card
			className="gap-0 p-0"
			style={{
				background: "#fff",
				border: "0.5px solid #e5e5e5",
				borderRadius: 12,
				position: "relative",
				overflow: "hidden",
				minWidth: 0,
			}}
		>
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					height: 3,
					background: kpi.accentColor,
					borderRadius: "12px 12px 0 0",
				}}
			/>
			<CardContent style={{ padding: "14px 16px" }}>
				<div
					style={{
						fontSize: 11,
						color: "#888",
						marginBottom: 6,
						textTransform: "uppercase",
						letterSpacing: "0.4px",
						fontWeight: 500,
					}}
				>
					{kpi.label}
				</div>
				<div style={{ fontSize: 22, fontWeight: 500, color: kpi.valueColor || "#1a1a1a", lineHeight: 1 }}>{kpi.value}</div>
				<div style={{ fontSize: 11, marginTop: 5, display: "flex", alignItems: "center", gap: 3, color: deltaColor }}>
					<DeltaIcon dir={kpi.deltaDir} /> {kpi.delta}
				</div>
				{kpi.sparkPoints && (
					<div style={{ marginTop: 10 }}>
						<Sparkline points={kpi.sparkPoints} color={kpi.accentColor} />
					</div>
				)}
				{kpi.badges && (
					<div style={{ marginTop: 8, display: "flex", gap: 4 }}>
						{kpi.badges.map((b) => (
							<SmallBadge key={b.label} label={b.label} variant={b.variant} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export function EightCardsComponent() {
	const data = DASHBOARD_DATA;

	return (
		<>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 10 }}>
				{data.kpiRow1.map((kpi) => (
					<KpiCard key={kpi.id} kpi={kpi} />
				))}
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
				{data.kpiRow2.map((kpi) => (
					<KpiCard key={kpi.id} kpi={kpi} />
				))}
			</div>
		</>
	);
}
