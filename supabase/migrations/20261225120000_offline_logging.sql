-- Offline logging on the phone app (OFFLINE-SPEC; Lauren, Nov 23, 2026:
-- O5 yes, O7 yes with read logging later (B5), O8 14 days).
--
-- The phone keeps a relationship-building log in its outbox until it has a
-- connection, then sends it with this one function. It does everything the
-- website's log form does (new residents, room numbers, shared musicians,
-- the residents linked) in one transaction, so a dropped connection never
-- leaves half a log behind.
--
-- Safe to resend: the phone picks the log's id (and any new resident's id)
-- when the musician taps Save. If the first send arrived but its answer was
-- lost, the second send finds the log already there and returns
-- 'already_logged' without changing anything.
--
-- Same rules as today: SECURITY INVOKER, so the existing row-level policies
-- and triggers decide (roster, approved weeks final, dates after they
-- happen, detailed-notes buildings). Nothing new is allowed.
--
-- A new resident whose name was added at that building by someone else while
-- the phone was offline is refused with 'resident_exists' (O5): the phone
-- asks whether it's the same person.
--
-- Additive only (expand): a new function and a new setting.

create function public.log_relationship_activity(
  p_id            uuid,
  p_residency     uuid,
  p_site          uuid,
  p_occurred_on   date,
  p_kind          public.activity_kind,
  p_minutes       integer,
  p_collaborative boolean,
  p_note          text,
  p_start_time    time,
  p_end_time      time,
  p_residents     jsonb,  -- [{"id": uuid, "room": text|null}]      residents already on the list
  p_new_residents jsonb,  -- [{"id": uuid, "name": text, "disambiguator": text, "room": text|null}]
  p_shared_with   uuid[]  -- other musicians who shared it (v0.24)
)
returns text language plpgsql security invoker set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  r jsonb;
  v_room text;
  v_name text;
  v_dis text;
  v_existing uuid;
begin
  if exists (select 1 from public.relationship_activity where id = p_id) then
    return 'already_logged';
  end if;

  -- Rooms for residents already on the list (detailed-notes buildings).
  for r in select * from jsonb_array_elements(coalesce(p_residents, '[]'::jsonb)) loop
    v_room := nullif(btrim(r->>'room'), '');
    if v_room is not null then
      perform public.set_resident_room((r->>'id')::uuid, v_room);
    end if;
  end loop;

  -- New residents: first name + last initial (D14).
  for r in select * from jsonb_array_elements(coalesce(p_new_residents, '[]'::jsonb)) loop
    if exists (select 1 from public.resident where id = (r->>'id')::uuid) then
      continue;
    end if;
    v_name := regexp_replace(btrim(r->>'name'), '\s+', ' ', 'g');
    v_dis := btrim(coalesce(r->>'disambiguator', ''));
    v_room := nullif(btrim(r->>'room'), '');
    select id into v_existing from public.resident
      where site_id = p_site and lower(display_name) = lower(v_name) and lower(disambiguator) = lower(v_dis);
    if found then
      raise exception 'resident_exists' using errcode = 'P0001', detail = v_name, hint = v_existing::text;
    end if;
    insert into public.resident (id, site_id, display_name, disambiguator, created_by, room)
      values ((r->>'id')::uuid, p_site, v_name, v_dis, me, v_room);
  end loop;

  insert into public.relationship_activity
    (id, person_id, residency_id, site_id, occurred_on, kind, minutes, collaborative, note, start_time, end_time)
  values
    (p_id, me, p_residency, p_site, p_occurred_on, p_kind, p_minutes, coalesce(p_collaborative, false),
     nullif(btrim(coalesce(p_note, '')), ''), p_start_time, p_end_time);

  insert into public.relationship_activity_musician (activity_id, person_id)
    select p_id, x from unnest(coalesce(p_shared_with, '{}'::uuid[])) as x where x is distinct from me
    on conflict do nothing;

  insert into public.relationship_activity_resident (activity_id, resident_id, room)
    select p_id, (e->>'id')::uuid, nullif(btrim(e->>'room'), '')
    from jsonb_array_elements(coalesce(p_residents, '[]'::jsonb) || coalesce(p_new_residents, '[]'::jsonb)) as e
    on conflict do nothing;

  return 'logged';
end;
$$;
revoke all on function public.log_relationship_activity(uuid, uuid, uuid, date, public.activity_kind, integer, boolean, text, time, time, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.log_relationship_activity(uuid, uuid, uuid, date, public.activity_kind, integer, boolean, text, time, time, jsonb, jsonb, uuid[]) to authenticated;

-- O8: how long the phone may keep saving work offline since it last reached
-- Iris with a valid sign-in. After that it keeps the outbox but asks the
-- person to sign in before saving more.
insert into public.setting (key, value) values ('offline_signin_max_days', '14')
  on conflict (key) do nothing;
