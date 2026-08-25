import React, { useState } from "react";
import { ChevronLeft, MapPin, Users, CheckCircle, ArrowRight } from "lucide-react";

interface Story {
  id: number;
  place: string;
  region: string;
  title: string;
  body: string;
  reach: string;
  outcome: string;
  tag: string;
  gradient: string;
}

const STORIES: Story[] = [
  {
    id: 1,
    place: "Godavari Basin, Andhra Pradesh",
    region: "Southern Agricultural Corridor",
    title: "Early Paddy Blast Warning & Microbial Bio-Control",
    body: "When satellite humidity indices flagged outbreak risks across 4,200 paddy hectares, local field experts dispatched verified bio-pesticide formulations directly over WhatsApp voice messages in Telugu.",
    reach: "4,200+",
    outcome: "1,150",
    tag: "Crop Protection",
    gradient: "linear-gradient(135deg, #0c3a2a 0%, #245d43 100%)",
  },
  {
    id: 2,
    place: "Vidarbha Region, Maharashtra",
    region: "Central Cotton Belt",
    title: "Cotton Pink Bollworm Pheromone Trap Alert",
    body: "Automated phone IVR in Marathi alerted 8,500 cotton growers to deploy pheromone lures 7 days prior to moth emergence, averting crop loss across 12,000 acres.",
    reach: "8,500+",
    outcome: "3,200",
    tag: "Pest Prevention",
    gradient: "linear-gradient(135deg, #061923 0%, #0c3a2a 100%)",
  },
  {
    id: 3,
    place: "Malwa Region, Punjab",
    region: "Northern Grain Granary",
    title: "Micro-Irrigation & Tensiometer Scheduling",
    body: "Precision soil moisture sensor advisories reduced canal water consumption by 32% while boosting wheat grain weight by 4.8 quintals per hectare.",
    reach: "3,100+",
    outcome: "980",
    tag: "Water Conservation",
    gradient: "linear-gradient(135deg, #173326 0%, #245d43 100%)",
  },
];

export const OutreachCarousel: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const prevStory = () => {
    setCurrentIndex((prev) => (prev === 0 ? STORIES.length - 1 : prev - 1));
  };

  const nextStory = () => {
    setCurrentIndex((prev) => (prev === STORIES.length - 1 ? 0 : prev + 1));
  };

  const current = STORIES[currentIndex];

  return (
    <div
      style={{
        background: current.gradient,
        borderRadius: "24px",
        padding: "clamp(1.25rem, 4vw, 2.5rem)",
        color: "#f2efe5",
        position: "relative",
        boxShadow: "0 24px 64px rgba(12, 58, 42, 0.2)",
        border: "1px solid rgba(140, 172, 130, 0.3)",
        transition: "background 0.5s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f0d27b", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <MapPin size={16} />
          <span>{current.place}</span>
        </div>
        <span style={{ background: "rgba(212, 172, 87, 0.2)", color: "#f0d27b", border: "1px solid #d4ac57", padding: "4px 14px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: 600 }}>
          {current.tag}
        </span>
      </div>

      <h3 style={{ fontSize: "clamp(1.3rem, 3.5vw, 1.8rem)", fontWeight: 700, color: "#faf8f1", marginBottom: "1rem", lineHeight: 1.3 }}>
        {current.title}
      </h3>

      <p style={{ fontSize: "clamp(0.9rem, 2vw, 1.05rem)", color: "rgba(242, 239, 229, 0.88)", lineHeight: 1.6, marginBottom: "2rem", maxWidth: "100%" }}>
        {current.body}
      </p>

      {/* Metrics Row */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.06)", padding: "0.8rem 1.25rem", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.1)", flex: "1 1 min(180px, 100%)" }}>
          <Users size={20} color="#9bd9cd" />
          <div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#faf8f1" }}>{current.reach}</div>
            <div style={{ fontSize: "0.75rem", color: "rgba(242,239,229,0.7)" }}>Farmers Reached</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.06)", padding: "0.8rem 1.25rem", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.1)", flex: "1 1 min(180px, 100%)" }}>
          <CheckCircle size={20} color="#f0d27b" />
          <div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#faf8f1" }}>{current.outcome}</div>
            <div style={{ fontSize: "0.75rem", color: "rgba(242,239,229,0.7)" }}>Actions Completed</div>
          </div>
        </div>
      </div>

      {/* Navigation Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(242, 239, 229, 0.15)", paddingTop: "1.5rem", flexWrap: "wrap", gap: "14px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {STORIES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              style={{
                width: idx === currentIndex ? "32px" : "10px",
                height: "10px",
                borderRadius: "5px",
                background: idx === currentIndex ? "#d4ac57" : "rgba(242, 239, 229, 0.3)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={prevStory}
            aria-label="Previous story"
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#faf8f1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.2s ease",
            }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={nextStory}
            style={{
              padding: "0 1.1rem",
              height: "42px",
              borderRadius: "21px",
              background: "#d4ac57",
              border: "none",
              color: "#061923",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
              transition: "transform 0.2s ease",
            }}
          >
            <span>Next Story</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OutreachCarousel;
