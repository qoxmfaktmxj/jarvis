// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Authorized } from "../Authorized";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

afterEach(() => cleanup());

describe("Authorized", () => {
  it("renders children when single perm matches", () => {
    const { getByText } = render(
      <Authorized permissions={[PERMISSIONS.ADMIN_ALL]} perm={PERMISSIONS.ADMIN_ALL}>
        <span>visible</span>
      </Authorized>,
    );
    expect(getByText("visible")).toBeTruthy();
  });

  it("renders fallback when single perm does not match", () => {
    const { queryByText, getByText } = render(
      <Authorized
        permissions={[PERMISSIONS.NOTICE_READ]}
        perm={PERMISSIONS.ADMIN_ALL}
        fallback={<span>nope</span>}
      >
        <span>visible</span>
      </Authorized>,
    );
    expect(queryByText("visible")).toBeNull();
    expect(getByText("nope")).toBeTruthy();
  });

  it("renders children when ANY of the perms in array matches (ANY-match semantics)", () => {
    const { getByText } = render(
      <Authorized
        permissions={[PERMISSIONS.NOTICE_CREATE]}
        perm={[PERMISSIONS.ADMIN_ALL, PERMISSIONS.NOTICE_CREATE]}
      >
        <span>visible</span>
      </Authorized>,
    );
    expect(getByText("visible")).toBeTruthy();
  });

  it("renders fallback (defaults to null) when none of the array perms match", () => {
    const { queryByText } = render(
      <Authorized
        permissions={[PERMISSIONS.NOTICE_READ]}
        perm={[PERMISSIONS.ADMIN_ALL, PERMISSIONS.KNOWLEDGE_DELETE]}
      >
        <span>visible</span>
      </Authorized>,
    );
    expect(queryByText("visible")).toBeNull();
  });

  it("fails closed when permissions array is empty", () => {
    const { queryByText } = render(
      <Authorized permissions={[]} perm={PERMISSIONS.ADMIN_ALL}>
        <span>visible</span>
      </Authorized>,
    );
    expect(queryByText("visible")).toBeNull();
  });

  it("fails closed when perm array is empty (no requirement = no permission granted)", () => {
    const { queryByText } = render(
      <Authorized permissions={[PERMISSIONS.ADMIN_ALL]} perm={[]}>
        <span>visible</span>
      </Authorized>,
    );
    // [].some(...) returns false, so children are hidden. Documented in JSDoc.
    expect(queryByText("visible")).toBeNull();
  });
});
