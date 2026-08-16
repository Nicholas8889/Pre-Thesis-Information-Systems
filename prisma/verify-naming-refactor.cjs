/* eslint-disable @typescript-eslint/no-require-imports -- standalone guarded verifier */
require("dotenv/config");

const { mkdirSync, writeFileSync } = require("node:fs");

const phase = process.argv[2];
const allowCurrentDev = process.argv.includes("--allow-current-dev");
if (!new Set(["before", "mid", "after"]).has(phase)) {
  throw new Error(
    "Usage: node prisma/verify-naming-refactor.cjs <before|mid|after> [--allow-current-dev]"
  );
}

if (allowCurrentDev && phase === "before") {
  throw new Error("The current development database can only be snapshotted as mid or after.");
}

const databaseUrl = allowCurrentDev
  ? process.env.DATABASE_URL
  : process.env.NAMING_TEST_DATABASE_URL;
const directUrl = allowCurrentDev ? process.env.DIRECT_URL : process.env.NAMING_TEST_DIRECT_URL;

if (!databaseUrl || !directUrl) {
  throw new Error(
    allowCurrentDev
      ? "Set DATABASE_URL and DIRECT_URL first."
      : "Set NAMING_TEST_DATABASE_URL and NAMING_TEST_DIRECT_URL first."
  );
}

const parsedUrls = [databaseUrl, directUrl].map((value) => new URL(value));
for (const parsedUrl of parsedUrls) {
  if (!new Set(["postgres:", "postgresql:"]).has(parsedUrl.protocol)) {
    throw new Error("Naming verification requires PostgreSQL connection URLs.");
  }
}

if (!allowCurrentDev) {
  for (const [name, parsedUrl] of [
    ["NAMING_TEST_DATABASE_URL", parsedUrls[0]],
    ["NAMING_TEST_DIRECT_URL", parsedUrls[1]]
  ]) {
    const databaseName = parsedUrl.pathname.replace(/^\//, "");
    if (!/naming[_-]refactor[_-]test/i.test(databaseName)) {
      throw new Error(`${name} database name must contain naming_refactor_test.`);
    }
  }
}

process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL = directUrl;

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const physicalState = phase === "after" ? "snake" : phase;
const tableNames = {
  before: {
    user: "User",
    auditTrail: "AuditTrail",
    customer: "Customer",
    product: "Product",
    salesOrder: "SalesOrder",
    customerInquiry: "CustomerInquiry",
    customerInquiryItem: "CustomerInquiryItem",
    salesOrderItem: "SalesOrderItem",
    invoice: "Invoice",
    payment: "Payment",
    collectionTask: "FollowUp",
    customerOutreach: "CustomerProductFollowUp",
    deliveryNote: "DeliveryNote",
    deliveryNoteItem: "DeliveryNoteItem"
  },
  mid: {
    user: "User",
    auditTrail: "AuditTrail",
    customer: "Customer",
    product: "Product",
    salesOrder: "SalesOrder",
    customerInquiry: "CustomerInquiry",
    customerInquiryItem: "CustomerInquiryItem",
    salesOrderItem: "SalesOrderItem",
    invoice: "Invoice",
    payment: "Payment",
    collectionTask: "CollectionTask",
    customerOutreach: "CustomerOutreach",
    deliveryNote: "DeliveryNote",
    deliveryNoteItem: "DeliveryNoteItem"
  },
  snake: {
    user: "users",
    auditTrail: "audit_trails",
    customer: "customers",
    product: "products",
    salesOrder: "sales_orders",
    customerInquiry: "customer_inquiries",
    customerInquiryItem: "customer_inquiry_items",
    salesOrderItem: "sales_order_items",
    invoice: "invoices",
    payment: "payments",
    collectionTask: "collection_tasks",
    customerOutreach: "customer_outreach",
    deliveryNote: "delivery_notes",
    deliveryNoteItem: "delivery_note_items"
  }
};
const entities = tableNames[physicalState];

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const serializable = (value) =>
  JSON.parse(
    JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item))
  );

async function scalar(query) {
  const rows = await prisma.$queryRawUnsafe(query);
  return rows[0];
}

function selectForPhase(queries) {
  return queries[physicalState];
}

