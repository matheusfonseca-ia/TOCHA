/**
 * Payload dos botões/quick replies de sequência (puro, sem I/O, testável).
 *
 *  - v2 (envio atual): falow:seq:<runId>:<nodeId>:<handle>
 *  - v1 (legado):      falow:seq:<runId>:<handle>
 *
 * O v2 carrega o nó que enviou o botão: o claim exige que o run ainda esteja
 * parado nele, então tocar num botão de uma mensagem antiga é ignorado em vez
 * de ramificar (ou encerrar) o run a partir do nó errado. Botões v1 já
 * entregues em DMs continuam válidos para sempre, por isso o parser aceita os
 * dois formatos.
 */

const SEQ_PAYLOAD_PREFIX = "falow:seq:";
// O produto se chamou InstaReply até 2026-07-28. Botões já entregues em DMs
// carregam o payload antigo para sempre, então continuamos aceitando na leitura
// (só o envio usa o prefixo novo).
const SEQ_PAYLOAD_PREFIX_LEGACY = "instareply:seq:";

export interface SequencePayload {
  runId: string;
  /** null em payloads v1 (sem como saber de qual nó o botão saiu). */
  nodeId: string | null;
  handle: string;
}

export function buildSequencePayload(
  runId: string,
  nodeId: string,
  handle: string
): string {
  return `${SEQ_PAYLOAD_PREFIX}${runId}:${nodeId}:${handle}`;
}

export function isSequencePayload(payload: string | undefined | null): boolean {
  return (
    !!payload &&
    (payload.startsWith(SEQ_PAYLOAD_PREFIX) ||
      payload.startsWith(SEQ_PAYLOAD_PREFIX_LEGACY))
  );
}

export function parseSequencePayload(
  payload: string | undefined | null
): SequencePayload | null {
  const prefix = [SEQ_PAYLOAD_PREFIX, SEQ_PAYLOAD_PREFIX_LEGACY].find((p) =>
    payload?.startsWith(p)
  );
  if (!prefix || !payload) return null;
  const rest = payload.slice(prefix.length);

  // runId é uuid e handle nunca tem ":" (btn-0, qr-1, qr-fallback): o que
  // sobra entre o 1º e o último ":" é o nodeId (v2) ou nada (v1).
  const first = rest.indexOf(":");
  const last = rest.lastIndexOf(":");
  if (first <= 0 || last === rest.length - 1) return null;

  const runId = rest.slice(0, first);
  const handle = rest.slice(last + 1);
  if (first === last) return { runId, nodeId: null, handle };

  const nodeId = rest.slice(first + 1, last);
  if (!nodeId) return null;
  return { runId, nodeId, handle };
}
