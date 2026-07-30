import React from "react";
import { FlaskConical, Users, GraduationCap, Sprout, Landmark } from "lucide-react";

export const HeroNetwork: React.FC = () => {
  // Exact node target coordinates in a 1000x650 ViewBox / percentage space:
  // Farmer Phone Source: (520, 390) [Center-Chest of farmer]
  // Node 1 (Scientist): (160, 95) [16% left, 14.6% top]
  // Node 2 (Expert): (480, 50) [48% left, 7.7% top]
  // Node 3 (University): (800, 95) [80% left, 14.6% top]
  // Node 4 (Worker): (850, 320) [85% left, 49.2% top]
  // Node 5 (Government): (720, 530) [72% left, 81.5% top]

  const nodes = [
    {
      id: "scientist",
      title: "SCIENTISTS",
      subtitle: "Research. Innovate. Solve.",
      icon: FlaskConical,
      img: "/assets/hero-scientist.jpg",
      path: "M 520 390 C 380 300, 240 180, 160 95",
      dur: "2.4s",
      x: 160,
      y: 95,
      left: "16%",
      top: "14.6%",
      textClass: "node-text-left",
    },
    {
      id: "expert",
      title: "EXPERTS",
      subtitle: "Domain knowledge. Field experience.",
      icon: Users,
      img: "/assets/hero-expert.jpg",
      path: "M 520 390 C 500 250, 490 130, 480 50",
      dur: "2.1s",
      x: 480,
      y: 50,
      left: "48%",
      top: "7.7%",
      textClass: "node-text-right",
    },
    {
      id: "university",
      title: "UNIVERSITIES & KVKs",
      subtitle: "Knowledge. Training. Innovation.",
      icon: GraduationCap,
      img: "/assets/hero-university.jpg",
      path: "M 520 390 C 640 280, 730 180, 800 95",
      dur: "2.6s",
      x: 800,
      y: 95,
      left: "80%",
      top: "14.6%",
      textClass: "node-text-right",
    },
    {
      id: "worker",
      title: "EXTENSION WORKERS",
      subtitle: "Guidance. Support. On-ground help.",
      icon: Sprout,
      img: "/assets/hero-worker.jpg",
      path: "M 520 390 C 660 390, 770 360, 850 320",
      dur: "2.3s",
      x: 850,
      y: 320,
      left: "85%",
      top: "49.2%",
      textClass: "node-text-right",
    },
    {
      id: "government",
      title: "GOVERNMENT AGENCIES",
      subtitle: "Policies. Schemes. Market & weather intelligence.",
      icon: Landmark,
      img: "/assets/hero-government.jpg",
      path: "M 520 390 C 400 430, 280 460, 180 480",
      dur: "2.5s",
      x: 180,
      y: 480,
      left: "18%",
      top: "73.8%",
      textClass: "node-text-left",
    },
  ];

  return (
    <div className="hero-network-wrap">
      {/* SVG Connections & Moving Light Particles */}
      <svg
        className="hero-network-svg"
        viewBox="0 0 1000 650"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Intense Golden Glow Filter */}
          <filter id="amberGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur1" />
            <feGaussianBlur stdDeviation="12" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Core White Hot Light Glow */}
          <filter id="coreLightGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Radial Sunburst at Farmer Phone */}
          <radialGradient id="phoneSunburst" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="25%" stopColor="#ffea9f" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#e5a720" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#d48c00" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Central Sunburst Glow behind farmer phone */}
        <circle cx="520" cy="390" r="120" fill="url(#phoneSunburst)" />

        {/* Render Curved Glowing Line Paths */}
        {nodes.map((node) => (
          <g key={`path-${node.id}`}>
            {/* 1. Deep Amber Outer Glow Line */}
            <path
              d={node.path}
              stroke="#e29b12"
              strokeWidth="8"
              strokeOpacity="0.45"
              fill="none"
              strokeLinecap="round"
              filter="url(#amberGlow)"
            />

            {/* 2. Vibrant Golden Mid Line */}
            <path
              d={node.path}
              stroke="#ffc83b"
              strokeWidth="4"
              strokeOpacity="0.9"
              fill="none"
              strokeLinecap="round"
            />

            {/* 3. White Core Line */}
            <path
              d={node.path}
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeOpacity="0.95"
              fill="none"
              strokeLinecap="round"
            />

            {/* Light Stream Particle 1 (Outward flow) */}
            <g>
              {/* Outer Golden Flare */}
              <circle r="11" fill="#ffd766" filter="url(#amberGlow)">
                <animateMotion
                  path={node.path}
                  dur={node.dur}
                  repeatCount="indefinite"
                />
              </circle>
              {/* Intense White Core */}
              <circle r="5" fill="#ffffff" filter="url(#coreLightGlow)">
                <animateMotion
                  path={node.path}
                  dur={node.dur}
                  repeatCount="indefinite"
                />
              </circle>
            </g>

            {/* Light Stream Particle 2 (Staggered offset) */}
            <g>
              <circle r="9" fill="#ffe082" filter="url(#amberGlow)">
                <animateMotion
                  path={node.path}
                  dur={node.dur}
                  begin="1.1s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle r="4" fill="#ffffff" filter="url(#coreLightGlow)">
                <animateMotion
                  path={node.path}
                  dur={node.dur}
                  begin="1.1s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>

            {/* Node Arrival Target Pulse Ring */}
            <circle
              cx={node.x}
              cy={node.y}
              r="14"
              fill="none"
              stroke="#ffd54f"
              strokeWidth="2"
              filter="url(#amberGlow)"
            >
              <animate
                attributeName="r"
                values="8;20;8"
                dur="2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.9;0.2;0.9"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
          </g>
        ))}

        {/* Central Phone Emitter Point */}
        <circle cx="520" cy="390" r="16" fill="#ffffff" filter="url(#amberGlow)">
          <animate
            attributeName="r"
            values="12;22;12"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="520" cy="390" r="8" fill="#fff5cb" />
      </svg>

      {/* Central Farmer Portrait Image */}
      <div className="farmer-hero-avatar">
        <img
          src="/assets/hero-farmer.jpg"
          alt="Farmer holding smartphone connected to network"
          className="farmer-image"
        />
      </div>

      {/* Render Floating Node Avatars & Labels */}
      {nodes.map((node) => {
        const IconComponent = node.icon;
        return (
          <div
            key={`node-${node.id}`}
            className={`network-node node-${node.id} ${node.textClass}`}
            style={{ left: node.left, top: node.top }}
          >
            <div className="node-avatar-wrap">
              <img src={node.img} alt={node.title} />
              <div className="node-icon-badge">
                <IconComponent size={14} />
              </div>
            </div>

            <div className="node-text">
              <strong>{node.title}</strong>
              <span>{node.subtitle}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HeroNetwork;
