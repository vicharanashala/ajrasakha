import { Counter } from "../components/Counter";
import { SectionHead } from "../components/SectionHead";
import { networkRoles } from "../data/dashboardData";
import type { RoleCount } from "@/hooks/services/publicStatsService";

/**
 * Layer 04 — the distributed expert network. Role headcounts come from the live
 * userRoleOverview (via /dashboard/stats); the demo `networkRoles` are used only until
 * that arrives.
 *
 * Renders as a plain column (not its own <section>) so it can sit beside the 60-second
 * overview carousel — see NarrativeSection. It keeps id="layer4" for the nav scroll-spy.
 */
export const HumanNetwork = ({ roles }: { roles?: RoleCount[] }) => {
  const roleCells = roles?.length
    ? roles.map((r) => ({ label: r.role, count: r.count }))
    : networkRoles;

  return (
  <div id="layer4" className="hin-col">
    <SectionHead title="Human Intelligence Network" />
    <p className="sec-desc">
      ANNAM.AI's knowledge base is validated by a distributed network of Post-graduate
      Agri Experts (PAEs), reviewers, moderators, authors, gatekeepers and auditors,
      anchored by KVKs and State Agricultural Universities.
    </p>
    <div className="hin-grid">
      {roleCells.map((r, i) => (
        <div
          className="stat-cell hin-cell"
          key={r.label}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="val">
            <Counter value={r.count} />
          </div>
          <div className="lab">{r.label}</div>
        </div>
      ))}
    </div>
  </div>
  );
};
