import { useState, useEffect, useRef } from "react";
import { SectionHead } from "../components/SectionHead";

/** Animation states for each workflow step */
type StepStatus = "pending" | "active" | "approved" | "rejected" | "modified";

/** Detailed descriptions for each workflow step */
const workflowDescriptions: Record<string, string> = {
  "Question Submitted": "Farmer asks agricultural question via WhatsApp, Voice Bot, or Web Portal",
  "AI Processing": "AI checks Golden Database for existing answer. If found, provides answer. If not found, routes to Agri Expert",
  "Author": "Agri Expert writes a new answer based on agricultural knowledge and expertise",
  "Reviewer 1": "First reviewer validates answer accuracy and completeness",
  "Reviewer 2": "Second reviewer verifies technical correctness and recommendations",
  "Reviewer 3": "Third reviewer ensures quality standards and consistency",
  "Reviewer 4": "A further reviewer from the queue — after a rejection or modification the answer is sent to the NEXT reviewers, not back to the ones who already saw it",
  "Moderator Approval": "Final review by moderator before entering the knowledge base",
  "Golden Database": "Validated Q&A pair stored in Golden Database for future farmer queries",
};

/** Boxes for the happy path. */
const BASE_STEPS = [
  "Question Submitted", "AI Processing", "Author",
  "Reviewer 1", "Reviewer 2", "Reviewer 3",
  "Moderator Approval", "Golden Database",
];

/**
 * Boxes for the rejection / modification paths. Once Reviewer 1 rejects or modifies, the
 * approval count drops to 0 and the answer goes to the NEXT reviewers in the queue — so
 * these flows carry a fourth reviewer box rather than looping back to Reviewer 1.
 */
const RETRY_STEPS = [
  "Question Submitted", "AI Processing", "Author",
  "Reviewer 1", "Reviewer 2", "Reviewer 3", "Reviewer 4",
  "Moderator Approval", "Golden Database",
];

/** Simulated review events for demo */
const demoScenarios = [
  {
    name: "Standard Approval Flow",
    description: "3 consecutive approvals → Golden Database",
    labels: BASE_STEPS,
    steps: [0, 1, 2, 3, 4, 5, 6, 7],
    approvals: [3, 4, 5],
    type: "approval" as const,
    resetAtVisit: undefined as number | undefined,
  },
  {
    name: "Rejection → New Answer",
    description:
      "Reviewer 1 rejects → Author writes a new answer → count resets to 0 → the NEXT 3 reviewers must all approve",
    labels: RETRY_STEPS,
    // 3 = Reviewer 1 rejects, 2 = Author writes the new answer, then 4/5/6 = Reviewer 2, 3, 4.
    steps: [0, 1, 2, 3, 2, 4, 5, 6, 7, 8],
    approvals: [3, 4, 5, 6],
    type: "rejection" as const,
    rejectAt: 3,
    // Position in `steps` after which the consecutive-approval counter goes back to zero:
    // a rejection creates a brand-new answer document, whose approvalCount starts at 0.
    resetAtVisit: 3,
  },
  {
    name: "Modification → Next Reviewer",
    description:
      "Reviewer 1 modifies the answer → count resets to 0 → the NEXT 3 reviewers must all approve",
    labels: RETRY_STEPS,
    // The reviewer edits the answer in place (no Author step), then 4/5/6 = Reviewer 2, 3, 4.
    steps: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    approvals: [3, 4, 5, 6],
    type: "modification" as const,
    modifyAt: 3,
    // A modification calls resetApprovalCount() on the answer, so the tally restarts.
    resetAtVisit: 3,
  },
];

