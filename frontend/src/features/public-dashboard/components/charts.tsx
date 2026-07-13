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
import { domainColors, domains, growth, growthColors } from "../data/dashboardData";
import { useGetPublicStats } from "@/hooks/api/dashboard/usePublicStats";

/**
 * Domain distribution of collected questions — a doughnut (identity, fixed colours).
 * Uses the LIVE domain breakdown from the database when available (top 10 by volume),
 * falling back to the demo figures only if the API hasn't answered yet.
 */
export const DomainDoughnut = () => {
  const { data: live } = useGetPublicStats();

  const data = live?.domainData?.length
    ? [...live.domainData]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((d) => ({ label: d.name, value: d.count }))
    : domains;

  return <DomainDoughnutView data={data} />;
};

const DomainDoughnutView = ({
  data,
}: {
  data: { label: string; value: number }[];
}) => (
  <div style={{ height: 320 }} role="img" aria-label="Distribution of questions across agronomy domains">
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
            <Cell key={i} fill={domainColors[i % domainColors.length]} />
          ))}
        </Pie>
        {/* Live data is a raw question count, not a percentage — show the number. */}
        <Tooltip formatter={(v: any, n: any) => [v, n]} />
        <Legend
          layout="horizontal"
          align="center"
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: "#6b7570" }}
        />
      </PieChart>
    </ResponsiveContainer>
  </div>
);

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
