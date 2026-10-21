-- Importar estados de cuenta y separar gastos personales, de la casa y en pareja.

alter table public.expenses
  add column scope text not null default 'personal' check (scope in ('personal', 'casa', 'pareja')),
  -- Mes de pago fijado por el estado de cuenta (manda sobre el calculado por la fecha de compra).
  add column payment_month text,
  -- Línea del estado de cuenta de donde salió el gasto (evita importarla dos veces).
  add column source_ref text;

alter table public.fixed_expenses
  add column scope text not null default 'personal' check (scope in ('personal', 'casa', 'pareja'));

alter table public.installments
  add column scope text not null default 'personal' check (scope in ('personal', 'casa', 'pareja'));

alter table public.incomes
  add column source_ref text;

alter table public.cards drop constraint if exists cards_network_check;
alter table public.cards add constraint cards_network_check check (network in ('visa', 'mastercard', 'amex'));
