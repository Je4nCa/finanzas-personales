-- "Tasa cero" pasa a ser "pagos mensuales": préstamos, tasa cero, suscripciones y otros.
alter table public.installments
  add column type text not null default 'tasa_cero' check (type in ('prestamo', 'tasa_cero', 'suscripcion', 'otro')),
  add column monthly numeric(14, 2),               -- cuota fija (préstamos, suscripciones)
  add column due_day smallint check (due_day between 1 and 31);

-- Las suscripciones no tienen fin: cantidad de cuotas opcional.
alter table public.installments drop constraint if exists installments_months_check;
alter table public.installments alter column months drop not null;
alter table public.installments add constraint installments_months_check check (months is null or months between 1 and 360);
