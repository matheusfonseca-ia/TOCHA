"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  FolderInput,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Timer,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ExpiryBadge } from "@/components/expiry/expiry-badge";
import { ExpiryDialog, type ExpiryTarget } from "@/components/expiry/expiry-dialog";
import { ExpiryField } from "@/components/expiry/expiry-field";
import type { Folder } from "@/lib/folders/folders";
import { canEditInBuilder } from "@/lib/rules/edit-rule";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  expiryFormFrom,
  resolveExpiryForm,
  type ExpiryFormValue,
} from "@/lib/expiry/expiry";
import type {
  MatchType,
  MediaMode,
  MediaRef,
  ReplyType,
  TriggerType,
} from "@/types/database";
import {
  deleteRule,
  duplicateRule,
  listRuleWorkflowUsage,
  saveRule,
  toggleRule,
  type RuleInput,
} from "@/app/(dashboard)/rules/actions";

import { useListView } from "../hooks/use-list-view";
import type { AccountOption, RuleWithAccount } from "../types";
import { ruleAdapter, ruleTitle, ruleTriggerLine } from "../utils/display";
import {
  applyListView,
  DEFAULT_VIEW,
  isFiltered,
  sanitizeView,
  viewFolderCounts,
} from "../utils/list-view";
import { AutomationList, AutomationRow, FolderChip, NoResults } from "./automation-row";
import { FolderBreadcrumb, FolderCards } from "./folder-cards";
import { ListToolbar } from "./list-toolbar";
import { MoveToFolderDialog, type MoveTarget } from "./move-to-folder-dialog";

interface ButtonSlot {
  title: string;
  url: string;
}

/**
 * Configuração exclusiva de regras de comentário. Este diálogo não a edita
 * (quem cria isso é o builder em /rules/nova/responder-comentario), mas
 * precisa carregá-la de volta no salvar: `saveRule` reescreve a linha inteira,
 * então omitir esses campos apagaria o fluxo de comentário da regra.
 */
interface CommentConfig {
  media_mode: MediaMode | null;
  media_refs: MediaRef[] | null;
  comment_any_word: boolean;
  public_reply_enabled: boolean;
  public_reply_text: string | null;
  /** Variantes extras da resposta pública; este diálogo não edita, só preserva. */
  public_reply_variants: string[] | null;
  welcome_text: string | null;
  /** Variantes extras da boas-vindas; este diálogo não edita, só preserva. */
  welcome_text_variants: string[] | null;
  welcome_button_label: string | null;
}

interface FormState {
  id?: string;
  name: string;
  account_id: string;
  trigger_type: TriggerType;
  keyword: string;
  match_type: MatchType;
  reply_type: ReplyType;
  reply_text: string;
  reply_image_url: string;
  buttons: ButtonSlot[];
  delay_seconds: number;
  is_active: boolean;
  /** Preenchido apenas quando trigger_type === "comment". */
  comment: CommentConfig | null;
  expiry: ExpiryFormValue;
  /** Só envia a expiração se o usuário mexeu nela (salvar sem mexer mantém a atual). */
  expiryTouched: boolean;
}

function emptyForm(defaultAccountId: string): FormState {
  return {
    name: "",
    account_id: defaultAccountId,
    trigger_type: "dm",
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
    comment: null,
    expiry: expiryFormFrom(null, null),
    expiryTouched: false,
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
    name: rule.name ?? "",
    account_id: rule.account_id,
    trigger_type: rule.trigger_type,
    keyword: rule.keyword ?? "",
    match_type: rule.match_type,
    reply_type: rule.reply_type,
    reply_text: rule.reply_text ?? "",
    reply_image_url: rule.reply_image_url ?? "",
    buttons,
    delay_seconds: rule.delay_seconds,
    is_active: rule.is_active,
    comment:
      rule.trigger_type === "comment"
        ? {
            media_mode: rule.media_mode,
            media_refs: rule.media_refs,
            comment_any_word: rule.comment_any_word,
            public_reply_enabled: rule.public_reply_enabled,
            public_reply_text: rule.public_reply_text,
            public_reply_variants: rule.public_reply_variants,
            welcome_text: rule.welcome_text,
            welcome_text_variants: rule.welcome_text_variants,
            welcome_button_label: rule.welcome_button_label,
          }
        : null,
    expiry: expiryFormFrom(rule.expires_at, rule.expire_action),
    expiryTouched: false,
  };
}

