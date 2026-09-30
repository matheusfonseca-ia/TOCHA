"use client";

import { KeyRound, Sparkles } from "lucide-react";
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

import { removeAiSettings, saveAiSettings } from "../actions";
import type { AiSettingsStatus } from "../types";

/**
 * Chave da OpenRouter de quem está logado. O valor nunca volta do servidor:
 * o campo começa vazio e o `keyHint` mostra só o final da chave guardada.
 */
export function AiSettingsCard({ status }: { status: AiSettingsStatus }) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(status.model ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveAiSettings({ apiKey, model });
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

  const canSave = apiKey.trim().length > 0 || (status.hasUserKey && model.trim() !== (status.model ?? ""));

  return (
    <Card className="mt-8 animate-fade-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          IA nos campos de texto
        </CardTitle>
        <CardDescription>
          Sua chave da OpenRouter (openrouter.ai/keys). Ela vale só para o seu
          usuário, fica criptografada e só o que você digita no botão de IA vai
          para o provedor, nunca mensagem de seguidor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {status.migrationMissing && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
            Aplique a migration <code className="font-mono">0016_user_ai_settings.sql</code> no
            Supabase para guardar a chave por usuário.
          </p>
        )}

        <p className="text-muted-foreground">
          {status.hasUserKey
            ? `Usando a sua chave (${status.keyHint}).`
            : status.installationKey
              ? "Sem chave própria: usando a chave padrão desta instalação."
              : "Sem chave: o botão de IA não aparece nos campos."}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-key">
              {status.hasUserKey ? "Trocar a chave" : "Chave da OpenRouter"}
            </Label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              placeholder="sk-or-v1-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={pending || status.migrationMissing}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Modelo (opcional)</Label>
            <Input
              id="ai-model"
              placeholder="anthropic/claude-sonnet-4.5"
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
