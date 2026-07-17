do $$
declare
  test_poi_id bigint;
  test_user_id uuid;
  test_email text;
  original_discount integer;
  original_info text;
  campaign_id text := gen_random_uuid()::text;
  created jsonb;
  validated jsonb;
  generated_code text;
begin
  select p.id, p.discount, p.discount_info, u.id, lower(u.email)
  into test_poi_id, original_discount, original_info, test_user_id, test_email
  from public.pois p
  join auth.users u on lower(u.email) = (string_to_array(lower(replace(coalesce(p.emails, ''), ' ', '')), ','))[1]
  where coalesce(u.email, '') <> ''
  order by p.id
  limit 1;

  if test_poi_id is null then raise exception 'Campaign verification requires an authenticated business manager'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', test_user_id, 'email', test_email, 'role', 'authenticated')::text, true);

  update public.pois set discount = 1, discount_info = jsonb_build_object(
    'campaign_id', campaign_id,
    'title', 'Test campagna',
    'description', 'Verifica automatica',
    'schedule', jsonb_build_object('start_mode','now','start_at',now() - interval '1 minute','end_at',now() + interval '1 day'),
    'redemption', jsonb_build_object('mode','interval','every',24,'unit','hours'),
    'validation_window', jsonb_build_object('enabled',true,'start','00:00','end','23:59','weekdays',jsonb_build_array(1,2,3,4,5,6,7))
  )::text where id = test_poi_id;

  created := public.create_partner_offer_code(test_poi_id);
  generated_code := created -> 'code' ->> 'code';
  if generated_code !~ '^5T-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$' then raise exception 'Generated code is not short and transcribable: %', generated_code; end if;
  validated := public.validate_partner_discount_code(generated_code);
  if coalesce((validated ->> 'ok')::boolean, false) is not true then raise exception 'Campaign code validation failed'; end if;

  delete from public.discount_codes where code = generated_code;
  update public.pois set discount = original_discount, discount_info = original_info where id = test_poi_id;
end;
$$;
