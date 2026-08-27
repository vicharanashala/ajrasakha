import React, { useRef, useEffect } from 'react';

/**
 * HeroVideoBackground — continuously looping cinematic landscape video.
 *
 * Critical rules:
 * - NEVER scroll-scrub or alter playbackTime based on scroll.
 * - NEVER remount or restart this component during scroll.
 * - pointer-events: none so it does not intercept interaction.
 * - The video must run independently of all scroll animation.
 */
const HeroVideoBackground: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Ensure the video plays even if browser autoplay policy requires a nudge
    const tryPlay = () => {
      video.play().catch(() => {
        // Some browsers require muted for autoplay — it's already muted
      });
    };
    tryPlay();
    // Re-try if stalled
    video.addEventListener('canplay', tryPlay, { once: true });
    return () => {
      video.removeEventListener('canplay', tryPlay);
    };
  }, []);

  return (
    <div className="hc-video-host" aria-hidden="true">
      <video
        ref={videoRef}
        className="hc-video"
        src="/assets/hero-bg.mp4"
        poster="/assets/hero-poster.webp"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        tabIndex={-1}
      />
      {/* Bottom gradient softening — separates landscape from lower UI */}
      <div className="hc-video-bottom-fade" />
      {/* Right-side darkening to help text panel readability */}
      <div className="hc-video-right-fade" />
    </div>
  );
};

export default HeroVideoBackground;
