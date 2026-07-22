import { notFound } from "next/navigation";

import { SequenceEditor } from "@/components/sequences/sequence-editor";
import { createClient } from "@/lib/supabase/server";
import type { Sequence } from "@/types/sequence";

export default async function EditarSequenciaPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const [{ data: sequence }, { data: accounts }] = await Promise.all([
    // RLS garante que só sequências das contas do usuário aparecem aqui
    supabase.from("sequences").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("ig_accounts")
      .select("id, ig_username")
      .eq("status", "active")
      .order("connected_at"),
  ]);

  if (!sequence) notFound();

  return (
    <SequenceEditor
      accounts={accounts ?? []}
      sequence={sequence as Sequence}
    />
  );
}
