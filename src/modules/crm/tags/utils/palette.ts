import { TAG_COLORS, type TagColor } from "../types";

/**
 * Paleta fixa (8 cores) com contraste AA em claro e escuro, no mesmo estilo
 * de `src/components/ui/badge.tsx` (borda translúcida + fundo translúcido +
 * texto sólido, mais escuro no claro e mais claro no escuro).
 */
export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  green: "border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  blue: "border-blue-500/30 bg-blue-500/15 text-blue-800 dark:text-blue-300",
  purple: "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300",
  pink: "border-pink-500/30 bg-pink-500/15 text-pink-800 dark:text-pink-300",
  orange: "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300",
  amber: "border-amber-500/30 bg-amber-500/15 text-amber-900 dark:text-amber-300",
  cyan: "border-cyan-500/30 bg-cyan-500/15 text-cyan-800 dark:text-cyan-300",
  red: "border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-300",
};

/** Só o fundo sólido, para a bolinha de cor nos seletores. */
export const TAG_COLOR_DOT_CLASSES: Record<TagColor, string> = {
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  purple: "bg-violet-500",
  pink: "bg-pink-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  cyan: "bg-cyan-500",
  red: "bg-rose-500",
};

export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  green: "Verde",
  blue: "Azul",
  purple: "Roxo",
  pink: "Rosa",
  orange: "Laranja",
  amber: "Amarelo",
  cyan: "Ciano",
  red: "Vermelho",
};

export function isTagColor(value: string): value is TagColor {
  return (TAG_COLORS as readonly string[]).includes(value);
}

/** Cor seguinte da paleta, por rodízio, a partir de quantas tags já existem. */
export function paletteColorForIndex(index: number): TagColor {
  return TAG_COLORS[index % TAG_COLORS.length];
}
