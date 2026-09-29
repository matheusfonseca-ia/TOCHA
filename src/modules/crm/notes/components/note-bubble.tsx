import { StickyNote } from "lucide-react";

import { messageTime } from "../../inbox/utils/time";
import type { CrmNote } from "../../shared/types/conversation";

/** Nota interna intercalada na conversa por horário, com estilo próprio; nunca vai para o Instagram. */
export function NoteBubble({ note }: { note: CrmNote }) {
  return (
    <div className="flex justify-center py-1">
      <div className="flex max-w-[90%] items-start gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-[13px] text-amber-900 dark:text-amber-200 sm:max-w-[70%]">
        <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0">
          <p className="whitespace-pre-wrap break-words">{note.text}</p>
          <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-300/80" suppressHydrationWarning>
            Nota interna · {messageTime(note.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}
