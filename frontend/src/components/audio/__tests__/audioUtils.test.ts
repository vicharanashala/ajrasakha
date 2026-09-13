import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {base64ToBlobUrl, revokeBlobUrl} from "../audioUtils";

describe("base64ToBlobUrl", () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let created: Array<{blob: Blob; url: string}>;
  let revoked: string[];

  beforeEach(() => {
    created = [];
    revoked = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:test-${created.length}`;
      created.push({blob, url});
      return url;
    }) as any;
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    }) as any;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it("produces a URL for a known input", () => {
    const b64 = Buffer.from("hello").toString("base64");
    const url = base64ToBlobUrl(b64, "audio/wav");
    expect(url).toMatch(/^blob:test-\d+$/);
    expect(created).toHaveLength(1);
    expect(created[0].blob.type).toBe("audio/wav");
    expect(created[0].blob.size).toBe(5);
  });

  it("preserves an empty-string audio payload without throwing", () => {
    const url = base64ToBlobUrl("", "audio/wav");
    expect(url).toMatch(/^blob:test-\d+$/);
    expect(created[0].blob.size).toBe(0);
  });

  it("honors the provided MIME type", () => {
    base64ToBlobUrl(Buffer.from("x").toString("base64"), "audio/mp3");
    expect(created[0].blob.type).toBe("audio/mp3");
  });
});

describe("revokeBlobUrl", () => {
  it("does nothing when passed null", () => {
    const spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    revokeBlobUrl(null);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does nothing when passed an empty string", () => {
    const spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    revokeBlobUrl("");
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls URL.revokeObjectURL when given a real URL", () => {
    const spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    revokeBlobUrl("blob:abc-123");
    expect(spy).toHaveBeenCalledWith("blob:abc-123");
  });
});