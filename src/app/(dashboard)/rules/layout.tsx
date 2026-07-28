import { AutomationSectionNav } from "@/components/rules/automation-section-nav";
import { PageHeader } from "@/components/layout/page-header";

export default function RulesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <PageHeader
        title="Automação"
        description='Regras de palavra-chave e sequências: de "se receber X, responda Y" a fluxos completos de conversa.'
      />
      <div className="flex flex-col gap-5 md:flex-row md:gap-8">
        <AutomationSectionNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
