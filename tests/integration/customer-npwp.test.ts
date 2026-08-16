import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();
const ROLLBACK_MARKER = "ROLLBACK_CUSTOMER_NPWP_TEST";

describe("customer NPWP integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a normalized NPWP and allows it to be removed", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const npwp = createTestNpwp(15);

    await expect(
      prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: `NPWP Customer ${marker}`,
            companyName: `NPWP Company ${marker}`,
            npwp,
            phone: "",
            email: "",
            address: "",
            customerSegment: "Retail"
          }
        });

        expect(customer.npwp).toBe(npwp);

        const updated = await tx.customer.update({
          where: { id: customer.id },
          data: { npwp: null }
        });

        expect(updated.npwp).toBeNull();
        throw new Error(ROLLBACK_MARKER);
      })
    ).rejects.toThrow(ROLLBACK_MARKER);
  });

  it("rejects duplicate non-empty NPWP values", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const npwp = createTestNpwp(16);

    await expect(
      prisma.$transaction(async (tx) => {
        const commonData = {
          phone: "",
          email: "",
          address: "",
          customerSegment: "Retail",
          npwp
        };

        await tx.customer.create({
          data: {
            ...commonData,
            name: `First NPWP Customer ${marker}`,
            companyName: `First NPWP Company ${marker}`
          }
        });
        await tx.customer.create({
          data: {
            ...commonData,
            name: `Second NPWP Customer ${marker}`,
            companyName: `Second NPWP Company ${marker}`
          }
        });
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

function createTestNpwp(length: 15 | 16) {
  const digits = `${Date.now()}${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0")}`;
  return digits.slice(-length).padStart(length, "0");
}
