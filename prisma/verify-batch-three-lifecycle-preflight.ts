import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function count(query: TemplateStringsArray) {
  const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>(query);
  return Number(row?.count ?? 0);
}

async function main() {
  const result = {
    collectionTasks: await count`
      SELECT COUNT(*) AS count FROM collection_tasks
    `,
    collectionTasksWithoutConcurrencyTimestamp: await count`
      SELECT COUNT(*) AS count FROM collection_tasks WHERE updated_at IS NULL
    `,
    collectionTasksWithUnknownState: await count`
      SELECT COUNT(*) AS count FROM collection_tasks
      WHERE status::text NOT IN ('Planned', 'Done', 'Cancelled')
    `
  };

  console.log(JSON.stringify(result, null, 2));
  if (
    result.collectionTasksWithoutConcurrencyTimestamp !== 0 ||
    result.collectionTasksWithUnknownState !== 0
  ) {
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());
