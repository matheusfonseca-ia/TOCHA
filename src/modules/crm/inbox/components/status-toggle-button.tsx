"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ConversationStatus } from "../../shared/types/conversation";
import { setConversationStatus } from "../services/status.actions";

/** Concluir / reabrir a conversa, no cabeçalho. */
export function StatusToggleButton({
  conversationId,
  status,
}: {
  conversationId: string;
  status: ConversationStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const done = status === "done";

  function toggle() {
    startTransition(async () => {
      await setConversationStatus(conversationId, done ? "open" : "done");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      onClick={toggle}
      disabled={pending}
      aria-label={done ? "Reabrir conversa" : "Concluir conversa"}
      title={done ? "Reabrir conversa" : "Concluir conversa"}
    >
      {done ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
    </Button>
  );
}
