-- Tarjetas de débito y cuentas (sin ciclo de pago) y apodo para mostrar en la app.
alter table public.cards
  add column kind text not null default 'credit' check (kind in ('credit', 'debit', 'account')),
  add column nickname text;
