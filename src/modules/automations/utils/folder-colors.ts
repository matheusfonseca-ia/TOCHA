/** Classe da bolinha de cada cor de `FOLDER_COLORS` (lib/folders). */
export const FOLDER_DOT_CLASS: Record<string, string> = {
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-400",
};

/** Cor salva que não existe mais na lista cai no cinza em vez de sumir. */
export function folderDotClass(color: string): string {
  return FOLDER_DOT_CLASS[color] ?? FOLDER_DOT_CLASS.slate;
}
