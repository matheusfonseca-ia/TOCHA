"use client";

import { useState } from "react";
import {
  BatteryFull,
  Bookmark,
  Camera,
  ChevronLeft,
  Heart,
  Image as ImageIcon,
  Instagram,
  Mic,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Send,
  Signal,
  Smile,
  Video,
  Wifi,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { MediaRef } from "@/types/database";

type Tab = "publicar" | "comentarios" | "dm";

const TABS: { id: Tab; label: string }[] = [
  { id: "publicar", label: "Publicar" },
  { id: "comentarios", label: "Comentários" },
  { id: "dm", label: "DM" },
];

interface CommentPhonePreviewProps {
  username: string;
  avatarUrl: string | null;
  selectedMedia: MediaRef | null;
  anyMedia: boolean;
  commentText: string;
  publicReplyEnabled: boolean;
  publicReplyText: string;
  welcomeText: string;
  welcomeButtonLabel: string;
  linkMessageText: string;
  links: { title: string; url: string }[];
}

function Avatar({
  avatarUrl,
  username,
  size = "h-7 w-7",
}: {
  avatarUrl: string | null;
  username: string;
  size?: string;
}) {
  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt={username}
      className={cn(size, "shrink-0 rounded-full object-cover")}
    />
  ) : (
    <div
      className={cn(
        size,
        "flex shrink-0 items-center justify-center rounded-full bg-neutral-700"
      )}
    >
      <Instagram className="h-3.5 w-3.5 text-white" />
    </div>
  );
}

function StatusBar() {
  return (
    <>
      <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-neutral-800" />
      <div className="flex items-center justify-between px-5 pb-1 pt-3 text-[11px] font-medium text-white">
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <Signal className="h-3 w-3" />
          <Wifi className="h-3 w-3" />
          <BatteryFull className="h-3.5 w-3.5" />
        </div>
      </div>
    </>
  );
}

