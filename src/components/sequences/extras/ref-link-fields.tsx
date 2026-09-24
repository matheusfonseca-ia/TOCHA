"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { refLinkUrl } from "@/lib/meta/triggers";
import type { TriggerNodeData } from "@/types/sequence";

/**
 * Campos extras do gatilho "Link de referência": código do link e a URL
 * pronta pra copiar (ig.me/m/<usuário>?ref=<código>). Usado dentro do
 * TriggerForm (sequence-inspector.tsx) quando esse modo está selecionado.
 */
export function RefLinkFields({
  data,
  patch,
  accountUsername,
}: {
  data: TriggerNodeData;
  patch: (d: TriggerNodeData) => void;
  accountUsername?: string;
}) {
  const [copied, setCopied] = useState(false);
  const url = refLinkUrl(accountUsername ?? "", data.refCode ?? "");

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard indisponível (ex.: sem permissão) — falha silenciosa
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="seq-ref-code">Código do link</Label>
      <Input
        id="seq-ref-code"
        placeholder="ex.: promo10"
        className="font-mono"
        value={data.refCode ?? ""}
        onChange={(e) => patch({ ...data, refCode: e.target.value })}
      />
      <div className="flex items-center gap-2 rounded-md border border-input bg-secondary/40 px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {url}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={copyUrl}
          aria-label="Copiar link"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Qualquer pessoa que abrir esse link (ou escanear um QR code com ele)
        entra direto nesta conversa e dispara este gatilho.
      </p>
    </div>
  );
}
