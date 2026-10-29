import { format } from "date-fns";

import { hasActiveAccess } from "@/lib/billing/access";
import { contactsToCsv } from "@/lib/contacts/csv";
import { contactSearchText, matchesTerms, searchTerms } from "@/lib/contacts/search";
import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/types/database";

export const dynamic = "force-dynamic";

const PAGE = 1000;
// Teto de segurança do export (memória do Worker).
const MAX_ROWS = 50_000;

type Row = Contact & { ig_accounts: { ig_username: string } | null };

/**
 * Export CSV da página Contatos, gerado no servidor em páginas de 1000 (o
 * teto do PostgREST) em vez de depender da lista carregada no navegador: a
 * tabela mostra uma página por vez, o CSV leva todos os contatos (da conta
 * filtrada e que combinam com a busca). Client do usuário: o RLS limita às
 * contas dele.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await hasActiveAccess(supabase, user.id))) {
    return new Response("Sem acesso.", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const accountId = (params.get("conta") ?? "").slice(0, 64);
  const terms = searchTerms((params.get("q") ?? "").slice(0, 100));

  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = supabase
      .from("contacts")
      .select("id, account_id, ig_sender_id, ig_username, fields, tags, created_at, updated_at, ig_accounts(ig_username)")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (accountId) query = query.eq("account_id", accountId);
    const { data, error } = await query;
    if (error) {
      console.error("[contatos] falha no export:", error.message);
      return new Response("Não foi possível exportar os contatos.", { status: 500 });
    }
    const page = (data ?? []) as unknown as Row[];
    for (const c of page) if (terms.length === 0 || matchesTerms(contactSearchText(c), terms)) rows.push(c);
    if (page.length < PAGE) break;
  }

  const csv = contactsToCsv(rows.map((c) => ({ ...c, account_username: c.ig_accounts?.ig_username ?? null })));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contatos-falow-${format(new Date(), "yyyy-MM-dd")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
