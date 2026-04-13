import { useState, useRef } from "react";
import { createPortal } from "react-dom";
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
	sparkLabels?: string[];
	dateRange?: string;
	badges?: { label: string; variant: BadgeVariant }[];
};

const badgeStyles: Record<BadgeVariant, { bg: string; text: string }> = {
	green: { bg: "bg-green-50 dark:bg-green-950", text: "text-green-900 dark:text-green-200" },
	red: { bg: "bg-red-50 dark:bg-red-950", text: "text-red-900 dark:text-red-200" },
	amber: { bg: "bg-amber-50 dark:bg-amber-950", text: "text-amber-900 dark:text-amber-200" },
	blue: { bg: "bg-blue-50 dark:bg-blue-950", text: "text-blue-900 dark:text-blue-200" },
};


function getDateRangeLabel(days = 30): string {
	const end = new Date();
	const start = new Date();
	start.setDate(start.getDate() - days);
	const fmt = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
	return `${fmt(start)} – ${fmt(end)}`;
}

function SmallBadge({ label, variant = "green" }: { label: string; variant?: BadgeVariant }) {
	const styles = badgeStyles[variant];
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${styles.bg} ${styles.text}`}
		>
			{label}
		</span>
	);
}

function Sparkline({ points, color, labels }: { points: number[]; color: string; labels?: string[] }) {
	const [hovered, setHovered] = useState<number | null>(null);
	const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const max = Math.max(...points);
	const min = Math.min(...points);
	const width = 120;
	const height = 28;
	const px = (i: number) => (i / (points.length - 1)) * width;
	const py = (v: number) => height - ((v - min) / (max - min || 1)) * height;
	const d = points.map((v, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(v)}`).join(" ");
	const fill = `${d} L ${width} ${height} L 0 ${height} Z`;
	const sliceWidth = width / points.length;

	const handleEnter = (i: number) => {
		setHovered(i);
		const rect = svgRef.current?.getBoundingClientRect();
		if (rect) {
			setTooltipPos({
				x: rect.left + (px(i) / width) * rect.width,
				y: rect.top,
			});
		}
	};

	return (
		<div>
			{hovered !== null && tooltipPos && createPortal(
				<div
					className="fixed -translate-x-1/2 -translate-y-[calc(100%+8px)] pointer-events-none whitespace-nowrap z-[9999] flex flex-col items-center"
					style={{ left: tooltipPos.x, top: tooltipPos.y }}
				>
					<div
						className="text-white text-[10px] font-semibold px-[9px] py-[5px] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.2)] text-center min-w-[70px]"
						style={{ background: color }}
					>
						<div className="font-bold text-[11px]">
							{points[hovered].toLocaleString()}
						</div>
						{labels?.[hovered] && (
							<>
								<div className="h-px bg-white/35 my-1" />
								<div className="font-normal text-[9px] opacity-[0.88]">
									{labels[hovered]}
								</div>
							</>
						)}
					</div>
					<div style={{
						width: 0,
						height: 0,
						borderLeft: "4px solid transparent",
						borderRight: "4px solid transparent",
						borderTop: `4px solid ${color}`,
					}} />
				</div>,
				document.body
			)}
			<svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-13" preserveAspectRatio="none">
				<path d={fill} fill={color} fillOpacity={0.08} />
				<path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
				{hovered !== null && (
					<circle cx={px(hovered)} cy={py(points[hovered])} r={2.5} fill={color} />
				)}
				{points.map((_, i) => (
					<rect
						key={i}
						x={i * sliceWidth}
						y={0}
						width={sliceWidth}
						height={height}
						fill="transparent"
						onMouseEnter={() => handleEnter(i)}
						onMouseLeave={() => { setHovered(null); setTooltipPos(null); }}
						className="cursor-crosshair"
					/>
				))}
			</svg>
		</div>
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

	return <span className="text-xs">→</span>;
}

function KpiCard({ kpi }: { kpi: KpiCardData }) {
	const deltaColor = kpi.deltaDir === "up" ? "#1E7A3C" : kpi.deltaDir === "down" ? "#A32D2D" : "#888";

	return (
		<Card
			className="relative overflow-hidden border border-gray-200 bg-white p-0 dark:border-[#2a2a2a] dark:bg-[#1a1a1a]"
		>
			<div
				className="absolute inset-x-0 top-0 h-1"
				style={{ background: kpi.accentColor }}
			/>
			<CardContent className="p-4 flex flex-col gap-3">
				{/* Upper: label */}
				<div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
				  {kpi.label}
				</div>

				{/* Lower: value, delta, sparkline, badges */}
				<div className="flex flex-col gap-1.5">
					<div className="text-2xl font-semibold dark:text-slate-100" style={{ color: kpi.valueColor }}>
						{kpi.value}
					</div>
					<div className="flex items-center gap-1 text-xs dark:text-gray-300" style={{ color: deltaColor }}>
						<DeltaIcon dir={kpi.deltaDir} /> {kpi.delta}
					</div>
					{kpi.sparkPoints && (
						<div className="mt-1">
							<Sparkline points={kpi.sparkPoints} color={kpi.accentColor} labels={kpi.sparkLabels} />
						</div>
					)}
					{kpi.badges && (
						<div className="flex gap-1 flex-wrap">
							{kpi.badges.map((b) => (
								<SmallBadge key={b.label} label={b.label} variant={b.variant} />
							))}
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

export function EightCardsComponent({ kpiRow1, kpiRow2 }: { kpiRow1: KpiCardData[], kpiRow2: KpiCardData[] }) {

	return (
		<>
			<div className="mb-2.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
				{kpiRow1.map((kpi) => (
					<KpiCard key={kpi.id} kpi={kpi} />
				))}
			</div>
			<div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
				{kpiRow2.map((kpi) => (
					<KpiCard key={kpi.id} kpi={kpi} />
				))}
			</div>
		</>
	);
}
