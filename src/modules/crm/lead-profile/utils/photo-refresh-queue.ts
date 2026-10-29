import { refreshLeadPhotos } from "../services/lead-profile.actions";

/**
 * Fila do navegador para fotos de lead que falharam ao carregar. As URLs da
 * CDN da Meta expiram juntas: sem a fila, abrir o Inbox dispararia uma server
 * action por avatar (60+ de uma vez). Aqui as falhas de ~300ms viram uma
 * chamada só, e cada conversa é pedida no máximo uma vez por carregamento da
 * página (o servidor ainda segura em 1 busca por hora).
 */
const DELAY_MS = 300;
const requested = new Set<string>();
let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

export function queueLeadPhotoRefresh(conversationId: string, send = refreshLeadPhotos): void {
  if (!conversationId || requested.has(conversationId)) return;
  requested.add(conversationId);
  pending.push(conversationId);
  if (timer) return;
  timer = setTimeout(() => {
    const ids = pending;
    pending = [];
    timer = undefined;
    void send(ids).catch(() => {});
  }, DELAY_MS);
}

/** Só para testes. */
export function resetLeadPhotoQueue(): void {
  requested.clear();
  pending = [];
  if (timer) clearTimeout(timer);
  timer = undefined;
}
