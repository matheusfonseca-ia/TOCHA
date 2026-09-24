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

// A busca e o CSV rodam no navegador sobre esta lista.
const CONTACTS_LIMIT = 2000;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { conta?: string };
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

  let query = supabase
    .from("contacts")
    .select("*, ig_accounts(ig_username)")
    .order("updated_at", { ascending: false })
    .limit(CONTACTS_LIMIT);
  if (selectedId) query = query.eq("account_id", selectedId);

  const { data, error } = await query;
  const contacts = (data ?? []) as ContactRow[];

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
      ) : contacts.length === 0 ? (
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
          <ContactsTable contacts={contacts} showAccount={accounts.length > 1} />
          {contacts.length === CONTACTS_LIMIT && (
            <p className="mt-3 text-xs text-muted-foreground">
              Mostrando os {CONTACTS_LIMIT} contatos atualizados mais recentemente.
            </p>
          )}
        </>
      )}
    </>
  );
}
