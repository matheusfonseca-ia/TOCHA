"use client";

import { useState, useTransition } from "react";
import { FlaskConical, Save, Workflow } from "lucide-react";
import { toast } from "sonner";

import {
  saveSettings,
  sendTestWebhook,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface SettingsFormProps {
  initialUrl: string;
  initialEnabled: boolean;
}

export function SettingsForm({ initialUrl, initialEnabled }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState(initialUrl);
  const [enabled, setEnabled] = useState(initialEnabled);

  function handleSave() {
    startTransition(async () => {
      const result = await saveSettings({
        n8n_webhook_url: url,
        n8n_enabled: enabled,
      });
      if (result.error) toast.error(result.error);
      if (result.message) toast.success(result.message);
    });
  }

  function handleTest() {
    startTransition(async () => {
      const result = await sendTestWebhook();
      if (result.error) toast.error(result.error);
      if (result.message) toast.success(result.message);
    });
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="h-4 w-4 text-primary" />
          Integração n8n
        </CardTitle>
        <CardDescription>
          A cada mensagem processada, o InstaReply envia um POST com o evento
          completo para o seu workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-md border border-input px-4 py-3">
          <div>
            <p className="text-sm font-medium">Disparar webhook</p>
            <p className="text-xs text-muted-foreground">
              Ativa o envio de eventos para o n8n.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="n8n-url">URL do webhook</Label>
          <Input
            id="n8n-url"
            placeholder="https://seu-n8n.com/webhook/instareply"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isPending}>
            <Save />
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={isPending}>
            <FlaskConical />
            Enviar teste
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
