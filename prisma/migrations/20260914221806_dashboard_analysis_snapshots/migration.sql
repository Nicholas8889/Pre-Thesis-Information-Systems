BEGIN;

-- CreateTable
CREATE TABLE "dashboard_analysis_snapshots" (
    "scope_key" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "trend" JSONB NOT NULL,
    "last_succeeded_at" TIMESTAMP(3) NOT NULL,
    "last_attempt_at" TIMESTAMP(3) NOT NULL,
    "last_run_status" TEXT NOT NULL,
    "last_error" TEXT,

    CONSTRAINT "dashboard_analysis_snapshots_pkey" PRIMARY KEY ("scope_key")
);

-- CreateTable
CREATE TABLE "dashboard_analysis_runs" (
    "id" BIGSERIAL NOT NULL,
    "trigger_source" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "error_message" TEXT,

    CONSTRAINT "dashboard_analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_analysis_snapshots_scope_idx" ON "dashboard_analysis_snapshots"("scope_type", "owner_user_id");

-- CreateIndex
CREATE INDEX "dashboard_analysis_runs_started_at_idx" ON "dashboard_analysis_runs"("started_at");


ALTER TABLE public.dashboard_analysis_snapshots
  ADD CONSTRAINT dashboard_analysis_snapshots_scope_check CHECK (
    (scope_key = 'company' AND scope_type = 'COMPANY' AND owner_user_id IS NULL)
    OR (scope_type = 'SALES' AND owner_user_id IS NOT NULL
        AND scope_key = 'sales:' || owner_user_id)
  ),
  ADD CONSTRAINT dashboard_analysis_snapshots_status_check
    CHECK (last_run_status IN ('SUCCEEDED', 'FAILED')),
  ADD CONSTRAINT dashboard_analysis_snapshots_trend_check
    CHECK (jsonb_typeof(trend) = 'array');

ALTER TABLE public.dashboard_analysis_runs
  ADD CONSTRAINT dashboard_analysis_runs_status_check
    CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'));

-- The application accesses these tables only through its authenticated server.
-- public is an exposed Supabase schema, so deny Data API roles even if grants change.
ALTER TABLE public.dashboard_analysis_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_analysis_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_analysis_snapshots, public.dashboard_analysis_runs
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.dashboard_analysis_runs_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS dashboard_private;
REVOKE ALL ON SCHEMA dashboard_private FROM PUBLIC, anon, authenticated, service_role;

-- One writer is shared by the nightly Cron job and the manual server action.
-- A failed inner block rolls back every snapshot change, then records the failure.
CREATE FUNCTION dashboard_private.refresh_dashboard_analysis(
  p_trigger text,
  p_actor_user_id text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_run_id bigint;
  v_finished_at timestamp;
  v_error text;
BEGIN
  INSERT INTO public.dashboard_analysis_runs (trigger_source, actor_user_id, status)
  VALUES (p_trigger, p_actor_user_id, 'RUNNING')
  RETURNING id INTO v_run_id;

  IF NOT pg_try_advisory_xact_lock(824219, 1424) THEN
    UPDATE public.dashboard_analysis_runs
    SET status = 'SKIPPED', finished_at = (clock_timestamp() AT TIME ZONE 'UTC'),
        error_message = 'Another dashboard analysis run is in progress'
    WHERE id = v_run_id;
    RETURN v_run_id;
  END IF;

  BEGIN
    IF p_trigger NOT IN ('NIGHTLY', 'MANUAL') THEN
      RAISE EXCEPTION 'Unsupported dashboard analysis trigger: %', p_trigger;
    END IF;
    IF p_trigger = 'MANUAL' AND p_actor_user_id IS NULL THEN
      RAISE EXCEPTION 'Manual dashboard analysis requires an actor';
    END IF;

    v_finished_at := (clock_timestamp() AT TIME ZONE 'UTC');
    WITH scopes AS (
      SELECT 'company'::text AS scope_key, 'COMPANY'::text AS scope_type,
             NULL::text AS owner_user_id
      UNION ALL
      SELECT 'sales:' || u.id, 'SALES', u.id
      FROM public.users u WHERE u.role = 'SALES' AND u.status = 'Active'
    ), months AS (
      SELECT generate_series(
        date_trunc('month', transaction_timestamp() AT TIME ZONE 'Asia/Jakarta') - interval '5 months',
        date_trunc('month', transaction_timestamp() AT TIME ZONE 'Asia/Jakarta'),
        interval '1 month'
      )::timestamp AS month_start
    ), order_months AS (
      SELECT 'company'::text AS scope_key,
             date_trunc('month', so.order_date + interval '7 hours') AS month_start,
             sum(so.total)::bigint AS amount
      FROM public.sales_orders so
      WHERE so.order_date >= (SELECT min(month_start) - interval '7 hours' FROM months)
        AND so.order_date < (SELECT max(month_start) + interval '1 month' - interval '7 hours' FROM months)
      GROUP BY 2
      UNION ALL
      SELECT 'sales:' || so.created_by_user_id,
             date_trunc('month', so.order_date + interval '7 hours'),
             sum(so.total)::bigint
      FROM public.sales_orders so
      WHERE so.created_by_user_id IS NOT NULL
        AND so.order_date >= (SELECT min(month_start) - interval '7 hours' FROM months)
        AND so.order_date < (SELECT max(month_start) + interval '1 month' - interval '7 hours' FROM months)
      GROUP BY 1, 2
    ), payment_months AS (
      SELECT 'company'::text AS scope_key,
             date_trunc('month', p.payment_date + interval '7 hours') AS month_start,
             sum(p.amount)::bigint AS amount
      FROM public.payments p
      WHERE p.payment_date >= (SELECT min(month_start) - interval '7 hours' FROM months)
        AND p.payment_date < (SELECT max(month_start) + interval '1 month' - interval '7 hours' FROM months)
      GROUP BY 2
      UNION ALL
      SELECT 'sales:' || so.created_by_user_id,
             date_trunc('month', p.payment_date + interval '7 hours'),
             sum(p.amount)::bigint
      FROM public.payments p
      JOIN public.invoices i ON i.id = p.invoice_id
      JOIN public.sales_orders so ON so.id = i.sales_order_id
      WHERE so.created_by_user_id IS NOT NULL
        AND p.payment_date >= (SELECT min(month_start) - interval '7 hours' FROM months)
        AND p.payment_date < (SELECT max(month_start) + interval '1 month' - interval '7 hours' FROM months)
      GROUP BY 1, 2
    ), calculated AS (
      SELECT s.scope_key, s.scope_type, s.owner_user_id,
             min(m.month_start) - interval '7 hours' AS period_start,
             jsonb_agg(
               jsonb_build_object(
                 'label', to_char(m.month_start, 'Mon'),
                 'sales', coalesce(o.amount, 0),
                 'payments', coalesce(p.amount, 0)
               ) ORDER BY m.month_start
             ) AS trend
      FROM scopes s CROSS JOIN months m
      LEFT JOIN order_months o ON o.scope_key = s.scope_key AND o.month_start = m.month_start
      LEFT JOIN payment_months p ON p.scope_key = s.scope_key AND p.month_start = m.month_start
      GROUP BY s.scope_key, s.scope_type, s.owner_user_id
    )
    INSERT INTO public.dashboard_analysis_snapshots (
      scope_key, scope_type, owner_user_id, period_start, trend,
      last_succeeded_at, last_attempt_at, last_run_status, last_error
    )
    SELECT scope_key, scope_type, owner_user_id, period_start, trend,
           v_finished_at, v_finished_at, 'SUCCEEDED', NULL
    FROM calculated
    WHERE true
    ON CONFLICT (scope_key) DO UPDATE SET
      scope_type = EXCLUDED.scope_type,
      owner_user_id = EXCLUDED.owner_user_id,
      period_start = EXCLUDED.period_start,
      trend = EXCLUDED.trend,
      last_succeeded_at = EXCLUDED.last_succeeded_at,
      last_attempt_at = EXCLUDED.last_attempt_at,
      last_run_status = 'SUCCEEDED',
      last_error = NULL;

    -- Record completion time only after all scope calculations have succeeded.
    v_finished_at := (clock_timestamp() AT TIME ZONE 'UTC');
    UPDATE public.dashboard_analysis_snapshots
    SET last_succeeded_at = v_finished_at, last_attempt_at = v_finished_at
    WHERE scope_key = 'company'
       OR scope_key IN (
         SELECT 'sales:' || u.id FROM public.users u
         WHERE u.role = 'SALES' AND u.status = 'Active'
       );

    UPDATE public.dashboard_analysis_runs
    SET status = 'SUCCEEDED', finished_at = v_finished_at
    WHERE id = v_run_id;
  EXCEPTION WHEN OTHERS THEN
    v_error := left(SQLERRM, 2000);
    UPDATE public.dashboard_analysis_snapshots
    SET last_attempt_at = (clock_timestamp() AT TIME ZONE 'UTC'),
        last_run_status = 'FAILED',
        last_error = v_error;
    UPDATE public.dashboard_analysis_runs
    SET status = 'FAILED', finished_at = (clock_timestamp() AT TIME ZONE 'UTC'),
        error_message = v_error
    WHERE id = v_run_id;
  END;

  RETURN v_run_id;
END;
$function$;

REVOKE ALL ON FUNCTION dashboard_private.refresh_dashboard_analysis(text, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- This database reports cron.timezone=GMT. 17:15 UTC is 00:15 WIB next day.
-- Refuse a different scheduler timezone instead of silently shifting the job.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $schedule$
BEGIN
  IF current_setting('cron.timezone', true) NOT IN ('GMT', 'UTC', 'Etc/UTC') THEN
    RAISE EXCEPTION 'dashboard-analysis-nightly-wib requires a UTC/GMT cron.timezone';
  END IF;
  PERFORM cron.schedule(
    'dashboard-analysis-nightly-wib',
    '15 17 * * *',
    'SELECT dashboard_private.refresh_dashboard_analysis(''NIGHTLY'', NULL)'
  );
END;
$schedule$;

COMMIT;
