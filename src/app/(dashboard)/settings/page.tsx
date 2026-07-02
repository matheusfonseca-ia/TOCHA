import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const SAMPLE_PAYLOAD = `{
  "event": "message_processed",
  "timestamp": "2026-07-02T14:30:00.000Z",
  "account": { "ig_user_id": "1789...", "ig_username": "minha_loja" },
  "sender_id": "9038...",
  "message_text": "qual o preço?",
  "result": {
    "status": "replied",
    "matched_keyword": "preço",
    "rule_id": "uuid-da-regra",
    "reply_type": "text"
  }
}`;

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: settings } = await supabase
    .from("user_settings")
    .select("n8n_webhook_url, n8n_enabled")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Integrações e preferências da sua conta."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SettingsForm
          initialUrl={settings?.n8n_webhook_url ?? ""}
          initialEnabled={settings?.n8n_enabled ?? false}
        />

        <Card
          className="stagger-item"
          style={{ "--stagger-index": 1 } as React.CSSProperties}
        >
          <CardHeader>
            <CardTitle className="text-base">Payload do evento</CardTitle>
            <CardDescription>
              Formato do JSON enviado ao n8n a cada mensagem processada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-background/60 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {SAMPLE_PAYLOAD}
            </pre>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
