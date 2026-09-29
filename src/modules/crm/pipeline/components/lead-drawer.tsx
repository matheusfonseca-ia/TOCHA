"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, History, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeadAvatar } from "@/modules/crm/inbox/components/lead-avatar";
import { leadName } from "@/modules/crm/inbox/utils/labels";
import { fullDateTime } from "@/modules/crm/inbox/utils/time";

import { getLeadDetailAction, updateLeadValueAction } from "../services/pipeline.actions";
import type { LeadDetail } from "../types";

const SOURCE_LABEL: Record<string, string> = { manual: "Manual", automation: "Automação", system: "Sistema" };

/** Drawer do card: resumo, valor editável, histórico de movimentação. */
export function LeadDrawer({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!leadId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    getLeadDetailAction(leadId)
      .then((d) => {
        setDetail(d);
        setValue(d?.lead.value != null ? String(d.lead.value) : "");
      })
      .finally(() => setLoading(false));
  }, [leadId]);

  async function saveValue() {
    if (!detail) return;
    const parsed = value.trim() ? Number(value.replace(",", ".")) : null;
    if (value.trim() && !Number.isFinite(parsed)) {
      toast.error("Valor inválido.");
      return;
    }
    const res = await updateLeadValueAction(detail.lead.id, parsed);
    if (res.error) toast.error(res.error);
  }

  return (
    <Dialog open={!!leadId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ficha do lead</DialogTitle>
        </DialogHeader>

        {loading || !detail ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <LeadAvatar username={detail.ig_sender_username} seed={detail.ig_sender_id} className="h-11 w-11" />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{leadName(detail.ig_sender_username, detail.ig_sender_id)}</p>
                <p className="text-[12px] text-muted-foreground">Etapa atual: {detail.stageName}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-value">Valor</Label>
              <Input
                id="lead-value"
                inputMode="decimal"
                placeholder="Sem valor"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={saveValue}
              />
            </div>

            {detail.lead.lost_reason && (
              <p className="rounded-md bg-secondary/50 px-3 py-2 text-[12px] text-muted-foreground">
                Motivo da perda: {detail.lead.lost_reason}
              </p>
            )}

            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Histórico
              </p>
              {detail.events.length === 0 ? (
                <p className="text-[12px] text-muted-foreground/70">Sem movimentações ainda.</p>
              ) : (
                <ul className="max-h-40 space-y-1.5 overflow-y-auto text-[12px]">
                  {detail.events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span className="truncate">
                        {e.fromStageName ? `${e.fromStageName} → ` : "Entrou em "}
                        <span className="text-foreground">{e.toStageName}</span>{" "}
                        <span className="text-[11px]">({SOURCE_LABEL[e.source] ?? e.source})</span>
                      </span>
                      <span className="shrink-0" suppressHydrationWarning>
                        {fullDateTime(e.moved_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button asChild variant="outline" className="w-full gap-1.5">
              <Link href={`/crm/conversas?c=${detail.lead.conversation_id}`}>
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir conversa
              </Link>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
