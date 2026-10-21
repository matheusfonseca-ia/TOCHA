"use client";

import { VariantList } from "@/components/rules/variants/variant-list";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FOLLOW_GATE_DEFAULTS, FOLLOW_GATE_LIMITS } from "@/lib/follow-gate/copy";
import type { FollowGateForm } from "@/lib/follow-gate/form";

const VARIANTS_HINT = "O Falow sorteia um dos textos a cada envio.";

/**
 * Interruptor "Seguir para liberar" + textos do portão, usado nas telas de
 * automação de DM e de comentário. Quem não segue a conta recebe esta
 * mensagem no lugar do conteúdo, com os botões de seguir e "Já segui".
 *
 * As duas mensagens (a do portão e a de "ainda não segue") aceitam variações:
 * o Falow sorteia uma delas a cada envio, como na resposta pública do comentário.
 */
export function FollowGateField({
  value,
  onChange,
  username,
  label,
  contentName,
  accountId,
}: {
  value: FollowGateForm;
  onChange: (next: FollowGateForm) => void;
  /** @ da conta selecionada: o botão de seguir abre este perfil. */
  username: string;
  label: string;
  /** Como a tela chama o que fica retido ("o link", "a resposta"). */
  contentName: string;
  /** Conta dona dos textos salvos a partir daqui. */
  accountId?: string | null;
}) {
  const set = (patch: Partial<FollowGateForm>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="follow-gate-enabled" className="text-sm font-normal">
          {label}
        </Label>
        <Switch
          id="follow-gate-enabled"
          checked={value.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
        />
      </div>

      {value.enabled && (
        <div className="space-y-3 rounded-md border border-border/70 bg-secondary/20 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="follow-gate-text" className="text-xs text-muted-foreground">
              Mensagem para quem ainda não segue
            </Label>
            <VariantList
              idPrefix="follow-gate-text"
              field="followGateText"
              rows={3}
              maxLength={FOLLOW_GATE_LIMITS.text}
              placeholder={FOLLOW_GATE_DEFAULTS.text}
              primary={value.text}
              onPrimaryChange={(text) => set({ text })}
              extras={value.textVariants}
              onExtrasChange={(textVariants) => set({ textVariants })}
              onBothChange={(next) =>
                set({ text: next.primary, textVariants: next.extras })
              }
              accountId={accountId}
              hint={VARIANTS_HINT}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="follow-gate-follow" className="text-xs text-muted-foreground">
                Botão que abre seu perfil
              </Label>
              <Input
                id="follow-gate-follow"
                maxLength={FOLLOW_GATE_LIMITS.label}
                placeholder={FOLLOW_GATE_DEFAULTS.followLabel}
                value={value.followLabel}
                onChange={(e) => set({ followLabel: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="follow-gate-confirm" className="text-xs text-muted-foreground">
                Botão de confirmação
              </Label>
              <Input
                id="follow-gate-confirm"
                maxLength={FOLLOW_GATE_LIMITS.label}
                placeholder={FOLLOW_GATE_DEFAULTS.confirmLabel}
                value={value.confirmLabel}
                onChange={(e) => set({ confirmLabel: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="follow-gate-retry" className="text-xs text-muted-foreground">
              Se tocarem na confirmação sem seguir
            </Label>
            <VariantList
              idPrefix="follow-gate-retry"
              field="followGateRetry"
              rows={2}
              maxLength={FOLLOW_GATE_LIMITS.text}
              placeholder={FOLLOW_GATE_DEFAULTS.retryText}
              primary={value.retryText}
              onPrimaryChange={(retryText) => set({ retryText })}
              extras={value.retryVariants}
              onExtrasChange={(retryVariants) => set({ retryVariants })}
              onBothChange={(next) =>
                set({ retryText: next.primary, retryVariants: next.extras })
              }
              accountId={accountId}
              hint={VARIANTS_HINT}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            O primeiro botão abre o perfil @{username}. O Falow confere se a
            pessoa segue você e só então envia {contentName}. Campo vazio usa o
            texto padrão.
          </p>
        </div>
      )}
    </div>
  );
}
