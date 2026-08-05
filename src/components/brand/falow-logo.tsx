import { cn } from "@/lib/utils";

/**
 * Símbolo Falow: anel verde com uma abertura preenchida por um ponto
 * amarelo — o "loop" de conversa que nunca fecha sozinho. Cores fixas da
 * identidade (Falow Green / Trigger Yellow), não seguem o tema.
 */
export function FalowMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        d="M44.79 20.46 A30 30 0 1 1 24.02 35"
        stroke="#32E875"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <circle cx="31.07" cy="22.97" r="8" fill="#FFD43B" />
    </svg>
  );
}

export function FalowLogo({
  className,
  markClassName = "h-6 w-6",
  textClassName = "text-[15px]",
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <FalowMark className={markClassName} />
      <span
        className={cn(
          "font-display font-bold leading-none tracking-tight text-foreground",
          textClassName
        )}
      >
        falow
      </span>
    </div>
  );
}
