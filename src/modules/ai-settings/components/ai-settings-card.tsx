"use client";

import { ExternalLink, KeyRound, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { AI_PROVIDER_IDS, AI_PROVIDERS, type AiProviderId } from "@/lib/ai/providers";
import { cn } from "@/lib/utils";

import { removeAiSettings, saveAiSettings } from "../actions";
import { AI_PROVIDER_UI } from "../constants";
import type { AiSettingsStatus } from "../types";

/**
 * Chave de IA de quem está logado, da OpenRouter ou da OpenAI. O valor nunca
 * volta do servidor: o campo começa vazio e o `keyHint` mostra só o final da
 * chave guardada. Trocar de provedor exige colar a chave do provedor novo.
 */
export function AiSettingsCard({ status }: { status: AiSettingsStatus }) {
  const [provider, setProvider] = useState<AiProviderId>(
    status.provider ?? status.installationProvider ?? "openrouter"
  );
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(status.model ?? "");
  const [pending, startTransition] = useTransition();

  const info = AI_PROVIDERS[provider];
  const ui = AI_PROVIDER_UI[provider];
  /** O seletor está num provedor diferente do da chave guardada. */
  const switching = status.hasUserKey && provider !== status.provider;

  function chooseProvider(next: AiProviderId) {
    if (next === provider) return;
    setProvider(next);
    setApiKey("");
    // O modelo é do provedor: id da OpenRouter não vale na OpenAI e vice-versa.
    setModel(next === status.provider ? (status.model ?? "") : "");
  }

  function save() {
    startTransition(async () => {
      const result = await saveAiSettings({ apiKey, model, provider });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setApiKey("");
      toast.success("Chave guardada. O botão de IA já aparece nos campos.");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeAiSettings();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setModel("");
      toast.success("Chave removida.");
    });
  }

  const canSave =
    apiKey.trim().length > 0 ||
    (status.hasUserKey && !switching && model.trim() !== (status.model ?? ""));

  const statusLine = status.hasUserKey
    ? `Usando a sua chave da ${AI_PROVIDERS[status.provider ?? "openrouter"].label} (${status.keyHint}).`
    : status.installationKey
      ? `Sem chave própria: usando a chave padrão desta instalação (${
          AI_PROVIDERS[status.installationProvider ?? "openrouter"].label
        }).`
      : "Sem chave: o botão de IA não aparece nos campos.";

  return (
    <Card className="mt-8 animate-fade-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          IA nos campos de texto
        </CardTitle>
        <CardDescription>
          Sua chave da OpenRouter ou da OpenAI. Ela vale só para o seu usuário,
          fica criptografada e só o que você digita no botão de IA vai para o
          provedor, nunca mensagem de seguidor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {status.migrationMissing && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
            Aplique a migration <code className="font-mono">0016_user_ai_settings.sql</code> no
            Supabase para guardar a chave por usuário.
          </p>
        )}

        <p className="text-muted-foreground">{statusLine}</p>

        <div className="space-y-1.5">
          <Label id="ai-provider-label">Provedor</Label>
          <div
            role="radiogroup"
            aria-labelledby="ai-provider-label"
            className="inline-flex rounded-md border border-border/70 bg-secondary/20 p-0.5"
          >
            {AI_PROVIDER_IDS.map((id) => {
              const active = id === provider;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={pending || status.migrationMissing}
                  onClick={() => chooseProvider(id)}
                  className={cn(
                    "rounded px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {AI_PROVIDERS[id].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-key">
              {status.hasUserKey && !switching
                ? `Trocar a chave da ${info.label}`
                : `Chave da ${info.label}`}
            </Label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              placeholder={ui.keyPlaceholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={pending || status.migrationMissing}
            />
            <p className="text-xs text-muted-foreground">
              {switching && `Para trocar de provedor, cole a chave da ${info.label}. `}
              Pegue a sua em{" "}
              <a
                href={ui.keysUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                {ui.keysUrlLabel}
                <ExternalLink className="h-3 w-3" />
              </a>
              .
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Modelo (opcional)</Label>
            <Input
              id="ai-model"
              placeholder={info.defaultModel}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={pending || status.migrationMissing}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending || !canSave || status.migrationMissing}>
            <KeyRound />
            {pending ? "Validando..." : "Guardar"}
          </Button>
          {status.hasUserKey && (
            <Button variant="outline" onClick={remove} disabled={pending}>
              Remover minha chave
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
