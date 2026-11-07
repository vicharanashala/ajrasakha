// Lightweight canvas fireworks: short rockets that burst into fading sparks, with
// a bigger finale burst. The animation loop only runs while something is on screen.

// Deep festive colours that stay visible on the cream Diwali background.
const SPARK_COLOURS = ["#E8590C", "#D6336C", "#F59F00", "#C2255C", "#7048E8", "#2B8A3E", "#E67700"];

const GRAVITY = 0.045;
const FRICTION = 0.975;
/** How many frames of movement each spark's trail covers. */
const TRAIL_LENGTH = 4;
const FLASH_RADIUS_PX = 46;
const FINALE_FLASH_RADIUS_PX = 110;
const FLASH_DECAY = 0.08;
const ROCKET_RISE_PX = 150;
const FINALE_RISE_PX = 260;
const ROCKET_SPEED = 5;
const FINALE_BURST_SCALE = 1.6;
const MAX_PIXEL_RATIO = 2;
const FRAME_MS = 1000 / 60;

interface Spark {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  alpha: number;
  decay: number;
  colour: string;
  width: number;
}

interface Flash {
  x: number;
  y: number;
  alpha: number;
  colour: string;
  radius: number;
}

interface Rocket {
  x: number;
  y: number;
  targetY: number;
  isFinale: boolean;
}

export interface FireworksEngine {
  launch: (x: number, y: number) => void;
  launchFinale: (x: number, y: number) => void;
  destroy: () => void;
}

// Picks a random item from a non-empty list.
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Creates the sparks for one burst, mostly in one colour with a few accents.
// A larger scale gives more, faster and thicker sparks.
function createBurst(x: number, y: number, scale = 1): Spark[] {
  const count = Math.round((70 + Math.floor(Math.random() * 30)) * scale);
  const mainColour = pick(SPARK_COLOURS);
  const accentColour = pick(SPARK_COLOURS);

  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + Math.random() * 0.2;
    const speed = (2 + Math.random() * 3.6) * scale;
    return {
      x,
      y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      alpha: 1,
      decay: 0.009 + Math.random() * 0.009,
      colour: Math.random() < 0.75 ? mainColour : accentColour,
      width: (1.6 + Math.random() * 1.6) * Math.min(scale, 1.3),
    };
  });
}

// Draws fireworks on the given full-screen canvas and returns controls for it.
export function createFireworksEngine(canvas: HTMLCanvasElement): FireworksEngine | null {
  const context = canvas.getContext("2d");
  if (!context) return null;

  let sparks: Spark[] = [];
  let rockets: Rocket[] = [];
  let flashes: Flash[] = [];
  let frameId = 0;
  let lastFrameAt = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  // Bursts a rocket into sparks with a short flash; the finale is bigger.
  const explode = (rocket: Rocket) => {
    const burst = createBurst(rocket.x, rocket.y, rocket.isFinale ? FINALE_BURST_SCALE : 1);
    sparks.push(...burst);
    flashes.push({
      x: rocket.x,
      y: rocket.y,
      alpha: 1,
      colour: burst[0].colour,
      radius: rocket.isFinale ? FINALE_FLASH_RADIUS_PX : FLASH_RADIUS_PX,
    });
  };

  const drawRockets = (step: number) => {
    context.strokeStyle = "#B8860B";
    rockets = rockets.filter((rocket) => {
      const nextY = rocket.y - ROCKET_SPEED * step;
      context.globalAlpha = 0.8;
      context.lineWidth = rocket.isFinale ? 2.6 : 1.6;
      context.beginPath();
      context.moveTo(rocket.x, rocket.y + 10);
      context.lineTo(rocket.x, nextY);
      context.stroke();
      rocket.y = nextY;
      if (rocket.y > rocket.targetY) return true;
      explode(rocket);
      return false;
    });
  };

  // Soft glow at the centre of each burst for its first few frames.
  const drawFlashes = (step: number) => {
    flashes = flashes.filter((flash) => {
      flash.alpha -= FLASH_DECAY * step;
      if (flash.alpha <= 0) return false;
      const glow = context.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, flash.radius);
      glow.addColorStop(0, flash.colour);
      glow.addColorStop(1, "transparent");
      context.globalAlpha = flash.alpha * 0.55;
      context.fillStyle = glow;
      context.fillRect(flash.x - flash.radius, flash.y - flash.radius, flash.radius * 2, flash.radius * 2);
      return true;
    });
  };

  const drawSparks = (step: number) => {
    const friction = Math.pow(FRICTION, step);
    sparks = sparks.filter((spark) => {
      spark.velocityX *= friction;
      spark.velocityY = spark.velocityY * friction + GRAVITY * step;
      spark.x += spark.velocityX * step;
      spark.y += spark.velocityY * step;
      spark.alpha -= spark.decay * step;
      if (spark.alpha <= 0) return false;

      // A little flicker makes the sparks glitter as they fade.
      context.globalAlpha = spark.alpha * (0.7 + Math.random() * 0.3);
      context.strokeStyle = spark.colour;
      context.lineWidth = spark.width;
      context.beginPath();
      context.moveTo(spark.x - spark.velocityX * TRAIL_LENGTH, spark.y - spark.velocityY * TRAIL_LENGTH);
      context.lineTo(spark.x, spark.y);
      context.stroke();
      return true;
    });
  };

  const tick = (now: number) => {
    // Scale movement by elapsed time so speed is the same on 60Hz and 120Hz screens.
    const step = Math.min((now - lastFrameAt) / FRAME_MS, 3);
    lastFrameAt = now;

    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    context.globalCompositeOperation = "source-over";
    context.lineCap = "round";
    drawRockets(step);
    drawFlashes(step);
    drawSparks(step);
    context.globalAlpha = 1;

    frameId = sparks.length || rockets.length || flashes.length ? requestAnimationFrame(tick) : 0;
  };

  const ensureRunning = () => {
    if (frameId) return;
    lastFrameAt = performance.now();
    frameId = requestAnimationFrame(tick);
  };

  return {
    launch: (x, y) => {
      rockets.push({ x, y: y + ROCKET_RISE_PX, targetY: y, isFinale: false });
      ensureRunning();
    },
    launchFinale: (x, y) => {
      rockets.push({ x, y: y + FINALE_RISE_PX, targetY: y, isFinale: true });
      ensureRunning();
    },
    destroy: () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      sparks = [];
      rockets = [];
      flashes = [];
    },
  };
}
