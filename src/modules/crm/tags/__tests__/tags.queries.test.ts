import type { createClient } from "@/lib/supabase/server";
import { describe, expect, it } from "vitest";

import { createFakeAdmin } from "@/lib/sequences/__tests__/fake-supabase";

import { attachTagsToConversations, listSenderIdsWithTag } from "../services/tags.queries";

function userClient(fake: ReturnType<typeof createFakeAdmin>) {
  return fake.client as unknown as ReturnType<typeof createClient>;
}

const ACCOUNT = "acc-1";

describe("listSenderIdsWithTag", () => {
  it("filtra pela tag dentro da conta", async () => {
    const fake = createFakeAdmin();
    fake.tables.contacts.push(
      { id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: ["VIP"] },
      { id: "c2", account_id: ACCOUNT, ig_sender_id: "s2", tags: ["outra"] },
      { id: "c3", account_id: "acc-2", ig_sender_id: "s3", tags: ["VIP"] }
    );

    const ids = await listSenderIdsWithTag(userClient(fake), ACCOUNT, "VIP");
    expect(ids).toEqual(["s1"]);
  });

  it("sem conta selecionada, busca em todas (RLS já limita ao dono no banco real)", async () => {
    const fake = createFakeAdmin();
    fake.tables.contacts.push(
      { id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: ["VIP"] },
      { id: "c2", account_id: "acc-2", ig_sender_id: "s2", tags: ["VIP"] }
    );

    const ids = await listSenderIdsWithTag(userClient(fake), "", "VIP");
    expect(ids.sort()).toEqual(["s1", "s2"]);
  });

  it("acha a tag em qualquer grafia de maiúscula/acento, como o catálogo", async () => {
    const fake = createFakeAdmin();
    fake.tables.contacts.push(
      { id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: ["vip"] },
      { id: "c2", account_id: ACCOUNT, ig_sender_id: "s2", tags: ["promocao"] },
      { id: "c3", account_id: ACCOUNT, ig_sender_id: "s3", tags: [] }
    );

    expect(await listSenderIdsWithTag(userClient(fake), ACCOUNT, "VIP")).toEqual(["s1"]);
    expect(await listSenderIdsWithTag(userClient(fake), ACCOUNT, "Promoção")).toEqual(["s2"]);
  });
});

describe("attachTagsToConversations", () => {
  it("junta até 2 tags por conversa com a cor do catálogo", async () => {
    const fake = createFakeAdmin();
    fake.tables.contacts.push({
      id: "c1",
      account_id: ACCOUNT,
      ig_sender_id: "s1",
      tags: ["VIP", "Promoção", "Extra"],
    });
    fake.tables.crm_tags.push(
      { id: "t1", account_id: ACCOUNT, name: "VIP", color: "green" },
      { id: "t2", account_id: ACCOUNT, name: "Promoção", color: "purple" }
    );

    const map = await attachTagsToConversations(userClient(fake), [
      { account_id: ACCOUNT, ig_sender_id: "s1" },
    ]);

    const tags = map.get(`${ACCOUNT}:s1`);
    expect(tags).toHaveLength(2);
    expect(tags?.[0]).toEqual({ name: "VIP", color: "green" });
    expect(tags?.[1]).toEqual({ name: "Promoção", color: "purple" });
  });

  it("devolve mapa vazio quando o contato não tem tags", async () => {
    const fake = createFakeAdmin();
    fake.tables.contacts.push({ id: "c1", account_id: ACCOUNT, ig_sender_id: "s1", tags: [] });
    const map = await attachTagsToConversations(userClient(fake), [
      { account_id: ACCOUNT, ig_sender_id: "s1" },
    ]);
    expect(map.size).toBe(0);
  });
});
