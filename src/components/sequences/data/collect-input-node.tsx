"use client";

import { INVALID_HANDLE, OUT_HANDLE, type CollectInputNodeData } from "@/types/sequence";

import { inputTypeOption } from "./labels";
import { OutputRow } from "./output-row";

/** Conteúdo do card "Coletar dado" (a moldura é o NodeFrame de sequence-nodes.tsx). */
export function CollectInputNodeBody({
  data,
  handleClassName,
}: {
  data: CollectInputNodeData;
  handleClassName: string;
}) {
  const type = inputTypeOption(data.inputType);
  const attempts = data.maxAttempts === 1 ? "1 tentativa" : `${data.maxAttempts} tentativas`;

  return (
    <div className="space-y-1.5">
      <p className="break-words text-xs text-muted-foreground">
        Coletar {type.noun} em{" "}
        {data.fieldKey ? (
          <span className="font-mono font-medium text-foreground">{`{${data.fieldKey}}`}</span>
        ) : (
          <span className="italic text-muted-foreground/70">campo…</span>
        )}
      </p>
      {data.question.trim() ? (
        <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-foreground/80">
          {data.question}
        </p>
      ) : (
        <p className="text-xs italic text-muted-foreground/70">Escreva a pergunta…</p>
      )}
      <OutputRow handleId={OUT_HANDLE} handleClassName={handleClassName} label="Resposta válida" />
      <OutputRow
        handleId={INVALID_HANDLE}
        handleClassName={handleClassName}
        label={`Inválido após ${attempts}`}
        tone="muted"
      />
    </div>
  );
}