function PublicarScreen({
  username,
  avatarUrl,
  media,
  anyMedia,
}: {
  username: string;
  avatarUrl: string | null;
  media: MediaRef | null;
  anyMedia: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 pb-2.5 pt-1.5">
        <ChevronLeft className="h-5 w-5 shrink-0 text-white" />
        <Avatar avatarUrl={avatarUrl} username={username} size="h-6 w-6" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
          {username}
        </span>
        <MoreHorizontal className="h-4 w-4 shrink-0 text-white/80" />
      </div>

      <div className="flex aspect-square w-full items-center justify-center bg-neutral-900">
        {media?.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.thumbnail_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <p className="px-6 text-center text-[11px] leading-relaxed text-white/40">
            {anyMedia
              ? "Qualquer publicação ou Reel"
              : "Selecione uma publicação ao lado"}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 px-3 py-2.5 text-white">
        <Heart className="h-5 w-5" />
        <MessageCircle className="h-5 w-5" />
        <Send className="h-5 w-5" />
        <Bookmark className="ml-auto h-5 w-5" />
      </div>

      <div className="px-3 text-[12px] leading-snug text-white/80">
        <span className="font-semibold text-white">{username}</span>{" "}
        {media?.caption ? media.caption.slice(0, 60) : "sua legenda aparece aqui"}
      </div>
    </div>
  );
}

function ComentariosScreen({
  username,
  avatarUrl,
  commentText,
  publicReplyEnabled,
  publicReplyText,
}: {
  username: string;
  avatarUrl: string | null;
  commentText: string;
  publicReplyEnabled: boolean;
  publicReplyText: string;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-center border-b border-white/10 px-3 pb-2.5 pt-1.5">
        <span className="text-[13px] font-semibold text-white">Comentários</span>
      </div>

      <div className="flex-1 space-y-4 px-3 py-3">
        <div className="flex items-start gap-2">
          <div className="h-6 w-6 shrink-0 rounded-full bg-neutral-700" />
          <div className="min-w-0">
            <p className="text-[12px] leading-snug text-white">
              <span className="font-semibold">seguidor.ig</span>{" "}
              {commentText || <span className="text-white/40">preço</span>}
            </p>
            <p className="mt-0.5 text-[10px] text-white/40">2 min · Responder</p>
          </div>
        </div>

        {publicReplyEnabled && (
          <div className="ml-6 flex items-start gap-2 border-l border-white/10 pl-3">
            <Avatar avatarUrl={avatarUrl} username={username} size="h-5 w-5" />
            <div className="min-w-0">
              <p className="text-[12px] leading-snug text-white">
                <span className="font-semibold">{username}</span>{" "}
                {publicReplyText || (
                  <span className="text-white/40">
                    sua resposta pública aparece aqui
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[10px] text-white/40">agora · Autor</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
        <Avatar avatarUrl={avatarUrl} username={username} size="h-6 w-6" />
        <div className="min-w-0 flex-1 truncate rounded-full bg-neutral-800 px-3 py-1.5 text-[12px] text-white/40">
          Adicione um comentário...
        </div>
      </div>
    </div>
  );
}

function DmScreen({
  username,
  avatarUrl,
  welcomeText,
  welcomeButtonLabel,
  linkMessageText,
  links,
}: {
  username: string;
  avatarUrl: string | null;
  welcomeText: string;
  welcomeButtonLabel: string;
  linkMessageText: string;
  links: { title: string; url: string }[];
}) {
  const hasButton = welcomeButtonLabel.trim().length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 pb-2.5 pt-1.5">
        <ChevronLeft className="h-5 w-5 shrink-0 text-white" />
        <Avatar avatarUrl={avatarUrl} username={username} size="h-7 w-7" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
          {username}
        </span>
        <Phone className="h-4 w-4 shrink-0 text-white/80" />
        <Video className="h-[18px] w-[18px] shrink-0 text-white/80" />
      </div>

      <div className="flex flex-1 flex-col justify-end gap-2.5 px-3 py-4">
        {/* bot: mensagem de boas-vindas com botão postback */}
        <div className="flex items-end gap-1.5">
          <div className="h-5 w-5 shrink-0 rounded-full bg-neutral-700" />
          <div className="max-w-[210px] overflow-hidden rounded-2xl rounded-bl-sm bg-neutral-800">
            <p className="whitespace-pre-wrap px-3 py-2 text-[13px] leading-snug text-white">
              {welcomeText || (
                <span className="text-white/40">
                  Sua mensagem de boas-vindas aparece aqui
                </span>
              )}
            </p>
            {hasButton && (
              <div className="border-t border-white/15 px-3 py-2 text-center text-[12px] font-semibold text-[#9DAAFF]">
                {welcomeButtonLabel}
              </div>
            )}
          </div>
        </div>

        {/* seguidor "toca" no botão */}
        {hasButton && (
          <div className="flex justify-end">
            <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-[#5B4FE5] px-3 py-2 text-[13px] leading-snug text-white">
              {welcomeButtonLabel}
            </div>
          </div>
        )}

        {/* bot: mensagem com o link, liberada pelo toque */}
        <div className="flex items-end gap-1.5">
          <div className="h-5 w-5 shrink-0 rounded-full bg-neutral-700" />
          <div className="max-w-[210px] overflow-hidden rounded-2xl rounded-bl-sm bg-neutral-800">
            <p className="whitespace-pre-wrap px-3 py-2 text-[13px] leading-snug text-white">
              {linkMessageText || (
                <span className="text-white/40">A DM com o link aparece aqui</span>
              )}
            </p>
            {links.length > 0 && (
              <div className="border-t border-white/15">
                {links.map((link, i) => (
                  <div
                    key={i}
                    className={cn(
                      "truncate px-3 py-2 text-center text-[12px] font-semibold text-[#9DAAFF]",
                      i > 0 && "border-t border-white/15"
                    )}
                  >
                    {link.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 border-t border-white/10 px-3 py-2.5">
        <Camera className="h-5 w-5 shrink-0 text-white/80" />
        <div className="min-w-0 flex-1 truncate rounded-full bg-neutral-800 px-3 py-1.5 text-[12px] text-white/40">
          Mensagem...
        </div>
        <ImageIcon className="h-[18px] w-[18px] shrink-0 text-white/80" />
        <Smile className="h-[18px] w-[18px] shrink-0 text-white/80" />
        <Mic className="h-[18px] w-[18px] shrink-0 text-white/80" />
      </div>
    </div>
  );
}

/**
 * Preview com 3 telas (Publicar / Comentários / DM), do ponto de vista de
 * quem comenta — diferente do DmPhonePreview (que mostra o próprio inbox do
 * dono da conta), aqui a mensagem do bot fica à esquerda e a ação do
 * seguidor (tocar no botão) aparece à direita, como no espelho do ManyChat.
 */
export function CommentPhonePreview({
  username,
  avatarUrl,
  selectedMedia,
  anyMedia,
  commentText,
  publicReplyEnabled,
  publicReplyText,
  welcomeText,
  welcomeButtonLabel,
  linkMessageText,
  links,
}: CommentPhonePreviewProps) {
  const [tab, setTab] = useState<Tab>("dm");

  return (
    <div>
      <div className="mx-auto w-[270px] rounded-[2.5rem] border-[6px] border-neutral-800 bg-neutral-800 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)]">
        <div className="relative flex min-h-[540px] flex-col overflow-hidden rounded-[2rem] bg-black">
          <StatusBar />

          {tab === "publicar" && (
            <PublicarScreen
              username={username}
              avatarUrl={avatarUrl}
              media={selectedMedia}
              anyMedia={anyMedia}
            />
          )}
          {tab === "comentarios" && (
            <ComentariosScreen
              username={username}
              avatarUrl={avatarUrl}
              commentText={commentText}
              publicReplyEnabled={publicReplyEnabled}
              publicReplyText={publicReplyText}
            />
          )}
          {tab === "dm" && (
            <DmScreen
              username={username}
              avatarUrl={avatarUrl}
              welcomeText={welcomeText}
              welcomeButtonLabel={welcomeButtonLabel}
              linkMessageText={linkMessageText}
              links={links}
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              tab === t.id
                ? "border-foreground/80 bg-foreground text-background"
                : "border-border/70 bg-secondary/40 text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
