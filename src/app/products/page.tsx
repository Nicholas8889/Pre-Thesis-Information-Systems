import Link from "next/link";
import type { Product } from "@prisma/client";
import {
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
  const { success, error } = getSearchMessage(params);

  const products = await prisma.product.findMany({
    where: query
      ? {
          OR: [
            { productName: { contains: query } },
            { notes: { contains: query } }
          ]
        }
      : undefined,
    orderBy: { createdAt: "desc" }
  });

  const selectedProduct = viewId
    ? await prisma.product.findUnique({ where: { id: viewId } })
    : null;
  const productToEdit = editId
    ? await prisma.product.findUnique({ where: { id: editId } })
    : null;

  return (
    <>
      <PageHeader
        title="Products"
        description="Manage product master data, base prices, and availability status."
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
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <h2 className="mb-4 text-lg font-semibold">
            {productToEdit ? "Edit Product" : "Add Product"}
          </h2>
          <ProductForm product={productToEdit ?? undefined} />
        </section>
      )}

      {selectedProduct && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-blue-50 text-brand ring-1 ring-inset ring-blue-200">
                <Package aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">{selectedProduct.productName}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {formatCurrency(selectedProduct.basePrice)}
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
                      ? "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      : "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
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

          <div className="grid gap-4 text-sm md:grid-cols-3">
            <Detail label="Base Price" value={formatCurrency(selectedProduct.basePrice)} />
            <Detail label="Created" value={formatDateTime(selectedProduct.createdAt)} />
            <Detail label="Last Updated" value={formatDateTime(selectedProduct.updatedAt)} />
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-600">
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

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <form className="mb-4 flex max-w-md items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
          <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
          <input
            name="q"
            className="w-full outline-none"
            placeholder="Search product"
            defaultValue={query}
          />
        </form>

        {products.length === 0 ? (
          <EmptyState message="No products found." />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Product Name</th>
                  <th className="py-3 pr-4 text-right">Base Price</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Notes</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {products.map((product) => (
                  <tr key={product.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{product.productName}</td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(product.basePrice)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="max-w-80 whitespace-pre-wrap py-3 pr-4 text-slate-600">
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
          label="Base Price"
          name="basePrice"
          type="number"
          defaultValue={product?.basePrice}
          min="0"
          required
        />
        <label className="text-sm font-medium text-slate-700">
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
      <label className="block text-sm font-medium text-slate-700">
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
          className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-slate-600"
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
    <label className="text-sm font-medium text-slate-700">
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
