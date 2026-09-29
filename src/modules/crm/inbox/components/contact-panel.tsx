"use client";

import { useState, useTransition } from "react";
import { ExternalLink, PauseCircle, Workflow, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { moveLeadAction } from "@/modules/crm/pipeline/services/pipeline.actions";

import { LeadProfileDialog } from "../../lead-profile/components/lead-profile-dialog";
import { ContactFieldsEditor } from "../../tags/components/contact-fields-editor";
import { TagManagerDialog } from "../../tags/components/tag-manager-dialog";
import { TagPicker } from "../../tags/components/tag-picker";
import { NotesPanel } from "../../notes/components/notes-panel";
import type { InboxThread } from "../../shared/types/conversation";
import { RUN_STATUS_LABEL, leadName } from "../utils/labels";
import { fullDateTime } from "../utils/time";
import { LeadAvatar } from "./lead-avatar";

/**
 * Ficha do lead: coluna fixa em telas largas (xl), painel sobreposto abaixo
 * disso (aberto pelo botão do cabeçalho da conversa).
 */
export function ContactPanel({
  thread,
  open,
  onClose,
}: {
  thread: InboxThread;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm 2xl:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        aria-label="Ficha do lead"
        className={cn(
          "w-[320px] max-w-full shrink-0 flex-col border-l border-border/70 bg-background",
          "fixed inset-y-0 right-0 z-40 2xl:static 2xl:z-auto 2xl:flex 2xl:w-[300px]",
          open ? "flex" : "hidden"
        )}
      >
        <div className="flex items-center justify-end px-3 pt-3 2xl:hidden">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Fechar ficha">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <PanelBody thread={thread} />
      </aside>
    </>
  );
}

function PanelBody({ thread }: { thread: InboxThread }) {
  const { conversation: c, panel } = thread;
  const [managerOpen, setManagerOpen] = useState(false);
  const fields = Object.entries(panel.fields).filter(([key]) => !key.startsWith("__"));
  const pausedUntil =
    c.automation_paused_until && Date.parse(c.automation_paused_until) > Date.now() ? c.automation_paused_until : null;

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-2 2xl:pt-5">
      <section className="flex flex-col items-center text-center">
        <LeadProfileDialog conversation={c}>
          <LeadAvatar
            username={c.ig_sender_username}
            seed={c.ig_sender_id}
            photoUrl={c.ig_profile_pic_url}
            conversationId={c.id}
            className="h-14 w-14 text-base"
          />
        </LeadProfileDialog>
        <LeadProfileDialog conversation={c}>
          <p className="mt-3 text-[15px] font-semibold">{leadName(c.ig_sender_username, c.ig_sender_id)}</p>
        </LeadProfileDialog>
        {c.ig_sender_username && (
          <a
            href={`https://www.instagram.com/${c.ig_sender_username}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir no Instagram
          </a>
        )}
      </section>

      {pausedUntil && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
          <PauseCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span suppressHydrationWarning>Automações pausadas para este lead até {fullDateTime(pausedUntil)}</span>
        </p>
      )}

      <PanelSection title="Funil">
        {panel.pipeline ? (
          <StageSelect leadId={panel.pipeline.leadId} currentStageId={panel.pipeline.currentStageId} stages={panel.pipeline.stages} />
        ) : (
          <Empty>Ainda não entrou no funil</Empty>
        )}
      </PanelSection>

      <PanelSection title="Workflows em andamento">
        {panel.runs.length === 0 ? (
          <Empty>Nenhum workflow rodando para este lead</Empty>
        ) : (
          <ul className="space-y-2">
            {panel.runs.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-[13px]">
                <Workflow className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.sequenceName}</p>
                  <p className="text-[12px] text-muted-foreground">{RUN_STATUS_LABEL[r.status]}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>

      <PanelSection title="Notas">
        <NotesPanel accountId={c.account_id} igSenderId={c.ig_sender_id} notes={thread.notes} />
      </PanelSection>

      <PanelSection title="Tags">
        <TagPicker
          accountId={c.account_id}
          senderId={c.ig_sender_id}
          username={c.ig_sender_username}
          catalog={panel.tagCatalog}
          tags={panel.tags}
          onManageTags={() => setManagerOpen(true)}
        />
      </PanelSection>
      <TagManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        accountId={c.account_id}
        accountUsername={c.account_username}
      />

      <PanelSection title="Dados coletados">
        <ContactFieldsEditor accountId={c.account_id} senderId={c.ig_sender_id} fields={fields} />
      </PanelSection>

      <PanelSection title="Conversa">
        <dl className="space-y-2 text-[13px]" suppressHydrationWarning>
          <div>
            <dt className="text-[12px] text-muted-foreground">Primeiro contato</dt>
            <dd suppressHydrationWarning>{fullDateTime(c.created_at)}</dd>
          </div>
          {c.last_inbound_at && (
            <div>
              <dt className="text-[12px] text-muted-foreground">Última mensagem do lead</dt>
              <dd suppressHydrationWarning>{fullDateTime(c.last_inbound_at)}</dd>
            </div>
          )}
        </dl>
      </PanelSection>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-muted-foreground/80">{children}</p>;
}

/** Etapa atual do lead + mover, direto da ficha (Fase 6). */
function StageSelect({
  leadId,
  currentStageId,
  stages,
}: {
  leadId: string;
  currentStageId: string;
  stages: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(currentStageId);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    setValue(next);
    startTransition(async () => {
      const res = await moveLeadAction({ leadId, toStageId: next });
      if (res.error) {
        toast.error(res.error);
        setValue(currentStageId);
      }
    });
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="h-8 text-[13px]" aria-label="Etapa do funil">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {stages.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
