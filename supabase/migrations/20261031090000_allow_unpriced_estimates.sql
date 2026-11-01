-- Preserve the distinction between an unpriced Estimate and an explicit $0.
-- Existing rows keep their current numeric values (including legitimate zeroes).
alter table public.estimates
  alter column total_amount drop not null;
