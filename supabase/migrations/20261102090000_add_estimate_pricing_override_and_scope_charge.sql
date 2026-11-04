alter table public.estimates
  add column additional_scope_charge_amount numeric(12,2),
  add column additional_scope_charge_description text,
  add column manual_total_override_enabled boolean not null default false,
  add column manual_total_override_amount numeric(12,2),
  add constraint estimates_additional_scope_charge_amount_nonnegative_check
    check (additional_scope_charge_amount is null or additional_scope_charge_amount >= 0),
  add constraint estimates_manual_total_override_amount_nonnegative_check
    check (manual_total_override_amount is null or manual_total_override_amount >= 0);
