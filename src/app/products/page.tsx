import Link from "next/link";
import type { Prisma, Product } from "@prisma/client";
import {
  ArrowUpDown,
  CheckCircle2,
  Eye,
  Package,
  Pencil,
  Plus,
  Search,
  XCircle
} from "lucide-react";
import {
  createProduct,
  updateProduct,
  updateProductStatus
} from "@/lib/actions";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  getCurrentMonthAverageSoldPrice,
  getJakartaCurrentMonthWindow,
  PRODUCT_AVERAGE_ELIGIBLE_STATUSES
} from "@/lib/product-insights";
import { getSearchMessage } from "@/lib/workflow";

type SearchParams = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export default async function ProductsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const query = getFirst(params.q);
  const mode = getFirst(params.mode);
  const viewId = getFirst(params.view);
  const editId = getFirst(params.edit);
  const averagePriceSort = getAveragePriceSort(getFirst(params.averagePrice));
  const { success, error } = getSearchMessage(params);
  const now = new Date();
  const currentMonth = getJakartaCurrentMonthWindow(now);
  const currentMonthSalesItems = {
    where: {
      salesOrder: {
        orderDate: {
          gte: currentMonth.monthStart,
          lt: currentMonth.nextMonthStart
        },
        status: { in: [...PRODUCT_AVERAGE_ELIGIBLE_STATUSES] }
      }
    },
    select: {
      productId: true,
      quantity: true,
      subtotal: true,
      salesOrder: {
        select: {
          orderDate: true,
          status: true
        }
      }
    }
  } satisfies Prisma.SalesOrderItemFindManyArgs;

  const products = await prisma.product.findMany({
    where: query
      ? {
          OR: [
            { productName: { contains: query } },
            { notes: { contains: query } }
          ]
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: { salesOrderItems: currentMonthSalesItems }
  });
  const productsWithAverages = products.map((product) => ({
    ...product,
    average: getCurrentMonthAverageSoldPrice(
      product.id,
      product.salesOrderItems,
      now
    )
  }));
  const sortedProducts = averagePriceSort
    ? [...productsWithAverages].sort((left, right) => {
        const leftAverage = left.average.averageSoldPrice;
        const rightAverage = right.average.averageSoldPrice;
        if (leftAverage === null && rightAverage === null) {
          return left.productName.localeCompare(right.productName);
        }
        if (leftAverage === null) return 1;
        if (rightAverage === null) return -1;
        const difference = leftAverage - rightAverage;
        return averagePriceSort === "asc" ? difference : -difference;
      })
    : productsWithAverages;

  const selectedProduct = viewId
    ? products.find((product) => product.id === viewId) ??
      await prisma.product.findUnique({
        where: { id: viewId },
        include: { salesOrderItems: currentMonthSalesItems }
      })
    : null;
  const selectedProductAverage = selectedProduct
    ? getCurrentMonthAverageSoldPrice(
        selectedProduct.id,
        selectedProduct.salesOrderItems,
        now
      )
    : null;
  const productToEdit = editId
    ? products.find((product) => product.id === editId) ??
      await prisma.product.findUnique({ where: { id: editId } })
    : null;

  return (
    <>
      <PageHeader
        title="Products"
        description="Manage product master data, prices, and availability status."
        action={
          <Link
            href="/products?mode=add"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add Product
          </Link>
        }
      />

      <FlashMessage success={success} error={error} />

      {(mode === "add" || productToEdit) && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <h2 className="mb-4 text-lg font-semibold">
            {productToEdit ? "Edit Product" : "Add Product"}
          </h2>
          <ProductForm product={productToEdit ?? undefined} />
        </section>
      )}

      {selectedProduct && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-strong">
                <Package aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">{selectedProduct.productName}</h2>
                <p className="mt-1 text-sm text-ink/80">
                  {formatCurrency(selectedProduct.listPrice)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={selectedProduct.status} />
              <form action={updateProductStatus}>
                <input type="hidden" name="id" value={selectedProduct.id} />
                <input
                  type="hidden"
                  name="status"
                  value={selectedProduct.status === "Active" ? "Inactive" : "Active"}
                />
                <button
                  className={
                    selectedProduct.status === "Active"
                      ? "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:bg-soft"
                      : "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-success px-3 text-sm font-semibold text-white transition hover:bg-success/90"
                  }
                >
                  {selectedProduct.status === "Active" ? (
                    <XCircle aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  )}
                  {selectedProduct.status === "Active" ? "Make Inactive" : "Make Active"}
                </button>
              </form>
            </div>
          </div>

          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Detail label="List Price" value={formatCurrency(selectedProduct.listPrice)} />
            <Detail
              label="Average Sold Price - This Month"
              value={formatAverageSoldPrice(selectedProductAverage?.averageSoldPrice ?? null)}
              description={`${selectedProductAverage?.eligibleQuantity ?? 0} eligible unit(s) · ${selectedProductAverage?.monthLabel ?? currentMonth.monthLabel}`}
            />
            <Detail label="Created" value={formatDateTime(selectedProduct.createdAt)} />
            <Detail label="Last Updated" value={formatDateTime(selectedProduct.updatedAt)} />
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase text-ink/50">Notes</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-soft p-3 text-sm text-ink/80">
              {selectedProduct.notes || "-"}
            </p>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <Link
              href={`/products?edit=${selectedProduct.id}`}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Edit Product
            </Link>
          </div>
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <div className="mb-5 flex items-center gap-2 border-b border-line pb-4">
          <h2 className="text-lg font-semibold">Product Records</h2>
        </div>
        <form className="mb-4 flex max-w-md items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
          <Search aria-hidden="true" className="h-4 w-4 text-ink/50" />
          <input
            name="q"
            className="w-full outline-none"
            placeholder="Search product"
            defaultValue={query}
          />
          {averagePriceSort && (
            <input type="hidden" name="averagePrice" value={averagePriceSort} />
          )}
        </form>

        {products.length === 0 ? (
          <EmptyState message="No products found." />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Product Name</th>
                  <th className="py-3 pr-4 text-right">List Price</th>
                  <th className="py-3 pr-4 text-right">
                    <Link
                      href={getAveragePriceSortHref(
                        query,
                        averagePriceSort === "desc" ? "asc" : "desc"
                      )}
                      className="inline-flex items-center justify-end gap-1 font-semibold text-ink/70 hover:text-brand"
                    >
                      Avg. Sold Price (This Month)
                      <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                  </th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Notes</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {sortedProducts.map((product) => (
                  <tr key={product.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">{product.productName}</td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(product.listPrice)}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {product.average.averageSoldPrice === null ? (
                        <span className="text-xs font-normal text-ink/70">
                          No sales this month
                        </span>
                      ) : (
                        formatCurrency(product.average.averageSoldPrice)
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="max-w-80 whitespace-pre-wrap py-3 pr-4 text-ink/80">
                      {product.notes || "-"}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/products?view=${product.id}`}
                          title="View product"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                        >
                          <Eye aria-hidden="true" className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/products?edit=${product.id}`}
                          title="Edit product"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                        >
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ProductForm({ product }: { product?: Product }) {
  return (
    <form action={product ? updateProduct : createProduct} className="space-y-4">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="Product Name"
          name="productName"
          defaultValue={product?.productName}
          required
        />
        <FormField
          label="List Price"
          name="listPrice"
          type="number"
          defaultValue={product?.listPrice}
          min="0"
          required
        />
        <label className="text-sm font-medium text-ink">
          Status
          <select
            name="status"
            defaultValue={product?.status ?? "Active"}
            className={`${inputClass} mt-1`}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-ink">
        Notes
        <textarea
          name="notes"
          defaultValue={product?.notes ?? ""}
          className={`${inputClass} mt-1 min-h-24`}
        />
      </label>
      <div className="flex gap-3">
        <button className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
          {product ? "Save Product" : "Add Product"}
        </button>
        <Link
          href="/products"
          className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink/80"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function FormField({
  label,
  name,
  defaultValue,
  type = "text",
  min,
  required = false
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  min?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-medium text-ink">
      {label}
      <input
        name={name}
        type={type}
        min={min}
        step={type === "number" ? "1" : undefined}
        defaultValue={defaultValue ?? ""}
        required={required}
        className={`${inputClass} mt-1`}
      />
    </label>
  );
}

function Detail({
  label,
  value,
  description
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-ink/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
      {description && <p className="mt-1 text-xs text-ink/70">{description}</p>}
    </div>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getAveragePriceSort(value: string | undefined) {
  return value === "asc" || value === "desc" ? value : null;
}

function getAveragePriceSortHref(
  query: string | undefined,
  direction: "asc" | "desc"
) {
  const params = new URLSearchParams({ averagePrice: direction });
  if (query) params.set("q", query);
  return `/products?${params.toString()}`;
}

function formatAverageSoldPrice(value: number | null) {
  return value === null ? "No sales this month" : formatCurrency(value);
}
