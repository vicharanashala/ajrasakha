import React, { useState } from "react";
import { CheckCircle2, ShieldCheck, Award, Layers, ChevronRight, UserCheck } from "lucide-react";

interface StageInfo {
  id: number;
  kicker: string;
  label: string;
  body: string;
  reviewers: string[];
  badge: string;
  badgeType: "reviewer" | "moderator" | "consensus" | "golden";
  metrics: { label: string; value: string }[];
}

const STAGES: StageInfo[] = [
  {
    id: 1,
    kicker: "Stage 01 · Peer Review",
    label: "Field Agronomist Verification",
    body: "4 regional field agronomists evaluate incoming questions and claims against ground agronomy protocols and local soil condition reports.",
    reviewers: ["Reviewer 1 (Punjab)", "Reviewer 2 (Maharashtra)", "Reviewer 3 (Karnataka)", "Reviewer 4 (UP)"],
    badge: "Verified",
    badgeType: "reviewer",
    metrics: [
      { label: "Accuracy Target", value: "99.4%" },
      { label: "Avg SLA", value: "< 4 mins" },
    ],
  },
  {
    id: 2,
    kicker: "Stage 02 · Institutional Approval",
    label: "ICAR & KVK Specialist Moderation",
    body: "Senior Subject Matter Specialists at Krishi Vigyan Kendra validate recommendations for chemical dosages, pest advisories, and weather alerts.",
    reviewers: ["KVK Specialist A", "ICAR Agronomist B", "Nodal Director C"],
    badge: "Moderator Approval",
    badgeType: "moderator",
    metrics: [
      { label: "Institutional Signoffs", value: "1,030+" },
      { label: "Conflict Rate", value: "0.02%" },
    ],
  },
  {
    id: 3,
    kicker: "Stage 03 · Cross-Discipline Consensus",
    label: "Multi-modal AI & Expert Consensus",
    body: "Algorithmic safety rails cross-check historical disease databases, remote sensing vegetation indices (NDVI), and expert consensus scores.",
    reviewers: ["AI Safety Mesh", "Soil Health Engine", "Pest Model"],
    badge: "Consensus Reached",
    badgeType: "consensus",
    metrics: [
      { label: "Cross-Checks", value: "12 Sources" },
      { label: "Safety Score", value: "100/100" },
    ],
  },
  {
    id: 4,
    kicker: "Stage 04 · National Repository",
    label: "Golden Database Commitment",
    body: "Approved intelligence is published to the national Golden Database for instant zero-latency query response across web, WhatsApp, and voice IVR.",
    reviewers: ["National Knowledge Core"],
    badge: "Golden Database",
    badgeType: "golden",
    metrics: [
      { label: "Trusted Datasets", value: "3.2M+" },
      { label: "Active Sync", value: "Realtime" },
    ],
  },
];

export const ReviewWorkflow: React.FC = () => {
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const activeStage = STAGES[activeStageIndex];

  return (
    <div className="review-workflow-container" style={{ padding: "3rem 0" }}>
      {/* Stepper buttons */}
      <div className="review-progress" style={{ display: "flex", gap: "0.75rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        {STAGES.map((stage, idx) => {
          const isActive = idx === activeStageIndex;
          const isPassed = idx < activeStageIndex;
          return (
            <button
              key={stage.id}
              onClick={() => setActiveStageIndex(idx)}
              style={{
                flex: "1 1 min(160px, 45%)",
                padding: "0.85rem 1rem",
                borderRadius: "14px",
                border: isActive
                  ? "1px solid #d4ac57"
                  : isPassed
                  ? "1px solid rgba(140, 172, 130, 0.4)"
                  : "1px solid rgba(23, 51, 38, 0.12)",
                background: isActive
                  ? "linear-gradient(135deg, rgba(12, 58, 42, 0.95), rgba(6, 25, 35, 0.95))"
                  : "rgba(250, 248, 241, 0.7)",
                color: isActive ? "#faf8f1" : "#173326",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.3s ease",
                boxShadow: isActive ? "0 12px 32px rgba(12, 58, 42, 0.25)" : "none",
              }}
            >
              <div style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.25rem", fontWeight: 600 }}>
                STAGE 0{stage.id}
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{stage.label.split(" ")[0]} {stage.label.split(" ")[1] || ""}</span>
                {isPassed && <CheckCircle2 size={16} color="#8cac82" />}
                {isActive && <ChevronRight size={16} color="#d4ac57" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main active stage content grid */}
      <div
        className="review-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
          gap: "1.5rem",
          background: "linear-gradient(145deg, #0c3a2a, #061923)",
          color: "#f2efe5",
          padding: "clamp(1.25rem, 4vw, 2.5rem)",
          borderRadius: "24px",
          boxShadow: "0 24px 64px rgba(6, 25, 35, 0.3)",
          border: "1px solid rgba(212, 172, 87, 0.3)",
        }}
      >
        {/* Left Copy */}
        <div>
          <div className="stage-kicker" style={{ color: "#f0d27b", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            {activeStage.kicker}
          </div>
          <h3 style={{ fontSize: "clamp(1.3rem, 3.5vw, 1.75rem)", color: "#faf8f1", marginBottom: "1rem", fontWeight: 700 }}>
            {activeStage.label}
          </h3>
          <p style={{ color: "rgba(242, 239, 229, 0.85)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            {activeStage.body}
          </p>

          {/* Stage badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(212, 172, 87, 0.15)", border: "1px solid #d4ac57", padding: "8px 16px", borderRadius: "30px", color: "#f0d27b", fontWeight: 600, fontSize: "0.85rem" }}>
            {activeStage.badgeType === "reviewer" && <UserCheck size={18} />}
            {activeStage.badgeType === "moderator" && <ShieldCheck size={18} />}
            {activeStage.badgeType === "consensus" && <Layers size={18} />}
            {activeStage.badgeType === "golden" && <Award size={18} />}
            <span>{activeStage.badge}</span>
          </div>
        </div>

        {/* Right Stage Node Cards & Metrics */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "1.25rem" }}>
          <div style={{ fontSize: "0.85rem", color: "#8cac82", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            Active Review Nodes & Verification
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {activeStage.reviewers.map((rev, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  padding: "0.75rem 1rem",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "0.9rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#9bd9cd" }} />
                  <span>{rev}</span>
                </div>
                <span style={{ fontSize: "0.75rem", background: "rgba(140, 172, 130, 0.2)", color: "#9bd9cd", padding: "3px 10px", borderRadius: "12px", fontWeight: 600 }}>
                  Active
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.75rem", marginTop: "0.5rem" }}>
            {activeStage.metrics.map((m, i) => (
              <div key={i} style={{ background: "rgba(36, 93, 67, 0.3)", padding: "0.85rem", borderRadius: "14px", border: "1px solid rgba(140, 172, 130, 0.2)" }}>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#faf8f1" }}>{m.value}</div>
                <div style={{ fontSize: "0.75rem", color: "rgba(242, 239, 229, 0.7)" }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewWorkflow;
