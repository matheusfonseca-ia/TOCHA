import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount } from "@/lib/sequences/__tests__/fixtures";

import { syncAccountProfile, withSyncedProfiles } from "./account-profile";

const { getInstagramProfileMock } = vi.hoisted(() => ({
  getInstagramProfileMock: vi.fn(),
}));

vi.mock("./oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./oauth")>()),
  getInstagramProfile: getInstagramProfileMock,
}));

let fake: FakeSupabase;
const db = () => fake.client as unknown as SupabaseClient;

beforeEach(() => {
  fake = createFakeAdmin();
  vi.clearAllMocks();
});

function profile(username: string, profilePictureUrl: string | null = null) {
  return { igUserId: "17841400000000000", username, profilePictureUrl };
}

describe("syncAccountProfile", () => {
  it("conta trocou de @: devolve o atual e grava no banco", async () => {
    const account = makeAccount({ ig_username: "antigo" });
    fake.tables.ig_accounts.push(account);
    getInstagramProfileMock.mockResolvedValue(profile("novo", "https://cdn/foto.jpg"));

    const synced = await syncAccountProfile(db(), account, "token");

    expect(synced.ig_username).toBe("novo");
    expect(fake.tables.ig_accounts[0].ig_username).toBe("novo");
    expect(fake.tables.ig_accounts[0].profile_picture_url).toBe("https://cdn/foto.jpg");
  });

  it("nada mudou: não escreve no banco", async () => {
    const account = makeAccount({ ig_username: "igual", profile_picture_url: null });
    fake.tables.ig_accounts.push(account);
    getInstagramProfileMock.mockResolvedValue(profile("igual"));
    const fromSpy = vi.spyOn(fake.client, "from");

    const synced = await syncAccountProfile(db(), account, "token");

    expect(synced.ig_username).toBe("igual");
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("Meta sem foto na resposta: mantém a foto salva", async () => {
    const account = makeAccount({ ig_username: "antigo", profile_picture_url: "https://cdn/salva.jpg" });
    fake.tables.ig_accounts.push(account);
    getInstagramProfileMock.mockResolvedValue(profile("novo", null));

    const synced = await syncAccountProfile(db(), account, "token");

    expect(synced.profile_picture_url).toBe("https://cdn/salva.jpg");
  });

  it("falha na Meta: devolve o salvo sem lançar", async () => {
    const account = makeAccount({ ig_username: "salvo" });
    fake.tables.ig_accounts.push(account);
    getInstagramProfileMock.mockRejectedValue(new Error("rede"));

    const synced = await syncAccountProfile(db(), account, "token");

    expect(synced.ig_username).toBe("salvo");
    expect(fake.tables.ig_accounts[0].ig_username).toBe("salvo");
  });
});

describe("withSyncedProfiles", () => {
  it("devolve o @ atual e nunca o token criptografado", async () => {
    const account = makeAccount({ ig_username: "antigo" });
    fake.tables.ig_accounts.push(account);
    getInstagramProfileMock.mockResolvedValue(profile("novo"));

    const [result] = await withSyncedProfiles(db(), [
      {
        id: account.id,
        ig_username: account.ig_username,
        profile_picture_url: account.profile_picture_url,
        access_token_enc: account.access_token_enc,
      },
    ]);

    expect(result.ig_username).toBe("novo");
    expect(result).not.toHaveProperty("access_token_enc");
    expect(getInstagramProfileMock).toHaveBeenCalledWith("token-valido-de-teste");
  });

  it("token ilegível: devolve a conta como está, sem consultar a Meta", async () => {
    const [result] = await withSyncedProfiles(db(), [
      { id: "acc-x", ig_username: "salvo", profile_picture_url: null, access_token_enc: "lixo" },
    ]);

    expect(result).toEqual({ id: "acc-x", ig_username: "salvo", profile_picture_url: null });
    expect(getInstagramProfileMock).not.toHaveBeenCalled();
  });
});
