import { describe, expect, it } from "vitest";

import {
  expiryFormFrom,
  expiryLabel,
  expiryPreset,
  expiryTone,
  fromDatetimeLocal,
  isExpired,
  resolveExpiryForm,
  toDatetimeLocal,
  validateExpiry,
  withoutExpired,
} from "./expiry";
import { expiryColumns } from "./schema";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const plus = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("expiryPreset", () => {
  it("soma o preset a partir de agora", () => {
    expect(expiryPreset("24h", NOW)).toBe("2026-09-24T12:00:00.000Z");
    expect(expiryPreset("3d", NOW)).toBe("2026-09-26T12:00:00.000Z");
    expect(expiryPreset("7d", NOW)).toBe("2026-09-30T12:00:00.000Z");
  });
});

describe("expiryLabel", () => {
  it("nulo quando permanente", () => {
    expect(expiryLabel(null, NOW)).toBeNull();
    expect(expiryLabel(undefined, NOW)).toBeNull();
  });

  it("Expirada quando venceu ou vence agora", () => {
    expect(expiryLabel(plus(0), NOW)).toBe("Expirada");
    expect(expiryLabel(plus(-DAY), NOW)).toBe("Expirada");
  });

  it("minutos abaixo de 1 h (arredonda para cima, mínimo 1)", () => {
    expect(expiryLabel(plus(10 * 1000), NOW)).toBe("Expira em 1 min");
    expect(expiryLabel(plus(12 * MIN + 1), NOW)).toBe("Expira em 13 min");
  });

  it("horas abaixo de 24 h", () => {
    expect(expiryLabel(plus(3 * HOUR), NOW)).toBe("Expira em 3 h");
    expect(expiryLabel(plus(23 * HOUR + 50 * MIN), NOW)).toBe("Expira em 24 h");
  });

  it("dias a partir de 24 h, com singular", () => {
    expect(expiryLabel(plus(DAY), NOW)).toBe("Expira em 1 dia");
    expect(expiryLabel(plus(2 * DAY), NOW)).toBe("Expira em 2 dias");
    // Preset de 3 dias salvo há alguns segundos continua "3 dias".
    expect(expiryLabel(plus(3 * DAY - 30 * 1000), NOW)).toBe("Expira em 3 dias");
  });

  it("nulo para data inválida", () => {
    expect(expiryLabel("não é data", NOW)).toBeNull();
  });
});

describe("expiryTone", () => {
  it("classifica por distância", () => {
    expect(expiryTone(null, NOW)).toBeNull();
    expect(expiryTone(plus(-1), NOW)).toBe("expired");
    expect(expiryTone(plus(5 * HOUR), NOW)).toBe("soon");
    expect(expiryTone(plus(2 * DAY), NOW)).toBe("normal");
  });
});

describe("isExpired / withoutExpired", () => {
  it("vencida apenas com data no passado ou agora", () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(plus(0), NOW)).toBe(true);
    expect(isExpired(plus(MIN), NOW)).toBe(false);
  });

  it("mantém permanentes (inclusive sem a coluna) e futuras", () => {
    const rows = [
      { id: "a" },
      { id: "b", expires_at: null },
      { id: "c", expires_at: plus(HOUR) },
      { id: "d", expires_at: plus(-HOUR) },
    ];
    expect(withoutExpired(rows, NOW).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("validateExpiry", () => {
  it("permanente é sempre válido", () => {
    expect(validateExpiry(null, NOW)).toBeNull();
  });

  it("exige pelo menos 5 minutos no futuro", () => {
    expect(validateExpiry(plus(4 * MIN), NOW)).toMatch(/5 minutos/);
    expect(validateExpiry(plus(-HOUR), NOW)).toMatch(/5 minutos/);
    expect(validateExpiry(plus(5 * MIN), NOW)).toBeNull();
  });

  it("recusa data inválida", () => {
    expect(validateExpiry("amanhã", NOW)).toMatch(/inválida/);
  });
});

describe("formulário (ExpiryField)", () => {
  it("datetime-local ida e volta preserva o instante (minuto)", () => {
    const iso = "2026-10-01T15:42:00.000Z";
    expect(fromDatetimeLocal(toDatetimeLocal(iso))).toBe(iso);
    expect(fromDatetimeLocal("")).toBeNull();
    expect(fromDatetimeLocal("lixo")).toBeNull();
  });

  it("estado inicial reflete o que está salvo", () => {
    expect(expiryFormFrom(null, undefined)).toEqual({
      enabled: false,
      mode: "24h",
      customLocal: "",
      action: "delete",
    });
    const saved = expiryFormFrom("2026-10-01T15:42:00.000Z", "pause");
    expect(saved.enabled).toBe(true);
    expect(saved.mode).toBe("custom");
    expect(saved.action).toBe("pause");
  });

  it("desligado vira permanente", () => {
    expect(
      resolveExpiryForm({ enabled: false, mode: "3d", customLocal: "", action: "pause" }, NOW)
    ).toEqual({ expires_at: null, expire_action: "pause" });
  });

  it("preset conta a partir do salvar", () => {
    expect(
      resolveExpiryForm({ enabled: true, mode: "7d", customLocal: "", action: "delete" }, NOW)
    ).toEqual({ expires_at: "2026-09-30T12:00:00.000Z", expire_action: "delete" });
  });

  it("data e hora: vazia ou no passado vira erro", () => {
    const empty = resolveExpiryForm(
      { enabled: true, mode: "custom", customLocal: "", action: "delete" },
      NOW
    );
    expect(empty.error).toMatch(/data e a hora/);

    const past = resolveExpiryForm(
      { enabled: true, mode: "custom", customLocal: toDatetimeLocal(plus(-HOUR)), action: "delete" },
      NOW
    );
    expect(past.error).toMatch(/5 minutos/);
  });
});

describe("expiryColumns", () => {
  it("não mexe na expiração quando o campo não veio", () => {
    expect(expiryColumns({})).toEqual({});
  });

  it("grava nulo (permanente) e a ação padrão, zerando o marcador de pausa por expiração", () => {
    expect(expiryColumns({ expires_at: null })).toEqual({
      expires_at: null,
      expire_action: "delete",
      paused_by_expiry: false,
    });
    expect(expiryColumns({ expires_at: plus(DAY), expire_action: "pause" })).toEqual({
      expires_at: plus(DAY),
      expire_action: "pause",
      paused_by_expiry: false,
    });
  });
});
