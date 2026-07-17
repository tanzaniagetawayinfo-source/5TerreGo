create or replace function public.update_partner_discount(
  target_poi_id bigint,
  new_discount integer,
  new_discount_info text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  manager_email text;
  configured_manager text;
  updated_row public.pois;
begin
  manager_email := lower(auth.jwt() ->> 'email');
  if manager_email is null or manager_email = '' then
    raise exception 'Missing authenticated user email';
  end if;

  select (string_to_array(lower(replace(coalesce(emails, ''), ' ', '')), ','))[1]
  into configured_manager
  from public.pois
  where id = target_poi_id;

  if configured_manager is null or configured_manager <> manager_email then
    raise exception 'Only the business manager can edit the campaign';
  end if;

  update public.pois
  set discount = greatest(0, least(100, coalesce(new_discount, 0))),
      discount_info = coalesce(new_discount_info, '')
  where id = target_poi_id
  returning * into updated_row;

  if updated_row.id is null then raise exception 'POI not found'; end if;

  return jsonb_build_object(
    'ok', true,
    'poi_id', updated_row.id,
    'discount', updated_row.discount,
    'discount_info', updated_row.discount_info
  );
end;
$$;

revoke all on function public.update_partner_discount(bigint, integer, text) from public;
grant execute on function public.update_partner_discount(bigint, integer, text) to authenticated;
