import { AlertTriangle, CheckCircle2, Instagram, Webhook } from "lucide-react";

import { AccountCard } from "@/components/accounts/account-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { IgAccount } from "@/types/database";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "Autorização cancelada no Facebook.",
  invalid_state: "Sessão OAuth inválida. Tente novamente.",
  no_ig_account:
    "Nenhuma conta IG Business encontrada. Vincule seu Instagram a uma Página do Facebook e use uma conta Profissional.",
  exchange_failed: "Falha ao trocar o código OAuth. Verifique as credenciais do app Meta.",
  unknown: "Erro inesperado ao conectar. Tente novamente.",
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from("ig_accounts")
    .select("id, ig_username, page_name, profile_picture_url, status, connected_at")
    .order("connected_at", { ascending: false });

  const accounts = (data ?? []) as Pick<
    IgAccount,
    "id" | "ig_username" | "page_name" | "profile_picture_url" | "status" | "connected_at"
  >[];

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/meta`;

  return (
    <>
      <PageHeader
        title="Contas"
        description="Contas do Instagram conectadas via Meta."
      >
        <Button asChild>
          <a href="/api/auth/meta">
            <Instagram />
            Conectar Instagram
          </a>
        </Button>
      </PageHeader>

      {searchParams.connected && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm animate-fade-up">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <span>
            {searchParams.connected} conta(s) conectada(s) com sucesso! As
            automações já estão valendo.
          </span>
        </div>
      )}

      {searchParams.error && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm animate-fade-up">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          <span>
            {ERROR_MESSAGES[searchParams.error] ?? ERROR_MESSAGES.unknown}
          </span>
        </div>
      )}

      {accounts.length === 0 ? (
        <Card className="animate-fade-up">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
              <Instagram className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold">
                Nenhuma conta conectada
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Clique em “Conectar Instagram” e autorize com o Facebook. É
                necessária uma conta IG Profissional vinculada a uma Página.
              </p>
            </div>
            <Button asChild>
              <a href="/api/auth/meta">
                <Instagram />
                Conectar Instagram
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((account, i) => (
            <AccountCard key={account.id} account={account} index={i} />
          ))}
        </div>
      )}

      <Card className="mt-8 animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-4 w-4 text-primary" />
            Configuração do webhook no painel Meta
          </CardTitle>
          <CardDescription>
            No app Meta (developers.facebook.com), em Webhooks → Instagram,
            configure:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Callback URL:</span>
            <code className="rounded bg-background/60 px-2 py-1 font-mono text-xs text-primary">
              {webhookUrl}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Verify token:</span>
            <code className="rounded bg-background/60 px-2 py-1 font-mono text-xs text-primary">
              valor de META_VERIFY_TOKEN no seu .env
            </code>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Assine o campo <code className="font-mono">messages</code>. Em
            desenvolvimento, exponha o localhost com um túnel (ngrok,
            cloudflared).
          </p>
        </CardContent>
      </Card>
    </>
  );
}
