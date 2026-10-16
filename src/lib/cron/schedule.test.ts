import { describe, expect, it } from "vitest";

import { CRON_ROUTES, cronRequestFor } from "./schedule";

describe("CRON_ROUTES", () => {
  it("mapeia os dois crons do wrangler.toml para as rotas certas", () => {
    expect(CRON_ROUTES).toEqual({
      "* * * * *": "/api/cron/sequences",
      "0 6 * * *": "/api/cron/purge",
    });
  });
});

describe("cronRequestFor", () => {
  const env = { CRON_SECRET: "segredo", NEXT_PUBLIC_APP_URL: "https://falow.app.br" };

  it("monta a requisicao do cron de sequencias com URL absoluta e Bearer", () => {
    const req = cronRequestFor("* * * * *", env);
    expect(req).not.toBeNull();
    expect(req!.url).toBe("https://falow.app.br/api/cron/sequences");
    expect(req!.method).toBe("GET");
    expect(req!.headers.get("authorization")).toBe("Bearer segredo");
  });

  it("monta a requisicao do cron de purge", () => {
    const req = cronRequestFor("0 6 * * *", env);
    expect(req!.url).toBe("https://falow.app.br/api/cron/purge");
    expect(req!.headers.get("authorization")).toBe("Bearer segredo");
  });

  it("devolve null para cron desconhecido", () => {
    expect(cronRequestFor("*/5 * * * *", env)).toBeNull();
    expect(cronRequestFor("", env)).toBeNull();
  });

  it("usa https://falow.app.br quando NEXT_PUBLIC_APP_URL nao esta definida", () => {
    const req = cronRequestFor("* * * * *", { CRON_SECRET: "segredo" });
    expect(req!.url).toBe("https://falow.app.br/api/cron/sequences");
  });

  it("respeita a base configurada, inclusive com barra no fim", () => {
    const req = cronRequestFor("0 6 * * *", { CRON_SECRET: "x", NEXT_PUBLIC_APP_URL: "https://staging.falow.app.br/" });
    expect(req!.url).toBe("https://staging.falow.app.br/api/cron/purge");
  });

  it("sem CRON_SECRET ainda monta a requisicao com 'Bearer ' (a rota responde 503 e o worker loga)", () => {
    const req = cronRequestFor("* * * * *", {});
    expect(req).not.toBeNull();
    expect(req!.headers.get("authorization")).toBe("Bearer");
  });
});
