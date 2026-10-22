import React, {
  useRef,
  useEffect,
  useState,
} from 'react';
import * as THREE from 'three';
import {
  Landmark,
  FlaskConical,
  Sprout,
  BookOpen,
  Users,
  ShieldCheck,
  MessageSquare,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import './knowledge-river.css';

/* ─── 7 Knowledge Source Verticals ─────────────────────────────────────── */
interface VerticalSource {
  id: string;
  label: string;
  sub: string;
  stat: string;
  Icon: React.FC<{ size?: number; color?: string }>;
  xPct: number; // horizontal placement %
  yPct: number; // vertical placement %
  color: string;
}

const VERTICALS: VerticalSource[] = [
  {
    id: 'gov',
    label: 'Government schemes',
    sub: 'Policy, subsidies & national guidelines',
    stat: '450+ Schemes',
    Icon: Landmark,
    xPct: 6,
    yPct: 18,
    color: '#e2be6e',
  },
  {
    id: 'icar',
    label: 'ICAR research',
    sub: 'Scientific papers & field advisories',
    stat: '100+ Institutes',
    Icon: FlaskConical,
    xPct: 20,
    yPct: 14,
    color: '#65c496',
  },
  {
    id: 'kvk',
    label: 'KVKs & observations',
    sub: 'Real-time ground station advisories',
    stat: '731 KVKs',
    Icon: Sprout,
    xPct: 34,
    yPct: 22,
    color: '#76d6a2',
  },
  {
    id: 'research',
    label: 'Research institutions',
    sub: 'Peer-reviewed agronomy & soil studies',
    stat: '126 Zones',
    Icon: BookOpen,
    xPct: 48,
    yPct: 12,
    color: '#84b8f0',
  },
  {
    id: 'experts',
    label: 'Experts & scientists',
    sub: 'Verified domain specialists & agronomists',
    stat: '70,741 Refined',
    Icon: Users,
    xPct: 62,
    yPct: 16,
    color: '#f0b078',
  },
  {
    id: 'sau',
    label: 'SAUs & institutions',
    sub: 'State Agricultural Universities network',
    stat: '70+ SAUs',
    Icon: ShieldCheck,
    xPct: 76,
    yPct: 20,
    color: '#d48cf0',
  },
  {
    id: 'conversations',
    label: 'Farmer conversations',
    sub: 'Multilingual ground voice & text queries',
    stat: '45M+ Collected',
    Icon: MessageSquare,
    xPct: 90,
    yPct: 24,
    color: '#f49494',
  },
];

export const KnowledgeRiverThree: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const convergenceRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [activeVertical, setActiveVertical] = useState<string | null>(null);

  // Three.js scene refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const streamsGroupRef = useRef<THREE.Group | null>(null);
  const particleSystemsRef = useRef<{
    particles: THREE.Points;
    curve: THREE.CatmullRomCurve3;
    curveSamples: THREE.Vector3[];
    speed: number;
  }[]>([]);
  const animFrameIdRef = useRef<number | null>(null);
  const scrollRatioRef = useRef(0);
  const activeVerticalRef = useRef<string | null>(null);
  // Whether the section is in the viewport — rAF is paused when false
  const isVisibleRef = useRef(false);

  useEffect(() => {
    activeVerticalRef.current = activeVertical;
  }, [activeVertical]);

  // Scroll listener for section progress — updates DOM nodes directly via refs (0 React re-renders)
  useEffect(() => {
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId) return; // already scheduled
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const windowH = window.innerHeight;
        const totalH = rect.height;
        const scrolled = windowH - rect.top;
        const p = Math.max(0, Math.min(1, scrolled / (totalH + windowH * 0.4)));
        scrollRatioRef.current = p;

        // Apply visual updates directly to DOM styles to eliminate layout thrashing & virtual DOM diffing
        if (convergenceRef.current) {
          convergenceRef.current.style.opacity = String(Math.min(1, p * 1.5));
          convergenceRef.current.style.transform = `translateY(${(1 - p) * 20}px)`;
        }
        if (ctaRef.current) {
          ctaRef.current.style.opacity = String(Math.min(1, Math.max(0, (p - 0.25) * 1.8)));
          ctaRef.current.style.transform = `translateY(${Math.max(0, (0.6 - p) * 40)}px)`;
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06140b, 0.015);
    sceneRef.current = scene;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.set(0, 15, 38);
    camera.lookAt(0, -2, 0);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // antialias is expensive; visual difference minimal at this scale
      alpha: true,
      powerPreference: 'default',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap at 1.5x, not 2x
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0x0a2416, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xe8d28a, 1.2);
    dirLight.position.set(10, 30, 20);
    scene.add(dirLight);

    const mainGlowLight = new THREE.PointLight(0xf0d27b, 4, 60);
    mainGlowLight.position.set(0, -10, 0);
    scene.add(mainGlowLight);

    // 5. River Streams Construction
    const streamsGroup = new THREE.Group();
    scene.add(streamsGroup);
    streamsGroupRef.current = streamsGroup;

    // Define 3D 7 Stream Origin X coordinates spanning across -28 to +28
    const startXPositions = [-26, -17, -9, 0, 9, 17, 26];

    // Main convergence target point at bottom center (x:0, y:-12, z:-2)
    const convergencePoint = new THREE.Vector3(0, -12, -2);

    particleSystemsRef.current = [];

    // Particle texture canvas creator
    const createParticleTexture = () => {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = 64;
      pCanvas.height = 64;
      const ctx = pCanvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255, 245, 200, 1)');
        grad.addColorStop(0.3, 'rgba(240, 210, 123, 0.8)');
        grad.addColorStop(0.7, 'rgba(100, 200, 150, 0.25)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
      }
      return new THREE.CanvasTexture(pCanvas);
    };

    const particleTex = createParticleTexture();
    // Optimize texture parameters to avoid mipmap generation overhead
    particleTex.generateMipmaps = false;
    particleTex.minFilter = THREE.LinearFilter;

    VERTICALS.forEach((vert, i) => {
      const startX = startXPositions[i];
      const startY = 16 - Math.abs(startX * 0.12); // subtle arch
      const startZ = 2;

      // Create smooth CatmullRom 3D Curve from top start position to central convergence
      const mid1 = new THREE.Vector3(
        startX * 0.75,
        startY - 7,
        Math.sin(i * 1.2) * 4 - 2
      );
      const mid2 = new THREE.Vector3(
        startX * 0.35,
        startY - 18,
        Math.cos(i * 0.8) * 3 - 2
      );

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, startY, startZ),
        mid1,
        mid2,
        convergencePoint,
      ]);

      // Pre-sample points along the curve for fast lookup (prevents O(N) getPoint computation inside frame loop)
      const samplesCount = 200;
      const curveSamples: THREE.Vector3[] = [];
      for (let s = 0; s <= samplesCount; s++) {
        curveSamples.push(curve.getPoint(s / samplesCount));
      }

      // Tube Geometry for main river path (Optimized segments)
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.45, 6, false);

      const streamMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(vert.color),
        emissive: new THREE.Color(vert.color),
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 0.65,
        side: THREE.FrontSide, // FrontSide only is twice as light as DoubleSide
      });

      const tubeMesh = new THREE.Mesh(tubeGeo, streamMat);
      tubeMesh.userData = { id: vert.id, baseEmissive: 0.6 };
      streamsGroup.add(tubeMesh);

      // Flowing glowing particle system along the curve
      const pCount = 40; // reduced from 90 — same visual, half the GPU buffer updates
      const pGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(pCount * 3);

      for (let p = 0; p < pCount; p++) {
        const t = (p / pCount);
        const pt = curveSamples[Math.floor(t * samplesCount)];
        positions[p * 3] = pt.x;
        positions[p * 3 + 1] = pt.y;
        positions[p * 3 + 2] = pt.z;
      }

      pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const pMat = new THREE.PointsMaterial({
        size: 1.6,
        map: particleTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        color: new THREE.Color(vert.color),
      });

      const particles = new THREE.Points(pGeo, pMat);
      streamsGroup.add(particles);

      particleSystemsRef.current.push({
        particles,
        curve,
        curveSamples,
        speed: 0.0025 + (i % 3) * 0.0008,
      });
    });

    // 6. Main Merged Saturated River (below convergence point)
    const mergedCurve = new THREE.CatmullRomCurve3([
      convergencePoint,
      new THREE.Vector3(0, -18, -4),
      new THREE.Vector3(0, -26, -6),
    ]);

    const mergedGeo = new THREE.TubeGeometry(mergedCurve, 32, 2.2, 8, false);
    const mergedMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f0d27b'),
      emissive: new THREE.Color('#e8c050'),
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.85,
      roughness: 0.1,
    });
    const mergedTube = new THREE.Mesh(mergedGeo, mergedMat);
    streamsGroup.add(mergedTube);

    // Merged main river glowing particle burst
    const mPCount = 80; // reduced from 200
    const mPGeo = new THREE.BufferGeometry();
    const mPositions = new Float32Array(mPCount * 3);
    for (let p = 0; p < mPCount; p++) {
      const t = p / mPCount;
      const pt = mergedCurve.getPoint(t);
      mPositions[p * 3] = pt.x + (Math.random() - 0.5) * 2;
      mPositions[p * 3 + 1] = pt.y + (Math.random() - 0.5) * 1.5;
      mPositions[p * 3 + 2] = pt.z + (Math.random() - 0.5) * 2;
    }
    mPGeo.setAttribute('position', new THREE.BufferAttribute(mPositions, 3));

    const mPMat = new THREE.PointsMaterial({
      size: 2.2,
      map: particleTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color('#ffe896'),
    });
    const mergedParticles = new THREE.Points(mPGeo, mPMat);
    streamsGroup.add(mergedParticles);

    // 7. Animation Loop — paused automatically when section leaves viewport
    const clock = new THREE.Clock();
    let isLoopRunning = false;
    let prevActiveVertical: string | null = null;

    const animate = () => {
      if (!isVisibleRef.current) {
        isLoopRunning = false;
        return;
      }
      isLoopRunning = true;
      animFrameIdRef.current = requestAnimationFrame(animate);

      const time = clock.getElapsedTime();
      const pRatio = scrollRatioRef.current;

      // Scroll camera rotation & height shift
      if (cameraRef.current) {
        cameraRef.current.position.y = 15 - pRatio * 10;
        cameraRef.current.position.z = 38 - pRatio * 8;
        cameraRef.current.lookAt(0, -4 - pRatio * 6, 0);
      }

      // Gentle river group sway
      if (streamsGroupRef.current) {
        streamsGroupRef.current.rotation.y = Math.sin(time * 0.3) * 0.04;
      }

      // Animate particles flowing along each vertical curve using lookup table
      particleSystemsRef.current.forEach(({ particles, curveSamples, speed }, idx) => {
        const vertId = VERTICALS[idx]?.id;
        const isActive = activeVerticalRef.current === vertId;
        const currentSpeed = isActive ? speed * 2.8 : speed;

        const posAttr = particles.geometry.attributes.position as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const count = arr.length / 3;
        const samplesCount = curveSamples.length - 1;

        for (let p = 0; p < count; p++) {
          const t = (p / count + time * currentSpeed) % 1;

          // Fast linear interpolation over pre-sampled curve coordinates
          const tScaled = t * samplesCount;
          const sampleIdx = Math.floor(tScaled);
          const frac = tScaled - sampleIdx;
          const p1 = curveSamples[sampleIdx];
          const p2 = curveSamples[Math.min(samplesCount, sampleIdx + 1)] || p1;

          const pX = p1.x + (p2.x - p1.x) * frac;
          const pY = p1.y + (p2.y - p1.y) * frac;
          const pZ = p1.z + (p2.z - p1.z) * frac;

          // Add slight organic swirl offset
          const swirl = Math.sin(time * 3 + p) * 0.3;
          arr[p * 3] = pX + swirl * 0.4;
          arr[p * 3 + 1] = pY;
          arr[p * 3 + 2] = pZ + swirl * 0.3;
        }

        posAttr.needsUpdate = true;
      });

      // Highlight tube material when hovered - update uniform only on active vertical change
      const currentActive = activeVerticalRef.current;
      if (streamsGroupRef.current && currentActive !== prevActiveVertical) {
        streamsGroupRef.current.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.userData?.id) {
            const mat = child.material as THREE.MeshStandardMaterial;
            const isHov = currentActive === child.userData.id;
            mat.emissiveIntensity = isHov ? 1.8 : 0.65;
            mat.opacity = isHov ? 0.95 : 0.65;
          }
        });
        prevActiveVertical = currentActive;
      }

      renderer.render(scene, camera);
    };

    // 8. IntersectionObserver — stop rAF work completely when section is off-screen
    const io = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting && !isLoopRunning) {
          animate();
        }
      },
      { threshold: 0 },
    );
    io.observe(container);

    // 9. Resize Observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      ro.disconnect();
      io.disconnect();
      // Cleanup geometries & materials to avoid WebGL memory leaks
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      particleTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <section className="knowledge-river-section" id="knowledge" ref={containerRef}>
      {/* Three.js Canvas Background */}
      <canvas ref={canvasRef} className="knowledge-river-canvas" aria-hidden="true" />

      {/* Atmospheric Overlays */}
      <div className="kr-overlay-vignette" />
      <div className="kr-overlay-grid" />

      <div className="page-shell kr-content-shell">
        {/* Section Header */}
        <div className="kr-header">
          <div className="kr-eyebrow">
            <Sparkles size={13} color="#f0d27b" />
            <span>KNOWLEDGE ORIGIN · 7 VERTICAL SOURCES</span>
          </div>
          <h2 className="kr-title">
            The Flow of <em>Agricultural Wisdom</em>
          </h2>
          <p className="kr-subtitle">
            Hover each vertical source to watch how research, field extension, government policy, and farmer conversations converge into one unified intelligence engine.
          </p>
        </div>

        {/* 7 Vertical Badges Field (Top Arch Layout) */}
        <div className="kr-source-field" aria-label="Knowledge Sources Verticals">
          {VERTICALS.map((vert) => {
            const { id, label, sub, stat, Icon, xPct, yPct, color } = vert;
            const isSelected = activeVertical === id;

            return (
              <div
                key={id}
                className={`kr-source-node${isSelected ? ' kr-source-node--active' : ''}`}
                style={{
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  '--node-accent': color,
                } as React.CSSProperties}
                onMouseEnter={() => setActiveVertical(id)}
                onMouseLeave={() => setActiveVertical(null)}
              >
                <div className="kr-source-pill">
                  <span className="kr-source-icon">
                    <Icon size={16} />
                  </span>
                  <div className="kr-source-info">
                    <strong>{label}</strong>
                    <small>{stat}</small>
                  </div>
                </div>

                {/* Popover Detail Card on Hover */}
                {isSelected && (
                  <div className="kr-source-popover">
                    <div className="kr-popover-header">
                      <Icon size={14} color={color} />
                      <span>{label}</span>
                    </div>
                    <p>{sub}</p>
                    <div className="kr-popover-badge">Active Flowing Channel</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stream Convergence Flow Indicator */}
        <div
          ref={convergenceRef}
          className="kr-convergence-indicator"
          style={{
            opacity: 0,
            transform: "translateY(20px)",
          }}
        >
          <div className="kr-pulse-ring" />
          <span>7 VERTICALS CONVERGING INTO ONE GOLDEN DATABASE</span>
        </div>

        {/* Final CTA Card (Appears at River Convergence Point) */}
        <div
          ref={ctaRef}
          className="kr-final-cta-card"
          style={{
            opacity: 0,
            transform: "translateY(40px)",
          }}
        >
          <div className="kr-cta-eyebrow">
            <span className="kr-cta-dot" />
            <span>KNOWLEDGE ORIGIN · OUR FOUNDATION</span>
          </div>

          <h3 className="kr-cta-headline">
            From thousands of sources.<br />
            <em>One trusted.</em>
          </h3>

          <p className="kr-cta-body">
            Empowering every farmer, researcher, and extension agent with real-time, verified agricultural intelligence — compiled continuously from ICAR, KVKs, SAUs, and national policy.
          </p>

          <a
            className="kr-cta-button"
            href="https://chat.annam.ai/"
            target="_blank"
            rel="noopener noreferrer"
            id="knowledge-river-start-asking"
          >
            <span>Start Asking</span>
            <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
};

export default KnowledgeRiverThree;
