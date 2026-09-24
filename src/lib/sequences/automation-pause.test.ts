import { describe, expect, it } from "vitest";

import { isPausedAt, pauseUntilFromHours } from "@/lib/sequences/automation-pause";

describe("pauseUntilFromHours", () => {
  it("soma as horas em milissegundos a partir de `now`", () => {
    const now = Date.parse("2026-09-23T12:00:00.000Z");
    expect(pauseUntilFromHours(24, now)).toBe("2026-09-24T12:00:00.000Z");
    expect(pauseUntilFromHours(1, now)).toBe("2026-09-23T13:00:00.000Z");
  });
});

describe("isPausedAt", () => {
  const now = Date.parse("2026-09-23T12:00:00.000Z");

  it("null/undefined nunca está pausado", () => {
    expect(isPausedAt(null, now)).toBe(false);
    expect(isPausedAt(undefined, now)).toBe(false);
  });

  it("data no futuro está pausado", () => {
    expect(isPausedAt("2026-09-24T12:00:00.000Z", now)).toBe(true);
  });

  it("data no passado (ou exatamente agora) não está mais pausado", () => {
    expect(isPausedAt("2026-09-22T12:00:00.000Z", now)).toBe(false);
    expect(isPausedAt(now.toString(), now)).toBe(false);
  });

  it("data inválida não trava (conta como não pausado)", () => {
    expect(isPausedAt("não é data", now)).toBe(false);
  });
});
