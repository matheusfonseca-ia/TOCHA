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
import { contactFieldKeys, contactsToCsv } from "@/lib/contacts/csv";
import type { Contact } from "@/types/database";

export type ContactRow = Contact & { ig_accounts: { ig_username: string } | null };

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Texto em que a busca procura: @, id, conta, valores dos campos e tags. */
function searchableText(c: ContactRow): string {
  return normalize(
    [
      c.ig_username ?? "",
      c.ig_sender_id,
      c.ig_accounts?.ig_username ?? "",
      ...Object.values(c.fields ?? {}).map(String),
      ...(c.tags ?? []),
    ].join(" ")
  );
}

function downloadCsv(contacts: ContactRow[]) {
  const csv = contactsToCsv(
    contacts.map((c) => ({ ...c, account_username: c.ig_accounts?.ig_username ?? null }))
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `contatos-falow-${format(new Date(), "yyyy-MM-dd")}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ContactsTable({
  contacts,
  showAccount,
}: {
  contacts: ContactRow[];
  showAccount: boolean;
}) {
  const [query, setQuery] = useState("");

  const indexed = useMemo(
    () => contacts.map((c) => ({ contact: c, text: searchableText(c) })),
    [contacts]
  );
  const filtered = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return contacts;
    return indexed
      .filter(({ text }) => terms.every((t) => text.includes(t)))
      .map(({ contact }) => contact);
  }, [indexed, contacts, query]);

  const fieldKeys = useMemo(() => contactFieldKeys(contacts), [contacts]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
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
            ? `${contacts.length} ${contacts.length === 1 ? "contato" : "contatos"}`
            : `${filtered.length} de ${contacts.length}`}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => downloadCsv(filtered)}
          disabled={filtered.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
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
                          <p className="max-w-[220px] truncate text-sm" title={String(value)}>
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
                      <div className="flex max-w-[240px] flex-wrap gap-1">
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
