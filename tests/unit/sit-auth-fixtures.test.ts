import { describe, expect, it } from "vitest";
import {
  buildSitAuthMarker,
  cleanupSitAuthFixtures,
  SIT_AUTH_PREFIX
} from "../helpers/sit-auth-fixtures";

describe("SIT auth fixture safety", () => {
  it("builds a recognizable lowercase marker", () => {
    expect(buildSitAuthMarker("Run 01/Unsafe")).toBe(`${SIT_AUTH_PREFIX}run_01_unsafe`);
  });

  it("refuses cleanup without the dedicated marker", async () => {
    await expect(
      cleanupSitAuthFixtures({} as never, "demo-user")
    ).rejects.toThrow("Refusing to clean");
  });
});
