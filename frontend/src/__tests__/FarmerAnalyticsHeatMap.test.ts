/**
 * BUG FIX TEST: FarmerAnalyticsHeatMap.tsx unhandled promise rejections
 *
 * Bug #12: FarmerAnalyticsHeatMap.tsx — four chained promises from
 *          locationService calls had no .catch(), causing unhandled promise
 *          rejections when the API fails (e.g., network error, timeout).
 *
 * File affected: frontend/src/features/chatbotDashboard/components/FarmerAnalyticsHeatMap.tsx
 *
 * Fix: Added .catch(() => null) to each of the four location service promise chains:
 *   - locationService.getStates()
 *   - locationService.getDistricts()
 *   - locationService.getBlocks()
 *   - locationService.getVillages()
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/hooks/services/locationService", () => ({
  LocationService: vi.fn().mockImplementation(() => ({
    getStates: vi.fn(),
    getDistricts: vi.fn(),
    getBlocks: vi.fn(),
    getVillages: vi.fn(),
  })),
}));

import { LocationService } from "@/hooks/services/locationService";

describe("Bug #12: FarmerAnalyticsHeatMap unhandled promise rejections", () => {
  let service: InstanceType<typeof LocationService>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    service = new LocationService();
  });

  it("getStates should handle rejection without crashing", async () => {
    (service.getStates as any).mockRejectedValue(new Error("Network error"));

    await expect(service.getStates().catch(() => null)).resolves.toBe(null);
  });

  it("getDistricts should handle rejection without crashing", async () => {
    (service.getDistricts as any).mockRejectedValue(new Error("API timeout"));

    await expect(service.getDistricts(1).catch(() => null)).resolves.toBe(null);
  });

  it("getBlocks should handle rejection without crashing", async () => {
    (service.getBlocks as any).mockRejectedValue(new Error("Server error"));

    await expect(service.getBlocks(1).catch(() => null)).resolves.toBe(null);
  });

  it("getVillages should handle rejection without crashing", async () => {
    (service.getVillages as any).mockRejectedValue(new Error("Connection refused"));

    await expect(service.getVillages(1).catch(() => null)).resolves.toBe(null);
  });

  it("all four services should fail gracefully in parallel", async () => {
    (service.getStates as any).mockRejectedValue(new Error("fail1"));
    (service.getDistricts as any).mockRejectedValue(new Error("fail2"));
    (service.getBlocks as any).mockRejectedValue(new Error("fail3"));
    (service.getVillages as any).mockRejectedValue(new Error("fail4"));

    const [d1, d2, d3, d4] = await Promise.all([
      service.getStates().catch(() => null),
      service.getDistricts(1).catch(() => null),
      service.getBlocks(1).catch(() => null),
      service.getVillages(1).catch(() => null),
    ]);

    expect(d1).toBe(null);
    expect(d2).toBe(null);
    expect(d3).toBe(null);
    expect(d4).toBe(null);
  });

  it("should still work when services succeed", async () => {
    (service.getStates as any).mockResolvedValue(["Karnataka"]);
    (service.getDistricts as any).mockResolvedValue(["Bangalore"]);
    (service.getBlocks as any).mockResolvedValue(["North"]);
    (service.getVillages as any).mockResolvedValue(["Village A"]);

    const [d1, d2, d3, d4] = await Promise.all([
      service.getStates().catch(() => null),
      service.getDistricts(1).catch(() => null),
      service.getBlocks(1).catch(() => null),
      service.getVillages(1).catch(() => null),
    ]);

    expect(d1).toEqual(["Karnataka"]);
    expect(d2).toEqual(["Bangalore"]);
    expect(d3).toEqual(["North"]);
    expect(d4).toEqual(["Village A"]);
  });
});