function validateObjectState(objectState) {
  const commonLegacy = objectState.legacy_sales_order && !objectState.snake_sales_order;
  if (
    phase === "before" &&
    (!commonLegacy ||
      !objectState.legacy_collection ||
      objectState.mid_collection ||
      !objectState.legacy_outreach ||
      objectState.mid_outreach ||
      !objectState.legacy_source_column ||
      objectState.mid_source_column ||
      !objectState.legacy_audit_reference_column ||
      objectState.mid_audit_reference_column)
  ) {
    throw new Error("Before snapshot is not at the expected legacy physical-schema state.");
  }

  if (
    phase === "mid" &&
    (!commonLegacy ||
      objectState.legacy_collection ||
      !objectState.mid_collection ||
      objectState.legacy_outreach ||
      !objectState.mid_outreach ||
      objectState.legacy_source_column ||
      !objectState.mid_source_column ||
      objectState.legacy_audit_reference_column ||
      !objectState.mid_audit_reference_column)
  ) {
    throw new Error("Mid snapshot is not after the business-name migrations and before snake_case.");
  }

  if (
    phase === "after" &&
    (objectState.legacy_sales_order ||
      !objectState.snake_sales_order ||
      objectState.legacy_collection ||
      objectState.mid_collection ||
      !objectState.snake_collection ||
      objectState.legacy_outreach ||
      objectState.mid_outreach ||
      !objectState.snake_outreach ||
      !objectState.snake_source_column ||
      !objectState.snake_audit_reference_column)
  ) {
    throw new Error("After snapshot is not at the expected canonical snake_case state.");
  }
}

