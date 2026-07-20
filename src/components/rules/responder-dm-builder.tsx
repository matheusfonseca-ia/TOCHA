"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Link2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { DmPhonePreview } from "@/components/rules/dm-phone-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  deriveTitleFromUrl,
  emptyLink,
  normalizeUrl,
  type LinkSlot,
} from "@/lib/rules/links";
import { saveRule, type RuleInput } from "@/app/(dashboard)/rules/actions";

const EXAMPLES = ["Preço", "Link", "Comprar"];

interface AccountOption {
  id: string;
  ig_username: string;
  profile_picture_url: string | null;
}

export function ResponderDmBuilder({
  accounts,
}: {
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [accountId, setAccountId] = useState(accounts[0].id);
  const [keywordInput, setKeywordInput] = useState("");
  const [message, setMessage] = useState("");
  const [links, setLinks] = useState<LinkSlot[]>([]);

  const selectedAccount =
    accounts.find((a) => a.id === accountId) ?? accounts[0];

  const keywordTerms = useMemo(
    () =>
      keywordInput
        .split(",")
        .map((term) => term.trim())
        .filter(Boolean),
    [keywordInput]
  );

  function toggleExample(example: string) {
    const exists = keywordTerms.some(
      (term) => term.toLowerCase() === example.toLowerCase()
    );
    const next = exists
      ? keywordTerms.filter((term) => term.toLowerCase() !== example.toLowerCase())
      : [...keywordTerms, example];
    setKeywordInput(next.join(", "));
  }

  function addLink() {
    setLinks((prev) => (prev.length >= 3 ? prev : [...prev, emptyLink()]));
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLinkUrl(index: number, url: string) {
    setLinks((prev) =>
      prev.map((link, i) =>
        i === index
          ? {
              ...link,
              url,
              title: link.touched ? link.title : deriveTitleFromUrl(url),
            }
          : link
      )
    );
  }

  function updateLinkTitle(index: number, title: string) {
    setLinks((prev) =>
      prev.map((link, i) =>
        i === index ? { ...link, title, touched: title.trim().length > 0 } : link
      )
    );
  }

  function handleActivate() {
    if (keywordTerms.length === 0) {
      toast.error("Adicione ao menos uma palavra-chave.");
      return;
    }
    if (!message.trim()) {
      toast.error("Escreva a mensagem de resposta.");
      return;
    }

    const activeLinks = links.filter((link) => link.url.trim());
    for (const link of activeLinks) {
      if (!link.title.trim()) {
        toast.error("Dê um nome ao botão do link (ou remova o link).");
        return;
      }
    }

    const input: RuleInput = {
      account_id: accountId,
      keyword: keywordTerms.join(", "),
      match_type: "contains",
      reply_type: activeLinks.length > 0 ? "buttons" : "text",
      reply_text: message.trim(),
      reply_buttons:
        activeLinks.length > 0
          ? activeLinks.map((link) => ({
              title: link.title.trim().slice(0, 20),
              url: normalizeUrl(link.url),
            }))
          : undefined,
      delay_seconds: 3,
      is_active: true,
    };

    startTransition(async () => {
      const result = await saveRule(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Automação ativada — já está respondendo DMs.");
      router.push("/rules");
    });
  }

  const previewLinks = links
    .filter((link) => link.url.trim())
    .map((link) => ({ title: link.title || "Link", url: link.url }));

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2.5 text-muted-foreground"
        >
          <Link href="/rules/nova">
            <ArrowLeft className="h-4 w-4" />
            Novo gatilho
          </Link>
        </Button>
        <Button onClick={handleActivate} disabled={isPending} size="lg">
          {isPending ? "Ativando..." : "Ativar"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-display text-[15px] font-semibold tracking-tight">
                Quando alguém te enviar uma DM com
              </h2>

              <div className="space-y-2">
                <Label htmlFor="keyword">
                  uma palavra ou expressão específica
                </Label>
                <Input
                  id="keyword"
                  placeholder="Digite uma ou mais palavras"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use vírgulas para separar as palavras
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">
                    Por exemplo:
                  </span>
                  {EXAMPLES.map((example) => {
                    const active = keywordTerms.some(
                      (term) => term.toLowerCase() === example.toLowerCase()
                    );
                    return (
                      <button
                        key={example}
                        type="button"
                        onClick={() => toggleExample(example)}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                          active
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-border/70 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                        )}
                      >
                        {example}
                      </button>
                    );
                  })}
                </div>
              </div>

              {accounts.length > 1 && (
                <div className="space-y-2 border-t border-border/70 pt-4">
                  <Label>Conta do Instagram</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          @{account.ig_username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-display text-[15px] font-semibold tracking-tight">
                {links.length > 0
                  ? "Uma DM com um link será enviada para eles de volta"
                  : "Uma DM será enviada para eles de volta"}
              </h2>

              <div className="space-y-2">
                <Label htmlFor="message">
                  {links.length > 0 ? "uma DM contendo um link" : "sua mensagem"}
                </Label>
                <Textarea
                  id="message"
                  placeholder="Escreva uma mensagem"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {links.map((link, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-md border border-border/70 bg-secondary/20 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Link2 className="h-3.5 w-3.5" />
                      Link {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLink(index)}
                      aria-label="Remover link"
                      className="text-muted-foreground/70 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="w-full sm:w-36"
                      placeholder="Texto do botão"
                      maxLength={20}
                      value={link.title}
                      onChange={(e) => updateLinkTitle(index, e.target.value)}
                    />
                    <Input
                      className="min-w-[180px] flex-1"
                      placeholder="https://seulink.com"
                      value={link.url}
                      onChange={(e) => updateLinkUrl(index, e.target.value)}
                    />
                  </div>
                </div>
              ))}

              {links.length < 3 && (
                <Button type="button" variant="outline" size="sm" onClick={addLink}>
                  <Plus className="h-4 w-4" />
                  {links.length === 0 ? "Adicionar Um Link" : "Adicionar outro link"}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-8 xl:self-start">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground xl:text-left">
            Visualização
          </p>
          <DmPhonePreview
            username={selectedAccount.ig_username}
            avatarUrl={selectedAccount.profile_picture_url}
            incomingText={keywordTerms[0] ?? ""}
            replyText={message}
            links={previewLinks}
          />
          <div className="mt-3 flex justify-center">
            <span className="inline-flex items-center rounded-full border border-border/70 bg-secondary/40 px-3 py-1 text-xs font-medium text-muted-foreground">
              DM
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
