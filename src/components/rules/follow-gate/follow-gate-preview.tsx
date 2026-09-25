import { cn } from "@/lib/utils";

/**
 * Trecho da conversa do portão nas prévias do celular: a mensagem com os 2
 * botões e o toque em "Já segui". `perspective` segue a prévia onde entra:
 * "follower" (bot à esquerda, como vê quem comenta) ou "owner" (bot à
 * direita, como no inbox da conta).
 */
export function FollowGatePreview({
  text,
  followLabel,
  confirmLabel,
  perspective,
}: {
  text: string;
  followLabel: string;
  confirmLabel: string;
  perspective: "follower" | "owner";
}) {
  const owner = perspective === "owner";

  return (
    <>
      <div className={cn("flex items-end gap-1.5", owner && "justify-end")}>
        {!owner && <div className="h-5 w-5 shrink-0 rounded-full bg-neutral-700" />}
        <div
          className={cn(
            "max-w-[210px] overflow-hidden rounded-2xl",
            owner
              ? "rounded-br-sm bg-gradient-to-br from-[#7C5CFC] to-[#C13584]"
              : "rounded-bl-sm bg-neutral-800"
          )}
        >
          <p className="whitespace-pre-wrap px-3 py-2 text-[13px] leading-snug text-white">
            {text}
          </p>
          {[followLabel, confirmLabel].map((label, i) => (
            <div
              key={i}
              className={cn(
                "truncate border-t px-3 py-2 text-center text-[12px] font-semibold",
                owner ? "border-white/25 text-white" : "border-white/15 text-[#9DAAFF]"
              )}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* quem pediu segue o perfil e toca em "Já segui" */}
      <div className={cn("flex items-end gap-1.5", !owner && "justify-end")}>
        {owner && <div className="h-5 w-5 shrink-0 rounded-full bg-neutral-700" />}
        <div
          className={cn(
            "max-w-[75%] rounded-2xl px-3 py-2 text-[13px] leading-snug text-white",
            owner ? "rounded-bl-sm bg-neutral-800" : "rounded-br-sm bg-[#5B4FE5]"
          )}
        >
          {confirmLabel}
        </div>
      </div>
    </>
  );
}
