import { PrismaClient } from "@prisma/client";
import { DEMO_PASSWORD, DEMO_USERNAME, hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

const demoUsers = [
  {
    username: DEMO_USERNAME,
    password: DEMO_PASSWORD,
    displayName: "Admin Demo",
    role: "ADMIN" as const
  },
  {
    username: "sales",
    password: "Sales123!",
    displayName: "Sales Demo",
    role: "SALES" as const
  },
  {
    username: "manager",
    password: "Manager123!",
    displayName: "Manager Demo",
    role: "MANAGER" as const
  }
];

async function main() {
  for (const user of demoUsers) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        displayName: user.displayName,
        role: user.role,
        status: "Active"
      },
      create: {
        username: user.username,
        passwordHash: hashPassword(user.password),
        displayName: user.displayName,
        role: user.role,
        status: "Active"
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
