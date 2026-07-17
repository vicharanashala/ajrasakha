import { Counter } from "../components/Counter";
import { SectionHead } from "../components/SectionHead";
import { networkRoles } from "../data/dashboardData";
import type { RoleCount } from "@/hooks/services/publicStatsService";

/**
 * Layer 04 — the distributed expert network: roles, KVKs and SAUs. Role headcounts come
 * from the live userRoleOverview (via /dashboard/stats); the demo `networkRoles` are used
 * only until that arrives.
 */
export const HumanNetwork = ({ roles }: { roles?: RoleCount[] }) => {
  const roleCells = roles?.length
    ? roles.map((r) => ({ label: r.role, count: r.count }))
    : networkRoles;

  return (
  <section className="wrap" id="layer4">
    <SectionHead title="Human Intelligence Network" />
    <p className="sec-desc">
      ANNAM.AI's knowledge base is validated by a distributed network of Post-graduate
      Agri Experts (PAEs), reviewers, moderators, authors, gatekeepers and auditors,
      anchored by KVKs and State Agricultural Universities.
    </p>
    <div className="stat-grid" style={{ marginBottom: 28 }}>
      {roleCells.map((r) => (
        <div className="stat-cell" key={r.label}>
          <div className="val">
            <Counter value={r.count} />
          </div>
          <div className="lab">{r.label}</div>
        </div>
      ))}
    </div>
  {/**  <div className="two-col">
      <div className="chart-box">
        <h4 style={{ fontSize: 16, marginBottom: 14 }}>KVK Mapping</h4>
        <div className="metric-mini-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <MiniCounter value={731} label="KVKs mapped" />
          <MiniCounter value={4.8} suffix="M" label="Farmers serviced" />
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
          <MiniCounter value={63} label="SAUs onboarded" />
          <MiniCounter value={29} label="States contributing" />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 16, lineHeight: 1.6 }}>
          State Agricultural Universities contribute domain experts and validate
          region-specific advisory content, anchoring coverage in local agro-climatic reality.
        </p>
      </div>
    </div>*/} 
  </section>
  );
};
