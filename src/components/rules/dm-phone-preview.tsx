import {
  BatteryFull,
  Camera,
  ChevronLeft,
  Image as ImageIcon,
  Instagram,
  Mic,
  Phone,
  Signal,
  Smile,
  Video,
  Wifi,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface DmPhonePreviewProps {
  username: string;
  avatarUrl: string | null;
  incomingText: string;
  replyText: string;
  links: { title: string; url: string }[];
}

export function DmPhonePreview({
  username,
  avatarUrl,
  incomingText,
  replyText,
  links,
}: DmPhonePreviewProps) {
  return (
    <div>
      <div className="mx-auto w-[270px] rounded-[2.5rem] border-[6px] border-neutral-800 bg-neutral-800 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)]">
        <div className="relative flex min-h-[540px] flex-col overflow-hidden rounded-[2rem] bg-black">
          <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-neutral-800" />

          <div className="flex items-center justify-between px-5 pb-1 pt-3 text-[11px] font-medium text-white">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <Signal className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <BatteryFull className="h-3.5 w-3.5" />
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-white/10 px-3 pb-2.5 pt-1.5">
            <ChevronLeft className="h-5 w-5 shrink-0 text-white" />
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={username}
                className="h-7 w-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-700">
                <Instagram className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
              {username}
            </span>
            <Phone className="h-4 w-4 shrink-0 text-white/80" />
            <Video className="h-[18px] w-[18px] shrink-0 text-white/80" />
          </div>

          <div className="flex flex-1 flex-col justify-end gap-2.5 px-3 py-4">
            <div className="flex items-end gap-1.5">
              <div className="h-5 w-5 shrink-0 rounded-full bg-neutral-700" />
              <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-neutral-800 px-3 py-2 text-[13px] leading-snug text-white">
                {incomingText || <span className="text-white/40">preço</span>}
              </div>
            </div>

            <div className="flex justify-end">
              <div className="max-w-[210px] overflow-hidden rounded-2xl rounded-br-sm bg-gradient-to-br from-[#7C5CFC] to-[#C13584] shadow-sm">
                <p className="whitespace-pre-wrap px-3 py-2 text-[13px] leading-snug text-white">
                  {replyText || (
                    <span className="text-white/60">Sua resposta aparece aqui</span>
                  )}
                </p>
                {links.length > 0 && (
                  <div className="border-t border-white/25">
                    {links.map((link, i) => (
                      <div
                        key={i}
                        className={cn(
                          "truncate px-3 py-2 text-center text-[12px] font-semibold text-white",
                          i > 0 && "border-t border-white/25"
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
      </div>

      <div className="mt-3 flex justify-center">
        <span className="rounded-full border border-foreground/80 bg-foreground px-3 py-1 text-xs font-medium text-background">
          DM
        </span>
      </div>
    </div>
  );
}
