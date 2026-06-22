export type RoleCapability =
  | "CREATE_SALES_ORDER"
  | "DELETE_SALES_ORDER"
  | "CREATE_INVOICE"
  | "RECORD_PAYMENT"
  | "CREATE_SURAT_JALAN"
  | "CREATE_ACCOUNT"
  | "CREATE_AUDIT_TRAIL";

export function canRole(role: string | null | undefined, capability: RoleCapability) {
  if (role === "MANAGER") return true;

  if (role === "SALES") {
    return ![
      "DELETE_SALES_ORDER",
      "CREATE_INVOICE",
      "RECORD_PAYMENT",
      "CREATE_SURAT_JALAN",
      "CREATE_ACCOUNT"
    ].includes(capability);
  }

  if (role === "ADMIN") {
    return !["CREATE_SALES_ORDER", "CREATE_AUDIT_TRAIL"].includes(capability);
  }

  return false;
}

export function getRestrictionMessage(capability: RoleCapability) {
  return {
    CREATE_SALES_ORDER: "You cannot create Sales Orders. Only Sales and Manager roles can do this.",
    DELETE_SALES_ORDER: "You cannot delete Sales Orders. Only Admin and Manager roles can do this.",
    CREATE_INVOICE: "You cannot create Invoices. Only Admin and Manager roles can do this.",
    RECORD_PAYMENT: "You cannot record Payments. Only Admin and Manager roles can do this.",
    CREATE_SURAT_JALAN: "You cannot create Surat Jalan. Only Admin and Manager roles can do this.",
    CREATE_ACCOUNT: "You cannot create accounts. Only Admin and Manager roles can do this.",
    CREATE_AUDIT_TRAIL: "You cannot create Audit Trail records. They are system-generated and Manager-controlled."
  }[capability];
}
