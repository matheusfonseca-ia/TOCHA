import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeAccount } from "@/lib/sequences/__tests__/fixtures";

const { listRecentMedia } = vi.hoisted(() => ({ listRecentMedia: vi.fn() }));
vi.mock("@/lib/meta/graph", () => ({ listRecentMedia }));

import { withRecentMedia } from "./account-media";

const item = {
  id: "m1",
  media_type: "IMAGE",
  media_url: "https://cdn.test/m1.jpg",
  permalink: "https://instagram.com/p/m1",
  caption: "legenda",
};

describe("withRecentMedia", () => {
  beforeEach(() => {
    listRecentMedia.mockReset();
    listRecentMedia.mockResolvedValue([item]);
  });

  it("conta ativa: descriptografa o token e devolve a mídia", async () => {
    const result = await withRecentMedia([makeAccount({ id: "a1", status: "active" })]);

    expect(listRecentMedia).toHaveBeenCalledWith("token-valido-de-teste");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a1");
    expect(result[0].media).toEqual([
      { id: "m1", media_type: "IMAGE", thumbnail_url: item.media_url, permalink: item.permalink, caption: "legenda" },
    ]);
  });

  it.each(["disconnected", "expired"] as const)(
    "conta %s: mídia vazia, sem usar o token guardado",
    async (status) => {
      const result = await withRecentMedia([makeAccount({ id: "a2", status })]);

      expect(listRecentMedia).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a2");
      expect(result[0].media).toEqual([]);
    }
  );

  it("mistura: mantém a ordem e só busca mídia da conta ativa", async () => {
    const result = await withRecentMedia([
      makeAccount({ id: "off", status: "disconnected" }),
      makeAccount({ id: "on", status: "active" }),
      makeAccount({ id: "exp", status: "expired" }),
    ]);

    expect(result.map((a) => a.id)).toEqual(["off", "on", "exp"]);
    expect(result.map((a) => a.media.length)).toEqual([0, 1, 0]);
    expect(listRecentMedia).toHaveBeenCalledTimes(1);
  });
});
