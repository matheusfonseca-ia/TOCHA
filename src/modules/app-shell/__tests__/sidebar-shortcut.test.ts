import { describe, expect, it } from "vitest";

import {
  isApplePlatform,
  isEditableTarget,
  isSidebarToggleShortcut,
  type ShortcutEventLike,
  sidebarShortcutKeys,
} from "../utils/sidebar-shortcut";

const body = { tagName: "BODY", isContentEditable: false };

function keyEvent(overrides: Partial<ShortcutEventLike> = {}): ShortcutEventLike {
  return {
    key: "b",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: body,
    ...overrides,
  };
}

describe("isSidebarToggleShortcut", () => {
  it("aceita Ctrl+B e Cmd+B, com B maiúsculo também (Caps Lock)", () => {
    expect(isSidebarToggleShortcut(keyEvent())).toBe(true);
    expect(
      isSidebarToggleShortcut(keyEvent({ ctrlKey: false, metaKey: true }))
    ).toBe(true);
    expect(isSidebarToggleShortcut(keyEvent({ key: "B" }))).toBe(true);
  });

  it("ignora B sem modificador, outras teclas e combinações com Shift/Alt", () => {
    expect(isSidebarToggleShortcut(keyEvent({ ctrlKey: false }))).toBe(false);
    expect(isSidebarToggleShortcut(keyEvent({ key: "k" }))).toBe(false);
    expect(isSidebarToggleShortcut(keyEvent({ shiftKey: true }))).toBe(false);
    expect(isSidebarToggleShortcut(keyEvent({ altKey: true }))).toBe(false);
  });

  it("ignora tecla segurada, composição de acento e evento já tratado", () => {
    expect(isSidebarToggleShortcut(keyEvent({ repeat: true }))).toBe(false);
    expect(isSidebarToggleShortcut(keyEvent({ isComposing: true }))).toBe(false);
    expect(
      isSidebarToggleShortcut(keyEvent({ defaultPrevented: true }))
    ).toBe(false);
  });

  it("não dispara com o foco em campo de texto", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "input"]) {
      expect(isSidebarToggleShortcut(keyEvent({ target: { tagName } }))).toBe(
        false
      );
    }
    expect(
      isSidebarToggleShortcut(
        keyEvent({ target: { tagName: "DIV", isContentEditable: true } })
      )
    ).toBe(false);
  });
});

describe("isEditableTarget", () => {
  it("reconhece campos, contenteditable e role=textbox", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(
      true
    );
    expect(
      isEditableTarget({
        tagName: "DIV",
        getAttribute: (name: string) => (name === "role" ? "textbox" : null),
      })
    ).toBe(true);
  });

  it("botões, links e alvos vazios não contam como campo", () => {
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableTarget({ tagName: "A", getAttribute: () => null })).toBe(
      false
    );
    expect(isEditableTarget(body)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});

describe("dica do atalho", () => {
  it("detecta Mac, iPhone e iPad", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("macOS")).toBe(true);
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
    expect(isApplePlatform("Linux x86_64")).toBe(false);
    expect(isApplePlatform(undefined)).toBe(false);
  });

  it("mostra ⌘ no Mac e Ctrl no resto", () => {
    expect(sidebarShortcutKeys(true)).toEqual(["⌘", "B"]);
    expect(sidebarShortcutKeys(false)).toEqual(["Ctrl", "B"]);
  });
});
