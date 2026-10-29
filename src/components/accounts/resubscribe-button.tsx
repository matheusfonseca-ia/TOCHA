"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { resubscribeAccount } from "@/app/(dashboard)/accounts/webhook-actions";
import { Button } from "@/components/ui/button";

/** Tenta de novo a inscrição da conta nos webhooks da Meta (falhou no OAuth). */
export function ResubscribeButton({ accountId }: { accountId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = await resubscribeAccount(accountId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Pronto: a conta voltou a receber eventos. As automações já estão valendo.");
      router.replace("/accounts?connected=1");
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending} className="shrink-0">
      <RefreshCw />
      Tentar de novo
    </Button>
  );
}
