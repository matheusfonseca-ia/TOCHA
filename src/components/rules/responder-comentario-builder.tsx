"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Link2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { CommentPhonePreview } from "@/components/rules/comment-phone-preview";
import { MediaPicker } from "@/components/rules/media-picker";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  deriveTitleFromUrl,
  emptyLink,
  normalizeUrl,
  type LinkSlot,
} from "@/lib/rules/links";
import { saveRule, type RuleInput } from "@/app/(dashboard)/rules/actions";
import type { MediaRef } from "@/types/database";

const EXAMPLES = ["Preço", "Link", "Comprar"];

interface AccountOption {
  id: string;
  ig_username: string;
  profile_picture_url: string | null;
  media: MediaRef[];
}

function RadioRow({
  selected,
  onSelect,
  label,
  disabled,
  badge,
  children,
}: {
  selected: boolean;
  onSelect?: () => void;
  label: string;
  disabled?: boolean;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:bg-secondary/30"
        )}
      >
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-primary" : "border-border"
          )}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
        </span>
        <span className="flex-1">{label}</span>
        {badge && (
          <span className="rounded border border-border/70 bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {badge}
          </span>
        )}
      </button>
      {selected && children && <div className="ml-6 mt-2">{children}</div>}
    </div>
  );
}

function DisabledToggleRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 opacity-50">
      <Label className="text-sm font-normal">{label}</Label>
      <div className="flex items-center gap-2">
        <span className="rounded border border-border/70 bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Em breve
        </span>
        <Switch checked={false} disabled />
      </div>
    </div>
  );
}

