// Entrada do Worker: o fetch e o do OpenNext; o scheduled() dispara os crons
// chamando o proprio handler (sem sair pela rede, que pode ser bloqueada ou
// dar loop no custom domain). A logica pura (qual rota, qual header) fica em
// src/lib/cron/schedule.ts, import relativo porque o wrangler nao resolve `@/`.
// Este arquivo fica fora do typecheck (tsconfig.json): o .open-next e gerado no build.
// @ts-expect-error gerado no build (.open-next)
import handler from "./.open-next/worker.js";
import { cronRequestFor } from "./src/lib/cron/schedule";

// Reexporta as classes de Durable Object que o OpenNext gera
// (DOQueueHandler, DOShardedTagCache, BucketCachePurge).
// @ts-expect-error gerado no build (.open-next)
export * from "./.open-next/worker.js";

interface Env {
  CRON_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  [key: string]: unknown;
}

export default {
  fetch: handler.fetch,

  async scheduled(controller: { cron: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const request = cronRequestFor(controller.cron, env);
    if (!request) {
      console.error(`[cron] expressao desconhecida: ${controller.cron}`);
      return;
    }
    const path = new URL(request.url).pathname;
    ctx.waitUntil(
      handler
        .fetch(request, env, ctx)
        .then(async (res: Response) => {
          if (!res.ok) console.error(`[cron] ${path} -> ${res.status} ${await res.text()}`);
        })
        .catch((err: unknown) => {
          console.error(`[cron] ${path} falhou`, err);
        })
    );
  },
};
