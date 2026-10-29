import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { appUrl } from "@/lib/app-url";
import { encryptToken } from "@/lib/crypto";
import { hasActiveAccess, isAdmin } from "@/lib/billing/access";
import { connectBlockReason, MAX_ACCOUNTS_PER_USER } from "@/lib/meta/connect-guard";
import { subscribeAccountToWebhooks } from "@/lib/meta/graph";
import { tokenExpiresAtFrom } from "@/lib/meta/token";
import {
  exchangeCodeForToken,
  getInstagramProfile,
  getLongLivedToken,
  META_OAUTH_COOKIE,
  META_OAUTH_COOKIE_PATH,
} from "@/lib/meta/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirectToAccounts(params: string) {
  return NextResponse.redirect(appUrl(`/accounts?${params}`));
}

/** Valor que desliga uma conta: sem token guardado (a coluna é not null). */
const DISCONNECTED = { status: "disconnected", access_token_enc: "", token_expires_at: null } as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Usuário negou a autorização no diálogo do Instagram
  if (searchParams.get("error")) {
    return redirectToAccounts("error=oauth_denied");
  }

  // Validação do state anti-CSRF. O cookie é `state:user_id` (quem iniciou).
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieStore = cookies();
  const [expectedState, startedBy] = (cookieStore.get(META_OAUTH_COOKIE)?.value ?? "").split(":");
  cookieStore.delete({ name: META_OAUTH_COOKIE, path: META_OAUTH_COOKIE_PATH });

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToAccounts("error=invalid_state");
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(appUrl("/login"));
  }
  // A sessão trocou durante a autorização (navegador compartilhado): o @ não
  // pode ir para quem não clicou em "Conectar".
  if (startedBy !== user.id) {
    return redirectToAccounts("error=invalid_state");
  }

  try {
    // Confere de novo: o cliente pode ter sido bloqueado durante a autorização.
    if (!(await hasActiveAccess(supabase, user.id))) {
      return NextResponse.redirect(appUrl("/assinatura"));
    }
    // code → token curto → token longo (~60 dias) → perfil da conta
    const { token: shortToken } = await exchangeCodeForToken(code);
    const { token: longToken, expiresIn } = await getLongLivedToken(shortToken);
    const profile = await getInstagramProfile(longToken);

    // O id entra num filtro .or(...): só dígitos (cai em exchange_failed no catch).
    if (!/^\d+$/.test(profile.igUserId)) {
      throw new Error("ig_user_id inesperado na resposta do Instagram");
    }

    const admin = createAdminClient();
    const owner = isAdmin(user.id);

    // O RLS só mostra as contas do próprio usuário; o @ de outro login só
    // aparece pela service role.
    const { data: activeAccounts, error: accountsError } = await admin
      .from("ig_accounts")
      .select("id, user_id, ig_user_id")
      .eq("status", "active")
      .or(`ig_user_id.eq.${profile.igUserId},user_id.eq.${user.id}`);
    if (accountsError) throw new Error(`ig_accounts: ${accountsError.message}`);
    let accounts = (activeAccounts ?? []) as { id: string; user_id: string; ig_user_id: string }[];

    // Este @ ativo em outro login cujo dono perdeu o acesso (cancelou, foi
    // bloqueado, cortesia venceu): o bot já não o atende e o ex-dono nem entra
    // no painel para desconectar. O OAuth acabou de provar que quem está aqui
    // controla a conta do Instagram, então a linha antiga é desligada (token
    // apagado) e a conexão segue. Dono com acesso continua bloqueando.
    for (const stale of accounts.filter((a) => a.ig_user_id === profile.igUserId && a.user_id !== user.id)) {
      if (await hasActiveAccess(admin, stale.user_id)) continue;
      const { error: releaseError } = await admin
        .from("ig_accounts")
        .update(DISCONNECTED)
        .eq("id", stale.id)
        .eq("status", "active");
      if (releaseError) throw new Error(`ig_accounts (liberar @): ${releaseError.message}`);
      console.warn(`[oauth] @${profile.username} liberado da conta ${stale.id} (usuário ${stale.user_id} sem acesso).`);
      accounts = accounts.filter((a) => a.id !== stale.id);
    }

    const blocked = connectBlockReason({
      userId: user.id,
      igUserId: profile.igUserId,
      owner,
      activeAccounts: accounts,
    });
    if (blocked) return redirectToAccounts(`error=${blocked}`);

    // Necessário para o Meta entregar eventos de mensagens desta conta. Falha
    // aqui não impede a conexão, mas a tela avisa e oferece tentar de novo:
    // sem a inscrição nenhuma automação dispara.
    let webhookFailed = false;
    try {
      await subscribeAccountToWebhooks(longToken);
    } catch (err) {
      webhookFailed = true;
      console.warn(
        `[oauth] falha ao inscrever @${profile.username} no webhook:`,
        err instanceof Error ? err.message : err
      );
    }

    // Escrita pela service role: o user_id vem da sessão validada acima (a policy de ig_accounts é só leitura, migration 0022).
    const { data: saved, error } = await admin
      .from("ig_accounts")
      .upsert(
        {
          user_id: user.id,
          ig_user_id: profile.igUserId,
          ig_username: profile.username,
          page_id: null,
          page_name: null,
          profile_picture_url: profile.profilePictureUrl,
          access_token_enc: encryptToken(longToken),
          token_expires_at: tokenExpiresAtFrom(expiresIn),
          status: "active",
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,ig_user_id" }
      )
      .select("id")
      .single();

    if (error || !saved) {
      console.error("[oauth] erro ao salvar conta:", error?.message ?? "sem linha");
      // Corrida com outro login conectando o mesmo @ (índice único da 0020).
      if (error?.code === "23505") return redirectToAccounts("error=account_taken");
      return redirectToAccounts("error=unknown");
    }
    const accountId = (saved as { id: string }).id;

    // O limite de contas só foi conferido numa leitura anterior: dois callbacks
    // simultâneos do mesmo usuário passariam os dois. Reconfere depois de
    // gravar; se já existe outra conta ativa, desfaz esta (na pior corrida as
    // duas se desfazem e o cliente conecta de novo, nunca ficam duas).
    if (!owner) {
      const { data: mine, error: mineError } = await admin
        .from("ig_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active");
      if (mineError) throw new Error(`ig_accounts (limite): ${mineError.message}`);
      const others = ((mine ?? []) as { id: string }[]).filter((a) => a.id !== accountId);
      if (others.length >= MAX_ACCOUNTS_PER_USER) {
        await admin.from("ig_accounts").update(DISCONNECTED).eq("id", accountId);
        return redirectToAccounts("error=account_limit");
      }
    }

    if (webhookFailed) {
      return redirectToAccounts(`connected=1&webhook=failed&account=${encodeURIComponent(accountId)}`);
    }
    return redirectToAccounts("connected=1");
  } catch (err) {
    console.error("[oauth] callback falhou:", err);
    return redirectToAccounts("error=exchange_failed");
  }
}
