import { AutomationHeader } from "@/modules/automations";
import { getAutomationCounts } from "@/modules/automations/server";

/**
 * Só as telas que mostram as abas (listas, escolha do gatilho e builders de
 * automação) ficam neste grupo. O editor de workflow (/rules/sequencias/nova
 * e /rules/sequencias/[id]) é tela cheia e mora fora dele, então não paga as
 * duas contagens exatas nem o cabeçalho.
 */
export default async function RulesTabsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const counts = await getAutomationCounts();

  return (
    <>
      <AutomationHeader counts={counts} />
      {children}
    </>
  );
}
