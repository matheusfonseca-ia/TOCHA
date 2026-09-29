"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Headset } from "lucide-react";

import { Button } from "@/components/ui/button";

import { assumeConversation, returnToBot } from "../services/handoff.actions";

/** "Assumir conversa" / "Devolver ao bot" (D3), no cabeçalho da conversa. */
export function HandoffToggleButton({
  conversationId,
  takenOver,
}: {
  conversationId: string;
  takenOver: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      if (takenOver) await returnToBot(conversationId);
      else await assumeConversation(conversationId);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant={takenOver ? "default" : "outline"}
      size="sm"
      className="hidden h-8 gap-1.5 text-[12px] sm:inline-flex"
      onClick={toggle}
      disabled={pending}
    >
      {takenOver ? <Bot className="h-3.5 w-3.5" /> : <Headset className="h-3.5 w-3.5" />}
      {takenOver ? "Devolver ao bot" : "Assumir conversa"}
    </Button>
  );
}
