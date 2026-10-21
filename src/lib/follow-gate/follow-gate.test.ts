import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkFollow, FOLLOW_RECHECK_DELAY_MS } from "./check";
import {
  FOLLOW_GATE_DEFAULTS,
  followGateCopy,
  followGateMessageText,
  isFollowGateOn,
} from "./copy";
import { followGateFieldsForSave, followGateFormFrom, followGatePreviewCopy } from "./form";
import { isHeldByFollowGate } from "./gate";
import { followCheckPayload, parseFollowCheckPayload, profileUrl } from "./payload";
import {
  copyFollowGateColumns,
  followGateColumns,
  hasFollowGateVariants,
  isMissingFollowGateColumn,
  isMissingFollowGateVariantsColumn,
  withoutFollowGateColumns,
  withoutFollowGateVariantColumns,
} from "./schema";

const { getFollowsBusinessMock, sleepMock, sendTemplateButtonsMock } = vi.hoisted(() => ({
  getFollowsBusinessMock: vi.fn(async (_token: string, _id: string) => true),
  sleepMock: vi.fn(async (_ms: number) => {}),
  sendTemplateButtonsMock: vi.fn(
    async (_token: string, _to: string, _text: string, _buttons: unknown[]) => {}
  ),
}));

vi.mock("@/lib/meta/graph", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meta/graph")>()),
  getFollowsBusiness: getFollowsBusinessMock,
  sendTemplateButtonsMessage: sendTemplateButtonsMock,
}));

// O @ do link vem do perfil sincronizado; aqui basta devolver o da conta.
vi.mock("@/lib/meta/account-profile", () => ({
  syncAccountProfile: vi.fn(async (_admin: unknown, account: { ig_username: string }) => ({
    ig_username: account.ig_username,
  })),
}));

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  sleep: sleepMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  getFollowsBusinessMock.mockImplementation(async () => true);
});

describe("payload do Já segui", () => {
  it("ida e volta com o id da automação", () => {
    expect(parseFollowCheckPayload(followCheckPayload("rule-1"))).toBe("rule-1");
  });

  it("payload de outro botão ou sem id devolve null", () => {
    expect(parseFollowCheckPayload("falow:comment_link:rule-1")).toBeNull();
    expect(parseFollowCheckPayload("falow:follow_check:")).toBeNull();
  });

  it("link do perfil tira o @ e escapa o nome", () => {
    expect(profileUrl("@conta.teste")).toBe("https://www.instagram.com/conta.teste/");
    expect(profileUrl(" conta_x ")).toBe("https://www.instagram.com/conta_x/");
  });
});

describe("textos do portão", () => {
  it("coluna vazia ou só espaço usa o padrão", () => {
    expect(followGateCopy({ follow_gate_text: "  ", follow_gate_follow_label: null })).toEqual(
      FOLLOW_GATE_DEFAULTS
    );
  });

  it("texto próprio vence o padrão", () => {
    expect(followGateCopy({ follow_gate_confirm_label: "Pronto" }).confirmLabel).toBe("Pronto");
  });

  it("copy padrão sem travessão e rótulos dentro do limite da Meta", () => {
    for (const text of Object.values(FOLLOW_GATE_DEFAULTS)) expect(text).not.toMatch(/[—–]/);
    expect(FOLLOW_GATE_DEFAULTS.followLabel.length).toBeLessThanOrEqual(20);
    expect(FOLLOW_GATE_DEFAULTS.confirmLabel.length).toBeLessThanOrEqual(20);
  });

  it("portão só liga com true explícito (antes da migration o campo nem existe)", () => {
    expect(isFollowGateOn({})).toBe(false);
    expect(isFollowGateOn({ follow_gate_enabled: false })).toBe(false);
    expect(isFollowGateOn({ follow_gate_enabled: true })).toBe(true);
  });
});

