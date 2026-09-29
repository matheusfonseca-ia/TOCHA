import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { InboxShell, type InboxAccount, type InboxFilters } from "@/modules/crm";
import { getThread, listAllTagNames, listConversations, listTagCatalog } from "@/modules/crm/server";

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: { c?: string; conta?: string; filtro?: string; q?: string; tag?: string };
}) {
  const supabase = createClient();

  const { data: accountsData } = await supabase
    .from("ig_accounts")
    .select("id, ig_username")
    .order("connected_at");
  const accounts = (accountsData ?? []) as InboxAccount[];

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title="Conversas" description="As DMs da sua conta do Instagram, ao vivo." />
        <EmptyState
          icon={Instagram}
          title="Nenhuma conta conectada"
          description="Conecte a conta do Instagram para as conversas aparecerem aqui."
        >
          <Button asChild>
            <Link href="/accounts">Conectar conta</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  const filters: InboxFilters = {
    accountId: accounts.some((a) => a.id === searchParams.conta) ? (searchParams.conta as string) : "",
    status:
      searchParams.filtro === "nao-lidas" ? "unread" : searchParams.filtro === "concluidas" ? "done" : "open",
    q: (searchParams.q ?? "").slice(0, 60),
    tag: (searchParams.tag ?? "").slice(0, 60),
  };

  const [list, thread, tagOptions] = await Promise.all([
    listConversations(supabase, filters),
    searchParams.c ? getThread(supabase, searchParams.c) : Promise.resolve(null),
    filters.accountId ? listTagCatalog(supabase, filters.accountId) : listAllTagNames(supabase),
  ]);

  return (
    <InboxShell
      accounts={accounts}
      conversations={list.conversations}
      listError={list.error}
      filters={filters}
      thread={thread}
      tagOptions={tagOptions}
    />
  );
}
