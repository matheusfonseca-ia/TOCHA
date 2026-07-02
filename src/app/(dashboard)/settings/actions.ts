"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fireN8nWebhook } from "@/lib/n8n";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  message?: string;
}

const settingsSchema = z.object({
  n8n_webhook_url: z
    .string()
    .trim()
    .url("URL do webhook inválida.")
    .or(z.literal("")),
  n8n_enabled: z.boolean(),
});

export async function saveSettings(input: {
  n8n_webhook_url: string;
  n8n_enabled: boolean;
}): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  if (parsed.data.n8n_enabled && !parsed.data.n8n_webhook_url) {
    return { error: "Informe a URL do webhook para ativar a integração." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase.from("user_settings").upsert({
    user_id: user.id,
    n8n_webhook_url: parsed.data.n8n_webhook_url || null,
    n8n_enabled: parsed.data.n8n_enabled,
    updated_at: new Date().toISOString(),
  });

  if (error) return { error: "Não foi possível salvar as configurações." };

  revalidatePath("/settings");
  return { message: "Configurações salvas." };
}

export async function sendTestWebhook(): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { data: settings } = await supabase
    .from("user_settings")
    .select("n8n_webhook_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.n8n_webhook_url) {
    return { error: "Salve a URL do webhook antes de testar." };
  }

  const ok = await fireN8nWebhook(settings.n8n_webhook_url, {
    event: "message_processed",
    timestamp: new Date().toISOString(),
    account: { ig_user_id: "1789...", ig_username: "sua_conta_teste" },
    sender_id: "9038...",
    message_text: "Mensagem de teste do InstaReply 👋",
    result: {
      status: "replied",
      matched_keyword: "teste",
      rule_id: "00000000-0000-0000-0000-000000000000",
      reply_type: "text",
    },
  });

  return ok
    ? { message: "Payload de teste entregue com sucesso!" }
    : { error: "O n8n não respondeu 2xx. Confira a URL e o workflow." };
}
