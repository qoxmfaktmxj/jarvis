/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerDownload } from "../triggerDownload";

describe("triggerDownload", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:fake-url");
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("creates an anchor with download attribute and clicks it", () => {
    const bytes = new Uint8Array([0x50, 0x4b]); // PK header
    triggerDownload(bytes, "test.xlsx");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  it("uses the provided MIME type", () => {
    const bytes = new Uint8Array([0]);
    triggerDownload(bytes, "x.csv", "text/csv");
    const blobArg = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blobArg.type).toBe("text/csv");
  });

  it("defaults to xlsx MIME when omitted", () => {
    const bytes = new Uint8Array([0]);
    triggerDownload(bytes, "x.xlsx");
    const blobArg = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blobArg.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("removes the anchor element after click (no DOM leak)", () => {
    const bytes = new Uint8Array([0]);
    const initialAnchorCount = document.querySelectorAll("a").length;
    triggerDownload(bytes, "x.xlsx");
    expect(document.querySelectorAll("a").length).toBe(initialAnchorCount);
  });
});
