"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COLLECT_MAX_ATTEMPTS,
  COLLECT_MIN_ATTEMPTS,
} from "@/lib/sequences/collect";
import { COLLECT_ERROR_MAX, COLLECT_QUESTION_MAX } from "@/lib/sequences/fields";
import type { CollectInputNodeData, CollectInputType } from "@/types/sequence";

import { FieldKeyInput } from "./data-fields-context";
import { INPUT_TYPE_OPTIONS, inputTypeOption } from "./labels";
import { TemplateHint } from "./template-hint";

const TYPE_HELP: Record<CollectInputType, string> = {
  text: "Aceita qualquer resposta com texto.",
  email: "Aceita o e-mail mesmo no meio de uma frase e grava em minúsculas.",
  phone: "Aceita com ou sem DDI, parênteses e traços. Número com DDD vira +55.",
  number: "Aceita 1.500, 1500,00 e R$ 20. Grava só o número.",
  date: "Aceita 05/03/1990, 5/3/90 e 1990-03-05. Grava como dd/mm/aaaa.",
};

export function CollectInputForm({
  data,
  onChange,
}: {
  data: CollectInputNodeData;
  onChange: (data: CollectInputNodeData) => void;
}) {
  const changeType = (inputType: CollectInputType) => {
    const previous = inputTypeOption(data.inputType);
    const next = inputTypeOption(inputType);
    onChange({
      ...data,
      inputType,
      // Troca as sugestões só enquanto a pessoa não personalizou.
      fieldKey:
        !data.fieldKey || data.fieldKey === previous.suggestedKey
          ? next.suggestedKey
          : data.fieldKey,
      errorText:
        !data.errorText.trim() || data.errorText === previous.defaultError
          ? next.defaultError
          : data.errorText,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="collect-question">Pergunta</Label>
        <Textarea
          id="collect-question"
          placeholder="ex.: Qual é o seu melhor e-mail?"
          rows={3}
          maxLength={COLLECT_QUESTION_MAX}
          value={data.question}
          onChange={(e) => onChange({ ...data, question: e.target.value })}
        />
        <TemplateHint />
      </div>

      <div className="space-y-2">
        <Label>Tipo de resposta</Label>
        <Select
          value={data.inputType}
          onValueChange={(v) => changeType(v as CollectInputType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INPUT_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{TYPE_HELP[data.inputType]}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="collect-field">Salvar no campo</Label>
        <FieldKeyInput
          id="collect-field"
          value={data.fieldKey}
          onChange={(fieldKey) => onChange({ ...data, fieldKey })}
          placeholder={inputTypeOption(data.inputType).suggestedKey}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="collect-attempts">Tentativas</Label>
        <Input
          id="collect-attempts"
          type="number"
          min={COLLECT_MIN_ATTEMPTS}
          max={COLLECT_MAX_ATTEMPTS}
          value={Number.isFinite(data.maxAttempts) ? data.maxAttempts : ""}
          onChange={(e) =>
            onChange({ ...data, maxAttempts: Math.round(Number(e.target.value)) })
          }
        />
        <p className="text-xs text-muted-foreground">
          De {COLLECT_MIN_ATTEMPTS} a {COLLECT_MAX_ATTEMPTS}. Esgotadas, o fluxo
          segue pela saída “inválido” (sem ligação, ele termina).
        </p>
      </div>

      {data.maxAttempts > 1 && (
        <div className="space-y-2">
          <Label htmlFor="collect-error">Se a resposta for inválida</Label>
          <Textarea
            id="collect-error"
            rows={2}
            maxLength={COLLECT_ERROR_MAX}
            value={data.errorText}
            onChange={(e) => onChange({ ...data, errorText: e.target.value })}
          />
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        O fluxo espera a resposta neste bloco. A resposta válida fica salva no
        contato (página Contatos) e pode ser usada em Condição e nos textos.
      </p>
    </div>
  );
}
