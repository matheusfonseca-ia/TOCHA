"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, Search, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { withBasePath } from "@/lib/app-url";
import { contactFieldKeys } from "@/lib/contacts/csv";
import { contactSearchText, matchesTerms, searchTerms } from "@/lib/contacts/search";
import type { Contact } from "@/types/database";

export type ContactRow = Contact & { ig_accounts: { ig_username: string } | null };

/**
 * Tabela de uma página de contatos. A busca filtra a página carregada; o CSV
 * sai do servidor (`/contatos/exportar`) com todos os contatos da conta que
 * combinam com a busca, não só os desta página.
 */
export function ContactsTable({
  contacts,
  showAccount,
  accountId = "",
  total,
}: {
  contacts: ContactRow[];
  showAccount: boolean;
  /** Conta filtrada na página (vazio = todas), repassada ao export. */
  accountId?: string;
  /** Total de contatos (todas as páginas), quando conhecido. */
  total?: number;
}) {
  const [query, setQuery] = useState("");

  const indexed = useMemo(
    () => contacts.map((c) => ({ contact: c, text: contactSearchText(c) })),
    [contacts]
  );
  const filtered = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return contacts;
    return indexed
      .filter(({ text }) => matchesTerms(text, terms))
      .map(({ contact }) => contact);
  }, [indexed, contacts, query]);

  const fieldKeys = useMemo(() => contactFieldKeys(contacts), [contacts]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm xl:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por @, campo ou tag"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar contatos"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length === contacts.length
            ? `${total ?? contacts.length} ${(total ?? contacts.length) === 1 ? "contato" : "contatos"}`
            : `${filtered.length} de ${contacts.length} nesta página`}
        </span>
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <a href={withBasePath(`/contatos/exportar?${new URLSearchParams({ conta: accountId, q: query }).toString()}`)} download>
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </a>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum contato encontrado"
          description="Nenhum contato combina com a busca. Tente outro termo."
        />
      ) : (
        <Card className="animate-fade-up overflow-hidden">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Contato</TableHead>
                {showAccount && <TableHead>Conta</TableHead>}
                {fieldKeys.map((key) => (
                  <TableHead key={key} className="font-mono text-xs">
                    {key}
                  </TableHead>
                ))}
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Atualizado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    {c.ig_username ? (
                      <span className="text-sm font-medium">@{c.ig_username}</span>
                    ) : (
                      <span
                        className="font-mono text-xs text-muted-foreground"
                        title="O @ aparece quando a Meta informa o nome de usuário"
                      >
                        ID {c.ig_sender_id}
                      </span>
                    )}
                  </TableCell>
                  {showAccount && (
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      @{c.ig_accounts?.ig_username ?? "?"}
                    </TableCell>
                  )}
                  {fieldKeys.map((key) => {
                    const value = c.fields?.[key];
                    return (
                      <TableCell key={key}>
                        {value ? (
                          <p className="max-w-[220px] truncate text-sm xl:max-w-[320px] 2xl:max-w-[420px]" title={String(value)}>
                            {String(value)}
                          </p>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">vazio</span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    {c.tags?.length ? (
                      <div className="flex max-w-[240px] flex-wrap gap-1 xl:max-w-[340px] 2xl:max-w-[440px]">
                        {c.tags.map((tag) => (
                          <Badge key={tag} variant="muted">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">nenhuma</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                    {format(new Date(c.updated_at), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
