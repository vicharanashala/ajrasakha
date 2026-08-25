import React, { useRef, useEffect, useState } from "react";
import {
  ShieldCheck,
  Award,
  Layers,
  Volume2,
  Cpu,
} from "lucide-react";

interface ReviewWorkflowCanvasProps {
  progress: number; // 0.0 to 1.0
  reviewStage: number; // 0 to 4
  onSelectStage?: (stageIdx: number) => void;
  totalFrames?: number; // Default 60, can be set to 120
}

const STAGE_LABELS = [
  "Question Submitted",
  "AI Enrichment",
  "Expert Peer Review",
  "Moderator Approval",
  "Golden Database",
];

export const ReviewWorkflowCanvas: React.FC<ReviewWorkflowCanvasProps> = ({
  progress,
  reviewStage,
  onSelectStage,
  totalFrames = 60,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const targetFrameRef = useRef(0);
  const currentFrameRef = useRef(0);
  const activeFrameIdxStateRef = useRef(0);

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

  // Construct frame paths (/assets/review-workflow/ezgif-frame-001.png ...)
  const framePaths = React.useMemo(() => {
    return Array.from({ length: totalFrames }, (_, i) => {
      const numStr = String(i + 1).padStart(3, "0");
      return `/assets/review-workflow/ezgif-frame-${numStr}.png`;
    });
  }, [totalFrames]);

  // Preload frame images
  useEffect(() => {
    let isCancelled = false;
    const loadedImages: HTMLImageElement[] = new Array(totalFrames);
    let count = 0;
    setIsLoaded(false);
    setLoadedCount(0);

    framePaths.forEach((path, idx) => {
      const img = new Image();
      img.src = path;
      img.onload = () => {
        if (isCancelled) return;
        loadedImages[idx] = img;
        count++;
        setLoadedCount(count);
        if (count === totalFrames) {
          imagesRef.current = loadedImages;
          setIsLoaded(true);
        }
      };
      img.onerror = () => {
        if (isCancelled) return;
        count++;
        setLoadedCount(count);
        if (count === totalFrames) {
          imagesRef.current = loadedImages;
          setIsLoaded(true);
        }
      };
    });

    return () => {
      isCancelled = true;
    };
  }, [framePaths, totalFrames]);

  // Update target frame based on scroll progress
  useEffect(() => {
    targetFrameRef.current = progress * (totalFrames - 1);
  }, [progress, totalFrames]);

  // Continuous RAF Render Loop with Lerp Smoothing
  useEffect(() => {
    if (!isLoaded) return;

    let animId: number;

    const renderLoop = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;

      if (canvas && container) {
        // Lerp interpolation (0.18 damping for liquid-smooth scrubbing)
        const diff = targetFrameRef.current - currentFrameRef.current;
        if (Math.abs(diff) > 0.005) {
          currentFrameRef.current += diff * 0.18;
        } else {
          currentFrameRef.current = targetFrameRef.current;
        }

        const frameIdx = Math.max(
          0,
          Math.min(totalFrames - 1, Math.round(currentFrameRef.current))
        );

        if (activeFrameIdxStateRef.current !== frameIdx) {
          activeFrameIdxStateRef.current = frameIdx;
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          const rect = container.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;

          if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
          }

          ctx.save();
          ctx.scale(dpr, dpr);

          const img = imagesRef.current[frameIdx];
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.clearRect(0, 0, rect.width, rect.height);

            // Cover math
            const scale = Math.max(
              rect.width / img.naturalWidth,
              rect.height / img.naturalHeight
            );

            const drawWidth = img.naturalWidth * scale;
            const drawHeight = img.naturalHeight * scale;
            const offsetX = (rect.width - drawWidth) / 2;
            const offsetY = (rect.height - drawHeight) / 2;

            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          }
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [isLoaded, totalFrames]);

  return (
    <div className="evo-scene-pane evo-canvas-container" ref={containerRef}>
      {/* Background ambient lighting */}
      <div className="evo-ground-glow" />
      <div className="evo-ground-line" />

      {/* Full-bleed HTML5 Canvas Frame Scrubber */}
      <canvas
        ref={canvasRef}
        className="evo-frame-canvas"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          objectFit: "cover",
        }}
      />

      {/* Frame Loading Spinner */}
      {!isLoaded && (
        <div className="evo-canvas-loader">
          <div className="evo-loader-spinner" />
          <span className="evo-loader-text">
            Caching Sequence ({Math.round((loadedCount / totalFrames) * 100)}%)
          </span>
        </div>
      )}



      {/* ── Bottom Dotted Pagination & Current Stage Indicator ── */}
      <div className="evo-canvas-bottom-pagination">
        <div className="evo-canvas-dots-row">
          {STAGE_LABELS.map((_, idx) => (
            <span
              key={idx}
              className={`evo-canvas-dot ${
                idx === reviewStage ? "on" : idx < reviewStage ? "past" : ""
              }`}
              onClick={() => onSelectStage?.(idx)}
              title={`Stage 0${idx + 1}: ${STAGE_LABELS[idx]}`}
            />
          ))}
        </div>
        <div className="evo-canvas-active-stage-tag">
          <span className="evo-tag-idx">0{reviewStage + 1}</span>
          <span className="evo-tag-name">{STAGE_LABELS[reviewStage]}</span>
        </div>
      </div>

      {/* ── Restored Stage Badges Overlay ── */}
      {reviewStage === 0 && (
        <div className="evo-badge-overlay evo-badge-stage0" key="badge-s0">
          <div className="evo-glass-card">
            <div className="evo-glass-header">
              <Volume2 size={16} className="evo-icon-pulse" />
              <span>Voice &amp; Text Query Intake Node</span>
            </div>
            <div className="evo-glass-tags">
              <span className="evo-tag">Multilingual Intake</span>
              <span className="evo-tag">Location &amp; Weather Context</span>
            </div>
          </div>
        </div>
      )}

      {reviewStage === 1 && (
        <div className="evo-badge-overlay evo-badge-stage1" key="badge-s1">
          <div className="evo-glass-card">
            <div className="evo-glass-header">
              <Cpu size={16} className="evo-icon-pulse" />
              <span>AI Enrichment &amp; Evidence Link</span>
            </div>
            <div className="evo-glass-tags">
              <span className="evo-tag">ACE Engine v2.4</span>
              <span className="evo-tag">ICAR / SAU Citations</span>
            </div>
          </div>
        </div>
      )}

      {reviewStage === 2 && (
        <div className="evo-badges-cluster" key="cluster-reviewer">
          <div className="reviewer-badge rb-tl">
            <ShieldCheck size={14} />
            <span>Reviewer 1 <small>Verified</small></span>
          </div>
          <div className="reviewer-badge rb-tr">
            <ShieldCheck size={14} />
            <span>Reviewer 2 <small>Verified</small></span>
          </div>
          <div className="reviewer-badge rb-bl">
            <ShieldCheck size={14} />
            <span>Reviewer 3 <small>Verified</small></span>
          </div>
          <div className="reviewer-badge rb-br">
            <ShieldCheck size={14} />
            <span>Reviewer 4 <small>Verified</small></span>
          </div>
        </div>
      )}

      {reviewStage === 3 && (
        <div className="moderator-badge evo-mod-badge" key="badge-mod">
          <Award size={16} />
          <span>Moderator approval <small>Consensus reached</small></span>
        </div>
      )}

      {reviewStage === 4 && (
        <div className="golden-badge evo-gold-badge" key="badge-gold">
          <Layers size={16} />
          <span>Golden database <small>Trusted national knowledge</small></span>
        </div>
      )}
    </div>
  );
};

export default ReviewWorkflowCanvas;
