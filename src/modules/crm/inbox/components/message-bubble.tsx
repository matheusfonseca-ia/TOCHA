"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  CheckCheck,
  Copy,
  ExternalLink,
  FileText,
  ImageOff,
  MoreHorizontal,
  MousePointerClick,
  Reply,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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

import type { MessageAttachment, MessageRow } from "../../shared/types/message";
import { hideMessageForMe } from "../services/message-actions";
import { SOURCE_LABEL, kindLabel, messagePreview } from "../utils/labels";
import { fullDateTime, messageTime } from "../utils/time";

export interface QuotedMessage {
  text: string;
  mine: boolean;
}

export function MessageBubble({
  message: m,
  quoted,
  seen,
  onReply,
}: {
  message: MessageRow;
  /** Mensagem citada, se estiver entre as carregadas. */
  quoted: QuotedMessage | null;
  /** O lead já viu (só para enviadas). */
  seen: boolean;
  /** "Responder" no menu: mostra a citação no composer. */
  onReply: (message: MessageRow) => void;
}) {
  const outbound = m.direction === "outbound";

  if (m.kind === "postback" && !outbound) {
    return (
      <div className="flex justify-start">
        <p className="inline-flex max-w-[85%] items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1 text-xs text-muted-foreground">
          <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Tocou em &quot;{m.text ?? "botão"}&quot;</span>
          <span className="shrink-0 text-[11px]" suppressHydrationWarning>{messageTime(m.created_at)}</span>
        </p>
      </div>
    );
  }

  const deleted = Boolean(m.deleted_by_contact_at);

  return (
    <div className={cn("group flex items-end gap-1", outbound ? "justify-end" : "justify-start")}>
      {outbound && <MessageMenu message={m} deleted={deleted} onReply={onReply} />}
      <div className={cn("relative max-w-[85%] sm:max-w-[75%]", m.reaction_emoji && "mb-3")}>
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-[14px] leading-relaxed",
            outbound
              ? "rounded-br-md bg-primary/15 dark:bg-primary/20"
              : "rounded-bl-md border border-border/70 bg-card"
          )}
        >
          {quoted && !deleted && (
            <div
              className={cn(
                "mb-1.5 border-l-2 pl-2 text-[12px] leading-snug text-muted-foreground",
                quoted.mine ? "border-primary" : "border-muted-foreground/50"
              )}
            >
              <p className="font-medium">{quoted.mine ? "Você" : "Lead"}</p>
              <p className="line-clamp-2">{quoted.text}</p>
            </div>
          )}

          {deleted ? (
            <p className="flex items-center gap-1.5 italic text-muted-foreground">
              <Ban className="h-3.5 w-3.5 shrink-0" />
              Mensagem apagada pelo contato
            </p>
          ) : (
            <MessageBody message={m} />
          )}

          <p
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground"
            )}
          >
            {m.edited_at && !deleted && (
              <span title={m.original_text ? `Antes: ${m.original_text}` : undefined}>editada</span>
            )}
            {outbound && <span>{SOURCE_LABEL[m.source]}</span>}
            <time dateTime={m.created_at} title={fullDateTime(m.created_at)} suppressHydrationWarning>
              {messageTime(m.created_at)}
            </time>
            {outbound && (
              <CheckCheck
                className={cn("h-3.5 w-3.5", seen ? "text-emerald-600 dark:text-primary" : "text-muted-foreground/60")}
                aria-label={seen ? "Visto" : "Entregue"}
              />
            )}
          </p>
        </div>

        {m.reaction_emoji && !deleted && (
          <span
            className={cn(
              "absolute -bottom-3 rounded-full border border-border/70 bg-card px-1.5 py-0.5 text-[13px] leading-none",
              outbound ? "left-2" : "right-2"
            )}
            aria-label={`Reação do lead: ${m.reaction_emoji}`}
          >
            {m.reaction_emoji}
          </span>
        )}
      </div>
      {!outbound && <MessageMenu message={m} deleted={deleted} onReply={onReply} />}
    </div>
  );
}

