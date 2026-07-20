import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function NovaAutomacaoResponderDmPage() {
  return (
    <EmptyState
      icon={Construction}
      title="Responder DM — em construção"
      description="A configuração desta automação ainda vai ser definida."
    >
      <Button asChild variant="outline">
        <Link href="/rules/nova">
          <ArrowLeft />
          Voltar
        </Link>
      </Button>
    </EmptyState>
  );
}
