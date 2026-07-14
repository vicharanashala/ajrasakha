import { SectionHead } from "../components/SectionHead";
import { workflowSteps } from "../data/dashboardData";

/** The validation chain every question passes through before entering the golden DB. */
export const ReviewWorkflow = () => (
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
