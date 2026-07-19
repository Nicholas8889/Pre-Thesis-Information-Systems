import "server-only";

import { createClient } from "@supabase/supabase-js";

export const PRE_ORDER_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

export const PRE_ORDER_DOCUMENT_TYPES: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
};

type StoredPreOrderDocument = {
  originalName: string;
  storedName: string;
  mimeType: string;
};

const DEFAULT_BUCKET = "pre-order-documents";

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

function getPreOrderBucketName() {
  return process.env.SUPABASE_PRE_ORDER_BUCKET || DEFAULT_BUCKET;
}

async function ensurePreOrderBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const supabase = getSupabaseAdminClient();
      const bucket = getPreOrderBucketName();
      const { error: lookupError } = await supabase.storage.getBucket(bucket);

      if (!lookupError) return;

      const { error: createError } = await supabase.storage.createBucket(bucket, {
        public: false,
        allowedMimeTypes: Object.values(PRE_ORDER_DOCUMENT_TYPES).flat(),
        fileSizeLimit: PRE_ORDER_DOCUMENT_MAX_BYTES
      });

      if (createError && !/already exists/i.test(createError.message)) {
        throw new Error(`Unable to prepare Supabase Storage bucket: ${createError.message}`);
      }
    })();
  }

  return bucketReady;
}

export async function uploadPreOrderDocument(
  file: File,
  storedName: string
): Promise<StoredPreOrderDocument> {
  await ensurePreOrderBucket();
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(getPreOrderBucketName())
    .upload(storedName, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false
    });

  if (error) {
    throw new Error(`Unable to upload PO document to Supabase Storage: ${error.message}`);
  }

  return {
    originalName: file.name.slice(0, 255),
    storedName,
    mimeType: file.type
  };
}

export async function downloadPreOrderDocument(storedName: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(getPreOrderBucketName())
    .download(storedName);

  if (error || !data) {
    return null;
  }

  return new Uint8Array(await data.arrayBuffer());
}

export async function deletePreOrderDocument(storedName: string) {
  const supabase = getSupabaseAdminClient();
  await supabase.storage.from(getPreOrderBucketName()).remove([storedName]);
}
