"use client";

import { useState, useTransition } from "react";
import { History } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { importHistoryStep } from "../services/history-import.actions";

/**
 * Importa o histórico de DMs de uma conta (Conversations API) em lotes,
 * chamando a action em sequência até terminar. A Meta só libera as 20
 * mensagens mais recentes de cada conversa, sem forma de pedir mais.
 */
export function ImportHistoryButton({ accountId }: { accountId: string }) {
  const [isPending, startTransition] = useTransition();
  const [conversationsDone, setConversationsDone] = useState(0);

  function handleImport() {
    const confirmed = window.confirm(
      "Importar o histórico de DMs desta conta?\n\nO Instagram só libera as 20 mensagens mais recentes de cada conversa."
    );
    if (!confirmed) return;

    startTransition(async () => {
      let cursor: string | null = null;
      let totalConversations = 0;
      let totalMessages = 0;
      setConversationsDone(0);

      for (;;) {
        const result = await importHistoryStep(accountId, cursor);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        totalConversations += result.conversationsProcessed;
        totalMessages += result.messagesImported;
        setConversationsDone(totalConversations);
        if (result.done) {
          toast.success(
            totalMessages > 0
              ? `Histórico importado: ${totalConversations} conversas, ${totalMessages} mensagens.`
              : "Nenhuma conversa nova encontrada para importar."
          );
          return;
        }
        cursor = result.nextCursor;
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleImport}
      disabled={isPending}
      title="O Instagram só libera as 20 mensagens mais recentes de cada conversa"
      className="text-muted-foreground hover:text-foreground"
    >
      <History />
      <span className="hidden sm:inline">
        {isPending ? `Importando… ${conversationsDone} conversas` : "Importar histórico de DMs"}
      </span>
    </Button>
  );
}
