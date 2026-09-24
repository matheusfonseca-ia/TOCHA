import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeRule, makeSequence } from "@/lib/sequences/__tests__/fixtures";

/**
 * `extendExpiry`: só reativa o que o sweep pausou (`paused_by_expiry`);
 * pausa manual continua pausada, mesmo com a data já vencida.
 */

const { getClient, setClient } = vi.hoisted(() => {
  let current: unknown = null;
  return {
    getClient: () => current,
    setClient: (value: unknown) => {
      current = value;
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: () => getClient() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { expireAutomations } from "./sweep";
import { extendExpiry } from "./actions";

const HOUR = 60 * 60 * 1000;
const past = () => new Date(Date.now() - HOUR).toISOString();
const inDays = (n: number) => new Date(Date.now() + n * 24 * HOUR).toISOString();

let fake: FakeSupabase;

beforeEach(() => {
  fake = createFakeAdmin();
  setClient(fake.client);
});

describe("extendExpiry", () => {
  it("reativa a automação pausada pelo sweep e zera o marcador", async () => {
    const rule = makeRule({ expires_at: past(), expire_action: "pause" });
    fake.tables.rules.push(rule);
    await expireAutomations(fake.client as never);

    const newDate = inDays(3);
    const result = await extendExpiry("rule", rule.id, newDate);

    expect(result).toEqual({ reactivated: true });
    const saved = fake.tables.rules[0];
    expect(saved.is_active).toBe(true);
    expect(saved.paused_by_expiry).toBe(false);
    expect(saved.expires_at).toBe(newDate);
  });

  it("não reativa automação pausada pelo usuário, mesmo com a data vencida", async () => {
    const rule = makeRule({
      expires_at: past(),
      expire_action: "pause",
      is_active: false,
      paused_by_expiry: false,
    });
    fake.tables.rules.push(rule);

    const result = await extendExpiry("rule", rule.id, inDays(5));

    expect(result).toEqual({});
    expect(fake.tables.rules[0].is_active).toBe(false);
  });

  it("tornar permanente também reativa o que o sweep pausou", async () => {
    const sequence = makeSequence({ expires_at: past(), expire_action: "pause" });
    fake.tables.sequences.push(sequence);
    await expireAutomations(fake.client as never);

    const result = await extendExpiry("sequence", sequence.id, null);

    expect(result).toEqual({ reactivated: true });
    expect(fake.tables.sequences[0].is_active).toBe(true);
    expect(fake.tables.sequences[0].expires_at).toBeNull();
  });

  it("recusa data a menos de 5 minutos no futuro", async () => {
    const rule = makeRule();
    fake.tables.rules.push(rule);

    const result = await extendExpiry("rule", rule.id, new Date(Date.now() + 60_000).toISOString());

    expect(result.error).toMatch(/5 minutos/);
  });
});
