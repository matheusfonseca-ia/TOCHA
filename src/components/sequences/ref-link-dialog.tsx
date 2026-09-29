"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { refLinkUrl } from "@/lib/meta/triggers";

export interface RefLinkTarget {
  name: string;
  code: string;
  username: string;
  /** Quantas pessoas já entraram no fluxo por este link. */
  entries: number;
}

/**
 * Link do gatilho "Link de referência" pronto pra usar: copiar, baixar o QR
 * code (story, slide, impresso) e ver quantas pessoas já entraram por ele.
 *
 * O QR é gerado no navegador — nenhum dado de link sai daqui pra um serviço
 * de terceiro só pra virar imagem.
 */
export function RefLinkDialog({
  target,
  onClose,
}: {
  target: RefLinkTarget | null;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = target ? refLinkUrl(target.username, target.code) : "";

  useEffect(() => {
    if (!target) {
      setDataUrl(null);
      return;
    }
    let active = true;
    QRCode.toDataURL(url, { width: 512, margin: 1 })
      .then((png) => {
        if (active) setDataUrl(png);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [target, url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard indisponível (sem permissão): falha silenciosa
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Link do workflow</DialogTitle>
          <DialogDescription>
            Quem abrir este link cai direto na sua DM e entra em “{target?.name}”.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-input bg-secondary/40 px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {url}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={copy}
            aria-label="Copiar link"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {dataUrl && (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt={`QR code do link ${url}`}
              className="h-44 w-44 rounded-md bg-white p-2"
            />
            <Button asChild variant="outline" size="sm">
              <a href={dataUrl} download={`falow-${target?.code}.png`}>
                <Download className="h-4 w-4" />
                Baixar QR code
              </a>
            </Button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {target?.entries === 1
            ? "1 pessoa já entrou por aqui."
            : `${target?.entries ?? 0} pessoas já entraram por aqui.`}
        </p>
      </DialogContent>
    </Dialog>
  );
}
