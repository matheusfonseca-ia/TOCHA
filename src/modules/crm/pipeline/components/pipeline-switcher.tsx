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

export type FunnelAccount = { id: string; ig_username: string | null };

function funilHref(accountId: string, pipelineId?: string): string {
  const params = new URLSearchParams({ conta: accountId });
  if (pipelineId) params.set("funil", pipelineId);
  return `/crm/funil?${params.toString()}`;
}

/**
 * Seletores de conta e de funil no cabeçalho do board. Cada um só aparece
 * com mais de 1 opção; trocar de funil mantém a conta na URL (sem ela a
 * página volta para a 1ª conta).
 */
export function PipelineSwitcher({
  accounts,
  accountId,
  pipelines,
  selectedId,
}: {
  accounts: FunnelAccount[];
  accountId: string;
  pipelines: PipelineOption[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <>
      {accounts.length > 1 && (
        <Select value={accountId} onValueChange={(v) => router.replace(funilHref(v))}>
          <SelectTrigger className="h-9 w-[180px] text-[13px]" aria-label="Conta">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                @{a.ig_username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {pipelines.length > 1 && (
        <Select value={selectedId} onValueChange={(v) => router.replace(funilHref(accountId, v))}>
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
      )}
    </>
  );
}
