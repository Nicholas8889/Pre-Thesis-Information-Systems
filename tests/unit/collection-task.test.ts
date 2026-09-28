import { describe, expect, it } from "vitest";
import {
  canTransitionCollectionTask,
  parseCollectionTaskTransition,
  parseCollectionTaskVersion
} from "../../src/lib/collection-task";

describe("Collection Task lifecycle policy", () => {
  it.each([
    ["Planned", "Done", true],
    ["Planned", "Cancelled", true],
    ["Done", "Cancelled", false],
    ["Cancelled", "Done", false],
    ["Done", "Done", false]
  ] as const)("allows %s -> %s: %s", (current, next, allowed) => {
    expect(canTransitionCollectionTask(current, next)).toBe(allowed);
  });

  it("only parses terminal transition targets", () => {
    expect(parseCollectionTaskTransition("Done")).toBe("Done");
    expect(parseCollectionTaskTransition("Cancelled")).toBe("Cancelled");
    expect(parseCollectionTaskTransition("Planned")).toBeNull();
    expect(parseCollectionTaskTransition("done")).toBeNull();
  });

  it("requires a positive integer optimistic concurrency token", () => {
    expect(parseCollectionTaskVersion("1")).toBe(1);
    expect(parseCollectionTaskVersion(" 2 ")).toBe(2);
    expect(parseCollectionTaskVersion("0")).toBeNull();
    expect(parseCollectionTaskVersion("1.5")).toBeNull();
    expect(parseCollectionTaskVersion("stale")).toBeNull();
  });
});
