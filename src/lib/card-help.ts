const moduleNames: Record<string, string> = {
  "/": "Dashboard",
  "/customers": "Customer",
  "/products": "Product",
  "/customer-inquiries": "Customer Inquiry",
  "/sales-orders": "Sales Order",
  "/customer-purchase-orders": "Customer PO",
  "/invoices": "Invoice",
  "/payments": "Payment",
  "/surat-jalan": "Surat Jalan",
  "/receivables": "Receivable",
  "/collections": "Collections",
  "/customer-outreach": "Customer Outreach",
  "/audit-trail": "Audit Trail",
  "/settings": "Account"
};

export function getCardTitle(input: {
  pathname: string;
  existingTitle?: string;
  hasTable: boolean;
  hasForm: boolean;
}) {
  const moduleName = getModuleName(input.pathname);
  return (
    input.existingTitle?.trim() ||
    (input.hasTable
      ? `${moduleName} Records`
      : input.hasForm
        ? `${moduleName} Action`
        : `${moduleName} Summary`)
  );
}

function getModuleName(pathname: string) {
  const matchingPath = Object.keys(moduleNames)
    .filter((path) => path === "/" || pathname === path || pathname.startsWith(`${path}/`))
    .sort((left, right) => right.length - left.length)[0];
  return moduleNames[matchingPath] ?? "Information";
}
