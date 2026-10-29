import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/lead-profile.actions", () => ({ refreshLeadPhotos: vi.fn(async () => {}) }));

import { queueLeadPhotoRefresh, resetLeadPhotoQueue } from "../utils/photo-refresh-queue";

describe("queueLeadPhotoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetLeadPhotoQueue();
  });
  afterEach(() => vi.useRealTimers());

  it("agrupa as falhas próximas numa chamada só e não repete a mesma conversa", async () => {
    const send = vi.fn(async () => {});
    queueLeadPhotoRefresh("c1", send);
    queueLeadPhotoRefresh("c2", send);
    queueLeadPhotoRefresh("c1", send);
    await vi.advanceTimersByTimeAsync(400);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(["c1", "c2"]);

    queueLeadPhotoRefresh("c1", send);
    await vi.advanceTimersByTimeAsync(400);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
