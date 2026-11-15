-- Commission module: additive schema only. No existing table is modified.

CREATE TABLE IF NOT EXISTS public.commission_promoter_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  default_percent numeric(5,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_promoter_types_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT commission_promoter_types_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT commission_promoter_types_percent_range CHECK (default_percent IS NULL OR default_percent BETWEEN 0 AND 100),
  CONSTRAINT commission_promoter_types_company_code_key UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS public.commission_salespeople (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  salesperson_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  promoter_type_id uuid NOT NULL REFERENCES public.commission_promoter_types(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_salespeople_company_salesperson_key UNIQUE (company_id, salesperson_id)
);

CREATE TABLE IF NOT EXISTS public.commission_plan_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  group_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_plan_settings_group_type_check CHECK (group_type IN ('INDIVIDUAL', 'GRUPAL')),
  CONSTRAINT commission_plan_settings_company_plan_key UNIQUE (company_id, plan_id)
);

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  salesperson_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  promoter_type_id uuid REFERENCES public.commission_promoter_types(id) ON DELETE RESTRICT,
  plan_id uuid REFERENCES public.plans(id) ON DELETE RESTRICT,
  sale_type text,
  group_type text,
  calc_mode text NOT NULL,
  percent numeric(5,2),
  fixed_amount numeric(14,2),
  base text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  priority integer NOT NULL DEFAULT 0,
  specificity smallint GENERATED ALWAYS AS (
    (salesperson_id IS NOT NULL)::integer +
    (promoter_type_id IS NOT NULL)::integer +
    (plan_id IS NOT NULL)::integer +
    (sale_type IS NOT NULL)::integer +
    (group_type IS NOT NULL)::integer
  ) STORED,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_rules_sale_type_not_blank CHECK (sale_type IS NULL OR btrim(sale_type) <> ''),
  CONSTRAINT commission_rules_group_type_check CHECK (group_type IS NULL OR group_type IN ('INDIVIDUAL', 'GRUPAL')),
  CONSTRAINT commission_rules_calc_mode_check CHECK (calc_mode IN ('percent', 'fixed')),
  CONSTRAINT commission_rules_percent_range CHECK (percent IS NULL OR percent BETWEEN 0 AND 100),
  CONSTRAINT commission_rules_fixed_amount_nonnegative CHECK (fixed_amount IS NULL OR fixed_amount >= 0),
  CONSTRAINT commission_rules_calc_values_check CHECK (
    (calc_mode = 'percent' AND percent IS NOT NULL AND fixed_amount IS NULL)
    OR (calc_mode = 'fixed' AND fixed_amount IS NOT NULL AND percent IS NULL)
  ),
  CONSTRAINT commission_rules_base_check CHECK (base IN ('plan_price', 'sale_total_amount', 'per_adherent')),
  CONSTRAINT commission_rules_valid_dates_check CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT commission_rules_dimensions_valid_from_key UNIQUE NULLS NOT DISTINCT
    (company_id, salesperson_id, promoter_type_id, plan_id, sale_type, group_type, valid_from)
);

CREATE TABLE IF NOT EXISTS public.commission_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  accrual_event text NOT NULL DEFAULT 'venta_completada',
  liquidation_prefix text NOT NULL DEFAULT 'LIQ-',
  next_liquidation_number bigint NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_settings_accrual_event_check CHECK (accrual_event IN ('firma_completa', 'venta_completada')),
  CONSTRAINT commission_settings_prefix_not_blank CHECK (btrim(liquidation_prefix) <> ''),
  CONSTRAINT commission_settings_next_number_positive CHECK (next_liquidation_number > 0)
);

CREATE TABLE IF NOT EXISTS public.commission_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  liquidation_number text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'borrador',
  concept text NOT NULL DEFAULT 'COMISION VENTA PRE-PAGA',
  salesperson_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  salesperson_name text NOT NULL,
  salesperson_email text,
  promoter_type_id uuid NOT NULL REFERENCES public.commission_promoter_types(id) ON DELETE RESTRICT,
  promoter_type_code text NOT NULL,
  promoter_type_name text NOT NULL,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency_code varchar(3) NOT NULL DEFAULT 'PYG',
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes text,
  annulled_at timestamptz,
  annulled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  annulment_reason text,
  CONSTRAINT commission_periods_dates_check CHECK (period_end >= period_start),
  CONSTRAINT commission_periods_status_check CHECK (status IN ('borrador', 'cerrada', 'pagada', 'anulada')),
  CONSTRAINT commission_periods_concept_not_blank CHECK (btrim(concept) <> ''),
  CONSTRAINT commission_periods_number_not_blank CHECK (btrim(liquidation_number) <> ''),
  CONSTRAINT commission_periods_total_nonnegative CHECK (total_amount >= 0),
  CONSTRAINT commission_periods_company_number_key UNIQUE (company_id, liquidation_number)
);

