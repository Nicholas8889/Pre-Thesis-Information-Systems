const moduleNames: Record<string, string> = {
  "/": "Dashboard",
  "/customers": "Customer",
  "/products": "Product",
  "/customer-inquiries": "Customer Inquiry",
  "/sales-orders": "Sales Order",
  "/pre-orders": "Pre Order",
  "/invoices": "Invoice",
  "/payments": "Payment",
  "/surat-jalan": "Surat Jalan",
  "/receivables": "Receivable",
  "/billing": "Billing",
  "/follow-ups": "Follow Up",
  "/audit-trail": "Audit Trail",
  "/settings": "Account"
};

export function getCardHelpMetadata(input: {
  pathname: string;
  existingTitle?: string;
  hasTable: boolean;
  hasForm: boolean;
}) {
  const moduleName = getModuleName(input.pathname);
  const title =
    input.existingTitle?.trim() ||
    (input.hasTable
      ? `${moduleName} Records`
      : input.hasForm
        ? `${moduleName} Action`
        : `${moduleName} Summary`);

  const description = input.hasTable
    ? `Use this card to view, search, filter, and manage ${moduleName.toLowerCase()} records.`
    : input.hasForm
      ? `Use this card to enter and submit ${moduleName.toLowerCase()} information.`
      : `Use this card to review ${title.toLowerCase()} and related information.`;

  return { title, description };
}

function getModuleName(pathname: string) {
  const matchingPath = Object.keys(moduleNames)
    .filter((path) => path === "/" || pathname === path || pathname.startsWith(`${path}/`))
    .sort((left, right) => right.length - left.length)[0];
  return moduleNames[matchingPath] ?? "Information";
}
