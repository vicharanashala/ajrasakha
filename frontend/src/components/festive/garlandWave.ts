/** How many bulbs on each side of the hovered one join the wave. */
export const WAVE_RADIUS = 5;
/** Delay between neighbouring bulbs, which makes the wave travel outwards. */
export const WAVE_STEP_DELAY_MS = 70;
/** A bulb ignores new waves for this long so rapid hovering stays smooth. */
export const WAVE_COOLDOWN_MS = 350;

const MAX_SWING_DEG = 22;
const SWING_DURATION_MS = 1100;
const GLOW_DURATION_MS = 900;

// Swings one bulb and brightens its glass, scaled by how close it is to the hover.
function animateBulb(bulb: HTMLElement, strength: number, delay: number, direction: number) {
  const swing = MAX_SWING_DEG * strength * direction;

  // "add" layers this on top of any wave already playing, so overlaps blend smoothly.
  bulb.querySelector(".diwali-bulb-body")?.animate(
    [
      { transform: "rotate(0deg) translateY(0px)" },
      { transform: `rotate(${swing}deg) translateY(${2 * strength}px)`, offset: 0.25 },
      { transform: `rotate(${-swing * 0.55}deg) translateY(0px)`, offset: 0.55 },
      { transform: `rotate(${swing * 0.25}deg) translateY(0px)`, offset: 0.8 },
      { transform: "rotate(0deg) translateY(0px)" },
    ],
    { duration: SWING_DURATION_MS, delay, easing: "ease-in-out", composite: "add" },
  );

  bulb.querySelector(".diwali-bulb-glass")?.animate(
    [
      { transform: "scale(1)", filter: "brightness(1) saturate(1)" },
      {
        transform: `scale(${1 + 0.4 * strength})`,
        filter: `brightness(${1 + 0.5 * strength}) saturate(1.2)`,
        offset: 0.3,
      },
      { transform: "scale(1)", filter: "brightness(1) saturate(1)" },
    ],
    { duration: GLOW_DURATION_MS, delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

// Starts a ripple at the hovered bulb that travels to its neighbours, fading with distance.
// lastStartedAt keeps each bulb's most recent start time across calls.
export function playGarlandWave(
  bulbs: ArrayLike<HTMLElement>,
  origin: number,
  lastStartedAt: number[],
  now: number = performance.now(),
) {
  for (let offset = -WAVE_RADIUS; offset <= WAVE_RADIUS; offset++) {
    const index = origin + offset;
    const bulb = bulbs[index];
    if (!bulb) continue;

    const delay = Math.abs(offset) * WAVE_STEP_DELAY_MS;
    const startsAt = now + delay;
    if (startsAt - (lastStartedAt[index] ?? -Infinity) < WAVE_COOLDOWN_MS) continue;
    lastStartedAt[index] = startsAt;

    const strength = 1 - Math.abs(offset) / (WAVE_RADIUS + 1);
    // Bulbs swing away from the hover point on each side.
    animateBulb(bulb, strength, delay, offset < 0 ? -1 : 1);
  }
}
