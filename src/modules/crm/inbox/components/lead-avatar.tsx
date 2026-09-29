"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { refreshLeadPhoto } from "../../lead-profile/services/lead-profile.actions";
import { leadInitials } from "../utils/labels";

/**
 * Avatar do lead: mostra a foto de perfil da Meta quando disponível, com
 * fallback para iniciais (a URL da CDN expira e às vezes falha ao carregar).
 * O tom das iniciais varia pelo @ para diferenciar leads na lista.
 */
const TONES = [
  "bg-primary/15 text-emerald-800 dark:text-emerald-300",
  "bg-secondary text-secondary-foreground",
  "bg-warning/20 text-amber-800 dark:text-amber-300",
  "bg-accent text-accent-foreground",
];

function toneFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function LeadAvatar({
  username,
  seed,
  photoUrl,
  conversationId,
  className,
}: {
  username: string | null;
  seed: string;
  /** URL da foto de perfil (`conversations.ig_profile_pic_url`). */
  photoUrl?: string | null;
  /**
   * Se informado, ao falhar o carregamento da foto o componente pede uma
   * busca nova ao servidor (a action confere sozinha se já faz mais de 1h
   * da última tentativa, então é seguro chamar sempre que a imagem falhar).
   */
  conversationId?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // Foto nova (ex.: depois de um refresh ao vivo) merece uma nova chance.
  useEffect(() => setFailed(false), [photoUrl]);

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        className={cn("h-10 w-10 shrink-0 rounded-full object-cover", className)}
        onError={() => {
          setFailed(true);
          if (conversationId) void refreshLeadPhoto(conversationId).catch(() => {});
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-semibold",
        toneFor(seed),
        className
      )}
    >
      {leadInitials(username)}
    </div>
  );
}