export const ReviewWorkflow = () => {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [stepStates, setStepStates] = useState<StepStatus[]>(
    demoScenarios[0].labels.map(() => "pending")
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [approvalCount, setApprovalCount] = useState(0);
  const [showRejectFlow, setShowRejectFlow] = useState(false);
  const [showModifyFlow, setShowModifyFlow] = useState(false);
  const [showApprovalCycle, setShowApprovalCycle] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pausedStepIndexRef = useRef(0);
  const pausedApprovalsRef = useRef(0);

  const currentScenario = demoScenarios[scenarioIndex];

  // Reset animation when scenario changes
  useEffect(() => {
    setStepStates(demoScenarios[scenarioIndex].labels.map(() => "pending"));
    setCurrentStep(0);
    setSelectedStep(null);
    setIsPaused(false);
    setApprovalCount(0);
    setShowRejectFlow(false);
    setShowModifyFlow(false);
    setShowApprovalCycle(false);
    setAnimationKey((k) => k + 1);
    pausedStepIndexRef.current = 0;
    pausedApprovalsRef.current = 0;
  }, [scenarioIndex]);

  // Handle step click to pause and show description
  const handleStepClick = (stepIndex: number) => {
    // Stop the animation
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPaused(true);
    setSelectedStep(stepIndex);
    setCurrentStep(stepIndex);
  };

  // Resume animation from where it stopped
  const resumeAnimation = () => {
    setIsPaused(false);
    setSelectedStep(null);
    
    const scenario = demoScenarios[scenarioIndex];
    let stepIndex = pausedStepIndexRef.current;
    let approvals = pausedApprovalsRef.current;

    intervalRef.current = setInterval(() => {
      if (stepIndex >= scenario.steps.length) {
        clearInterval(intervalRef.current!);
        return;
      }

      const step = scenario.steps[stepIndex];
      
      setStepStates((prev) => {
        const newStates = [...prev];
        // Reset previous active
        newStates.forEach((_, i) => {
          if (newStates[i] === "active") {
            newStates[i] = "approved";
          }
        });
        // Set current step
        newStates[step] = "active";
        return newStates;
      });

      // A rejection or modification invalidates the tally: the answer either is replaced
      // (new document, approvalCount 0) or has resetApprovalCount() called on it, so the
      // chain must earn 3 FRESH consecutive approvals. Reset before counting this step.
      const isResetVisit =
        scenario.resetAtVisit !== undefined && stepIndex === scenario.resetAtVisit;
      if (isResetVisit) {
        approvals = 0;
        setApprovalCount(0);
        pausedApprovalsRef.current = 0;
        setShowApprovalCycle(false);
      }

      // Check for approvals (Reviewer 1, 2, 3). The reviewer who rejects/modifies at the
      // reset visit is not an approval, so it is skipped here.
      if (!isResetVisit && scenario.approvals.includes(step)) {
        approvals++;
        setApprovalCount(approvals);
        pausedApprovalsRef.current = approvals;

        // Show approval cycle indicator after 3 consecutive approvals
        if (approvals >= 3) {
          setShowApprovalCycle(true);
        }
      }

      // Handle rejection flow
      if (scenario.type === "rejection" && step === scenario.rejectAt) {
        setTimeout(() => {
          setShowRejectFlow(true);
          setStepStates((prev) => {
            const newStates = [...prev];
            newStates[step] = "rejected";
            return newStates;
          });
        }, 800);
      }

      // Handle modification flow
      if (scenario.type === "modification" && step === scenario.modifyAt) {
        setTimeout(() => {
          setShowModifyFlow(true);
          setStepStates((prev) => {
            const newStates = [...prev];
            newStates[step] = "modified";
            return newStates;
          });
        }, 800);
      }

      setCurrentStep(step);
      stepIndex++;
      pausedStepIndexRef.current = stepIndex;
    }, 1500);
  };

  // Animation logic
  useEffect(() => {
    if (isPaused) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const scenario = demoScenarios[scenarioIndex];
    let stepIndex = pausedStepIndexRef.current;
    let approvals = pausedApprovalsRef.current;

    intervalRef.current = setInterval(() => {
      if (stepIndex >= scenario.steps.length) {
        clearInterval(intervalRef.current!);
        return;
      }

      const step = scenario.steps[stepIndex];
      
      setStepStates((prev) => {
        const newStates = [...prev];
        // Reset previous active
        newStates.forEach((_, i) => {
          if (newStates[i] === "active") {
            newStates[i] = "approved";
          }
        });
        // Set current step
        newStates[step] = "active";
        return newStates;
      });

      // A rejection or modification invalidates the tally: the answer either is replaced
      // (new document, approvalCount 0) or has resetApprovalCount() called on it, so the
      // chain must earn 3 FRESH consecutive approvals. Reset before counting this step.
      const isResetVisit =
        scenario.resetAtVisit !== undefined && stepIndex === scenario.resetAtVisit;
      if (isResetVisit) {
        approvals = 0;
        setApprovalCount(0);
        pausedApprovalsRef.current = 0;
        setShowApprovalCycle(false);
      }

      // Check for approvals (Reviewer 1, 2, 3). The reviewer who rejects/modifies at the
      // reset visit is not an approval, so it is skipped here.
      if (!isResetVisit && scenario.approvals.includes(step)) {
        approvals++;
        setApprovalCount(approvals);
        pausedApprovalsRef.current = approvals;

        // Show approval cycle indicator after 3 consecutive approvals
        if (approvals >= 3) {
          setShowApprovalCycle(true);
        }
      }

      // Handle rejection flow
      if (scenario.type === "rejection" && step === scenario.rejectAt) {
        setTimeout(() => {
          setShowRejectFlow(true);
          setStepStates((prev) => {
            const newStates = [...prev];
            newStates[step] = "rejected";
            return newStates;
          });
        }, 800);
      }

      // Handle modification flow
      if (scenario.type === "modification" && step === scenario.modifyAt) {
        setTimeout(() => {
          setShowModifyFlow(true);
          setStepStates((prev) => {
            const newStates = [...prev];
            newStates[step] = "modified";
            return newStates;
          });
        }, 800);
      }

      setCurrentStep(step);
      stepIndex++;
      pausedStepIndexRef.current = stepIndex;
    }, 1500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [scenarioIndex, animationKey, isPaused]);

  const cycleToNextScenario = () => {
    setScenarioIndex((prev) => (prev + 1) % demoScenarios.length);
  };

  return (
    <section className="wrap" id="workflow">
      <SectionHead title="Review Workflow" />
      <p className="sec-desc">
        Every question submitted to ANNAM.AI passes through this validation chain before it
        enters the golden database. The workflow includes rejection and modification flows
        that cycle back to ensure quality.
      </p>

      {/* Scenario Selector */}
      <div className="scenario-selector">
        <div className="scenario-tabs">
          {demoScenarios.map((scenario, idx) => (
            <button
              key={idx}
              className={`scenario-tab ${idx === scenarioIndex ? "active" : ""}`}
              onClick={() => setScenarioIndex(idx)}
            >
              <span className="scenario-icon">
                {scenario.type === "approval" && "✓"}
                {scenario.type === "rejection" && "✗"}
                {scenario.type === "modification" && "↻"}
              </span>
              <span className="scenario-name">{scenario.name}</span>
            </button>
          ))}
        </div>
        <p className="scenario-desc">{currentScenario.description}</p>
      </div>

      {/* Workflow Visualization */}
      <div className="workflow-container" key={animationKey}>
        {/* Flow Indicators */}
        {(showRejectFlow || showModifyFlow) && (
          <div className={`flow-indicator ${showRejectFlow ? "rejection" : "modification"}`}>
            <div className="flow-badge">
              {showRejectFlow && (
                <>
                  <span className="flow-icon">✗</span>
                  <span>New Answer Created</span>
                </>
              )}
              {showModifyFlow && (
                <>
                  <span className="flow-icon">↻</span>
                  <span>Answer Modified</span>
                </>
              )}
            </div>
            <div className="flow-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            </div>
          </div>
        )}

        {/* Main Workflow Steps */}
        <div className="workflow">
          {currentScenario.labels.map((step, i) => (
            <div key={i} className="wf-step-wrapper">
              {/* Step Card - Clickable to pause and view description */}
              <div
                className={`wf-step ${stepStates[i]} ${
                  i === currentStep ? "current" : ""
                } ${i < currentStep ? "completed" : ""} ${isPaused && i === selectedStep ? "selected" : ""}`}
                onClick={() => handleStepClick(i)}
                title="Click to view details"
              >
                <div className="wf-step-number">{String(i + 1).padStart(2, "0")}</div>
                <div className="wf-step-title">{step}</div>
                
                {/* Status Icons */}
                {stepStates[i] === "approved" && (
                  <div className="wf-status-icon approved">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
                {stepStates[i] === "rejected" && (
                  <div className="wf-status-icon rejected">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </div>
                )}
                {stepStates[i] === "modified" && (
                  <div className="wf-status-icon modified">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </div>
                )}
                {stepStates[i] === "active" && (
                  <div className="wf-status-icon active">
                    <div className="pulse-dot" />
                  </div>
                )}
              </div>

              {/* Arrow between steps */}
              {i < currentScenario.labels.length - 1 && (
                <div className={`wf-arrow ${stepStates[i] === "active" ? "animating" : ""}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Step Description Panel */}
        <div className="step-description-panel">
          <div className="step-desc-header">
            <span className="step-desc-icon">ℹ️</span>
            <span>Current Step Details</span>
            {isPaused && (
              <button className="resume-btn" onClick={resumeAnimation}>
                ▶ Resume Animation
              </button>
            )}
          </div>
          <div className="step-desc-content">
            <h4 className="step-desc-title">{currentScenario.labels[currentStep]}</h4>
            <p className="step-desc-text">
              {workflowDescriptions[currentScenario.labels[currentStep]]}
            </p>
          </div>
        </div>

        {/* Live tally — makes the reset after a rejection/modification visible: the count
            drops back to 0/3 and has to be earned again. */}
        <div className="approval-tally" aria-live="polite">
          <span className="approval-tally-label">Consecutive approvals</span>
          <span className="approval-tally-dots">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`approval-tally-dot${approvalCount >= n ? " filled" : ""}`}
              />
            ))}
          </span>
          <span className="approval-tally-count mono">
            {Math.min(approvalCount, 3)} / 3
          </span>
        </div>

        {/* 3 Consecutive Approval Cycle Indicator */}
        {showApprovalCycle && (
          <div className="approval-cycle-indicator">
            <div className="cycle-badge">
              <span className="cycle-icon">🏆</span>
              <span>3 Consecutive Approvals Achieved!</span>
            </div>
            <div className="cycle-stars">
              {[1, 2, 3].map((n) => (
                <div key={n} className="star">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="workflow-legend">
          <div className="legend-item">
            <div className="legend-dot pending" />
            <span>Pending</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot active" />
            <span>In Progress</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot approved" />
            <span>Approved</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot rejected" />
            <span>Rejected</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot modified" />
            <span>Modified</span>
          </div>
        </div>
      </div>

      {/* Replay Button */}
      <div className="workflow-controls">
        <button className="replay-btn" onClick={cycleToNextScenario}>
          <span>Next Scenario</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </section>
  );
};