describe("formulário da tela", () => {
  it("automação nova começa desligada e com a copy padrão preenchida", () => {
    expect(followGateFormFrom(undefined)).toEqual({
      enabled: false,
      ...FOLLOW_GATE_DEFAULTS,
      textVariants: [],
      retryVariants: [],
    });
  });

  it("texto igual ao padrão vai vazio no save (nulo no banco); texto próprio vai como está", () => {
    const form = { ...followGateFormFrom(undefined), enabled: true, text: "  Me segue  " };
    expect(followGateFieldsForSave(form)).toEqual({
      follow_gate_enabled: true,
      follow_gate_text: "Me segue",
      follow_gate_follow_label: "",
      follow_gate_confirm_label: "",
      follow_gate_retry_text: "",
      follow_gate_text_variants: [],
      follow_gate_retry_variants: [],
    });
  });

  it("carrega as variações salvas; coluna fora do formato vira lista vazia", () => {
    const form = followGateFormFrom({
      follow_gate_text_variants: ["V2", "V3"],
      follow_gate_retry_variants: "lixo" as never,
    });
    expect(form.textVariants).toEqual(["V2", "V3"]);
    expect(form.retryVariants).toEqual([]);
  });

  it("save das variações: sem vazias nem repetidas, e apagar o principal promove a 1ª variação", () => {
    const base = followGateFormFrom(undefined);
    expect(
      followGateFieldsForSave({
        ...base,
        text: "Principal",
        textVariants: [" V2 ", "", "Principal", "V2"],
      })
    ).toMatchObject({ follow_gate_text: "Principal", follow_gate_text_variants: ["V2"] });

    // Principal apagado: a 1ª variação vira o principal, o padrão não entra no sorteio.
    expect(
      followGateFieldsForSave({ ...base, text: "  ", textVariants: ["V2", "V3"] })
    ).toMatchObject({ follow_gate_text: "V2", follow_gate_text_variants: ["V3"] });
  });

  it("prévia: nula com o portão desligado; campo apagado mostra o padrão", () => {
    const form = followGateFormFrom(undefined);
    expect(followGatePreviewCopy(form)).toBeNull();
    expect(followGatePreviewCopy({ ...form, enabled: true, followLabel: "" })?.followLabel).toBe(
      FOLLOW_GATE_DEFAULTS.followLabel
    );
  });
});

describe("colunas no save e no duplicar", () => {
  it("sem follow_gate_enabled não mexe no salvo (diálogo genérico da lista)", () => {
    expect(followGateColumns({})).toEqual({});
  });

  it("texto vazio grava nulo", () => {
    expect(followGateColumns({ follow_gate_enabled: true, follow_gate_text: " " })).toEqual({
      follow_gate_enabled: true,
      follow_gate_text: null,
      follow_gate_follow_label: null,
      follow_gate_confirm_label: null,
      follow_gate_retry_text: null,
    });
  });

  it("variações só entram quando vieram no input (ausente não apaga, lista vazia grava nulo)", () => {
    const semVariacoes = followGateColumns({ follow_gate_enabled: true });
    expect("follow_gate_text_variants" in semVariacoes).toBe(false);
    expect("follow_gate_retry_variants" in semVariacoes).toBe(false);

    expect(
      followGateColumns({
        follow_gate_enabled: true,
        follow_gate_text_variants: [" A ", ""],
        follow_gate_retry_variants: [],
      })
    ).toMatchObject({ follow_gate_text_variants: ["A"], follow_gate_retry_variants: null });
  });

  it("sem follow_gate_enabled nem as variações mexem no salvo", () => {
    expect(followGateColumns({ follow_gate_text_variants: ["A"] })).toEqual({});
  });

  it("duplicar copia o portão; regra lida antes da migration não ganha colunas", () => {
    expect(copyFollowGateColumns({})).toEqual({});
    expect(
      copyFollowGateColumns({ follow_gate_enabled: true, follow_gate_text: "Me segue" })
    ).toMatchObject({ follow_gate_enabled: true, follow_gate_text: "Me segue" });
  });
});

describe("banco sem a migration 0007", () => {
  it("reconhece o erro real do PostgREST para coluna do portão", () => {
    expect(
      isMissingFollowGateColumn({
        message: "Could not find the 'follow_gate_enabled' column of 'rules' in the schema cache",
      })
    ).toBe(true);
    expect(isMissingFollowGateColumn({ message: "column rules.follow_gate_text does not exist" })).toBe(true);
  });

  it("outros erros não disparam o fallback", () => {
    expect(isMissingFollowGateColumn(null)).toBe(false);
    expect(isMissingFollowGateColumn({ message: "duplicate key value violates unique constraint" })).toBe(false);
    expect(
      isMissingFollowGateColumn({ message: "Could not find the 'expires_at' column of 'rules' in the schema cache" })
    ).toBe(false);
  });

  it("tira só as colunas do portão da linha", () => {
    expect(
      withoutFollowGateColumns({ keyword: "oi", follow_gate_enabled: false, follow_gate_text: null })
    ).toEqual({ keyword: "oi" });
  });
});

describe("banco sem a migration 0017", () => {
  it("reconhece só as colunas de variações do portão", () => {
    expect(
      isMissingFollowGateVariantsColumn({
        code: "PGRST204",
        message: "Could not find the 'follow_gate_text_variants' column of 'rules' in the schema cache",
      })
    ).toBe(true);
    expect(
      isMissingFollowGateVariantsColumn({ code: "42703", message: "column rules.follow_gate_retry_variants does not exist" })
    ).toBe(true);
    expect(
      isMissingFollowGateVariantsColumn({
        code: "PGRST204",
        message: "Could not find the 'follow_gate_enabled' column of 'rules' in the schema cache",
      })
    ).toBe(false);
    expect(isMissingFollowGateVariantsColumn(null)).toBe(false);
  });

  it("tira só as colunas de variações e mantém o resto do portão", () => {
    expect(
      withoutFollowGateVariantColumns({
        keyword: "oi",
        follow_gate_enabled: true,
        follow_gate_text: "x",
        follow_gate_text_variants: ["a"],
        follow_gate_retry_variants: null,
      })
    ).toEqual({ keyword: "oi", follow_gate_enabled: true, follow_gate_text: "x" });
  });

  it("só avisa quando havia variações para gravar", () => {
    expect(hasFollowGateVariants({ follow_gate_text_variants: ["a"] })).toBe(true);
    expect(hasFollowGateVariants({ follow_gate_text_variants: null, follow_gate_retry_variants: [] })).toBe(false);
  });
});