export function RulesManager({
  rules,
  accounts,
  executionCounts,
  folders = [],
}: {
  rules: RuleWithAccount[];
  accounts: AccountOption[];
  executionCounts: Record<string, number>;
  /** Vazio quando a migration 0010 ainda não foi aplicada: a grade de pastas some. */
  folders?: Folder[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(accounts[0]?.id ?? "")
  );
  const [deleteTarget, setDeleteTarget] = useState<RuleWithAccount | null>(
    null
  );
  /** Workflows que usam a automação em exclusão (null = carregando). */
  const [deleteUsage, setDeleteUsage] = useState<string[] | null>(null);
  const deleteRequestRef = useRef<string | null>(null);
  const [editUsage, setEditUsage] = useState<string[]>([]);
  const editRequestRef = useRef<string | null>(null);
  const [expiryTarget, setExpiryTarget] = useState<ExpiryTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

  const { view: rawView, update, reset } = useListView("falow:automations:rules");
  const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const accountIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);
  const view = useMemo(
    () => sanitizeView(rawView, { folderIds, accountIds }),
    [rawView, folderIds, accountIds]
  );
  const adapter = useMemo(() => ruleAdapter(executionCounts), [executionCounts]);
  const filteredRules = useMemo(
    () => applyListView(rules, view, adapter, folderIds),
    [rules, view, adapter, folderIds]
  );
  const counts = useMemo(
    () => viewFolderCounts(rules, view, adapter, folders),
    [rules, view, adapter, folders]
  );

  const patch = (partial: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...partial }));

  function openEdit(rule: RuleWithAccount) {
    setForm(formFromRule(rule));
    setOpen(true);
    setEditUsage([]);
    editRequestRef.current = rule.id;
    listRuleWorkflowUsage(rule.id)
      .catch(() => [] as string[])
      .then((usage) => {
        if (editRequestRef.current === rule.id) setEditUsage(usage);
      });
  }

  function handleSubmit() {
    const comment = form.comment;
    const expiry = form.expiryTouched ? resolveExpiryForm(form.expiry) : null;
    if (expiry?.error) {
      toast.error(expiry.error);
      return;
    }
    const input: RuleInput = {
      id: form.id,
      name: form.name.trim() || undefined,
      account_id: form.account_id,
      trigger_type: form.trigger_type,
      keyword: form.keyword,
      match_type: form.match_type,
      reply_type: form.reply_type,
      reply_text: form.reply_text || undefined,
      reply_image_url: form.reply_image_url || undefined,
      reply_buttons: form.buttons.filter((b) => b.title.trim() && b.url.trim()),
      delay_seconds: form.delay_seconds,
      is_active: form.is_active,
      // Devolve intacta a configuração de comentário que este diálogo não edita.
      ...(comment && {
        media_mode: comment.media_mode ?? undefined,
        media_refs: comment.media_refs ?? undefined,
        comment_any_word: comment.comment_any_word,
        public_reply_enabled: comment.public_reply_enabled,
        public_reply_text: comment.public_reply_text ?? undefined,
        public_reply_variants: comment.public_reply_variants ?? undefined,
        welcome_text: comment.welcome_text ?? undefined,
        welcome_text_variants: comment.welcome_text_variants ?? undefined,
        welcome_button_label: comment.welcome_button_label ?? undefined,
      }),
      ...(expiry && {
        expires_at: expiry.expires_at,
        expire_action: expiry.expire_action,
      }),
    };

    startTransition(async () => {
      const result = await saveRule(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(form.id ? "Automação atualizada." : "Automação criada.");
      if (result.warning) toast.warning(result.warning);
      setOpen(false);
    });
  }

  function handleToggle(rule: RuleWithAccount, next: boolean) {
    startTransition(async () => {
      const result = await toggleRule(rule.id, next);
      if (result.error) toast.error(result.error);
      else if (result.warning) toast.warning(result.warning);
    });
  }

  function handleDuplicate(rule: RuleWithAccount) {
    startTransition(async () => {
      const result = await duplicateRule(rule.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Automação duplicada. A cópia foi criada pausada.");
    });
  }

  function openDelete(rule: RuleWithAccount) {
    setDeleteTarget(rule);
    setDeleteUsage(null);
    deleteRequestRef.current = rule.id;
    listRuleWorkflowUsage(rule.id)
      .catch(() => [] as string[])
      .then((usage) => {
        if (deleteRequestRef.current === rule.id) setDeleteUsage(usage);
      });
  }

  function handleDelete(rule: RuleWithAccount) {
    startTransition(async () => {
      const result = await deleteRule(rule.id);
      if (result.error) toast.error(result.error);
      else toast.success("Automação excluída.");
      setDeleteTarget(null);
    });
  }

  if (rules.length === 0) {
    return (
      <EmptyState
        icon={Zap}
        title="Nenhuma automação criada"
        description="Crie sua primeira automação: se alguém enviar uma palavra-chave, o Falow responde na hora."
      >
        <Button asChild>
          <Link href="/rules/nova">
            <Plus />
            Criar primeira automação
          </Link>
        </Button>
      </EmptyState>
    );
  }

  const folderCards = (
    <FolderCards
      folders={folders}
      counts={counts}
      accountId={accounts[0]?.id}
      selected={view.folder}
      onSelect={(folder) => update({ folder })}
    />
  );
  // Só a pasta aberta, sem outro filtro: a lista vazia é pasta vazia, não busca sem resultado.
  const onlyFolder =
    view.folder !== null && !isFiltered({ ...view, folder: DEFAULT_VIEW.folder });

  return (
    <>
      <div className="space-y-4">
        <ListToolbar
          view={view}
          onChange={update}
          onReset={reset}
          searchPlaceholder="Pesquisar automações..."
          gender="f"
          showKind
          accounts={accounts}
          trailing={folders.length === 0 ? folderCards : undefined}
        />

        {folders.length > 0 && folderCards}

        {view.folder !== null && (
          <FolderBreadcrumb
            folder={view.folder ? (folderById.get(view.folder) ?? null) : null}
            onBack={() => update({ folder: null })}
          />
        )}

        {filteredRules.length === 0 ? (
          <NoResults
            message={
              onlyFolder
                ? "Nenhuma automação nesta pasta ainda. Use “Mover para pasta” no menu de uma automação para trazê-la pra cá."
                : "Nenhuma automação encontrada com esses filtros."
            }
            onReset={onlyFolder ? undefined : reset}
          />
        ) : (
          <AutomationList>
            {filteredRules.map((rule, index) => {
              const isComment = rule.trigger_type === "comment";
              const title = ruleTitle(rule);
              const builder = canEditInBuilder(rule);
              const folder =
                view.folder === null && rule.folder_id
                  ? folderById.get(rule.folder_id)
                  : undefined;
              return (
                <AutomationRow
                  key={rule.id}
                  index={index}
                  icon={isComment ? MessageCircle : MessageSquareText}
                  title={title}
                  href={builder ? `/rules/${rule.id}/editar` : undefined}
                  onOpen={builder ? undefined : () => openEdit(rule)}
                  triggerLine={ruleTriggerLine(rule)}
                  updatedAt={rule.updated_at}
                  createdAt={rule.created_at}
                  gender="f"
                  badges={
                    <>
                      <ExpiryBadge
                        expiresAt={rule.expires_at}
                        expireAction={rule.expire_action}
                      />
                      {rule.follow_gate_enabled && (
                        <Badge variant="outline">Só seguidores</Badge>
                      )}
                      {accounts.length > 1 && rule.ig_accounts?.ig_username && (
                        <Badge variant="outline">@{rule.ig_accounts.ig_username}</Badge>
                      )}
                      {folder && <FolderChip folder={folder} />}
                    </>
                  }
                  metrics={[
                    {
                      value: executionCounts[rule.id] ?? 0,
                      singular: "execução",
                      plural: "execuções",
                    },
                  ]}
                  active={rule.is_active}
                  onToggle={(next) => handleToggle(rule, next)}
                  toggleDisabled={isPending}
                  menu={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Ações de ${title}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            builder
                              ? router.push(`/rules/${rule.id}/editar`)
                              : openEdit(rule)
                          }
                        >
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isPending}
                          onClick={() => handleDuplicate(rule)}
                        >
                          <Copy />
                          Duplicar
                        </DropdownMenuItem>
                        {folders.length > 0 && (
                          <DropdownMenuItem
                            onClick={() =>
                              setMoveTarget({
                                kind: "rule",
                                id: rule.id,
                                name: title,
                                folderId: rule.folder_id ?? null,
                              })
                            }
                          >
                            <FolderInput />
                            Mover para pasta
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() =>
                            setExpiryTarget({
                              id: rule.id,
                              name: title,
                              expires_at: rule.expires_at,
                              expire_action: rule.expire_action,
                            })
                          }
                        >
                          <Timer />
                          {rule.expires_at
                            ? "Estender expiração"
                            : "Tornar temporária"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => openDelete(rule)}
                        >
                          <Trash2 />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              );
            })}
          </AutomationList>
        )}
      </div>

      <MoveToFolderDialog
        target={moveTarget}
        folders={folders}
        onClose={() => setMoveTarget(null)}
      />

      {/* ── Dialog de criação/edição ─────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Editar automação" : "Nova automação"}
            </DialogTitle>
            <DialogDescription>
              {form.trigger_type === "comment"
                ? "Automação de comentário. Aqui você ajusta o básico e a mensagem com o link (as publicações-alvo e a mensagem de boas-vindas continuam como estão)."
                : "Se receber a palavra-chave, o Falow responde automaticamente na DM."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da automação</Label>
              <Input
                id="name"
                placeholder="ex.: Auto-DM de links dos comentários"
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Opcional, se vazio a lista usa a palavra-chave como nome.
              </p>
            </div>

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

            {/* Sem palavra-chave a regra dispara em qualquer comentário: o
                campo não teria efeito nenhum (saveRule salva keyword = null). */}
            {form.comment?.comment_any_word ? (
              <div className="rounded-md border border-input px-3 py-2.5 text-sm text-muted-foreground">
                Dispara em <strong className="font-medium">qualquer comentário</strong>{" "}
                das publicações escolhidas, sem palavra-chave.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="keyword">
                    {form.trigger_type === "comment"
                      ? "Se comentarem"
                      : "Se receber"}
                  </Label>
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
            )}

            <div className="space-y-2">
              <Label>
                {form.trigger_type === "comment"
                  ? "Mensagem entregue ao tocar no botão"
                  : "Responder com"}
              </Label>
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

            <div className="grid gap-4 sm:grid-cols-2">
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
                  Simula digitação humana (2 a 5s).
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
                    {form.is_active ? "Automação ativa" : "Automação pausada"}
                  </span>
                </div>
              </div>
            </div>

            <ExpiryField
              className="rounded-md border border-input p-3"
              value={form.expiry}
              onChange={(expiry) => patch({ expiry, expiryTouched: true })}
              usedInWorkflows={form.id ? editUsage : undefined}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar automação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExpiryDialog
        kind="rule"
        target={expiryTarget}
        onClose={() => setExpiryTarget(null)}
        loadUsage={listRuleWorkflowUsage}
      />

      {/* ── Confirmação de exclusão ──────────────────────────────────── */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir automação</DialogTitle>
            <DialogDescription>
              Excluir a automação &ldquo;
              {deleteTarget?.name || deleteTarget?.keyword || "esta automação"}
              &rdquo;? Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {deleteUsage && deleteUsage.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium">
                Usada em {deleteUsage.length}{" "}
                {deleteUsage.length === 1 ? "workflow" : "workflows"}:
              </p>
              <p className="mt-1 text-muted-foreground">
                {deleteUsage.join(", ")}. Nesses fluxos o bloco vai aparecer
                como &ldquo;Automação removida&rdquo; e precisa ser trocado.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={isPending || deleteUsage === null}
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
