import type { DashboardBlock } from "@/hooks/services/dashboardContentService";
import { SectionHead } from "../components/SectionHead";

/**
 * The 60-second overview: admin-authored blocks (what ACE is, why it matters, how large,
 * coverage, technology, impact, what's next). Blocks are supplied by the parent — live
 * content when an admin has saved some, the seed defaults otherwise.
 */
export const NarrativeSection = ({ blocks }: { blocks: DashboardBlock[] }) => (
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
