import { redirect } from "next/navigation";

import { isAiEnabled } from "@/app/(dashboard)/rules/ai-actions";
import { listPresets } from "@/app/(dashboard)/rules/presets-actions";
import { SmartFieldsProvider } from "@/components/fields/smart-fields-context";
import { Sidebar } from "@/components/layout/sidebar";
import { isOwner } from "@/lib/billing/access";
import { createClient } from "@/lib/supabase/server";
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

  // O dono não tem assinatura: o botão "Minha assinatura" só aparece pros clientes.
  const owner = isOwner(user.id);

  // Textos salvos e disponibilidade da IA valem pro painel inteiro: carrega
  // uma vez aqui em vez de em cada tela que tem campo de texto.
  const [presets, aiEnabled, crmUnread] = await Promise.all([
    listPresets(),
    isAiEnabled(),
    getUnreadTotal(supabase),
  ]);

  return (
    <div className="min-h-screen">
      <Sidebar userEmail={user.email ?? ""} crmUnread={crmUnread} showBilling={!owner} />
      <main className="min-h-screen md:ml-60">
        <div className="mx-auto max-w-6xl p-4 pb-12 sm:p-6 lg:p-8">
          <SmartFieldsProvider presets={presets} aiEnabled={aiEnabled}>
            {children}
          </SmartFieldsProvider>
        </div>
      </main>
    </div>
  );
}
