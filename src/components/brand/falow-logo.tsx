import { cn } from "@/lib/utils";

import { FALOW_WORDMARK_D } from "./falow-wordmark";

/**
 * Marca Falow no vetor oficial (mesma geometria da LP, falow-lp/src/shared/ui/
 * brandMark.js): anel verde aberto no canto superior esquerdo com o ponto
 * amarelo do gatilho. As medidas saíram do arquivo oficial, não são de olho:
 * espessura/raio 0.352, raio do ponto/raio 0.264. Cores fixas da identidade
 * (Falow Green / Trigger Yellow), não seguem o tema.
 */
export function FalowMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        d="M 22.617 8.289 A 25.5 25.5 0 1 1 7.536 24.805"
        stroke="#32E875"
        strokeWidth={8.976}
        strokeLinecap="round"
      />
      <circle cx={10.187} cy={11.322} r={6.732} fill="#FFD43B" />
    </svg>
  );
}

/**
 * Assinatura horizontal (símbolo + "falow") num SVG só, no sistema de
 * coordenadas do vetor oficial: a viewBox é o bbox exato do conjunto, então
 * proporção e respiro entre símbolo e palavra já são os da marca. A altura
 * vem do className (padrão h-6) e a largura acompanha. O lettering usa
 * currentColor pra seguir o tema (text-foreground).
 *
 * `wordmarkClassName` vai só no grupo da palavra: a sidebar recolhida usa pra
 * apagar o "falow" e deixar o símbolo parado no mesmo lugar (sem trocar de
 * SVG, então não há pulo). Só opacidade aí: o grupo já tem transform SVG.
 */
export function FalowLogo({
  className,
  wordmarkClassName,
}: {
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <svg
      viewBox="629.94 475.74 2912.06 688.66"
      role="img"
      aria-label="Falow"
      className={cn("h-6 w-auto shrink-0 text-foreground", className)}
      style={{ aspectRatio: "2912.06 / 688.66" }}
    >
      <path
        d="M 866.53 547.82 A 292.79 292.79 0 1 1 693.38 737.45"
        fill="none"
        stroke="#32E875"
        strokeWidth={103.07}
        strokeLinecap="round"
      />
      <circle cx={723.79} cy={582.65} r={77.3} fill="#FFD43B" />
      <g
        transform="translate(0,1695) scale(0.1,-0.1)"
        className={wordmarkClassName}
      >
        <path fill="currentColor" fillRule="evenodd" d={FALOW_WORDMARK_D} />
      </g>
    </svg>
  );
}
