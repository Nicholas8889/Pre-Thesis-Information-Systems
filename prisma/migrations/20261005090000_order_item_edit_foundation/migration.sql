BEGIN;

ALTER TABLE public.sales_orders
  ADD COLUMN revision_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN pack_started_at TIMESTAMPTZ(3),
  ADD CONSTRAINT sales_orders_revision_number_check CHECK (revision_number >= 1);
ALTER TABLE public.invoices
  ADD COLUMN revision_number INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT invoices_revision_number_check CHECK (revision_number >= 1);

CREATE TABLE public.sales_order_item_revisions (
  id TEXT NOT NULL PRIMARY KEY,
  sales_order_id TEXT NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  revision_number INTEGER NOT NULL CHECK (revision_number >= 2),
  invoice_id TEXT,
  invoice_revision_number INTEGER CHECK (invoice_revision_number >= 2),
  actor_user_id TEXT NOT NULL,
  actor_username TEXT NOT NULL,
  actor_display_name TEXT,
  actor_role public.user_role NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 150),
  before_snapshot JSONB NOT NULL CHECK (jsonb_typeof(before_snapshot) = 'object'),
  after_snapshot JSONB NOT NULL CHECK (jsonb_typeof(after_snapshot) = 'object'),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sales_order_item_revisions_invoice_reference_check CHECK (
    (invoice_id IS NULL AND invoice_revision_number IS NULL) OR
    (invoice_id IS NOT NULL AND invoice_revision_number IS NOT NULL)
  ),
  CONSTRAINT sales_order_item_revisions_order_revision_key UNIQUE (sales_order_id, revision_number)
);
CREATE INDEX sales_order_item_revisions_actor_user_id_idx ON public.sales_order_item_revisions(actor_user_id);
ALTER TABLE public.sales_order_item_revisions ENABLE ROW LEVEL SECURITY;
-- Revisions are written/read by the authenticated server workflow, not Data API clients.
REVOKE ALL ON public.sales_order_item_revisions FROM anon, authenticated;

-- Historical evidence remains a permanent edit boundary, even when a sheet's
-- current status was reopened/reset. Use the earliest recorded evidence where available.
WITH evidence AS (
  SELECT list.sales_order_id,
    COALESCE(history.first_pack_at, list.packed_at AT TIME ZONE 'UTC', list.updated_at AT TIME ZONE 'UTC') AS observed_at
  FROM public.picking_lists list
  LEFT JOIN LATERAL (
    SELECT min(audit.created_at) AT TIME ZONE 'UTC' AS first_pack_at
    FROM public.audit_trails audit
    WHERE audit.entity_type = 'PICKING_LIST' AND audit.entity_id = list.id
      AND audit.module_name = 'Pick & Pack'
      AND (audit.action IN ('PACKED', 'REOPENED') OR
        COALESCE(audit.old_value, '') ~ '"status"[[:space:]]*:[[:space:]]*"(InProgress|Packed)"' OR
        COALESCE(audit.new_value, '') ~ '"status"[[:space:]]*:[[:space:]]*"(InProgress|Packed)"')
  ) history ON true
  WHERE list.status IN ('InProgress', 'Packed') OR list.packed_at IS NOT NULL OR history.first_pack_at IS NOT NULL
)
UPDATE public.sales_orders orders
SET pack_started_at = evidence.observed_at,
    version = orders.version + 1,
    updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
FROM evidence WHERE orders.id = evidence.sales_order_id AND orders.pack_started_at IS NULL;

CREATE FUNCTION public.remember_order_pack_start() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.status IN ('InProgress', 'Packed') OR NEW.packed_at IS NOT NULL THEN
    UPDATE public.sales_orders
    SET pack_started_at = clock_timestamp(), version = version + 1,
        updated_at = clock_timestamp() AT TIME ZONE 'UTC'
    WHERE id = NEW.sales_order_id AND pack_started_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER picking_lists_remember_pack_start
AFTER INSERT OR UPDATE OF status, packed_at, sales_order_id ON public.picking_lists
FOR EACH ROW EXECUTE FUNCTION public.remember_order_pack_start();

CREATE FUNCTION public.protect_order_item_edit_boundary() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF OLD.pack_started_at IS NOT NULL AND NEW.pack_started_at IS DISTINCT FROM OLD.pack_started_at THEN
    RAISE EXCEPTION 'Pack start is a permanent order item edit boundary' USING ERRCODE = '23514';
  END IF;
  IF NEW.revision_number < OLD.revision_number THEN
    RAISE EXCEPTION 'Order revision numbers cannot decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_orders_protect_item_edit_boundary
BEFORE UPDATE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.protect_order_item_edit_boundary();

CREATE FUNCTION public.protect_invoice_revision_number() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.revision_number < OLD.revision_number THEN
    RAISE EXCEPTION 'Invoice revision numbers cannot decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoices_protect_revision_number
BEFORE UPDATE OF revision_number ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.protect_invoice_revision_number();

CREATE FUNCTION public.protect_order_item_revision_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Order item revision history is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER sales_order_item_revisions_append_only
BEFORE UPDATE OR DELETE ON public.sales_order_item_revisions
FOR EACH ROW EXECUTE FUNCTION public.protect_order_item_revision_history();

REVOKE EXECUTE ON FUNCTION public.remember_order_pack_start() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_order_item_edit_boundary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_order_item_revision_history() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_invoice_revision_number() FROM PUBLIC;

COMMIT;
