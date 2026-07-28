import React, { useState, useEffect, useRef } from "react";
import { SVGIndiaMap } from "./IndiaCoverageMap";

export const OrbCanvas: React.FC = () => {
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [glarePos, setGlarePos] = useState({ x: 35, y: 30 });
  const [pulseCount, setPulseCount] = useState(13479);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      setPulseCount((prev) => prev + Math.floor(Math.random() * 3) + 1);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Mouse move handler for interactive 3D spherical tilt & specular glass glare position
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const relX = (e.clientX - centerX) / (rect.width / 2);
    const relY = (e.clientY - centerY) / (rect.height / 2);

    if (isDragging.current) {
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      setRotation((prev) => ({
        x: Math.max(-25, Math.min(25, prev.x + dy * 0.14)),
        y: Math.max(-40, Math.min(40, prev.y + dx * 0.14)),
      }));
      startPos.current = { x: e.clientX, y: e.clientY };
    } else {
      // Interactive 3D spherical tilt
      setRotation({
        x: -relY * 20, // Vertical 3D rotation
        y: relX * 28,  // Horizontal 3D rotation
      });
    }

    // Dynamic specular glare position tracking mouse cursor across glass sphere surface
    const glareX = Math.max(15, Math.min(85, 50 + relX * 35));
    const glareY = Math.max(15, Math.min(85, 50 + relY * 35));
    setGlarePos({ x: glareX, y: glareY });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    isDragging.current = false;
    setRotation({ x: 0, y: 0 });
    setGlarePos({ x: 35, y: 30 });
  };

  return (
    <div
      ref={containerRef}
      className={`hero-orb-interactive-shell ${isHovered ? "hovered" : ""}`}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        userSelect: "none",
        cursor: isDragging.current ? "grabbing" : "grab",
        perspective: "1200px",
        transformStyle: "preserve-3d",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Background Radial Glow Ring */}
      <div
        className="orb-glow-ring"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "82%",
          height: "82%",
          borderRadius: "50%",
          transform: "translate(-50%, -50%) translateZ(-30px)",
          background: isHovered
            ? "radial-gradient(circle, rgba(231, 213, 129, 0.32) 0%, rgba(36, 93, 67, 0.28) 45%, transparent 75%)"
            : "radial-gradient(circle, rgba(231, 213, 129, 0.14) 0%, rgba(36, 93, 67, 0.12) 50%, transparent 75%)",
          transition: "background 0.5s ease, transform 0.5s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* 1. Base 3D Glass Sphere Image */}
      <img
        src="/assets/india-orb-glass.png"
        alt="3D Agricultural Intelligence Globe"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          pointerEvents: "none",
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) translateZ(0px) scale(${isHovered ? 1.04 : 1})`,
          transformStyle: "preserve-3d",
          transition: isDragging.current ? "none" : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), filter 0.4s ease",
          filter: isHovered
            ? "drop-shadow(0 0 40px rgba(155, 217, 205, 0.5)) drop-shadow(0 35px 95px rgba(13, 46, 31, 0.4))"
            : "drop-shadow(0 30px 80px rgba(13,46,31,0.22))",
          zIndex: 1,
        }}
      />

      {/* 2. Specular Glass Glare Sheen (Glides dynamically across spherical surface) */}
      <div
        className="orb-glass-sheen"
        style={{
          position: "absolute",
          top: "14%",
          left: "14%",
          width: "72%",
          height: "72%",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 2,
          transform: `rotateX(${rotation.x * 1.1}deg) rotateY(${rotation.y * 1.1}deg) translateZ(25px)`,
          background: isHovered
            ? `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255, 255, 255, 0.48) 0%, rgba(255, 255, 255, 0.12) 35%, transparent 68%)`
            : "radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.28) 0%, transparent 60%)",
          boxShadow: isHovered
            ? "inset 0 -24px 40px rgba(6, 25, 35, 0.4), inset 0 16px 30px rgba(255, 255, 255, 0.35)"
            : "inset 0 -15px 30px rgba(6, 25, 35, 0.25)",
          transition: isDragging.current ? "none" : "transform 0.25s ease-out, background 0.25s ease-out",
        }}
      />

      {/* 3. Standing Golden SVG India Map Overlay (Floats in 3D Space at +50px depth) */}
      <div
        className="orb-map"
        style={{
          transform: `rotateX(${rotation.x * 0.9}deg) rotateY(${rotation.y * 0.9}deg) translateZ(${isHovered ? "55px" : "35px"}) scale(${isHovered ? 1.06 : 1})`,
          transformStyle: "preserve-3d",
          transition: isDragging.current ? "none" : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), filter 0.4s ease",
          filter: isHovered
            ? "drop-shadow(0 0 32px rgba(240, 210, 123, 0.95)) drop-shadow(0 14px 35px rgba(0,0,0,0.35))"
            : "drop-shadow(0 0 18px rgba(231,213,129,.38))",
          zIndex: 3,
        }}
      >
        <SVGIndiaMap
          fillColor={isHovered ? "#f5e492" : "#e7d581"}
          strokeColor={isHovered ? "#d4ac57" : "#c4a54c"}
          strokeWidth={0.55}
          selectedColor="#f1df96"
          hoverColor="#fff4c4"
          selectedStateKey="Punjab"
        />
      </div>

      {/* 4. Top-Right Floating Pulse Card (Floats at +80px Z-depth) */}
      <div
        className="pulse-card"
        style={{
          transform: `rotateX(${rotation.x * 0.5}deg) rotateY(${rotation.y * 0.5}deg) translateZ(80px) scale(${isHovered ? 1.03 : 1})`,
          transition: "transform 0.25s ease-out, box-shadow 0.3s ease",
          boxShadow: isHovered
            ? "0 28px 90px rgba(18, 53, 35, 0.35)"
            : "0 24px 80px rgba(18, 53, 35, 0.19)",
          zIndex: 5,
        }}
      >
        <span>
          <i className="live-dot" /> LIVE KNOWLEDGE PULSE
        </span>
        <strong>{pulseCount.toLocaleString("en-IN")}</strong>
        <small>validated updates today</small>
      </div>

      {/* 5. Bottom-Right Floating Pill Badge (Floats at +65px Z-depth) */}
      <div
        className="orb-label"
        style={{
          transform: `rotateX(${rotation.x * 0.4}deg) rotateY(${rotation.y * 0.4}deg) translateZ(65px) scale(${isHovered ? 1.03 : 1})`,
          transition: "transform 0.25s ease-out",
          zIndex: 4,
        }}
      >
        <span className="live-dot" />
        <span>India</span>
        <strong>Live knowledge pulse</strong>
      </div>

      {/* 6. Interactive Subtext Label */}
      <div
        className="orb-ring-label"
        style={{
          color: isHovered ? "rgba(12, 58, 42, 0.95)" : "rgba(23, 51, 38, 0.54)",
          transition: "color 0.3s ease, letter-spacing 0.3s ease",
          letterSpacing: isHovered ? "0.14em" : "0.11em",
        }}
      >
        {isHovered ? "DRAG OR TILT TO EXPLORE 3D VIEW" : "DRAG TO EXPLORE"}
      </div>
    </div>
  );
};

export default OrbCanvas;
