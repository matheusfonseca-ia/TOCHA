import { redirect } from "next/navigation";

import { isAiEnabled } from "@/app/(dashboard)/rules/ai-actions";
import { listPresets } from "@/app/(dashboard)/rules/presets-actions";
import { SmartFieldsProvider } from "@/components/fields/smart-fields-context";
import { createClient } from "@/lib/supabase/server";
import { AppShellProvider, Sidebar } from "@/modules/app-shell";
import { getSidebarCollapsed } from "@/modules/app-shell/server";
import { getUnreadTotal } from "@/modules/crm/server";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Textos salvos e disponibilidade da IA valem pro painel inteiro: carrega
  // uma vez aqui em vez de em cada tela que tem campo de texto.
  const [presets, aiEnabled, crmUnread] = await Promise.all([
    listPresets(),
    isAiEnabled(),
    getUnreadTotal(supabase),
  ]);

  // Conteúdo fluido até 1600px: em monitor grande ocupa a tela em vez de
  // sobrar faixa vazia dos lados, sem esticar sem fim em ultrawide.
  return (
    <AppShellProvider initialCollapsed={getSidebarCollapsed()}>
      <Sidebar userEmail={user.email ?? ""} crmUnread={crmUnread} />
      <main className="min-h-screen md:pl-[var(--sidebar-w)]">
        <div className="mx-auto w-full max-w-[1600px] p-4 pb-12 sm:p-6 lg:p-8 2xl:px-10">
          <SmartFieldsProvider presets={presets} aiEnabled={aiEnabled}>
            {children}
          </SmartFieldsProvider>
        </div>
      </main>
    </AppShellProvider>
  );
}