CREATE TABLE IF NOT EXISTS public.commission_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.commission_periods(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  salesperson_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  item_number integer NOT NULL,
  group_type text,
  sale_date date NOT NULL,
  client_display_id text NOT NULL,
  client_sequence integer,
  client_name text NOT NULL,
  plan_name text NOT NULL,
  percent numeric(5,2),
  base_amount numeric(14,2) NOT NULL,
  commission_amount numeric(14,2) NOT NULL,
  concept text NOT NULL DEFAULT 'COMISION',
  rule_id uuid NOT NULL REFERENCES public.commission_rules(id) ON DELETE RESTRICT,
  rule_snapshot jsonb NOT NULL,
  is_settled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_items_item_positive CHECK (item_number > 0),
  CONSTRAINT commission_items_group_type_check CHECK (group_type IS NULL OR group_type IN ('INDIVIDUAL', 'GRUPAL')),
  CONSTRAINT commission_items_sequence_positive CHECK (client_sequence IS NULL OR client_sequence > 0),
  CONSTRAINT commission_items_percent_range CHECK (percent IS NULL OR percent BETWEEN 0 AND 100),
  CONSTRAINT commission_items_amounts_nonnegative CHECK (base_amount >= 0 AND commission_amount >= 0),
  CONSTRAINT commission_items_rule_snapshot_object CHECK (jsonb_typeof(rule_snapshot) = 'object'),
  CONSTRAINT commission_items_period_sale_key UNIQUE (period_id, sale_id),
  CONSTRAINT commission_items_period_item_key UNIQUE (period_id, item_number)
);

CREATE INDEX IF NOT EXISTS commission_salespeople_salesperson_idx ON public.commission_salespeople (salesperson_id);
CREATE INDEX IF NOT EXISTS commission_salespeople_promoter_type_idx ON public.commission_salespeople (promoter_type_id);
CREATE INDEX IF NOT EXISTS commission_plan_settings_plan_idx ON public.commission_plan_settings (plan_id);
CREATE INDEX IF NOT EXISTS commission_rules_resolution_idx ON public.commission_rules (company_id, is_active, valid_from, valid_to, priority DESC, specificity DESC);
CREATE INDEX IF NOT EXISTS commission_rules_salesperson_idx ON public.commission_rules (salesperson_id) WHERE salesperson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_rules_promoter_type_idx ON public.commission_rules (promoter_type_id) WHERE promoter_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_rules_plan_idx ON public.commission_rules (plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_rules_created_by_idx ON public.commission_rules (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_periods_company_dates_idx ON public.commission_periods (company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS commission_periods_salesperson_status_idx ON public.commission_periods (salesperson_id, status);
CREATE INDEX IF NOT EXISTS commission_periods_promoter_type_idx ON public.commission_periods (promoter_type_id);
CREATE INDEX IF NOT EXISTS commission_items_period_idx ON public.commission_items (period_id);
CREATE INDEX IF NOT EXISTS commission_items_salesperson_idx ON public.commission_items (salesperson_id, is_settled);
CREATE INDEX IF NOT EXISTS commission_items_company_idx ON public.commission_items (company_id);
CREATE INDEX IF NOT EXISTS commission_items_rule_idx ON public.commission_items (rule_id);
CREATE INDEX IF NOT EXISTS commission_items_sale_idx ON public.commission_items (sale_id);
CREATE INDEX IF NOT EXISTS commission_periods_created_by_idx ON public.commission_periods (created_by);
CREATE INDEX IF NOT EXISTS commission_periods_closed_by_idx ON public.commission_periods (closed_by) WHERE closed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_periods_paid_by_idx ON public.commission_periods (paid_by) WHERE paid_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_periods_annulled_by_idx ON public.commission_periods (annulled_by) WHERE annulled_by IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_items_one_settlement_per_sale_idx ON public.commission_items (sale_id) WHERE is_settled;
