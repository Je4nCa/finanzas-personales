-- Finanzas Personales: tablas por usuario con Row Level Security.
-- Cada fila pertenece a auth.uid(); nadie más puede leerla ni modificarla.
-- updated_at lo pone el servidor (trigger) y es la base de la sincronización incremental.
-- Los borrados son lógicos (deleted_at) para que los otros dispositivos se enteren.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.cards (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  last_four text not null default '',
  closing_day smallint not null check (closing_day between 1 and 31),
  payment_day smallint not null check (payment_day between 1 and 31),
  theme smallint not null default 0,
  network text check (network in ('visa', 'mastercard')),
  bank text check (bank in ('bac', 'wink')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.expenses (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  description text not null,
  amount numeric(14, 2) not null,
  currency text not null check (currency in ('USD', 'CRC')),
  date date not null,
  card_id text,
  category text not null default 'Otros',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.fixed_expenses (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  description text not null,
  amount numeric(14, 2) not null,
  currency text not null check (currency in ('USD', 'CRC')),
  card_id text,
  start_month text not null,
  end_month text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.installments (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  description text not null,
  total numeric(14, 2) not null,
  currency text not null check (currency in ('USD', 'CRC')),
  card_id text,
  months smallint not null check (months between 1 and 120),
  first_month text not null,
  paid_months text[] not null default '{}',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.card_payments (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id text not null,
  month text not null,
  amount numeric(14, 2) not null,
  currency text not null check (currency in ('USD', 'CRC')),
  date date not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.incomes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  description text not null,
  amount numeric(14, 2) not null,
  currency text not null check (currency in ('USD', 'CRC')),
  date date not null,
  fortnight smallint not null check (fortnight in (1, 2)),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Un registro de ajustes por usuario (el tema claro/oscuro queda en cada dispositivo).
create table public.settings (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  user_name text not null default '',
  base_currency text not null default 'CRC' check (base_currency in ('USD', 'CRC')),
  exchange_rate numeric(10, 2) not null default 510,
  monthly_budget numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
declare
  t text;
begin
  foreach t in array array['cards', 'expenses', 'fixed_expenses', 'installments', 'card_payments', 'incomes', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "solo el dueño" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
    execute format('create index %I on public.%I (user_id, updated_at)', t || '_user_updated_idx', t);
    execute format(
      'create trigger touch_updated_at before insert or update on public.%I for each row execute function public.touch_updated_at()',
      t
    );
  end loop;
end;
$$;
