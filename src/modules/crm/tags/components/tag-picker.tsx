"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { applyTagToLead } from "../services/tags.actions";
import type { CrmTag } from "../types";
import { sameTag } from "../utils/normalize-tag";
import { TAG_COLOR_DOT_CLASSES } from "../utils/palette";
import { TagBadge } from "./tag-badge";

/**
 * Seletor de tags da ficha do lead: badges do que já está marcado + menu com
 * o catálogo inteiro (marca/desmarca na hora, otimista com rollback em erro).
 */
export function TagPicker({
  accountId,
  senderId,
  username,
  catalog,
  tags,
  onManageTags,
}: {
  accountId: string;
  senderId: string;
  username: string | null;
  catalog: CrmTag[];
  tags: string[];
  onManageTags: () => void;
}) {
  const [current, setCurrent] = useState(tags);
  useEffect(() => setCurrent(tags), [tags]);

  async function toggle(tagName: string) {
    const has = current.some((t) => sameTag(t, tagName));
    const previous = current;
    setCurrent(has ? current.filter((t) => !sameTag(t, tagName)) : [...current, tagName]);
    const result = await applyTagToLead(accountId, senderId, username, tagName, has ? "remove" : "add");
    if (result.error) {
      setCurrent(previous);
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {current.map((name) => {
          const catalogTag = catalog.find((c) => sameTag(c.name, name));
          return <TagBadge key={name} name={name} color={catalogTag?.color ?? "green"} />;
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 rounded-full px-2 text-[11px]">
              <Plus className="h-3 w-3" />
              Tag
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {catalog.length === 0 ? (
              <DropdownMenuLabel className="font-normal text-muted-foreground">
                Nenhuma tag criada ainda
              </DropdownMenuLabel>
            ) : (
              catalog.map((tag) => {
                const active = current.some((t) => sameTag(t, tag.name));
                return (
                  <DropdownMenuItem
                    key={tag.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      void toggle(tag.name);
                    }}
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", TAG_COLOR_DOT_CLASSES[tag.color])} />
                    <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </DropdownMenuItem>
                );
              })
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onManageTags}>
              <Settings2 className="h-3.5 w-3.5" />
              Gerenciar tags
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
