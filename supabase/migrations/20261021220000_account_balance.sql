-- Disponible de tarjetas de débito y cuentas: saldo fijado por el usuario + ingresos − gastos posteriores.
alter table public.cards
  add column balances jsonb,      -- {"CRC": 300000, "USD": 0} al momento de balance_at
  add column balance_at text;     -- ISO del ajuste

alter table public.incomes
  add column account_id text,     -- cuenta o débito donde entró el dinero
  add column created_at text;     -- ISO de registro (ordena contra un ajuste del mismo día)

alter table public.expenses
  add column created_at text;
