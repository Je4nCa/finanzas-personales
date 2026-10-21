-- Ingresos programados: no cuentan hasta que el usuario confirma que llegaron.
alter table public.incomes
  add column status text not null default 'received' check (status in ('expected', 'received'));
