import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

/**
 * Pastas: entrada validada em runtime, posse da pasta conferida no mover e
 * escrita sem linha afetada vira erro (não "sucesso" silencioso).
 * O fake não tem RLS: "não visível" aqui é "não existe" na tabela.
 */

const h = vi.hoisted(() => ({ db: null as unknown as FakeSupabase, active: true }));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: (t: string) => h.db.from(t as never) }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ activeUserId: async () => (h.active ? "user-1" : null) }));

// `folders` não está no fake: entra como tabela extra, com o mesmo builder.
const folders: Record<string, unknown>[] = [];

import { createFolder, deleteFolder, moveToFolder } from "@/app/(dashboard)/rules/folders-actions";

const ACC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RULE = "11111111-1111-4111-8111-111111111111";
const FOLDER_A = "22222222-2222-4222-8222-222222222222";
const FOLDER_B = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  h.db = createFakeAdmin();
  h.active = true;
  folders.length = 0;
  folders.push({ id: FOLDER_A, account_id: ACC_A, name: "A", color: "violet" }, { id: FOLDER_B, account_id: ACC_B, name: "B", color: "blue" });
  (h.db.tables as Record<string, unknown[]>).folders = folders;
  h.db.tables.rules.push({ id: RULE, account_id: ACC_A, folder_id: null });
});

describe("pastas", () => {
  it("sem acesso ativo não escreve", async () => {
    h.active = false;
    expect(await createFolder({ accountId: ACC_A, name: "x", color: "violet" })).toHaveProperty("error");
    expect(await moveToFolder({ kind: "rule", id: RULE, folderId: FOLDER_A })).toHaveProperty("error");
    expect(h.db.tables.rules[0].folder_id).toBeNull();
  });

  it("cor fora do catálogo e conta que não é uuid são recusadas", async () => {
    expect(await createFolder({ accountId: ACC_A, name: "x", color: "qualquer" })).toHaveProperty("error");
    expect(await createFolder({ accountId: "nao-uuid", name: "x", color: "violet" })).toHaveProperty("error");
    expect(folders).toHaveLength(2);
  });

  it("move para pasta da mesma conta", async () => {
    expect(await moveToFolder({ kind: "rule", id: RULE, folderId: FOLDER_A })).toEqual({});
    expect(h.db.tables.rules[0].folder_id).toBe(FOLDER_A);
  });

  it("pasta de outra conta é recusada (A1-010)", async () => {
    expect(await moveToFolder({ kind: "rule", id: RULE, folderId: FOLDER_B })).toHaveProperty("error");
    expect(h.db.tables.rules[0].folder_id).toBeNull();
  });

  it("kind inválido e ids que não são uuid são recusados", async () => {
    expect(await moveToFolder({ kind: "x" as never, id: RULE, folderId: null })).toHaveProperty("error");
    expect(await moveToFolder({ kind: "rule", id: "1", folderId: null })).toHaveProperty("error");
  });

  it("apagar pasta inexistente devolve erro, não sucesso", async () => {
    expect(await deleteFolder("44444444-4444-4444-8444-444444444444")).toHaveProperty("error");
    expect(await deleteFolder(FOLDER_A)).toEqual({});
  });
});
