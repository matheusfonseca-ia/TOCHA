"use client";

import { useState, useTransition } from "react";
import {
  Image as ImageIcon,
  MessageSquareText,
  MoreHorizontal,
  MousePointerClick,
  Pencil,
  Plus,
  Timer,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { MatchType, ReplyType, Rule } from "@/types/database";
import {
  deleteRule,
  saveRule,
  toggleRule,
  type RuleInput,
} from "@/app/(dashboard)/rules/actions";

export type RuleWithAccount = Rule & {
  ig_accounts: { ig_username: string } | null;
};

interface AccountOption {
  id: string;
  ig_username: string;
}

const MATCH_LABELS: Record<MatchType, string> = {
  exact: "Mensagem exata",
  contains: "Contém a palavra",
  starts_with: "Começa com",
};

const REPLY_ICONS: Record<ReplyType, typeof MessageSquareText> = {
  text: MessageSquareText,
  image: ImageIcon,
  buttons: MousePointerClick,
};

interface ButtonSlot {
  title: string;
  url: string;
}

interface FormState {
  id?: string;
  account_id: string;
  keyword: string;
  match_type: MatchType;
  reply_type: ReplyType;
  reply_text: string;
  reply_image_url: string;
  buttons: ButtonSlot[];
  delay_seconds: number;
  is_active: boolean;
}

function emptyForm(defaultAccountId: string): FormState {
  return {
    account_id: defaultAccountId,
    keyword: "",
    match_type: "contains",
    reply_type: "text",
    reply_text: "",
    reply_image_url: "",
    buttons: [
      { title: "", url: "" },
      { title: "", url: "" },
      { title: "", url: "" },
    ],
    delay_seconds: 3,
    is_active: true,
  };
}

function formFromRule(rule: RuleWithAccount): FormState {
  const buttons: ButtonSlot[] = [
    { title: "", url: "" },
    { title: "", url: "" },
    { title: "", url: "" },
  ];
  (rule.reply_buttons ?? []).slice(0, 3).forEach((b, i) => {
    buttons[i] = { title: b.title, url: b.url };
  });
  return {
    id: rule.id,
    account_id: rule.account_id,
    keyword: rule.keyword,
    match_type: rule.match_type,
    reply_type: rule.reply_type,
    reply_text: rule.reply_text ?? "",
    reply_image_url: rule.reply_image_url ?? "",
    buttons,
    delay_seconds: rule.delay_seconds,
    is_active: rule.is_active,
  };
}

export function RulesManager({
  rules,
  accounts,
}: {
  rules: RuleWithAccount[];
  accounts: AccountOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(accounts[0]?.id ?? "")
  );

  const patch = (partial: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...partial }));

  function openCreate() {
    setForm(emptyForm(accounts[0]?.id ?? ""));
    setOpen(true);
  }

  function openEdit(rule: RuleWithAccount) {
    setForm(formFromRule(rule));
    setOpen(true);
  }

  function handleSubmit() {
    const input: RuleInput = {
      id: form.id,
      account_id: form.account_id,
      keyword: form.keyword,
      match_type: form.match_type,
      reply_type: form.reply_type,
      reply_text: form.reply_text || undefined,
      reply_image_url: form.reply_image_url || undefined,
      reply_buttons: form.buttons.filter((b) => b.title.trim() && b.url.trim()),
      delay_seconds: form.delay_seconds,
      is_active: form.is_active,
    };

    startTransition(async () => {
      const result = await saveRule(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(form.id ? "Regra atualizada." : "Regra criada.");
      setOpen(false);
    });
  }

  function handleToggle(rule: RuleWithAccount, next: boolean) {
    startTransition(async () => {
      const result = await toggleRule(rule.id, next);
      if (result.error) toast.error(result.error);
    });
  }

  function handleDelete(rule: RuleWithAccount) {
    if (!window.confirm(`Excluir a regra "${rule.keyword}"?`)) return;
    startTransition(async () => {
      const result = await deleteRule(rule.id);
      if (result.error) toast.error(result.error);
      else toast.success("Regra excluída.");
    });
  }

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button onClick={openCreate}>
          <Plus />
          Nova regra
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card className="animate-fade-up">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
              <Zap className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold">
                Nenhuma regra criada
              </h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Crie sua primeira regra: se alguém enviar uma palavra-chave, o
                InstaReply responde na hora.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus />
              Criar primeira regra
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="animate-fade-up overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Se receber</TableHead>
                <TableHead>Responder com</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-center">Delay</TableHead>
                <TableHead className="text-center">Ativa</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => {
                const ReplyIcon = REPLY_ICONS[rule.reply_type];
                return (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge className="font-mono text-[13px]">
                          {rule.keyword}
                        </Badge>
                        <p className="text-[11px] text-muted-foreground">
                          {MATCH_LABELS[rule.match_type]}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <ReplyIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="max-w-[260px] truncate text-sm">
                            {rule.reply_type === "image"
                              ? "Imagem"
                              : (rule.reply_text ?? "")}
                          </p>
                          {rule.reply_type === "buttons" && (
                            <p className="text-[11px] text-muted-foreground">
                              {(rule.reply_buttons ?? []).length} botão(ões)
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      @{rule.ig_accounts?.ig_username ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Timer className="h-3.5 w-3.5" />
                        {rule.delay_seconds}s
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(next) => handleToggle(rule, next)}
                        disabled={isPending}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(rule)}>
                            <Pencil />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(rule)}
                          >
                            <Trash2 />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── Dialog de criação/edição ─────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Editar regra" : "Nova regra de auto-resposta"}
            </DialogTitle>
            <DialogDescription>
              Se receber a palavra-chave, o InstaReply responde automaticamente
              na DM.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Conta do Instagram</Label>
              <Select
                value={form.account_id}
                onValueChange={(v) => patch({ account_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      @{a.ig_username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="keyword">Se receber</Label>
                <Input
                  id="keyword"
                  placeholder="ex.: preço"
                  className="font-mono"
                  value={form.keyword}
                  onChange={(e) => patch({ keyword: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de match</Label>
                <Select
                  value={form.match_type}
                  onValueChange={(v) => patch({ match_type: v as MatchType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contém a palavra</SelectItem>
                    <SelectItem value="exact">Mensagem exata</SelectItem>
                    <SelectItem value="starts_with">Começa com</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Responder com</Label>
              <Tabs
                value={form.reply_type}
                onValueChange={(v) => patch({ reply_type: v as ReplyType })}
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="text">Texto</TabsTrigger>
                  <TabsTrigger value="image">Imagem</TabsTrigger>
                  <TabsTrigger value="buttons">Botões</TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="space-y-2">
                  <Textarea
                    placeholder="Olá! Nosso catálogo completo está em..."
                    rows={4}
                    value={form.reply_text}
                    onChange={(e) => patch({ reply_text: e.target.value })}
                  />
                </TabsContent>

                <TabsContent value="image" className="space-y-2">
                  <Input
                    placeholder="https://exemplo.com/imagem.jpg"
                    value={form.reply_image_url}
                    onChange={(e) =>
                      patch({ reply_image_url: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    URL pública da imagem (JPG/PNG).
                  </p>
                </TabsContent>

                <TabsContent value="buttons" className="space-y-3">
                  <Textarea
                    placeholder="Texto que acompanha os botões..."
                    rows={2}
                    value={form.reply_text}
                    onChange={(e) => patch({ reply_text: e.target.value })}
                  />
                  {form.buttons.map((btn, i) => (
                    <div key={i} className="grid grid-cols-5 gap-2">
                      <Input
                        className="col-span-2"
                        placeholder={`Botão ${i + 1}`}
                        maxLength={20}
                        value={btn.title}
                        onChange={(e) => {
                          const buttons = [...form.buttons];
                          buttons[i] = { ...buttons[i], title: e.target.value };
                          patch({ buttons });
                        }}
                      />
                      <Input
                        className="col-span-3"
                        placeholder="https://..."
                        value={btn.url}
                        onChange={(e) => {
                          const buttons = [...form.buttons];
                          buttons[i] = { ...buttons[i], url: e.target.value };
                          patch({ buttons });
                        }}
                      />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Até 3 botões com link (título máx. 20 caracteres).
                  </p>
                </TabsContent>
              </Tabs>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Delay da resposta</Label>
                <Select
                  value={String(form.delay_seconds)}
                  onValueChange={(v) => patch({ delay_seconds: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5].map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s} segundos
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Simula digitação humana (2–5s).
                </p>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex h-10 items-center gap-3 rounded-md border border-input px-3">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => patch({ is_active: v })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {form.is_active ? "Regra ativa" : "Regra pausada"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar regra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