describe("sorteio das mensagens do portão", () => {
  const rule = {
    follow_gate_text: "Principal",
    follow_gate_text_variants: ["Outra A", "Outra B"],
    follow_gate_retry_text: null,
    follow_gate_retry_variants: ["Retry B"],
  };

  it("sorteia entre o principal e as variações da mensagem do portão", () => {
    expect(followGateMessageText(rule, false, () => 0)).toBe("Principal");
    expect(followGateMessageText(rule, false, () => 0.4)).toBe("Outra A");
    expect(followGateMessageText(rule, false, () => 0.99)).toBe("Outra B");
  });

  it("com again sorteia na mensagem de ainda não segue (principal vazio = texto padrão)", () => {
    expect(followGateMessageText(rule, true, () => 0)).toBe(FOLLOW_GATE_DEFAULTS.retryText);
    expect(followGateMessageText(rule, true, () => 0.99)).toBe("Retry B");
  });

  it("sem variações devolve o principal ou o padrão, sem sortear", () => {
    expect(followGateMessageText({ follow_gate_text: "Só eu" }, false, () => 0.99)).toBe("Só eu");
    expect(followGateMessageText({}, false)).toBe(FOLLOW_GATE_DEFAULTS.text);
    expect(followGateMessageText({ follow_gate_text_variants: null }, true)).toBe(
      FOLLOW_GATE_DEFAULTS.retryText
    );
  });

  it("variação repetida ou vazia não pesa no sorteio", () => {
    const dup = { follow_gate_text: "A", follow_gate_text_variants: ["A", "  ", "B"] };
    // Pool real: A e B. 0.6 cai no B (metade de cima).
    expect(followGateMessageText(dup, false, () => 0.6)).toBe("B");
    expect(followGateMessageText(dup, false, () => 0.1)).toBe("A");
  });

  it("sendFollowGateMessage manda o texto sorteado (e o da repetição com again)", async () => {
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        update: () => ({ eq: () => ({}) }),
      }),
    };
    const { sendFollowGateMessage } = await import("./gate");
    const account = { id: "a1", ig_username: "conta" } as never;

    await sendFollowGateMessage(admin as never, "t", account, rule as never, "s1", {
      again: false,
      confirmPayload: "p",
      random: () => 0.99,
    });
    await sendFollowGateMessage(admin as never, "t", account, rule as never, "s1", {
      again: true,
      confirmPayload: "p",
      random: () => 0.99,
    });

    expect(sendTemplateButtonsMock.mock.calls[0][2]).toBe("Outra B");
    expect(sendTemplateButtonsMock.mock.calls[1][2]).toBe("Retry B");
  });
});

describe("conteúdo retido", () => {
  it("portão enviado e conteúdo não entregue = retido", () => {
    expect(isHeldByFollowGate(null)).toBe(false);
    expect(isHeldByFollowGate({ link_delivered_at: null })).toBe(false);
    expect(isHeldByFollowGate({ link_delivered_at: null, follow_gate_sent_at: "2026-09-25" })).toBe(true);
    expect(
      isHeldByFollowGate({ link_delivered_at: "2026-09-25", follow_gate_sent_at: "2026-09-25" })
    ).toBe(false);
  });
});

describe("checkFollow", () => {
  it("segue na 1ª consulta", async () => {
    expect(await checkFollow("t", "s")).toEqual({ status: "follows" });
    expect(getFollowsBusinessMock).toHaveBeenCalledTimes(1);
  });

  it("sem recheck: não segue na 1ª consulta, não espera nem consulta de novo", async () => {
    getFollowsBusinessMock.mockImplementation(async () => false);
    expect(await checkFollow("t", "s")).toEqual({ status: "not_following" });
    expect(getFollowsBusinessMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("com recheck: espera e consulta 1x mais", async () => {
    getFollowsBusinessMock.mockImplementationOnce(async () => false).mockImplementationOnce(async () => true);
    expect(await checkFollow("t", "s", { recheck: true })).toEqual({ status: "follows" });
    expect(sleepMock).toHaveBeenCalledWith(FOLLOW_RECHECK_DELAY_MS);
    expect(getFollowsBusinessMock).toHaveBeenCalledTimes(2);
  });

  it("erro da Meta vira unknown com o motivo, sem lançar", async () => {
    getFollowsBusinessMock.mockImplementation(async () => {
      throw new Error("User consent is required to access user profile");
    });
    expect(await checkFollow("t", "s")).toEqual({
      status: "unknown",
      detail: "User consent is required to access user profile",
    });
  });
});
