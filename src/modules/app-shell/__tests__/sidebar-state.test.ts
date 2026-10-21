import { describe, expect, it } from "vitest";

import {
  isCollapsedCookie,
  SIDEBAR_COOKIE,
  sidebarCookieString,
} from "../utils/sidebar-state";

describe("sidebar-state", () => {
  it("só recolhe com o valor exato do cookie", () => {
    expect(isCollapsedCookie("collapsed")).toBe(true);
    expect(isCollapsedCookie("expanded")).toBe(false);
    expect(isCollapsedCookie(undefined)).toBe(false);
    expect(isCollapsedCookie("")).toBe(false);
    expect(isCollapsedCookie("COLLAPSED")).toBe(false);
  });

  it("grava o estado no cookie com path raiz e validade longa", () => {
    const value = sidebarCookieString(true);
    expect(value.startsWith(`${SIDEBAR_COOKIE}=collapsed;`)).toBe(true);
    expect(value).toContain("path=/");
    expect(value).toMatch(/max-age=\d{8}/);
    expect(sidebarCookieString(false)).toContain("=expanded;");
  });
});
