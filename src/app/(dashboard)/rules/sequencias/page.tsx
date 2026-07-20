import { Workflow } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function SequenciasPage() {
  return (
    <EmptyState
      icon={Workflow}
      title="Sequências — em breve"
      description="Fluxos de várias mensagens ao longo do tempo (drip campaigns) ainda não existem no InstaReply. Por enquanto, use as regras de palavra-chave em Minhas automações."
    />
  );
}
