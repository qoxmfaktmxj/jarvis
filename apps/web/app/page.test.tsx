import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import RootPage from "./page";

describe("RootPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects root traffic into the dashboard route", () => {
    expect(() => RootPage()).toThrow("redirect:/dashboard");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});
