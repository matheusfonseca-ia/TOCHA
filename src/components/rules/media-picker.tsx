"use client";

import { useState } from "react";
import { Check, Clapperboard, ImageOff, Images } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MediaRef } from "@/types/database";

const PREVIEW_COUNT = 4;

function MediaThumb({
  media,
  selected,
  onClick,
}: {
  media: MediaRef;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg border-2 bg-secondary/40 transition-colors",
        selected
          ? "border-primary"
          : "border-transparent hover:border-border"
      )}
    >
      {media.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.thumbnail_url}
          alt={media.caption ?? "Publicação"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-5 w-5 text-muted-foreground/50" />
        </div>
      )}

      {media.media_type === "VIDEO" && (
        <Clapperboard className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-white drop-shadow" />
      )}

      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity",
          selected ? "opacity-100 bg-primary/30" : "group-hover:opacity-100"
        )}
      >
        {selected && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </button>
  );
}

export function MediaPicker({
  media,
  selectedIds,
  onToggle,
}: {
  media: MediaRef[];
  selectedIds: string[];
  onToggle: (media: MediaRef) => void;
}) {
  const [open, setOpen] = useState(false);

  if (media.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border/70 bg-secondary/20 px-3 py-4 text-center text-xs text-muted-foreground">
        Nenhuma publicação encontrada nesta conta ainda.
      </p>
    );
  }

  const preview = media.slice(0, PREVIEW_COUNT);

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {preview.map((item) => (
          <MediaThumb
            key={item.id}
            media={item}
            selected={selectedIds.includes(item.id)}
            onClick={() => onToggle(item)}
          />
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Images className="h-3.5 w-3.5" />
          Mostrar Todos
        </button>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Escolha as publicações ou Reels</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {media.map((item) => (
              <MediaThumb
                key={item.id}
                media={item}
                selected={selectedIds.includes(item.id)}
                onClick={() => onToggle(item)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} publicação(ões) selecionada(s)
        </p>
      )}
    </div>
  );
}
