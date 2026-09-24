/**
 * Nó "Aleatório" (teste A/B): sorteia um caminho entre os configurados,
 * proporcional ao peso de cada um. Puro — `random` é injetável para teste
 * determinístico (padrão `Math.random`, usado pelo runtime de verdade).
 */

/**
 * Índice do caminho sorteado (0 a `weights.length - 1`). Pesos <= 0 nunca
 * são sorteados. Não exige que a soma seja 100 (isso é responsabilidade da
 * validação do grafo, `validateSequenceGraph`) — aqui só normaliza o que
 * recebe; soma <= 0 sempre devolve o primeiro caminho.
 */
export function pickBranch(weights: number[], random: () => number = Math.random): number {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (weights.length === 0 || total <= 0) return 0;

  const roll = random() * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += Math.max(0, weights[i]);
    if (roll < acc) return i;
  }
  return weights.length - 1;
}
