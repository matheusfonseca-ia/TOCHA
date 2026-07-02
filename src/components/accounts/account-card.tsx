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
    if (!window.confirm(`Desconectar @${account.ig_username}?`)) return;
    startTransition(async () => {
      const result = await disconnectAccount(account.id);
      if (result.error) toast.error(result.error);
      else toast.success("Conta desconectada.");
    });
  }

  return (
    <Card
      className="card-hover stagger-item"
      style={{ "--stagger-index": index } as React.CSSProperties}
    >
      <CardContent className="flex items-center gap-4 p-5">
        {account.profile_picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.profile_picture_url}
            alt={`@${account.ig_username}`}
            className="h-12 w-12 rounded-full border-2 border-primary/40 object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <Instagram className="h-6 w-6 text-primary" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">@{account.ig_username}</p>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {account.page_name ? `Página: ${account.page_name} · ` : ""}
            Conectada em{" "}
            {format(new Date(account.connected_at), "dd MMM yyyy", {
              locale: ptBR,
            })}
          </p>
        </div>

        {account.status !== "disconnected" && (
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
        )}
      </CardContent>
    </Card>
  );
}
