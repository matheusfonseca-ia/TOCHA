import type { createAdminClient } from "@/lib/supabase/admin";
import { describe, expect, it } from "vitest";

import { createFakeAdmin } from "@/lib/sequences/__tests__/fake-supabase";

import { removeContactField, setContactField } from "../server/contact-fields-repository";

function admin(fake: ReturnType<typeof createFakeAdmin>) {
  return fake.client as unknown as ReturnType<typeof createAdminClient>;
}

const ACCOUNT = "acc-1";

describe("setContactField", () => {
  it("recusa chave inválida (mesma regra dos nós Coletar dado / Definir campo)", async () => {
    const fake = createFakeAdmin();
    const result = await setContactField(admin(fake), ACCOUNT, "s1", null, "Nome Inválido", "x");
    expect(result.error).toMatch(/inválido/i);
    expect(fake.tables.contacts).toHaveLength(0);
  });

  it("grava um campo válido, criando a linha se necessário", async () => {
    const fake = createFakeAdmin();
    const result = await setContactField(admin(fake), ACCOUNT, "s1", "lead", "email", "a@b.com");
    expect(result.error).toBeNull();
    expect(fake.tables.contacts[0].fields).toEqual({ email: "a@b.com" });
  });
});

describe("removeContactField", () => {
  it("remove só a chave pedida, preservando as demais", async () => {
    const fake = createFakeAdmin();
    fake.tables.contacts.push({
      id: "c1",
      account_id: ACCOUNT,
      ig_sender_id: "s1",
      fields: { email: "a@b.com", telefone: "123" },
      tags: [],
    });
    await removeContactField(admin(fake), ACCOUNT, "s1", "email");
    expect(fake.tables.contacts[0].fields).toEqual({ telefone: "123" });
  });
});
