/** Dica de uma linha sob os textos de mensagem: variáveis disponíveis. */
export function TemplateHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Use{" "}
      <code className="rounded bg-secondary px-1 font-mono text-[11px] text-foreground">
        {"{{campo}}"}
      </code>{" "}
      para inserir um dado coletado ou{" "}
      <code className="rounded bg-secondary px-1 font-mono text-[11px] text-foreground">
        {"{{username}}"}
      </code>{" "}
      para o @ da pessoa.
    </p>
  );
}
