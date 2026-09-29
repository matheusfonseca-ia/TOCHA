"use client";

import { useState } from "react";
import { ExternalLink, PauseCircle, Workflow, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { ContactFieldsEditor } from "../../tags/components/contact-fields-editor";
import { TagManagerDialog } from "../../tags/components/tag-manager-dialog";
import { TagPicker } from "../../tags/components/tag-picker";
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
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm xl:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        aria-label="Ficha do lead"
        className={cn(
          "w-[320px] max-w-full shrink-0 flex-col border-l border-border/70 bg-background",
          "fixed inset-y-0 right-0 z-40 xl:static xl:z-auto xl:flex xl:w-[300px]",
          open ? "flex" : "hidden"
        )}
      >
        <div className="flex items-center justify-end px-3 pt-3 xl:hidden">
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
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-2 xl:pt-5">
      <section className="flex flex-col items-center text-center">
        <LeadAvatar username={c.ig_sender_username} seed={c.ig_sender_id} className="h-14 w-14 text-base" />
        <p className="mt-3 text-[15px] font-semibold">{leadName(c.ig_sender_username, c.ig_sender_id)}</p>
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
