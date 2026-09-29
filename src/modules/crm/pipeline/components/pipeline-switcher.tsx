"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { PipelineOption } from "../types";

/** Seletor de funil no cabeçalho do board (só aparece com mais de 1 funil). */
export function PipelineSwitcher({
  pipelines,
  selectedId,
}: {
  pipelines: PipelineOption[];
  selectedId: string;
}) {
  const router = useRouter();
  if (pipelines.length <= 1) return null;

  return (
    <Select value={selectedId} onValueChange={(v) => router.replace(`/crm/funil?funil=${v}`)}>
      <SelectTrigger className="h-9 w-[200px] text-[13px]" aria-label="Funil">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {pipelines.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
