"use client";

import { useState } from "react";
import { BadgeCheck, ExternalLink, Users } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import type { InboxConversation } from "../../shared/types/conversation";
import { leadInitials, leadName } from "../../inbox/utils/labels";
import { fullDateTime } from "../../inbox/utils/time";
import { refreshLeadPhoto } from "../services/lead-profile.actions";

/**
 * Diálogo de perfil do lead: aberto ao clicar na foto ou no nome, no
 * cabeçalho da conversa e na ficha. `children` é o gatilho clicável (avatar
 * pequeno + nome), o diálogo mostra a versão ampliada dos dados.
 */
export function LeadProfileDialog({
  conversation,
  children,
}: {
  conversation: InboxConversation;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const c = conversation;
  const name = leadName(c.ig_sender_username, c.ig_sender_id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Ver perfil de ${name}`}
      >
        {children}
      </button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">Perfil de {name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center pb-1 pt-2 text-center">
          <BigAvatar
            username={c.ig_sender_username}
            seed={c.ig_sender_id}
            photoUrl={c.ig_profile_pic_url}
            conversationId={c.id}
          />

          <div className="mt-3 flex items-center gap-1.5">
            <p className="text-[16px] font-semibold">
              {c.ig_profile_name || name}
            </p>
            {c.ig_is_verified && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Conta verificada" />
            )}
          </div>
          {c.ig_sender_username && (
            <p className="text-[13px] text-muted-foreground">@{c.ig_sender_username}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            {typeof c.ig_follower_count === "number" && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {c.ig_follower_count.toLocaleString("pt-BR")} seguidores
              </span>
            )}
            {c.ig_follows_business != null && (
              <span>{c.ig_follows_business ? "Segue você" : "Não segue você"}</span>
            )}
          </div>

          <p className="mt-3 text-[12px] text-muted-foreground" suppressHydrationWarning>
            Primeiro contato em {fullDateTime(c.created_at)}
          </p>

          {c.ig_sender_username && (
            <Button asChild className="mt-5 w-full">
              <a
                href={`https://www.instagram.com/${c.ig_sender_username}/`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir no Instagram
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Versão ampliada do avatar, só para o diálogo (evita depender do componente de lista). */
function BigAvatar({
  username,
  seed,
  photoUrl,
  conversationId,
}: {
  username: string | null;
  seed: string;
  photoUrl: string | null;
  conversationId: string;
}) {
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        className="h-20 w-20 rounded-full object-cover"
        onError={() => {
          setFailed(true);
          void refreshLeadPhoto(conversationId).catch(() => {});
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary font-display text-2xl font-semibold text-secondary-foreground"
      data-seed={seed}
    >
      {leadInitials(username)}
    </div>
  );
}
