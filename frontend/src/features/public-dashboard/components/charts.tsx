import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { domainColors, growth, growthColors } from "../data/dashboardData";

/**
 * A distribution doughnut (identity, fixed colours) with a scrollable legend on the right
 * listing each slice and its count. The list scrolls when there are more entries than fit,
 * so every one is reachable. Used for both the domain and crop breakdowns.
 *
 * Presentational: the caller supplies the slices (the live breakdown from the database,
 * or the demo figures while the API hasn't answered).
 */
export const DistributionDoughnut = ({
  data,
  colors = domainColors,
  showMeta = true,
  centerValue,
  centerLabel,
}: {
  data: { label: string; value: number }[];
  colors?: string[];
  /** Show the per-slice count · % on each legend row. */
  showMeta?: boolean;
  /** A headline figure rendered in the doughnut hole (e.g. total crops covered). */
  centerValue?: number | string;
  centerLabel?: string;
}) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <div
        style={{ position: "relative", flex: "1 1 240px", minWidth: 220, height: 300 }}
        role="img"
        aria-label="Distribution across agronomy categories"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="82%"
              paddingAngle={1}
              stroke="#ffffff"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            {/* Live data is a raw question count, not a percentage — show the number. */}
            <Tooltip formatter={(v: any, n: any) => [v, n]} />
          </PieChart>
        </ResponsiveContainer>

        {centerValue !== undefined && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 800, color: "var(--green-deep)", lineHeight: 1 }}>
              {centerValue}
            </div>
            {centerLabel && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  marginTop: 6,
                  maxWidth: 120,
                  lineHeight: 1.3,
                }}
              >
                {centerLabel}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrollable legend: colour swatch · domain · count. */}
      <ul
        style={{
          flex: "1 1 220px",
          minWidth: 200,
          maxHeight: 280,
          overflowY: "auto",
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {data.map((d, i) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          return (
            <li
              key={d.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "7px 4px",
                borderBottom: "1px solid var(--line)",
                fontSize: 12.5,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: colors[i % colors.length],
                    flexShrink: 0,
                  }}
                />
                <span
                  title={d.label}
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {d.label}
                </span>
              </span>
              {showMeta && (
                <span className="mono" style={{ flexShrink: 0, fontWeight: 600 }}>
                  {d.value.toLocaleString("en-IN")}
                  <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}> · {pct}%</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Cumulative growth of questions / experts / states / integrations over time. */
export const GrowthLine = () => (
  <div style={{ height: 300 }} role="img" aria-label="Cumulative programme growth since inception">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={growth} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="#e7ebe8" strokeWidth={1} />
        <XAxis dataKey="q" tick={{ fill: "#6b7570", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#6b7570", fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
        <Tooltip />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: "#6b7570" }} />
        <Line type="monotone" dataKey="questions" name="Questions (M)" stroke={growthColors.questions} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="experts" name="Experts (×100)" stroke={growthColors.experts} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="states" name="States" stroke={growthColors.states} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="integrations" name="Integrations" stroke={growthColors.integrations} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);
