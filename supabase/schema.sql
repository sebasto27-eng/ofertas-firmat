-- Ofertas Firmat: base de datos
-- Pegá todo este archivo en Supabase > SQL Editor > New query y tocá "Run".

create table if not exists public.comercios (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null check (char_length(nombre) between 2 and 60),
  rubro      text not null default 'otros',
  direccion  text not null check (char_length(direccion) between 3 and 80),
  telefono   text check (char_length(telefono) <= 30),
  horario    text check (char_length(horario) <= 40),
  maps_url   text check (maps_url is null or maps_url like 'https://%'),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  creado     timestamptz not null default now()
);

create table if not exists public.ofertas (
  id           uuid primary key default gen_random_uuid(),
  comercio_id  uuid not null references public.comercios(id) on delete cascade,
  titulo       text not null check (char_length(titulo) between 3 and 90),
  descuento    int  not null check (descuento between 1 and 100),
  vence        date not null,
  creado       timestamptz not null default now()
);
create index if not exists ofertas_comercio_idx on public.ofertas(comercio_id);

-- Seguridad: cualquiera puede ver; cada comercio solo toca lo suyo.
alter table public.comercios enable row level security;
alter table public.ofertas   enable row level security;

grant select on public.comercios, public.ofertas to anon, authenticated;
grant insert, update, delete on public.comercios, public.ofertas to authenticated;

drop policy if exists "comercios: ver"    on public.comercios;
drop policy if exists "comercios: crear"  on public.comercios;
drop policy if exists "comercios: editar" on public.comercios;
drop policy if exists "comercios: borrar" on public.comercios;
create policy "comercios: ver"    on public.comercios for select using (true);
create policy "comercios: crear"  on public.comercios for insert to authenticated with check ((select auth.uid()) = id);
create policy "comercios: editar" on public.comercios for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "comercios: borrar" on public.comercios for delete to authenticated using ((select auth.uid()) = id);

drop policy if exists "ofertas: ver"    on public.ofertas;
drop policy if exists "ofertas: crear"  on public.ofertas;
drop policy if exists "ofertas: editar" on public.ofertas;
drop policy if exists "ofertas: borrar" on public.ofertas;
-- El público ve solo ofertas vigentes; el dueño ve también las vencidas.
create policy "ofertas: ver"    on public.ofertas for select using (vence >= current_date or (select auth.uid()) = comercio_id);
create policy "ofertas: crear"  on public.ofertas for insert to authenticated with check ((select auth.uid()) = comercio_id);
create policy "ofertas: editar" on public.ofertas for update to authenticated using ((select auth.uid()) = comercio_id) with check ((select auth.uid()) = comercio_id);
create policy "ofertas: borrar" on public.ofertas for delete to authenticated using ((select auth.uid()) = comercio_id);
