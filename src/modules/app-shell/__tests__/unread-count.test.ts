import { describe, expect, it } from "vitest";

import { formatUnreadCount, unreadLabel } from "../utils/unread-count";

describe("formatUnreadCount", () => {
  it("mostra o número até o teto e teto+ acima dele", () => {
    expect(formatUnreadCount(7, 99)).toBe("7");
    expect(formatUnreadCount(99, 99)).toBe("99");
    expect(formatUnreadCount(100, 99)).toBe("99+");
    // bolinha da sidebar recolhida: só cabe dois caracteres
    expect(formatUnreadCount(9, 9)).toBe("9");
    expect(formatUnreadCount(12, 9)).toBe("9+");
  });

  it("zero, negativo ou inválido não mostra nada", () => {
    expect(formatUnreadCount(0, 99)).toBe("");
    expect(formatUnreadCount(-3, 99)).toBe("");
    expect(formatUnreadCount(Number.NaN, 99)).toBe("");
  });
});

describe("unreadLabel", () => {
  it("usa singular e plural certos", () => {
    expect(unreadLabel(1)).toBe("1 não lida");
    expect(unreadLabel(3)).toBe("3 não lidas");
    expect(unreadLabel(150)).toBe("150 não lidas");
  });
});
