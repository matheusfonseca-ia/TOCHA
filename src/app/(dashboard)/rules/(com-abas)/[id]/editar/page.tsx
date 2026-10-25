import { notFound, redirect } from "next/navigation";

import { ResponderComentarioBuilder } from "@/components/rules/responder-comentario-builder";
import { ResponderDmBuilder } from "@/components/rules/responder-dm-builder";
import { withRecentMedia } from "@/lib/rules/account-media";
import { canEditInBuilder } from "@/lib/rules/edit-rule";
import { createClient } from "@/lib/supabase/server";
import type { Rule } from "@/types/database";

/**
 * Editar uma automação na mesma tela da criação. A conta fica fixa (trocar
 * de conta invalidaria as publicações escolhidas), então só ela é carregada.
 */
export default async function EditarAutomacaoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  // RLS: só encontra a automação se ela for do usuário logado.
  const { data: rule } = await supabase
    .from("rules")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<Rule>();
  if (!rule) notFound();

  // Resposta em imagem não cabe nesta tela: a edição fica no diálogo da lista.
  if (!canEditInBuilder(rule)) redirect("/rules");

  const { data: account } = await supabase
    .from("ig_accounts")
    .select("id, ig_username, profile_picture_url, access_token_enc")
    .eq("id", rule.account_id)
    .maybeSingle();
  if (!account) notFound();

  if (rule.trigger_type === "comment") {
    return <ResponderComentarioBuilder accounts={await withRecentMedia([account])} rule={rule} />;
  }

  return (
    <ResponderDmBuilder
      accounts={[{ id: account.id, ig_username: account.ig_username, profile_picture_url: account.profile_picture_url }]}
      rule={rule}
    />
  );
}
