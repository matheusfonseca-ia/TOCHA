import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount } from "@/lib/sequences/__tests__/fixtures";
import type { IgAccount } from "@/types/database";

import { backfillLeadProfiles, refreshLeadProfile } from "../server/refresh-profile";

/**
 * `refreshLeadProfile` e `backfillLeadProfiles` contra o fake do Supabase,
 * com `fetch` mockado para a User Profile API.
 */

let fake: FakeSupabase;
let account: IgAccount;

function mockProfileApi(json: Record<string, unknown> | null, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(json ?? { error: { message: "falhou" } }), { status }))
  );
}

beforeEach(() => {
  fake = createFakeAdmin();
  account = makeAccount({ status: "active" });
  fake.tables.ig_accounts.push(account);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refreshLeadProfile", () => {
  it("grava o perfil completo e marca quando foi buscado", async () => {
    mockProfileApi({
      username: "maria_ig",
      name: "Maria",
      profile_pic: "https://cdn.example.com/maria.jpg",
      follower_count: 42,
      is_user_follow_business: true,
      is_verified_user: true,
    });
    fake.tables.conversations.push({
      id: "c1",
      account_id: account.id,
      ig_sender_id: "lead-1",
      ig_sender_username: null,
    });

    await refreshLeadProfile(fake.client as never, account, "lead-1");

    const conversation = fake.tables.conversations[0];
    expect(conversation).toMatchObject({
      ig_sender_username: "maria_ig",
      ig_profile_name: "Maria",
      ig_profile_pic_url: "https://cdn.example.com/maria.jpg",
      ig_follower_count: 42,
      ig_follows_business: true,
      ig_is_verified: true,
    });
    expect(conversation.ig_profile_fetched_at).toEqual(expect.any(String));
  });

  it("não sobrescreve o @ já gravado quando a Meta não devolve username desta vez", async () => {
    mockProfileApi({ follower_count: 10 });
    fake.tables.conversations.push({
      id: "c1",
      account_id: account.id,
      ig_sender_id: "lead-1",
      ig_sender_username: "ja_conhecido",
    });

    await refreshLeadProfile(fake.client as never, account, "lead-1");

    expect(fake.tables.conversations[0].ig_sender_username).toBe("ja_conhecido");
    expect(fake.tables.conversations[0].ig_follower_count).toBe(10);
  });

  it("falha na Graph API ainda assim grava ig_profile_fetched_at (não repete a cada mensagem)", async () => {
    mockProfileApi(null, 403);
    fake.tables.conversations.push({
      id: "c1",
      account_id: account.id,
      ig_sender_id: "lead-1",
      ig_sender_username: null,
    });

    await refreshLeadProfile(fake.client as never, account, "lead-1");

    expect(fake.tables.conversations[0].ig_profile_fetched_at).toEqual(expect.any(String));
    expect(fake.tables.conversations[0].ig_profile_pic_url ?? null).toBeNull();
  });
});

describe("backfillLeadProfiles", () => {
  it("preenche só as conversas sem ig_profile_fetched_at, até o limite", async () => {
    mockProfileApi({ username: "u", follower_count: 1 });
    fake.tables.conversations.push(
      { id: "c1", account_id: account.id, ig_sender_id: "l1", ig_profile_fetched_at: null },
      { id: "c2", account_id: account.id, ig_sender_id: "l2", ig_profile_fetched_at: null },
      { id: "c3", account_id: account.id, ig_sender_id: "l3", ig_profile_fetched_at: "2026-01-01T00:00:00.000Z" }
    );

    const count = await backfillLeadProfiles(fake.client as never, account.id, 1);

    expect(count).toBe(1);
    const fetched = fake.tables.conversations.filter((c) => c.ig_profile_fetched_at);
    // A já preenchida (c3) continua, e exatamente 1 nova foi processada.
    expect(fetched).toHaveLength(2);
  });

  it("conta inexistente não faz nada", async () => {
    const count = await backfillLeadProfiles(fake.client as never, "conta-fantasma", 10);
    expect(count).toBe(0);
  });
});
