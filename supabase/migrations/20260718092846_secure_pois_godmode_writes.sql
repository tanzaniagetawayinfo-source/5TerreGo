alter table public.pois enable row level security;

drop policy if exists "allow all" on public.pois;
drop policy if exists "only owner insert" on public.pois;
drop policy if exists "only owner update" on public.pois;
drop policy if exists "only owner delete" on public.pois;

create policy "godmode owners insert"
on public.pois
for insert
to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    '5terrego.info@gmail.com',
    'verofili96@icloud.com'
  )
);

create policy "godmode owners update"
on public.pois
for update
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    '5terrego.info@gmail.com',
    'verofili96@icloud.com'
  )
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    '5terrego.info@gmail.com',
    'verofili96@icloud.com'
  )
);

create policy "godmode owners delete"
on public.pois
for delete
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    '5terrego.info@gmail.com',
    'verofili96@icloud.com'
  )
);
