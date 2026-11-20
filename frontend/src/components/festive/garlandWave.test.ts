import { describe, expect, it, vi } from "vitest";
import { WAVE_RADIUS, WAVE_STEP_DELAY_MS, playGarlandWave } from "./garlandWave";

// Minimal stand-in for a bulb element that records the animations started on it.
function createBulb() {
  const body = { animate: vi.fn() };
  const glass = { animate: vi.fn() };
  const bulb = {
    querySelector: (selector: string) => (selector === ".diwali-bulb-body" ? body : glass),
  };
  return { bulb: bulb as unknown as HTMLElement, body };
}

describe("playGarlandWave", () => {
  it("animates only bulbs within the radius, with delays growing outwards", () => {
    const bulbs = Array.from({ length: 20 }, createBulb);
    playGarlandWave(bulbs.map((b) => b.bulb), 10, [], 0);

    bulbs.forEach(({ body }, index) => {
      const distance = Math.abs(index - 10);
      if (distance > WAVE_RADIUS) {
        expect(body.animate).not.toHaveBeenCalled();
      } else {
        expect(body.animate.mock.calls[0][1].delay).toBe(distance * WAVE_STEP_DELAY_MS);
      }
    });
  });

  it("swings the hovered bulb hardest and stays within the garland edges", () => {
    const bulbs = Array.from({ length: 3 }, createBulb);
    playGarlandWave(bulbs.map((b) => b.bulb), 0, [], 0);

    const peakSwing = (index: number) =>
      parseFloat(bulbs[index].body.animate.mock.calls[0][0][1].transform.match(/-?[\d.]+/)[0]);
    expect(Math.abs(peakSwing(0))).toBeGreaterThan(Math.abs(peakSwing(1)));
    expect(bulbs[2].body.animate).toHaveBeenCalledOnce();
  });

  it("ignores repeat hovers on the same bulb during the cooldown", () => {
    const bulbs = Array.from({ length: 1 }, createBulb);
    const lastStartedAt: number[] = [];
    playGarlandWave(bulbs.map((b) => b.bulb), 0, lastStartedAt, 0);
    playGarlandWave(bulbs.map((b) => b.bulb), 0, lastStartedAt, 100);
    playGarlandWave(bulbs.map((b) => b.bulb), 0, lastStartedAt, 1000);

    expect(bulbs[0].body.animate).toHaveBeenCalledTimes(2);
  });
});
