import Link from "next/link";
import { DatabaseZap, Users } from "lucide-react";

import {
  ContactsAccountFilter,
  ContactsTable,
  type ContactRow,
} from "@/components/contacts";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

// Uma página por vez (abaixo do teto de 1000 linhas do PostgREST); o CSV é
// gerado no servidor com todos os contatos (`/contatos/exportar`).
const PAGE_SIZE = 200;
const CONTACT_COLUMNS =
  "id, account_id, ig_sender_id, ig_username, fields, tags, created_at, updated_at, ig_accounts(ig_username)";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { conta?: string; pagina?: string };
}) {
  const supabase = createClient();

  const { data: accountsData } = await supabase
    .from("ig_accounts")
    .select("id, ig_username")
    .order("connected_at");
  const accounts = (accountsData ?? []) as { id: string; ig_username: string }[];
  const selectedId = accounts.some((a) => a.id === searchParams.conta)
    ? (searchParams.conta as string)
    : "";

  const page = Math.max(1, Math.min(10_000, Number.parseInt(searchParams.pagina ?? "1", 10) || 1));
  const from = (page - 1) * PAGE_SIZE;
  let query = supabase
    .from("contacts")
    .select(CONTACT_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (selectedId) query = query.eq("account_id", selectedId);

  const { data, error, count } = await query;
  const contacts = (data ?? []) as unknown as ContactRow[];
  const total = count ?? contacts.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (selectedId) params.set("conta", selectedId);
    if (n > 1) params.set("pagina", String(n));
    const qs = params.toString();
    return qs ? `/contatos?${qs}` : "/contatos";
  };

  return (
    <>
      <PageHeader
        title="Contatos"
        description="Dados que as pessoas informaram nos workflows (blocos Coletar dado e Definir campo ou tag)."
      />

      {accounts.length > 1 && (
        <ContactsAccountFilter accounts={accounts} selectedId={selectedId} />
      )}

      {error ? (
        <EmptyState
          icon={DatabaseZap}
          title="Tabela de contatos indisponível"
          description="Aplique a migration 0004_contacts_and_flow_data.sql no SQL Editor do Supabase e recarregue a página."
        />
      ) : contacts.length === 0 && page === 1 ? (
        <EmptyState
          icon={Users}
          title="Nenhum contato ainda"
          description="Adicione um bloco Coletar dado a um workflow para perguntar e-mail, telefone ou qualquer outra informação. As respostas aparecem aqui."
        >
          <Button asChild variant="outline">
            <Link href="/rules/sequencias">Abrir workflows</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <ContactsTable contacts={contacts} showAccount={accounts.length > 1} accountId={selectedId} total={total} />
          {pages > 1 && (
            <nav className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground" aria-label="Páginas de contatos">
              <span>
                Página {Math.min(page, pages)} de {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(page - 1)}>Anterior</Link>
                  </Button>
                )}
                {page < pages && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(page + 1)}>Próxima</Link>
                  </Button>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </>
  );
}
