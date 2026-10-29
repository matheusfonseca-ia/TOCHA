"use client";

import { useTransition } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Instagram, Unplug } from "lucide-react";
import { toast } from "sonner";

import { disconnectAccount } from "@/app/(dashboard)/accounts/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImportHistoryButton } from "@/modules/crm/history-import/components/import-history-button";
import type { AccountStatus } from "@/types/database";

interface AccountCardProps {
  account: {
    id: string;
    ig_username: string;
    page_name: string | null;
    profile_picture_url: string | null;
    status: AccountStatus;
    connected_at: string;
  };
  index?: number;
}

const STATUS_BADGE: Record<
  AccountStatus,
  { label: string; variant: "success" | "warning" | "muted" }
> = {
  active: { label: "Conectada", variant: "success" },
  expired: { label: "Token expirado", variant: "warning" },
  disconnected: { label: "Desconectada", variant: "muted" },
};

export function AccountCard({ account, index = 0 }: AccountCardProps) {
  const [isPending, startTransition] = useTransition();
  const badge = STATUS_BADGE[account.status];

  function handleDisconnect() {
    if (
      !window.confirm(
        `Desconectar @${account.ig_username}? As automações param e o Falow apaga o acesso guardado. ` +
          "Para tirar a permissão de vez, remova o app em Instagram → Configurações → Apps e sites."
      )
    )
      return;
    startTransition(async () => {
      const result = await disconnectAccount(account.id);
      if (result.error) toast.error(result.error);
      else toast.success("Conta desconectada.");
    });
  }

  return (
    <Card
      className="stagger-item"
      style={{ "--stagger-index": index } as React.CSSProperties}
    >
      {/* Vertical: identidade em cima, ações embaixo. Funciona em cartão
          estreito de grade (3 colunas) e em coluna única no celular. */}
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          {account.profile_picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={account.profile_picture_url}
              alt={`@${account.ig_username}`}
              className="h-11 w-11 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/70 bg-secondary/40">
              <Instagram className="h-5 w-5 text-muted-foreground" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              @{account.ig_username}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {account.page_name ? `Página: ${account.page_name} · ` : ""}
              Conectada em{" "}
              {format(new Date(account.connected_at), "dd MMM yyyy", {
                locale: ptBR,
              })}
            </p>
          </div>

          <Badge variant={badge.variant} className="shrink-0">
            {badge.label}
          </Badge>
        </div>

        {account.status !== "disconnected" && (
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
            {account.status === "active" ? (
              <ImportHistoryButton accountId={account.id} />
            ) : (
              <span />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Unplug />
              Desconectar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
