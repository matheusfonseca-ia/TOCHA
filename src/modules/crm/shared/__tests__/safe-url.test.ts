import { describe, expect, it } from "vitest";

import { instagramProfileUrl, safeHttpsUrl } from "../utils/safe-url";

describe("safeHttpsUrl", () => {
  it("aceita só https", () => {
    expect(safeHttpsUrl("https://scontent.cdninstagram.com/a.jpg?x=1")).toBe("https://scontent.cdninstagram.com/a.jpg?x=1");
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl(" JavaScript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("data:text/html,<script>")).toBeNull();
    expect(safeHttpsUrl("http://exemplo.com/a.jpg")).toBeNull();
    expect(safeHttpsUrl("https://user:pass@exemplo.com/")).toBeNull();
    expect(safeHttpsUrl("não é url")).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
  });
});

describe("instagramProfileUrl", () => {
  it("escapa o @ no caminho", () => {
    expect(instagramProfileUrl("ion_comunnity")).toBe("https://www.instagram.com/ion_comunnity/");
    expect(instagramProfileUrl("@ana.paula")).toBe("https://www.instagram.com/ana.paula/");
    expect(instagramProfileUrl("../../evil?x=1")).toBe("https://www.instagram.com/..%2F..%2Fevil%3Fx%3D1/");
    expect(instagramProfileUrl("")).toBeNull();
  });
});
