import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkFollow, FOLLOW_RECHECK_DELAY_MS } from "./check";
import { FOLLOW_GATE_DEFAULTS, followGateCopy, isFollowGateOn } from "./copy";
import { followGateFieldsForSave, followGateFormFrom, followGatePreviewCopy } from "./form";
import { isHeldByFollowGate } from "./gate";
import { followCheckPayload, parseFollowCheckPayload, profileUrl } from "./payload";
import {
  copyFollowGateColumns,
  followGateColumns,
  isMissingFollowGateColumn,
  withoutFollowGateColumns,
} from "./schema";

const { getFollowsBusinessMock, sleepMock } = vi.hoisted(() => ({
  getFollowsBusinessMock: vi.fn(async (_token: string, _id: string) => true),
  sleepMock: vi.fn(async (_ms: number) => {}),
}));

vi.mock("@/lib/meta/graph", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meta/graph")>()),
  getFollowsBusiness: getFollowsBusinessMock,
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
    expect(followGateFormFrom(undefined)).toEqual({ enabled: false, ...FOLLOW_GATE_DEFAULTS });
  });

  it("texto igual ao padrão vai vazio no save (nulo no banco); texto próprio vai como está", () => {
    const form = { ...followGateFormFrom(undefined), enabled: true, text: "  Me segue  " };
    expect(followGateFieldsForSave(form)).toEqual({
      follow_gate_enabled: true,
      follow_gate_text: "Me segue",
      follow_gate_follow_label: "",
      follow_gate_confirm_label: "",
      follow_gate_retry_text: "",
    });
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
