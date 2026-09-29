"use client";

import { Tags } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { CrmTag } from "../types";
import { TAG_COLOR_DOT_CLASSES } from "../utils/palette";

const ALL_TAGS = "todas";

export function TagFilter({
  tags,
  value,
  onChange,
}: {
  tags: CrmTag[];
  value: string;
  onChange: (tagName: string) => void;
}) {
  if (tags.length === 0) return null;

  return (
    <Select value={value || ALL_TAGS} onValueChange={(v) => onChange(v === ALL_TAGS ? "" : v)}>
      <SelectTrigger className="h-9 text-[13px]" aria-label="Filtrar por tag">
        <Tags className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Todas as tags" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_TAGS}>Todas as tags</SelectItem>
        {tags.map((tag) => (
          <SelectItem key={tag.id} value={tag.name}>
            <span className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", TAG_COLOR_DOT_CLASSES[tag.color])} />
              {tag.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