async function main() {
  const objectState = await scalar(`
    SELECT
      to_regclass('public."SalesOrder"')::text AS legacy_sales_order,
      to_regclass('public.sales_orders')::text AS snake_sales_order,
      to_regclass('public."FollowUp"')::text AS legacy_collection,
      to_regclass('public."CollectionTask"')::text AS mid_collection,
      to_regclass('public.collection_tasks')::text AS snake_collection,
      to_regclass('public."CustomerProductFollowUp"')::text AS legacy_outreach,
      to_regclass('public."CustomerOutreach"')::text AS mid_outreach,
      to_regclass('public.customer_outreach')::text AS snake_outreach,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'SalesOrder'
          AND column_name = 'transactionType'
      ) AS legacy_source_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'SalesOrder'
          AND column_name = 'source'
      ) AS mid_source_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales_orders'
          AND column_name = 'source'
      ) AS snake_source_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'AuditTrail'
          AND column_name = 'transactionCode'
      ) AS legacy_audit_reference_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'AuditTrail'
          AND column_name = 'recordReference'
      ) AS mid_audit_reference_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_trails'
          AND column_name = 'record_reference'
      ) AS snake_audit_reference_column
  `);
  validateObjectState(objectState);

  const counts = {};
  for (const [entity, table] of Object.entries(entities)) {
    counts[entity] = (
      await scalar(`SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(table)}`)
    ).count;
  }

  const columns = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, is_nullable, column_default, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    ORDER BY table_name, ordinal_position
  `);
  const enums = await prisma.$queryRawUnsafe(`
    SELECT t.typname AS enum_name, e.enumlabel AS enum_value,
           e.enumsortorder::text AS sort_order
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `);
  const constraints = await prisma.$queryRawUnsafe(`
    SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype,
           pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace
    ORDER BY table_name, c.conname
  `);
  const indexes = await prisma.$queryRawUnsafe(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);
  const missingFkIndexes = await prisma.$queryRawUnsafe(`
    SELECT c.conrelid::regclass::text AS table_name, a.attname AS fk_column
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey)
      )
    ORDER BY table_name, fk_column
  `);
  const rls = await prisma.$queryRawUnsafe(`
    SELECT c.relname AS table_name, c.relrowsecurity AS enabled,
           c.relforcerowsecurity AS forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
    ORDER BY c.relname
  `);
  const policies = await prisma.$queryRawUnsafe(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `);
  const views = await prisma.$queryRawUnsafe(`
    SELECT schemaname, viewname AS object_name, definition, 'view' AS object_type
    FROM pg_views
    WHERE schemaname = 'public'
    UNION ALL
    SELECT schemaname, matviewname, definition, 'materialized_view'
    FROM pg_matviews
    WHERE schemaname = 'public'
    ORDER BY object_type, object_name
  `);
  const functions = await prisma.$queryRawUnsafe(`
    SELECT p.oid::regprocedure::text AS function_name, p.prosecdef AS security_definer,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
    ORDER BY function_name
  `);
  const triggers = await prisma.$queryRawUnsafe(`
    SELECT c.relname AS table_name, t.tgname AS trigger_name,
           pg_get_triggerdef(t.oid, true) AS definition
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY table_name, trigger_name
  `);
  const tablePrivileges = await prisma.$queryRawUnsafe(`
    SELECT grantee, table_name, privilege_type, is_grantable
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    ORDER BY table_name, grantee, privilege_type
  `);
  const appliedMigrations = await prisma.$queryRawUnsafe(`
    SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations
    ORDER BY started_at, migration_name
  `);

  const stableChecksums = {};
  stableChecksums.collectionTask = (
    await scalar(
      selectForPhase({
        before: `SELECT md5(COALESCE(string_agg(concat_ws('|', "idFollowUp", "customerId",
          COALESCE("invoiceId", ''), "followUpDate"::text, status::text, notes),
          '' ORDER BY "idFollowUp"), '')) AS checksum FROM "FollowUp"`,
        mid: `SELECT md5(COALESCE(string_agg(concat_ws('|', "idCollectionTask", "customerId",
          COALESCE("invoiceId", ''), "scheduledDate"::text, status::text, notes),
          '' ORDER BY "idCollectionTask"), '')) AS checksum FROM "CollectionTask"`,
        snake: `SELECT md5(COALESCE(string_agg(concat_ws('|', id, customer_id,
          COALESCE(invoice_id, ''), scheduled_date::text, status::text, notes),
          '' ORDER BY id), '')) AS checksum FROM collection_tasks`
      })
    )
  ).checksum;
  stableChecksums.customerOutreach = (
    await scalar(
      selectForPhase({
        before: `SELECT md5(COALESCE(string_agg(concat_ws('|', "idCustomerProductFollowUp",
          "customerId", "contactDate"::text, COALESCE(notes, '')),
          '' ORDER BY "idCustomerProductFollowUp"), '')) AS checksum
          FROM "CustomerProductFollowUp"`,
        mid: `SELECT md5(COALESCE(string_agg(concat_ws('|', "idCustomerOutreach",
          "customerId", "contactDate"::text, COALESCE(notes, '')),
          '' ORDER BY "idCustomerOutreach"), '')) AS checksum FROM "CustomerOutreach"`,
        snake: `SELECT md5(COALESCE(string_agg(concat_ws('|', id, customer_id,
          contact_date::text, COALESCE(notes, '')), '' ORDER BY id), '')) AS checksum
          FROM customer_outreach`
      })
    )
  ).checksum;
  stableChecksums.salesOrderNaming = (
    await scalar(
      selectForPhase({
        before: `SELECT md5(COALESCE(string_agg(concat_ws('|', "idSalesOrder", "orderNumber",
          COALESCE("poNumber", ''),
          CASE "transactionType"::text WHEN 'SALES_ORDER' THEN 'DIRECT' ELSE 'CUSTOMER_PO' END,
          COALESCE("poDocumentName", ''), COALESCE("poDocumentStoredName", ''),
          COALESCE("poDocumentMimeType", '')), '' ORDER BY "idSalesOrder"), '')) AS checksum
          FROM "SalesOrder"`,
        mid: `SELECT md5(COALESCE(string_agg(concat_ws('|', "idSalesOrder", "orderNumber",
          COALESCE("customerPoNumber", ''), source::text,
          COALESCE("customerPoDocumentName", ''), COALESCE("customerPoDocumentStoredName", ''),
          COALESCE("customerPoDocumentMimeType", '')), '' ORDER BY "idSalesOrder"), '')) AS checksum
          FROM "SalesOrder"`,
        snake: `SELECT md5(COALESCE(string_agg(concat_ws('|', id, order_number,
          COALESCE(customer_po_number, ''), source::text,
          COALESCE(customer_po_document_name, ''),
          COALESCE(customer_po_document_stored_name, ''),
          COALESCE(customer_po_document_mime_type, '')), '' ORDER BY id), '')) AS checksum
          FROM sales_orders`
      })
    )
  ).checksum;
  stableChecksums.auditReference = (
    await scalar(
      selectForPhase({
        before: `SELECT md5(COALESCE(string_agg(concat_ws('|', "idAuditTrail", "transactionCode"),
          '' ORDER BY "idAuditTrail"), '')) AS checksum FROM "AuditTrail"`,
        mid: `SELECT md5(COALESCE(string_agg(concat_ws('|', "idAuditTrail", "recordReference"),
          '' ORDER BY "idAuditTrail"), '')) AS checksum FROM "AuditTrail"`,
        snake: `SELECT md5(COALESCE(string_agg(concat_ws('|', id, record_reference)
          , '' ORDER BY id), '')) AS checksum FROM audit_trails`
      })
    )
  ).checksum;

  const paymentTermDistribution = await prisma.$queryRawUnsafe(
    selectForPhase({
      before: `SELECT source_table,
        CASE term WHEN 'DEBIT' THEN 'IMMEDIATE' ELSE term END AS canonical_term,
        row_count::text AS row_count
      FROM (
        SELECT 'salesOrder' AS source_table, "paymentTermType"::text AS term,
               COUNT(*) AS row_count FROM "SalesOrder" GROUP BY "paymentTermType"
        UNION ALL
        SELECT 'invoice', "paymentTermType"::text, COUNT(*)
        FROM "Invoice" GROUP BY "paymentTermType"
      ) x ORDER BY source_table, canonical_term`,
      mid: `SELECT source_table, term AS canonical_term, row_count::text AS row_count
      FROM (
        SELECT 'salesOrder' AS source_table, "paymentTermType"::text AS term,
               COUNT(*) AS row_count FROM "SalesOrder" GROUP BY "paymentTermType"
        UNION ALL
        SELECT 'invoice', "paymentTermType"::text, COUNT(*)
        FROM "Invoice" GROUP BY "paymentTermType"
      ) x ORDER BY source_table, canonical_term`,
      snake: `SELECT source_table, term AS canonical_term, row_count::text AS row_count
      FROM (
        SELECT 'salesOrder' AS source_table, payment_term_type::text AS term,
               COUNT(*) AS row_count FROM sales_orders GROUP BY payment_term_type
        UNION ALL
        SELECT 'invoice', payment_term_type::text, COUNT(*)
        FROM invoices GROUP BY payment_term_type
      ) x ORDER BY source_table, canonical_term`
    })
  );

  const cleanupCandidates = {
    collectionNotes: await prisma.$queryRawUnsafe(
      selectForPhase({
        before: `SELECT "idFollowUp" AS id, notes FROM "FollowUp"
          WHERE notes LIKE 'Generated Billing follow-up for%'
             OR notes LIKE 'Credit billing reminder for%'
          ORDER BY "idFollowUp"`,
        mid: `SELECT "idCollectionTask" AS id, notes FROM "CollectionTask"
          WHERE notes LIKE 'Generated Billing follow-up for%'
             OR notes LIKE 'Credit billing reminder for%'
          ORDER BY "idCollectionTask"`,
        snake: `SELECT id, notes FROM collection_tasks
          WHERE notes LIKE 'Generated Billing follow-up for%'
             OR notes LIKE 'Credit billing reminder for%'
          ORDER BY id`
      })
    ),
    auditRows: await prisma.$queryRawUnsafe(
      selectForPhase({
        before: `SELECT "idAuditTrail" AS id, "moduleName" AS module_name,
               "entityType" AS entity_type, "changeSummary" AS change_summary
          FROM "AuditTrail"
          WHERE "moduleName" IN ('Billing', 'Follow Up')
             OR "entityType" IN ('FOLLOW_UP', 'CUSTOMER_PRODUCT_FOLLOW_UP')
          ORDER BY "idAuditTrail"`,
        mid: `SELECT "idAuditTrail" AS id, "moduleName" AS module_name,
               "entityType" AS entity_type, "changeSummary" AS change_summary
          FROM "AuditTrail"
          WHERE "moduleName" IN ('Billing', 'Follow Up')
             OR "entityType" IN ('FOLLOW_UP', 'CUSTOMER_PRODUCT_FOLLOW_UP')
          ORDER BY "idAuditTrail"`,
        snake: `SELECT id, module_name, entity_type, change_summary FROM audit_trails
          WHERE module_name IN ('Billing', 'Follow Up')
             OR entity_type IN ('FOLLOW_UP', 'CUSTOMER_PRODUCT_FOLLOW_UP')
          ORDER BY id`
      })
    )
  };

  const renamedRelationOrphans = await scalar(
    selectForPhase({
      before: `SELECT
        (SELECT COUNT(*)::text FROM "FollowUp" c
          LEFT JOIN "Customer" x ON x."idCustomer" = c."customerId"
          WHERE x."idCustomer" IS NULL) AS collection_customer_orphans,
        (SELECT COUNT(*)::text FROM "FollowUp" c
          LEFT JOIN "Invoice" i ON i."idInvoice" = c."invoiceId"
          WHERE c."invoiceId" IS NOT NULL AND i."idInvoice" IS NULL)
          AS collection_invoice_orphans,
        (SELECT COUNT(*)::text FROM "CustomerProductFollowUp" o
          LEFT JOIN "Customer" x ON x."idCustomer" = o."customerId"
          WHERE x."idCustomer" IS NULL) AS outreach_customer_orphans`,
      mid: `SELECT
        (SELECT COUNT(*)::text FROM "CollectionTask" c
          LEFT JOIN "Customer" x ON x."idCustomer" = c."customerId"
          WHERE x."idCustomer" IS NULL) AS collection_customer_orphans,
        (SELECT COUNT(*)::text FROM "CollectionTask" c
          LEFT JOIN "Invoice" i ON i."idInvoice" = c."invoiceId"
          WHERE c."invoiceId" IS NOT NULL AND i."idInvoice" IS NULL)
          AS collection_invoice_orphans,
        (SELECT COUNT(*)::text FROM "CustomerOutreach" o
          LEFT JOIN "Customer" x ON x."idCustomer" = o."customerId"
          WHERE x."idCustomer" IS NULL) AS outreach_customer_orphans`,
      snake: `SELECT
        (SELECT COUNT(*)::text FROM collection_tasks c
          LEFT JOIN customers x ON x.id = c.customer_id
          WHERE x.id IS NULL) AS collection_customer_orphans,
        (SELECT COUNT(*)::text FROM collection_tasks c
          LEFT JOIN invoices i ON i.id = c.invoice_id
          WHERE c.invoice_id IS NOT NULL AND i.id IS NULL) AS collection_invoice_orphans,
        (SELECT COUNT(*)::text FROM customer_outreach o
          LEFT JOIN customers x ON x.id = o.customer_id
          WHERE x.id IS NULL) AS outreach_customer_orphans`
    })
  );

  const connectionTarget = {
    database: {
      host: parsedUrls[0].hostname,
      port: parsedUrls[0].port || "5432",
      name: parsedUrls[0].pathname.replace(/^\//, "")
    },
    direct: {
      host: parsedUrls[1].hostname,
      port: parsedUrls[1].port || "5432",
      name: parsedUrls[1].pathname.replace(/^\//, "")
    },
    currentDevelopmentOverride: allowCurrentDev
  };

  const snapshot = serializable({
    phase,
    capturedAt: new Date().toISOString(),
    connectionTarget,
    objectState,
    counts,
    columns,
    enums,
    constraints,
    indexes,
    missingFkIndexes,
    rls,
    policies,
    views,
    functions,
    triggers,
    tablePrivileges,
    appliedMigrations,
    stableChecksums,
    paymentTermDistribution,
    cleanupCandidates,
    renamedRelationOrphans
  });
  mkdirSync(".codex/evidence/naming-refactor", { recursive: true });
  const output = `.codex/evidence/naming-refactor/db-${phase}.json`;
  writeFileSync(output, JSON.stringify(snapshot, null, 2));
  console.log(output);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
