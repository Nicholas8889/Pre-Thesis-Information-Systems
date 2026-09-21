"use client";

import { FileUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { calculateAdjustedUnitPrice, CREDIT_TERM_OPTIONS } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import { getProductPriceComparison } from "@/lib/product-insights";
import { calculateTaxInclusiveAmounts, formatPpnRate } from "@/lib/tax";
import type { CustomerPaymentSummary } from "@/lib/customer-intelligence";

type CustomerOption = CustomerPaymentSummary & {
  id: string;
  companyName: string;
  name: string;
  overdueInvoiceCount: number;
  npwp: string | null;
  ppnApplied: boolean;
};

type ProductOption = {
  id: string;
  productName: string;
  listPrice: number;
  averageSoldPrice: number | null;
  averageEligibleQuantity: number;
  averageMonthLabel: string;
};

type DraftItem = {
  productId: string;
  itemName: string;
  quantity: number;
  baseUnitPrice: number;
  markupPercent: number | "";
  discountPercent: number | "";
};

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export function SalesOrderForm({
  customers,
  products,
  ppnRateBasisPoints,
  action,
  source = "DIRECT",
  inquiryId = "",
  initialCustomerId = "",
  initialItems,
  disabled = false,
  restrictionMessage = ""
}: {
  customers: CustomerOption[];
  products: ProductOption[];
  ppnRateBasisPoints: number;
  action: (formData: FormData) => void | Promise<void>;
  source?: "DIRECT" | "CUSTOMER_PO";
  inquiryId?: string;
  initialCustomerId?: string;
  initialItems?: DraftItem[];
  disabled?: boolean;
  restrictionMessage?: string;
}) {
  const isCustomerPo = source === "CUSTOMER_PO";
  const [paymentTermType, setPaymentTermType] = useState("IMMEDIATE");
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId);
  const [items, setItems] = useState<DraftItem[]>(initialItems?.length ? initialItems : [createEmptyItem()]);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const serializedItems = items.map((item) => ({
    ...item,
    markupPercent: Number(item.markupPercent || 0),
    discountPercent: Number(item.discountPercent || 0),
    finalUnitPrice: getFinalUnitPrice(item)
  }));

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * getFinalUnitPrice(item), 0),
    [items]
  );
  const estimatedTax = useMemo(
    () =>
      selectedCustomer
        ? calculateTaxInclusiveAmounts({
            totalAmount: total,
            ppnApplied: selectedCustomer.ppnApplied,
            ppnRateBasisPoints
          })
        : null,
    [ppnRateBasisPoints, selectedCustomer, total]
  );
  const ppnRateLabel = formatPpnRate(ppnRateBasisPoints);
  const confirmationSummary = estimatedTax
    ? [
        `Total Price: ${formatCurrency(total)}`,
        estimatedTax.ppnApplied
          ? `PPN (${formatPpnRate(estimatedTax.ppnRateBasisPoints)}): ${formatCurrency(estimatedTax.ppnAmount)}`
          : "PPN: Not applied - customer NPWP not provided",
        `Net Sales (Margin): ${formatCurrency(estimatedTax.netSalesAmount)}`
      ].join("\n")
    : `Total Price: ${formatCurrency(total)}\nPPN and Net Sales: Select a customer`;

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function addItem() {
    setItems((current) => [...current, createEmptyItem()]);
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((option) => option.id === productId);
    updateItem(index, {
      productId,
      itemName: product?.productName ?? "",
      baseUnitPrice: product?.listPrice ?? 0
    });
  }

  function removeItem(index: number) {
    setItems((current) =>
      current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  return (
    <div className={disabled ? "group/form-restriction relative" : ""}>
      {disabled && <RestrictionTooltip message={restrictionMessage} />}
      <form
        action={action}
        data-confirm-title={isCustomerPo ? "Create Customer PO" : "Create Sales Order"}
        data-confirm-summary={confirmationSummary}
      >
        <fieldset disabled={disabled} className="space-y-4 disabled:cursor-not-allowed disabled:opacity-60">
      <input type="hidden" name="items" value={JSON.stringify(serializedItems)} />
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="source" value={source} />

      {isCustomerPo && (
        <div className="grid gap-4 rounded-md border border-line bg-accent/10 p-4 md:grid-cols-2">
          <div className="text-sm font-medium text-ink">
            Generated IDs
            <div className="mt-1 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
              Sales Order Number and Customer PO Number are generated after save.
            </div>
            <span className="mt-1 block text-xs font-normal text-ink/70">
              Customer Purchase Orders receive both an SO number and a PO number.
            </span>
          </div>

          <label className="text-sm font-medium text-ink">
            Product Required Date
            <input
              name="requiredDate"
              type="date"
              required
              className={`${inputClass} mt-1 bg-white`}
            />
            <span className="mt-1 block text-xs font-normal text-ink/70">
              The system will remind users as this processing date approaches.
            </span>
          </label>

          <label className="text-sm font-medium text-ink md:col-span-2">
            Customer PO Document
            <span className="mt-1 flex min-h-12 items-center gap-3 rounded-md border border-dashed border-line bg-white px-3 py-2">
              <FileUp aria-hidden="true" className="h-5 w-5 shrink-0 text-brand" />
              <input
                name="customerPoDocument"
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="w-full text-sm text-ink/80 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </span>
            <span className="mt-1 block text-xs font-normal text-ink/70">
              PDF, JPG, PNG, DOC, or DOCX. Maximum file size 8 MB.
            </span>
          </label>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-ink">
          Customer
          <select
            name="customerId"
            required
            value={selectedCustomerId}
            onChange={(event) => setSelectedCustomerId(event.target.value)}
            className={`${inputClass} mt-1`}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.companyName} - {customer.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-ink">
          Notes
          <input name="notes" className={`${inputClass} mt-1`} placeholder="Optional" />
        </label>

        <label className="text-sm font-medium text-ink">
          Payment Terms
          <select
            name="paymentTermType"
            required
            value={paymentTermType}
            onChange={(event) => setPaymentTermType(event.target.value)}
            className={`${inputClass} mt-1`}
          >
            <option value="IMMEDIATE">Immediate Payment</option>
            <option value="CREDIT">Credit</option>
          </select>
        </label>

        {paymentTermType === "CREDIT" && (
          <label className="text-sm font-medium text-ink">
            Credit Term
            <select name="creditTerm" defaultValue="1m" required className={`${inputClass} mt-1`}>
              {CREDIT_TERM_OPTIONS.map((term) => (
                <option key={term.value} value={term.value}>
                  {term.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {selectedCustomer && (
        <section
          aria-live="polite"
          className="rounded-md bg-info/10 p-4"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Customer Insight</h3>
              <p className="mt-1 text-xs leading-5 text-ink/80">
                Pricing guidance does not change payment terms, markup, or discounts automatically.
                Orders entered by Sales require Manager approval when the customer has an unpaid invoice with a Delivered Surat Jalan.
              </p>
            </div>
            <span className="w-fit rounded-md bg-info px-2.5 py-1 text-xs font-semibold text-white">
              {selectedCustomer.ppnApplied ? "PPN included" : "No PPN for this order"}
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InsightMetric label="Payment Status" value={selectedCustomer.paymentStatus} />
            <InsightMetric
              label="Outstanding Payment"
              value={formatCurrency(selectedCustomer.outstandingAmount)}
              help={`${selectedCustomer.openInvoiceCount} open invoice(s) with a Delivered Surat Jalan, including amounts not yet due.`}
            />
            <InsightMetric
              label="Overdue Invoices"
              value={String(selectedCustomer.overdueInvoiceCount)}
            />
            <InsightMetric
              label="NPWP"
              value={selectedCustomer.npwp ?? "Not provided"}
              help={
                selectedCustomer.ppnApplied
                  ? "Tax status: PPN included."
                  : "Tax status: No PPN for this order."
              }
            />
          </div>
        </section>
      )}

      <div className="space-y-3">
        {items.map((item, index) => {
          const selectedProduct = products.find(
            (product) => product.id === item.productId
          );
          const proposedUnitPrice = getFinalUnitPrice(item);
          const comparison = getProductPriceComparison(
            proposedUnitPrice,
            selectedProduct?.averageSoldPrice ?? null
          );

          return (
          <div key={index} className="space-y-3 rounded-md border border-line p-3">
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(180px,1.4fr)_90px_140px_110px_110px_150px_150px_44px]">
            <label className="text-sm font-medium text-ink">
              Product Name
              <select
                required
                value={item.productId}
                onChange={(event) => selectProduct(index, event.target.value)}
                className={`${inputClass} mt-1`}
              >
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.productName}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-ink">
              Qty
              <input
                required
                min={1}
                type="number"
                value={item.quantity}
                onChange={(event) =>
                  updateItem(index, { quantity: Number(event.target.value) })
                }
                className={`${inputClass} mt-1`}
              />
            </label>

            <label className="text-sm font-medium text-ink">
              Base Unit Price
              <input
                required
                min={0}
                step={1}
                type="number"
                value={item.baseUnitPrice}
                onChange={(event) =>
                  updateItem(index, { baseUnitPrice: Number(event.target.value) })
                }
                className={`${inputClass} mt-1`}
              />
            </label>

            <label className="text-sm font-medium text-ink">
              Markup (%)
              <input
                min={0}
                max={100}
                step={1}
                type="number"
                value={item.markupPercent}
                placeholder="Optional"
                onChange={(event) =>
                  updateItem(index, {
                    markupPercent: event.target.value === "" ? "" : Number(event.target.value)
                  })
                }
                className={`${inputClass} mt-1`}
              />
            </label>

            <label className="text-sm font-medium text-ink">
              Discount (%)
              <input
                min={0}
                max={100}
                step={1}
                type="number"
                value={item.discountPercent}
                placeholder="Optional"
                onChange={(event) =>
                  updateItem(index, {
                    discountPercent: event.target.value === "" ? "" : Number(event.target.value)
                  })
                }
                className={`${inputClass} mt-1`}
              />
            </label>

            <div className="text-sm font-medium text-ink">
              Final Unit Price
              <div className="mt-1 flex h-10 items-center rounded-md border border-line bg-soft px-3">
                {formatCurrency(getFinalUnitPrice(item))}
              </div>
            </div>

            <div className="text-sm font-medium text-ink">
              Subtotal
              <div className="mt-1 flex h-10 items-center rounded-md border border-line bg-soft px-3">
                {formatCurrency(item.quantity * getFinalUnitPrice(item))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => removeItem(index)}
              className="mt-6 flex h-10 w-10 items-center justify-center rounded-md border border-line text-ink/70"
              title="Remove item"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </button>
            </div>

            {selectedProduct && (
              <section
                aria-live="polite"
                className="rounded-md border border-line bg-soft p-3"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">
                    Product Price Insight
                  </p>
                  <p className="text-xs text-ink/70">
                    Advisory only; your Base Unit Price, markup, and discount remain unchanged.
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <InsightMetric
                    label="Latest Base Price"
                    value={formatCurrency(selectedProduct.listPrice)}
                    help={
                      selectedProduct.averageSoldPrice === null
                        ? `No eligible sales in ${selectedProduct.averageMonthLabel}; the latest base price is the available pricing reference.`
                        : "Current base price from the product master."
                    }
                  />
                  {selectedProduct.averageSoldPrice !== null && (
                    <InsightMetric
                      label="Average Sold Price - This Month"
                      value={formatCurrency(selectedProduct.averageSoldPrice)}
                      help={`${selectedProduct.averageEligibleQuantity} eligible unit(s) in ${selectedProduct.averageMonthLabel}, cumulative through today.`}
                    />
                  )}
                  <InsightMetric
                    label="Proposed Final Unit Price"
                    value={formatCurrency(proposedUnitPrice)}
                  />
                  {selectedProduct.averageSoldPrice !== null && (
                    <>
                      <InsightMetric
                        label="Selisih Nominal"
                        value={formatSignedCurrency(comparison.absoluteDifference)}
                      />
                      <InsightMetric
                        label="Selisih Persentase"
                        value={formatSignedPercentage(comparison.percentageDifference)}
                      />
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
          );
        })}
      </div>

      <section
        aria-live="polite"
        className="rounded-md bg-accent/10 p-4"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Calculation Summary</h3>
            <p className="mt-1 text-xs leading-5 text-ink/80">
              Amounts update automatically as you change the items, quantities, prices, or customer.
            </p>
          </div>
          <span className="w-fit rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-strong">
            Tax-inclusive customer charge
          </span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <InsightMetric
            label="Order Total"
            value={formatCurrency(total)}
            help="Amount charged to the customer, including PPN when applicable."
          />
          <InsightMetric
            label={
              estimatedTax?.ppnApplied
                ? `PPN Included (${ppnRateLabel})`
                : "PPN"
            }
            value={
              !estimatedTax
                ? "Select a customer"
                : estimatedTax.ppnApplied
                  ? formatCurrency(estimatedTax.ppnAmount)
                  : "Not applied"
            }
            help={
              !estimatedTax
                ? "Select a customer to calculate PPN."
                : estimatedTax.ppnApplied
                  ? `Already included in the order total at the ${ppnRateLabel} effective rate.`
                  : "Customer NPWP not provided."
            }
          />
          <InsightMetric
            label="Net Sales (Excluding PPN)"
            value={
              estimatedTax
                ? formatCurrency(estimatedTax.netSalesAmount)
                : "Select a customer"
            }
            help="Order total minus PPN, before deducting product costs."
          />
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={addItem}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add Item
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="text-base font-semibold">Total: {formatCurrency(total)}</p>
          <button className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
            {isCustomerPo ? "Create Customer PO" : "Create Sales Order"}
          </button>
        </div>
      </div>
        </fieldset>
      </form>
    </div>
  );
}

function createEmptyItem(): DraftItem {
  return {
    productId: "",
    itemName: "",
    quantity: 1,
    baseUnitPrice: 0,
    markupPercent: "",
    discountPercent: ""
  };
}

function getFinalUnitPrice(item: DraftItem) {
  return calculateAdjustedUnitPrice(
    item.baseUnitPrice,
    Number(item.markupPercent || 0),
    Number(item.discountPercent || 0)
  );
}

function formatSignedCurrency(value: number | null) {
  if (value === null) return "Not available";
  if (value === 0) return formatCurrency(0);
  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function formatSignedPercentage(value: number | null) {
  if (value === null) return "Not available";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-US", {
    maximumFractionDigits: 1
  })}%`;
}

function InsightMetric({
  label,
  value,
  help
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-white/80 bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-ink">{value}</p>
      {help && <p className="mt-1 text-xs leading-5 text-ink/70">{help}</p>}
    </div>
  );
}

function RestrictionTooltip({ message }: { message: string }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-72 -translate-x-1/2 rounded-md bg-strong px-3 py-2 text-center text-xs font-medium leading-5 text-white shadow-lg group-hover/form-restriction:block">
      {message}
    </span>
  );
}
