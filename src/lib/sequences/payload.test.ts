import { describe, expect, it } from "vitest";

import {
  buildSequencePayload,
  isSequencePayload,
  parseSequencePayload,
} from "@/lib/sequences/payload";

const RUN = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

describe("parseSequencePayload", () => {
  it("lê o formato v1 (runId:handle) sem nodeId", () => {
    expect(parseSequencePayload(`falow:seq:${RUN}:btn-0`)).toEqual({
      runId: RUN,
      nodeId: null,
      handle: "btn-0",
    });
  });

  it("lê o formato v2 (runId:nodeId:handle)", () => {
    expect(parseSequencePayload(`falow:seq:${RUN}:buttons-ab12cd34:btn-2`)).toEqual({
      runId: RUN,
      nodeId: "buttons-ab12cd34",
      handle: "btn-2",
    });
  });

  it("aceita o prefixo legado instareply em v1 e v2", () => {
    expect(parseSequencePayload(`instareply:seq:${RUN}:qr-1`)).toEqual({
      runId: RUN,
      nodeId: null,
      handle: "qr-1",
    });
    expect(parseSequencePayload(`instareply:seq:${RUN}:quickReplies-x1:qr-fallback`)).toEqual({
      runId: RUN,
      nodeId: "quickReplies-x1",
      handle: "qr-fallback",
    });
  });

  it("faz ida e volta com buildSequencePayload (sempre v2)", () => {
    const payload = buildSequencePayload(RUN, "quickReplies-9z", "qr-12");
    expect(payload).toBe(`falow:seq:${RUN}:quickReplies-9z:qr-12`);
    expect(parseSequencePayload(payload)).toEqual({
      runId: RUN,
      nodeId: "quickReplies-9z",
      handle: "qr-12",
    });
  });

  it("rejeita payloads malformados ou de outro tipo", () => {
    expect(parseSequencePayload(null)).toBeNull();
    expect(parseSequencePayload(undefined)).toBeNull();
    expect(parseSequencePayload("")).toBeNull();
    expect(parseSequencePayload("falow:comment_link:abc")).toBeNull();
    expect(parseSequencePayload("falow:seq:")).toBeNull();
    expect(parseSequencePayload(`falow:seq:${RUN}`)).toBeNull();
    expect(parseSequencePayload(`falow:seq:${RUN}:`)).toBeNull();
    expect(parseSequencePayload("falow:seq::btn-0")).toBeNull();
    expect(parseSequencePayload(`falow:seq:${RUN}::btn-0`)).toBeNull();
  });
});

describe("isSequencePayload", () => {
  it("reconhece os dois prefixos e nada mais", () => {
    expect(isSequencePayload(`falow:seq:${RUN}:btn-0`)).toBe(true);
    expect(isSequencePayload(`instareply:seq:${RUN}:btn-0`)).toBe(true);
    expect(isSequencePayload("falow:comment_link:abc")).toBe(false);
    expect(isSequencePayload(null)).toBe(false);
  });
});
