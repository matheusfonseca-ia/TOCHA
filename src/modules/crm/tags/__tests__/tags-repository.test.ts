import type { createAdminClient } from "@/lib/supabase/admin";
import { describe, expect, it } from "vitest";

import { createFakeAdmin } from "@/lib/sequences/__tests__/fake-supabase";

import {
  createTagInCatalog,
  deleteTagFromCatalog,
  ensureTagCatalog,
  listTagCatalog,
  renameTagInCatalog,
  setContactTag,
} from "../server/tags-repository";

/**
 * Propagação renomear/excluir e seed do catálogo, com o mesmo fake de
 * Supabase usado pelos testes de runtime do workflow (`crm_tag_rename` /
 * `crm_tag_remove` espelhados em JS no fake).
 */

function admin(fake: ReturnType<typeof createFakeAdmin>) {
  return fake.client as unknown as ReturnType<typeof createAdminClient>;
}

const ACCOUNT = "acc-1";

describe("ensureTagCatalog", () => {
  it("monta o catálogo a partir de contacts.tags sem duplicar por maiúscula/acento", async () => {
    const fake = createFakeAdmin();
    fake.tables.contacts.push(
      { id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: ["VIP", "Promoção"] },
      { id: "c2", account_id: ACCOUNT, ig_sender_id: "s2", tags: ["vip", "promocao"] }
    );

    const catalog = await ensureTagCatalog(admin(fake), ACCOUNT);
    expect(catalog.map((t) => t.name).sort()).toEqual(["Promoção", "VIP"].sort());

    // Alinha a grafia dos contatos com o nome canônico escolhido.
    const c2 = fake.tables.contacts.find((c) => c.id === "c2");
    expect(c2!.tags).toEqual(["VIP", "Promoção"]);
  });

  it("não reroda o seed quando o catálogo já existe", async () => {
    const fake = createFakeAdmin();
    fake.tables.crm_tags.push({ id: "t1", account_id: ACCOUNT, name: "Existente", color: "blue" });
    fake.tables.contacts.push({ id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: ["Nova"] });

    const catalog = await ensureTagCatalog(admin(fake), ACCOUNT);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].name).toBe("Existente");
  });

  it("devolve vazio quando a conta não tem tags em nenhum contato", async () => {
    const fake = createFakeAdmin();
    fake.tables.contacts.push({ id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: [] });
    expect(await ensureTagCatalog(admin(fake), ACCOUNT)).toEqual([]);
  });
});

describe("createTagInCatalog", () => {
  it("recusa nome duplicado (sem diferenciar maiúscula)", async () => {
    const fake = createFakeAdmin();
    await createTagInCatalog(admin(fake), ACCOUNT, "VIP", "green");
    const result = await createTagInCatalog(admin(fake), ACCOUNT, "vip", "blue");
    expect(result.tag).toBeNull();
    expect(result.error).toMatch(/já existe/i);
  });

  it("cria a tag quando o nome é novo", async () => {
    const fake = createFakeAdmin();
    const result = await createTagInCatalog(admin(fake), ACCOUNT, "Cliente", "amber");
    expect(result.error).toBeNull();
    expect(result.tag?.name).toBe("Cliente");
  });
});

describe("renameTagInCatalog e deleteTagFromCatalog", () => {
  it("renomear propaga para contacts.tags sem diferenciar maiúscula/acento", async () => {
    const fake = createFakeAdmin();
    const { tag } = await createTagInCatalog(admin(fake), ACCOUNT, "vip", "green");
    fake.tables.contacts.push(
      { id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: ["VIP", "outra"] },
      { id: "c2", account_id: ACCOUNT, ig_sender_id: "s2", tags: ["nada"] }
    );

    await renameTagInCatalog(admin(fake), ACCOUNT, tag!.id, "vip", "Cliente VIP");

    const catalog = await listTagCatalog(admin(fake), ACCOUNT);
    expect(catalog[0].name).toBe("Cliente VIP");
    expect(fake.tables.contacts.find((c) => c.id === "c1")!.tags).toEqual(["Cliente VIP", "outra"]);
    expect(fake.tables.contacts.find((c) => c.id === "c2")!.tags).toEqual(["nada"]);
  });

  it("renomear e excluir também pegam a grafia sem acento gravada por workflow", async () => {
    const fake = createFakeAdmin();
    const { tag } = await createTagInCatalog(admin(fake), ACCOUNT, "Promoção", "green");
    fake.tables.contacts.push(
      { id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: ["promocao", "outra"] },
      { id: "c2", account_id: ACCOUNT, ig_sender_id: "s2", tags: ["Promoção"] }
    );

    await renameTagInCatalog(admin(fake), ACCOUNT, tag!.id, "Promoção", "Oferta");
    expect(fake.tables.contacts.map((c) => c.tags)).toEqual([["Oferta", "outra"], ["Oferta"]]);

    fake.tables.contacts[0].tags = ["oferta", "outra"];
    await deleteTagFromCatalog(admin(fake), ACCOUNT, tag!.id, "Oferta");
    expect(fake.tables.contacts.map((c) => c.tags)).toEqual([["outra"], []]);
  });

  it("excluir remove do catálogo e de todos os contatos", async () => {
    const fake = createFakeAdmin();
    const { tag } = await createTagInCatalog(admin(fake), ACCOUNT, "vip", "green");
    fake.tables.contacts.push({ id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: ["VIP", "outra"] });

    await deleteTagFromCatalog(admin(fake), ACCOUNT, tag!.id, "vip");

    expect(await listTagCatalog(admin(fake), ACCOUNT)).toEqual([]);
    expect(fake.tables.contacts[0].tags).toEqual(["outra"]);
  });
});

describe("setContactTag", () => {
  it("cria a linha em contacts quando o lead ainda não tem ficha", async () => {
    const fake = createFakeAdmin();
    await setContactTag(admin(fake), ACCOUNT, "sender-novo", "lead_novo", "VIP", "add");

    const contact = fake.tables.contacts.find((c) => c.ig_sender_id === "sender-novo");
    expect(contact).toBeDefined();
    expect(contact!.tags).toEqual(["VIP"]);
    expect(contact!.ig_username).toBe("lead_novo");
  });

  it("remove sem diferenciar maiúscula/acento", async () => {
    const fake = createFakeAdmin();
    fake.tables.contacts.push({ id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: ["VIP", "outra"] });
    await setContactTag(admin(fake), ACCOUNT, "s1", null, "vip", "remove");
    expect(fake.tables.contacts[0].tags).toEqual(["outra"]);
  });
});
