import { AlertTriangle, CheckCircle2, Instagram } from "lucide-react";

import { AccountCard } from "@/components/accounts/account-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/app-url";
import { withSyncedProfiles } from "@/lib/meta/account-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AiSettingsCard } from "@/modules/ai-settings";
import { getAiSettingsStatus } from "@/modules/ai-settings/server";
import type { IgAccount } from "@/types/database";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "Autorização cancelada no Instagram.",
  invalid_state: "Sessão OAuth inválida. Tente novamente.",
  no_ig_account:
    "Conta incompatível. Use uma conta Profissional (Comercial ou Criador de Conteúdo).",
  exchange_failed:
    "Falha ao conectar. Confira INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET e se a conta aceitou o convite de testadora no painel Meta.",
  account_limit: "Seu plano permite 1 conta do Instagram. Desconecte a atual para conectar outra.",
  account_taken: "Esse @ já está conectado em outra conta do Falow. Desconecte por lá primeiro.",
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
    .select("id, ig_username, page_name, profile_picture_url, status, connected_at, access_token_enc")
    .order("connected_at", { ascending: false });

  const stored = (data ?? []) as Pick<
    IgAccount,
    "id" | "ig_username" | "page_name" | "profile_picture_url" | "status" | "connected_at" | "access_token_enc"
  >[];
  // @ e foto mudam no Instagram sem aviso: contas ativas mostram (e gravam)
  // os atuais; o token criptografado não segue para o client.
  const synced = new Map(
    (await withSyncedProfiles(createAdminClient(), stored.filter((a) => a.status === "active"))).map(
      (a) => [a.id, a]
    )
  );
  const accounts = stored.map(
    ({ access_token_enc: _token, ...account }) => synced.get(account.id) ?? account
  );

  const aiStatus = await getAiSettingsStatus();

  return (
    <>
      <PageHeader
        title="Contas"
        description="Contas do Instagram conectadas via Meta."
      >
        <Button asChild>
          <a href={withBasePath("/api/auth/meta")}>
            <Instagram />
            Conectar Instagram
          </a>
        </Button>
      </PageHeader>

      {searchParams.connected && (
        <div className="mb-6 flex items-center gap-2.5 rounded-lg border border-success/25 bg-success/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200 animate-fade-up">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          <span>
            {searchParams.connected} conta(s) conectada(s) com sucesso. As
            automações já estão valendo.
          </span>
        </div>
      )}

      {searchParams.error && (
        <div className="mb-6 flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-900 dark:text-red-200 animate-fade-up">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>
            {ERROR_MESSAGES[searchParams.error] ?? ERROR_MESSAGES.unknown}
          </span>
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={Instagram}
          title="Nenhuma conta conectada"
          description="Clique em “Conectar Instagram” e autorize com a própria conta do Instagram. É necessária uma conta Profissional (Comercial ou Criador)."
        >
          <Button asChild>
            <a href={withBasePath("/api/auth/meta")}>
              <Instagram />
              Conectar Instagram
            </a>
          </Button>
        </EmptyState>
      ) : (
        // Cartões de conta em grade: 1 coluna no celular, 2 a partir de sm e
        // 3 em 2xl (área útil >= ~1200px).
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {accounts.map((account, i) => (
            <AccountCard key={account.id} account={account} index={i} />
          ))}
        </div>
      )}

      <AiSettingsCard status={aiStatus} />
    </>
  );
}
