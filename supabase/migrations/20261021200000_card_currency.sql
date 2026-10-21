-- Moneda en que cobra cada tarjeta: colones, dólares o ambas (bimoneda).
alter table public.cards
  add column currency text not null default 'both' check (currency in ('CRC', 'USD', 'both'));
