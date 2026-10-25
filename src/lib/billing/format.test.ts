import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { formatPurgeDate } from "@/lib/billing/format";

describe("formatPurgeDate", () => {
  // O Worker da Cloudflare roda em UTC e a máquina de desenvolvimento em Brasília. Fixar UTC aqui
  // faz o teste falhar em qualquer máquina se alguém voltar a formatar no fuso do servidor.
  beforeAll(() => {
    vi.stubEnv("TZ", "UTC");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("cancelamento à noite em Brasília mostra o dia de Brasília, não o do UTC", () => {
    // 22h de 15/11 em Brasília = 01h de 16/11 em UTC
    expect(formatPurgeDate("2026-11-16T01:00:00Z")).toBe("15 de novembro de 2026");
  });
  it("durante o dia o dia de Brasília e o do UTC coincidem", () => {
    expect(formatPurgeDate("2026-11-16T12:00:00Z")).toBe("16 de novembro de 2026");
  });
  it("de madrugada em Brasília mostra o dia em que o cron das 03h apaga", () => {
    // 01h de 16/11 em Brasília = 04h de 16/11 em UTC
    expect(formatPurgeDate("2026-11-16T04:00:00Z")).toBe("16 de novembro de 2026");
  });
});