export function ResponderComentarioBuilder({
  accounts,
}: {
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [accountId, setAccountId] = useState(accounts[0].id);
  const [mediaMode, setMediaMode] = useState<"specific" | "any">("specific");
  const [selectedMedia, setSelectedMedia] = useState<MediaRef[]>([]);
  const [commentMode, setCommentMode] = useState<"keyword" | "any">("keyword");
  const [keywordInput, setKeywordInput] = useState("");
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [publicReplyText, setPublicReplyText] = useState("");
  const [welcomeText, setWelcomeText] = useState("");
  const [welcomeButtonLabel, setWelcomeButtonLabel] = useState("");
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

  function toggleMedia(media: MediaRef) {
    setSelectedMedia((prev) =>
      prev.some((m) => m.id === media.id)
        ? prev.filter((m) => m.id !== media.id)
        : [...prev, media]
    );
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
    if (mediaMode === "specific" && selectedMedia.length === 0) {
      toast.error("Selecione ao menos uma publicação ou Reel.");
      return;
    }
    if (commentMode === "keyword" && keywordTerms.length === 0) {
      toast.error("Adicione ao menos uma palavra-chave.");
      return;
    }
    if (!welcomeText.trim()) {
      toast.error("Escreva a mensagem de boas-vindas.");
      return;
    }
    if (!welcomeButtonLabel.trim()) {
      toast.error("Dê um nome ao botão da mensagem de boas-vindas.");
      return;
    }
    if (!message.trim()) {
      toast.error("Escreva a mensagem que vai conter o link.");
      return;
    }
    if (publicReplyEnabled && !publicReplyText.trim()) {
      toast.error("Escreva a resposta pública (ou desative a opção).");
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
      trigger_type: "comment",
      keyword: commentMode === "keyword" ? keywordTerms.join(", ") : undefined,
      match_type: "contains",
      media_mode: mediaMode,
      media_refs: mediaMode === "specific" ? selectedMedia : undefined,
      comment_any_word: commentMode === "any",
      public_reply_enabled: publicReplyEnabled,
      public_reply_text: publicReplyEnabled ? publicReplyText.trim() : undefined,
      welcome_text: welcomeText.trim(),
      welcome_button_label: welcomeButtonLabel.trim(),
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
      toast.success("Automação ativada — já está respondendo comentários.");
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
            <CardContent className="space-y-5 p-6">
              <h2 className="font-display text-[15px] font-semibold tracking-tight">
                Quando alguém faz um comentário
              </h2>

              <div className="space-y-1">
                <RadioRow
                  label="uma publicação ou Reels específico"
                  selected={mediaMode === "specific"}
                  onSelect={() => setMediaMode("specific")}
                >
                  <MediaPicker
                    media={selectedAccount.media}
                    selectedIds={selectedMedia.map((m) => m.id)}
                    onToggle={toggleMedia}
                  />
                </RadioRow>
                <RadioRow
                  label="qualquer publicação ou Reel"
                  selected={mediaMode === "any"}
                  onSelect={() => setMediaMode("any")}
                />
                <RadioRow
                  label="próxima publicação ou Reel"
                  selected={false}
                  disabled
                  badge="Em breve"
                />
              </div>

              <div className="space-y-1 border-t border-border/70 pt-4">
                <h3 className="px-2 pb-1 text-sm font-semibold">
                  E esse comentário possui
                </h3>
                <RadioRow
                  label="uma palavra ou expressão específica"
                  selected={commentMode === "keyword"}
                  onSelect={() => setCommentMode("keyword")}
                >
                  <div className="space-y-2">
                    <Input
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
                </RadioRow>
                <RadioRow
                  label="qualquer palavra"
                  selected={commentMode === "any"}
                  onSelect={() => setCommentMode("any")}
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
                <Label htmlFor="public-reply" className="text-sm font-normal">
                  interagir com os comentários deles na publicação
                </Label>
                <Switch
                  id="public-reply"
                  checked={publicReplyEnabled}
                  onCheckedChange={setPublicReplyEnabled}
                />
              </div>
              {publicReplyEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="public-reply-text">
                    Resposta pública, visível embaixo do comentário
                  </Label>
                  <Textarea
                    id="public-reply-text"
                    placeholder="Ex.: Te chamei no direct! 📩"
                    rows={2}
                    value={publicReplyText}
                    onChange={(e) => setPublicReplyText(e.target.value)}
                  />
                </div>
              )}

              {accounts.length > 1 && (
                <div className="space-y-2 border-t border-border/70 pt-4">
                  <Label>Conta do Instagram</Label>
                  <Select
                    value={accountId}
                    onValueChange={(v) => {
                      setAccountId(v);
                      setSelectedMedia([]);
                    }}
                  >
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
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-[15px] font-semibold tracking-tight">
                  Eles receberão
                </h2>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="welcome" className="text-sm font-normal">
                    uma mensagem de boas-vindas
                  </Label>
                  <Switch checked disabled />
                </div>
                <Textarea
                  id="welcome"
                  placeholder="Olá! Muito obrigado pelo seu interesse 😊 Clique abaixo e eu te mando o link em um segundo ✨"
                  rows={4}
                  value={welcomeText}
                  onChange={(e) => setWelcomeText(e.target.value)}
                />
                <Input
                  placeholder="Me envie o link"
                  maxLength={20}
                  value={welcomeButtonLabel}
                  onChange={(e) => setWelcomeButtonLabel(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Essa é a resposta privada ao comentário — sai com um botão que,
                  ao ser tocado, libera a próxima mensagem.
                </p>
              </div>

              <div className="space-y-3 border-t border-border/70 pt-4">
                <DisabledToggleRow label="uma DM solicitando que sigam seu perfil antes de receberem o link" />
                <DisabledToggleRow label="uma DM solicitando o endereço de e-mail" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-display text-[15px] font-semibold tracking-tight">
                {links.length > 0
                  ? "E então, eles vão receber uma DM com um link"
                  : "E então, eles vão receber uma DM"}
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

              <div className="border-t border-border/70 pt-4">
                <DisabledToggleRow label="uma DM de lembrete, caso o link não tenha sido acessado" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-8 xl:self-start">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground xl:text-left">
            Visualização
          </p>
          <CommentPhonePreview
            username={selectedAccount.ig_username}
            avatarUrl={selectedAccount.profile_picture_url}
            selectedMedia={selectedMedia[0] ?? null}
            anyMedia={mediaMode === "any"}
            commentText={keywordTerms[0] ?? ""}
            publicReplyEnabled={publicReplyEnabled}
            publicReplyText={publicReplyText}
            welcomeText={welcomeText}
            welcomeButtonLabel={welcomeButtonLabel}
            linkMessageText={message}
            links={previewLinks}
          />
        </div>
      </div>
    </div>
  );
}
