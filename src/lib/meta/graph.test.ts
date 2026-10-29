import { afterEach, describe, expect, it, vi } from "vitest";

import { GraphApiError, getUserProfile, isTransientGraphError, sendTextMessage } from "./graph";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const rateLimited = () => jsonResponse(400, { error: { message: "limite", code: 613 } });
const okSend = () => jsonResponse(200, { recipient_id: "1", message_id: "m" });

describe("Graph API: novas tentativas em falha temporária (A1-007)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("limite de taxa (613) é repetido e o envio sai na 2ª tentativa", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(okSend());
    vi.stubGlobal("fetch", fetchMock);

    const pending = sendTextMessage("tok", "1", "oi");
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ message_id: "m" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("5xx é repetido no máximo 2 vezes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(503, {}));
    vi.stubGlobal("fetch", fetchMock);

    const pending = getUserProfile("tok", "1").catch((err) => err);
    await vi.runAllTimersAsync();
    const err = await pending;
    expect(err).toBeInstanceOf(GraphApiError);
    expect((err as GraphApiError).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("erro de validação (4xx, código 100) não é repetido", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: { message: "inválido", code: 100 } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTextMessage("tok", "1", "oi")).rejects.toMatchObject({ code: 100 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("POST que estourou o timeout não é repetido (a mensagem pode ter saído)", async () => {
    const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal("fetch", fetchMock);

    const err = await sendTextMessage("tok", "1", "oi").catch((e) => e);
    expect(isTransientGraphError(err)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifica os erros", () => {
    expect(isTransientGraphError(new GraphApiError("x", 4))).toBe(true);
    expect(isTransientGraphError(new GraphApiError("x", undefined, undefined, 429))).toBe(true);
    expect(isTransientGraphError(new GraphApiError("x", 190, undefined, 400))).toBe(false);
    expect(isTransientGraphError(new TypeError("bug"))).toBe(false);
  });
});
