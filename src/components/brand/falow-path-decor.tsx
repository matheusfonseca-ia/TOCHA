import { cn } from "@/lib/utils";

/**
 * "Falow Path" decorativo — o traço de conversa da identidade visual,
 * usado como textura de fundo em telas de baixa densidade (login).
 * Puramente atmosférico: aria-hidden, não carrega informação.
 */
export function FalowPathDecor({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 600"
      fill="none"
      className={cn("pointer-events-none", className)}
      aria-hidden
    >
      <path
        d="M40,420 C160,300 220,520 340,380 C460,240 520,460 640,300 C700,220 720,160 760,80"
        stroke="#32E875"
        strokeWidth="10"
        strokeLinecap="round"
        className="falow-path-draw"
      />
      <circle cx="40" cy="420" r="12" fill="#FFD43B" />
    </svg>
  );
}