/** "..." com Copiar, Responder e Apagar para mim (nunca reage pela conta: falhou na Fase 0). */
function MessageMenu({
  message: m,
  deleted,
  onReply,
}: {
  message: MessageRow;
  deleted: boolean;
  onReply: (message: MessageRow) => void;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleHide() {
    await hideMessageForMe(m.id);
    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 self-end opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label="Mais ações da mensagem"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={m.direction === "outbound" ? "end" : "start"}>
          {m.text && (
            <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(m.text ?? "")}>
              <Copy className="h-3.5 w-3.5" />
              Copiar texto
            </DropdownMenuItem>
          )}
          {m.mid && !deleted && (
            <DropdownMenuItem onClick={() => onReply(m)}>
              <Reply className="h-3.5 w-3.5" />
              Responder
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Apagar para mim
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar mensagem para mim</DialogTitle>
            <DialogDescription>
              Ela some só do Falow. O contato continua vendo esta mensagem no Instagram.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleHide}>
              Apagar para mim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessageBody({ message: m }: { message: MessageRow }) {
  const text = m.text?.trim() ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : null;
  const media = m.attachments?.[0];
  const meta = (m.meta ?? {}) as {
    story?: { url?: string | null };
    buttons?: { title: string }[];
    options?: string[];
  };

  switch (m.kind) {
    case "image":
    case "sticker":
      if (m.kind === "sticker" && !media?.url) return <p className="text-3xl leading-none">❤️</p>;
      return (
        <>
          <Media attachment={media} as="image" />
          {text}
        </>
      );
    case "video":
    case "audio":
      return (
        <>
          <Media attachment={media} as={m.kind} />
          {text}
        </>
      );
    case "story_reply":
      return (
        <>
          <p className="mb-1 text-[12px] text-muted-foreground">Respondeu seu story</p>
          <Media attachment={{ type: "story", url: meta.story?.url ?? null }} as="image" compact />
          {text}
        </>
      );
    case "story_mention":
      return (
        <>
          <p className="mb-1 text-[12px] text-muted-foreground">Mencionou você no story</p>
          <Media attachment={media} as="image" compact />
        </>
      );
    case "share":
    case "reel":
    case "file":
    case "attachment":
      return (
        <>
          <LinkOut attachment={media} label={kindLabel(m.kind)} />
          {text}
        </>
      );
    case "buttons":
    case "quick_replies": {
      const labels = m.kind === "buttons" ? (meta.buttons ?? []).map((b) => b.title) : meta.options ?? [];
      return (
        <>
          {text ?? <p className="text-muted-foreground">{messagePreview(m.kind, null)}</p>}
          {labels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {labels.map((label, i) => (
                <span
                  key={`${label}-${i}`}
                  className="rounded-full border border-border/80 bg-background/60 px-2.5 py-0.5 text-[12px]"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </>
      );
    }
    case "unsupported":
      return <p className="italic text-muted-foreground">Mensagem não suportada pelo Instagram</p>;
    default:
      return text ?? <p className="text-muted-foreground">{messagePreview(m.kind, null)}</p>;
  }
}

/** Mídia pela URL da CDN da Meta; expirada, vira aviso (nunca é copiada). */
function Media({
  attachment,
  as,
  compact,
}: {
  attachment: MessageAttachment | undefined;
  as: "image" | "video" | "audio";
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = attachment?.url;

  if (!url || failed) {
    return (
      <p className="mb-1 flex items-center gap-1.5 rounded-lg bg-background/60 px-2.5 py-2 text-[12px] text-muted-foreground">
        <ImageOff className="h-3.5 w-3.5 shrink-0" />
        Mídia indisponível, abra no Instagram
      </p>
    );
  }
  if (as === "audio") {
    return <audio controls preload="none" src={url} onError={() => setFailed(true)} className="mb-1 h-10 w-60 max-w-full" />;
  }
  if (as === "video") {
    return (
      <video
        controls
        preload="none"
        src={url}
        onError={() => setFailed(true)}
        className="mb-1 max-h-72 w-full rounded-lg bg-background/60"
      />
    );
  }
  // <img> puro: URL assinada da CDN da Meta, não passa pelo otimizador do Next.
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("mb-1 rounded-lg object-cover", compact ? "max-h-40 w-28" : "max-h-72 w-full")}
    />
  );
}

function LinkOut({ attachment, label }: { attachment: MessageAttachment | undefined; label: string }) {
  if (!attachment?.url) {
    return (
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        {label}
      </p>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 font-medium underline-offset-2 hover:underline"
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      {label}
    </a>
  );
}
