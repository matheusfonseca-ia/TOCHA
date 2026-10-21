import { AutomationHeader } from "@/modules/automations";
import { getAutomationCounts } from "@/modules/automations/server";

export default async function RulesLayout({
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
