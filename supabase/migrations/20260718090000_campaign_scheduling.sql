drop index if exists public.discount_codes_one_per_user_per_poi_per_day;

create or replace function public.create_partner_offer_code(target_poi_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text := lower(auth.jwt() ->> 'email');
  poi_row public.pois;
  code_row public.discount_codes;
  offer jsonb := '{}'::jsonb;
  schedule jsonb := '{}'::jsonb;
  redemption jsonb := '{}'::jsonb;
  campaign_id text;
  start_at timestamptz;
  end_at timestamptz;
  last_created timestamptz;
  next_allowed timestamptz;
  every_value integer := 24;
  unit_value text := 'hours';
  mode_value text := 'interval';
  generated_code text;
  chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  attempt integer;
  i integer;
begin
  if v_user_id is null or coalesce(v_user_email, '') = '' then
    raise exception 'Devi accedere prima di generare il codice';
  end if;

  select * into poi_row from public.pois where id = target_poi_id limit 1;
  if poi_row.id is null then raise exception 'Attività non trovata'; end if;
  if coalesce(poi_row.discount, 0) <= 0 then raise exception 'Questa offerta non è attiva'; end if;

  begin
    offer := coalesce(nullif(poi_row.discount_info, '')::jsonb, '{}'::jsonb);
  exception when others then
    offer := '{}'::jsonb;
  end;
  if coalesce(trim(offer ->> 'title'), '') = '' and coalesce(trim(offer ->> 'description'), '') = '' then
    raise exception 'L’offerta non è configurata';
  end if;

  schedule := coalesce(offer -> 'schedule', '{}'::jsonb);
  redemption := coalesce(offer -> 'redemption', '{}'::jsonb);
  campaign_id := coalesce(nullif(offer ->> 'campaign_id', ''), 'legacy-' || target_poi_id::text);

  begin start_at := nullif(schedule ->> 'start_at', '')::timestamptz; exception when others then start_at := null; end;
  begin end_at := nullif(schedule ->> 'end_at', '')::timestamptz; exception when others then end_at := null; end;
  if start_at is not null and now() < start_at then raise exception 'La campagna non è ancora iniziata'; end if;
  if end_at is not null and now() >= end_at then raise exception 'La campagna è terminata'; end if;

  select * into code_row
  from public.discount_codes
  where poi_id = target_poi_id
    and user_id = v_user_id
    and status = 'active'
    and expires_at > now()
    and coalesce(nullif(discount_info, '')::jsonb ->> 'campaign_id', 'legacy-' || target_poi_id::text) = campaign_id
  order by created_at desc limit 1;
  if code_row.id is not null then
    return jsonb_build_object('ok', true, 'already_existing', true, 'code', to_jsonb(code_row));
  end if;

  mode_value := case when redemption ->> 'mode' = 'campaign' then 'campaign' else 'interval' end;
  if mode_value = 'campaign' and exists (
    select 1 from public.discount_codes dc
    where dc.poi_id = target_poi_id and dc.user_id = v_user_id
      and coalesce(nullif(dc.discount_info, '')::jsonb ->> 'campaign_id', 'legacy-' || target_poi_id::text) = campaign_id
  ) then
    raise exception 'Hai già richiesto il codice previsto per questa campagna';
  end if;

  if mode_value = 'interval' then
    begin every_value := greatest(1, least(999, coalesce(nullif(redemption ->> 'every', '')::integer, 24))); exception when others then every_value := 24; end;
    unit_value := case when redemption ->> 'unit' in ('hours','days','months') then redemption ->> 'unit' else 'hours' end;
    select max(created_at) into last_created from public.discount_codes dc
    where dc.poi_id = target_poi_id and dc.user_id = v_user_id
      and coalesce(nullif(dc.discount_info, '')::jsonb ->> 'campaign_id', 'legacy-' || target_poi_id::text) = campaign_id;
    if last_created is not null then
      next_allowed := case unit_value
        when 'days' then last_created + make_interval(days => every_value)
        when 'months' then last_created + make_interval(months => every_value)
        else last_created + make_interval(hours => every_value)
      end;
      if now() < next_allowed then raise exception 'Potrai richiedere un nuovo codice dal %', to_char(timezone('Europe/Rome', next_allowed), 'DD/MM/YYYY HH24:MI'); end if;
    end if;
  end if;

  for attempt in 1..20 loop
    generated_code := '5T-';
    for i in 1..4 loop
      generated_code := generated_code || substr(chars, 1 + floor(random() * length(chars))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.discount_codes where upper(code) = generated_code);
  end loop;
  if exists (select 1 from public.discount_codes where upper(code) = generated_code) then raise exception 'Impossibile creare il codice. Riprova.'; end if;

  insert into public.discount_codes (poi_id, user_id, user_email, code, discount, discount_info, status, expires_at, valid_day)
  values (target_poi_id, v_user_id, v_user_email, generated_code, 1, poi_row.discount_info, 'active', coalesce(end_at, now() + interval '30 days'), timezone('Europe/Rome', now())::date)
  returning * into code_row;

  return jsonb_build_object('ok', true, 'already_existing', false, 'code', to_jsonb(code_row));
end;
$$;

revoke all on function public.create_partner_offer_code(bigint) from public;
grant execute on function public.create_partner_offer_code(bigint) to authenticated;

create or replace function public.validate_partner_discount_code(target_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  operator_email text := lower(auth.jwt() ->> 'email');
  code_row public.discount_codes;
  poi_row public.pois;
  code_offer jsonb := '{}'::jsonb;
  current_offer jsonb := '{}'::jsonb;
  schedule jsonb := '{}'::jsonb;
  window_rule jsonb := '{}'::jsonb;
  italy_now timestamp := timezone('Europe/Rome', now());
  start_at timestamptz;
  end_at timestamptz;
  start_time time;
  end_time time;
  allowed_days jsonb := '[]'::jsonb;
  code_campaign text;
  current_campaign text;
begin
  if coalesce(operator_email, '') = '' then raise exception 'Utente non autenticato'; end if;
  select * into code_row from public.discount_codes where upper(code) = upper(trim(target_code)) limit 1;
  if code_row.id is null then raise exception 'Codice non trovato'; end if;
  select * into poi_row from public.pois where id = code_row.poi_id limit 1;
  if poi_row.id is null then raise exception 'Attività non trovata'; end if;
  if not (operator_email = any(string_to_array(lower(replace(coalesce(poi_row.emails, ''), ' ', '')), ','))) then raise exception 'Non sei autorizzato per questa attività'; end if;
  if coalesce(poi_row.discount, 0) <= 0 then raise exception 'L’offerta non è più attiva'; end if;
  if code_row.status = 'used' then raise exception 'Codice già utilizzato'; end if;
  if code_row.status <> 'active' or code_row.expires_at <= now() then
    update public.discount_codes set status = 'expired' where id = code_row.id;
    raise exception 'Codice scaduto';
  end if;

  begin code_offer := coalesce(nullif(code_row.discount_info, '')::jsonb, '{}'::jsonb); exception when others then code_offer := '{}'::jsonb; end;
  begin current_offer := coalesce(nullif(poi_row.discount_info, '')::jsonb, '{}'::jsonb); exception when others then current_offer := '{}'::jsonb; end;
  code_campaign := coalesce(nullif(code_offer ->> 'campaign_id', ''), 'legacy-' || poi_row.id::text);
  current_campaign := coalesce(nullif(current_offer ->> 'campaign_id', ''), 'legacy-' || poi_row.id::text);
  if code_campaign <> current_campaign then raise exception 'Il codice appartiene a una campagna precedente'; end if;

  schedule := coalesce(current_offer -> 'schedule', '{}'::jsonb);
  begin start_at := nullif(schedule ->> 'start_at', '')::timestamptz; exception when others then start_at := null; end;
  begin end_at := nullif(schedule ->> 'end_at', '')::timestamptz; exception when others then end_at := null; end;
  if start_at is not null and now() < start_at then raise exception 'La campagna non è ancora iniziata'; end if;
  if end_at is not null and now() >= end_at then raise exception 'La campagna è terminata'; end if;

  window_rule := coalesce(current_offer -> 'validation_window', '{}'::jsonb);
  if coalesce((window_rule ->> 'enabled')::boolean, false) then
    if coalesce(window_rule ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(window_rule ->> 'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Orari di validazione non configurati'; end if;
    start_time := (window_rule ->> 'start')::time;
    end_time := (window_rule ->> 'end')::time;
    allowed_days := coalesce(window_rule -> 'weekdays', '[]'::jsonb);
    if not allowed_days @> to_jsonb(array[extract(isodow from italy_now)::integer]) then raise exception 'Codice non validabile in questo giorno'; end if;
    if start_time <= end_time and not (italy_now::time >= start_time and italy_now::time <= end_time) then raise exception 'Codice fuori dall’orario consentito';
    elsif start_time > end_time and not (italy_now::time >= start_time or italy_now::time <= end_time) then raise exception 'Codice fuori dall’orario consentito'; end if;
  end if;

  update public.discount_codes set status = 'used', validated_at = now(), validated_by = auth.uid() where id = code_row.id returning * into code_row;
  return jsonb_build_object('ok', true, 'message', 'Codice validato', 'code', code_row.code, 'discount_info', code_row.discount_info, 'poi_id', poi_row.id, 'poi_name', poi_row.name, 'user_email', code_row.user_email, 'created_at', code_row.created_at, 'validated_at', code_row.validated_at);
end;
$$;

revoke all on function public.validate_partner_discount_code(text) from public;
grant execute on function public.validate_partner_discount_code(text) to authenticated;
