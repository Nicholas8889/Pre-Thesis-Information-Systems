import "server-only";

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  CUSTOMER_PO_DOCUMENT_MAX_BYTES,
  CUSTOMER_PO_DOCUMENT_TYPES,
  type ValidatedCustomerPoDocument
} from "@/lib/customer-po-document";

export {
  CUSTOMER_PO_DOCUMENT_MAX_BYTES,
  CUSTOMER_PO_DOCUMENT_TYPES,
  sanitizeCustomerPoDisplayName,
  validateCustomerPoDocument
} from "@/lib/customer-po-document";

type StoredCustomerPoDocument = {
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  sha256: string;
};

// Keep the deployed bucket fallback so existing customer PO documents remain readable.
const LEGACY_DEFAULT_BUCKET = "pre-order-documents";

let bucketReady: Promise<void> | null = null;

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function getCustomerPoBucketName() {
  return (
    process.env.SUPABASE_CUSTOMER_PO_BUCKET ||
    process.env.SUPABASE_PRE_ORDER_BUCKET ||
    LEGACY_DEFAULT_BUCKET
  );
}

async function ensureCustomerPoBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const supabase = getSupabaseAdminClient();
      const bucket = getCustomerPoBucketName();
      const { error: lookupError } = await supabase.storage.getBucket(bucket);

      if (!lookupError) return;

      const { error: createError } = await supabase.storage.createBucket(bucket, {
        public: false,
        allowedMimeTypes: Object.values(CUSTOMER_PO_DOCUMENT_TYPES).flat(),
        fileSizeLimit: CUSTOMER_PO_DOCUMENT_MAX_BYTES
      });

      if (createError && !/already exists/i.test(createError.message)) {
        throw new Error(`Unable to prepare Supabase Storage bucket: ${createError.message}`);
      }
    })();
  }

  return bucketReady;
}

export async function uploadCustomerPoDocument(
  document: ValidatedCustomerPoDocument,
  storedName = `customer-purchase-orders/${randomUUID()}.pdf`
): Promise<StoredCustomerPoDocument> {
  await ensureCustomerPoBucket();
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(getCustomerPoBucketName())
    .upload(storedName, Buffer.from(document.bytes), {
      contentType: document.mimeType,
      upsert: false
    });

  if (error) {
    throw new Error(`Unable to upload customer PO document to Supabase Storage: ${error.message}`);
  }

  return {
    originalName: document.originalName,
    storedName,
    mimeType: document.mimeType,
    size: document.size,
    sha256: document.sha256
  };
}

export async function downloadCustomerPoDocument(storedName: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(getCustomerPoBucketName())
    .download(storedName);

  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function deleteCustomerPoDocument(storedName: string) {
  const supabase = getSupabaseAdminClient();
  await supabase.storage.from(getCustomerPoBucketName()).remove([storedName]);
}
