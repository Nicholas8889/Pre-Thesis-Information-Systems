import type { Prisma } from "@prisma/client";

export class InactiveCustomerError extends Error {
  constructor() {
    super("Customer is no longer active. Refresh the form and choose an active customer.");
  }
}

export async function lockActiveCustomer(tx: Prisma.TransactionClient, customerId: string) {
  const customers = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM customers WHERE id = ${customerId} AND status = 'Active' FOR UPDATE
  `;
  if (customers.length !== 1) throw new InactiveCustomerError();
}
