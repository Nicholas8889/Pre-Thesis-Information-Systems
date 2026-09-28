import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [total, packedWithoutPackageCount, nonPackedWithPackageCount] = await Promise.all([
    prisma.pickingList.count(),
    prisma.pickingList.count({ where: { status: "Packed", packageCount: null } }),
    prisma.pickingList.count({
      where: { status: { in: ["Pending", "InProgress"] }, packageCount: { not: null } }
    })
  ]);
  const result = {
    pickingLists: total,
    grandfatheredPackedWithoutPackageCount: packedWithoutPackageCount,
    invalidNonPackedWithPackageCount: nonPackedWithPackageCount
  };
  console.log(JSON.stringify(result, null, 2));
  if (nonPackedWithPackageCount !== 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
