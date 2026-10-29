import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tick } = vi.hoisted(() => ({ tick: vi.fn(async () => 0) }));
vi.mock("@/lib/expiry/sweep", () => ({ expireAutomationsSafe: vi.fn(async () => 0) }));
vi.mock("@/lib/sequences/runtime", () => ({ processDueRuns: tick }));

import { GET } from "@/app/api/cron/sequences/route";

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://falow.app.br/sistema${path}`, { headers });
}

describe("GET /api/cron/sequences", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3gredo");
    tick.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("header Bearer certo roda o tick", async () => {
    const r = await GET(req("/api/cron/sequences", { authorization: "Bearer s3gredo" }));
    expect(r.status).toBe(200);
    expect(tick).toHaveBeenCalled();
  });

  it("segredo na query string não vale mais", async () => {
    const r = await GET(req("/api/cron/sequences?secret=s3gredo"));
    expect(r.status).toBe(403);
    expect(tick).not.toHaveBeenCalled();
  });

  it("header errado e segredo ausente recusam com 403", async () => {
    expect((await GET(req("/api/cron/sequences", { authorization: "Bearer outro" }))).status).toBe(403);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("/api/cron/sequences", { authorization: "Bearer " }))).status).toBe(403);
    expect(tick).not.toHaveBeenCalled();
  });
});
