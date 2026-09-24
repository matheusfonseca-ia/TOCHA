"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FIELD_VALUE_MAX, TAG_MAX } from "@/lib/sequences/fields";
import type { SetFieldNodeData } from "@/types/sequence";

import { FieldKeyInput } from "./data-fields-context";
import { TemplateHint } from "./template-hint";

export function SetFieldForm({
  data,
  onChange,
}: {
  data: SetFieldNodeData;
  onChange: (data: SetFieldNodeData) => void;
}) {
  return (
    <div className="space-y-4">
      <Tabs
        value={data.mode}
        onValueChange={(v) => onChange({ ...data, mode: v as SetFieldNodeData["mode"] })}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="field">Campo</TabsTrigger>
          <TabsTrigger value="tag">Tag</TabsTrigger>
        </TabsList>
      </Tabs>

      {data.mode === "field" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="set-field-key">Campo</Label>
            <FieldKeyInput
              id="set-field-key"
              value={data.fieldKey}
              onChange={(fieldKey) => onChange({ ...data, fieldKey })}
              placeholder="ex.: origem"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-field-value">Valor</Label>
            <Input
              id="set-field-value"
              placeholder="ex.: story de março"
              maxLength={FIELD_VALUE_MAX}
              value={data.value}
              onChange={(e) => onChange({ ...data, value: e.target.value })}
            />
            <TemplateHint />
          </div>
        </>
      ) : (
        <>
          <Tabs
            value={data.tagAction ?? "add"}
            onValueChange={(v) =>
              onChange({ ...data, tagAction: v as NonNullable<SetFieldNodeData["tagAction"]> })
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="add">Adicionar</TabsTrigger>
              <TabsTrigger value="remove">Remover</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="space-y-2">
            <Label htmlFor="set-field-tag">Tag</Label>
            <Input
              id="set-field-tag"
              placeholder="ex.: vip"
              maxLength={TAG_MAX}
              value={data.value}
              onChange={(e) => onChange({ ...data, value: e.target.value })}
            />
          </div>
        </>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Grava no contato sem enviar mensagem e continua na hora. Use com
        Condição para separar quem já passou por aqui.
      </p>
    </div>
  );
}
