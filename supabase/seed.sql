-- Fake data for the STAGING database only. Never run this on production.
-- Every name and address here is made up. Safe to run more than once.
-- Sections for tables that don't exist yet are skipped.

do $$
declare
  p uuid;
  s1 uuid;
  s2 uuid;
  s3 uuid;
begin
  if to_regclass('public.partner') is null then
    raise notice 'partner table not created yet; skipping places';
    return;
  end if;

  -- A multi-building partner, shaped like CESLC: several sites on one
  -- campus with different care levels, one shared building, one farther away.
  insert into public.partner (legal_name, display_name, billing_email)
  values ('Example Life Communities, Inc.', 'Example Life Communities', 'billing@example.org')
  on conflict do nothing;
  select id into p from public.partner where lower(legal_name) = lower('Example Life Communities, Inc.');

  insert into public.site (partner_id, name, display_name, care_levels, address, city, state, timezone)
  values
    (p, 'Maple House',  'Maple House',  '{independent}',              '100 Example Way', 'Testville', 'MD', 'America/New_York'),
    (p, 'Birch Hall',   'Birch Hall',   '{assisted,memory_care}',     '110 Example Way', 'Testville', 'MD', 'America/New_York'),
    (p, 'Cedar Manor',  'Cedar Manor',  '{affordable_housing}',       '9 Faraway Road',  'Elsewhere', 'MD', 'America/New_York')
  on conflict do nothing;
  select id into s1 from public.site where partner_id = p and name = 'Maple House';
  select id into s2 from public.site where partner_id = p and name = 'Birch Hall';
  select id into s3 from public.site where partner_id = p and name = 'Cedar Manor';

  insert into public.location (site_id, name, display_name)
  values
    (s1, 'Auditorium', 'Auditorium'),
    (s1, 'Library',    'Library'),
    (s2, 'Auditorium', 'Auditorium'),
    (s2, 'Memory Care Lounge', 'Lounge'),
    (s3, 'Community Room', 'Community Room')
  on conflict do nothing;

  -- A single-building partner in another time zone.
  insert into public.partner (legal_name, display_name)
  values ('Sample Senior Living LLC', 'Sample Senior Living')
  on conflict do nothing;
  select id into p from public.partner where lower(legal_name) = lower('Sample Senior Living LLC');
  insert into public.site (partner_id, name, display_name, care_levels, city, state, timezone)
  values (p, 'Sample Desert Campus', 'Sample Desert Campus', '{independent,assisted}', 'Testtown', 'AZ', 'America/Phoenix')
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduling (fake): a residency at Example Life Communities with a current
-- season, a roster, a point person and two weekly programs, so the
-- scheduling screens aren't empty on staging. Skipped until the scheduling
-- tables exist. The fake people have no password: they can't log in.
-- Fixed IDs keep this safe to run more than once.
do $$
declare
  v_partner uuid;
  maple uuid;
  birch uuid;
  maple_aud uuid;
  birch_lounge uuid;
  res uuid := 'a0000000-0000-4000-8000-000000000001';
  sea uuid := 'a0000000-0000-4000-8000-000000000002';
  people constant text[][] := array[
    ['b0000000-0000-4000-8000-000000000001', 'Violet Viola (fake)',  'violet.viola@example.com',  'contractor_1099', '{viola}'],
    ['b0000000-0000-4000-8000-000000000002', 'Cal Cello (fake)',     'cal.cello@example.com',     'contractor_1099', '{cello}'],
    ['b0000000-0000-4000-8000-000000000003', 'Fern Flute (fake)',    'fern.flute@example.com',    'contractor_1099', '{flute}'],
    ['b0000000-0000-4000-8000-000000000004', 'Piers Piano (fake)',   'piers.piano@example.com',   'contractor_1099', '{piano}'],
    ['b0000000-0000-4000-8000-000000000005', 'Stella Staff (fake)',  'stella.staff@example.com',  'employee_w2',     '{}']
  ];
  p text[];
begin
  if to_regclass('public.residency') is null then
    raise notice 'scheduling tables not created yet; skipping scheduling seed';
    return;
  end if;

  select id into v_partner from public.partner where lower(legal_name) = lower('Example Life Communities, Inc.');
  select id into maple from public.site where partner_id = v_partner and name = 'Maple House';
  select id into birch from public.site where partner_id = v_partner and name = 'Birch Hall';
  select id into maple_aud from public.location where site_id = maple and name = 'Auditorium';
  select id into birch_lounge from public.location where site_id = birch and name = 'Memory Care Lounge';
  if v_partner is null or maple_aud is null or birch_lounge is null then
    raise notice 'fake partner or rooms missing; skipping scheduling seed';
    return;
  end if;

  -- Fake people: a sign-in record (no password) plus a person record.
  foreach p slice 1 in array people loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', p[1]::uuid, 'authenticated', 'authenticated', p[3], '',
            now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
    on conflict (id) do nothing;
    insert into public.person (id, name, email, employment_type, instruments, system_roles)
    values (p[1]::uuid, p[2], p[3], p[4]::public.employment_type, p[5]::text[],
            case when p[4] = 'employee_w2' then '{admin}'::public.system_role[] else '{}' end)
    on conflict (id) do nothing;
  end loop;

  insert into public.residency (id, partner_id, name, display_name, status, started_on)
  values (res, v_partner, 'Example Life Communities (fake)', 'Iris Music Project at Example Life Communities', 'active', current_date - 60)
  on conflict (id) do nothing;
  insert into public.residency_site (residency_id, site_id) values (res, maple), (res, birch)
  on conflict do nothing;

  -- A season around today, so "this month" always has something to show.
  insert into public.season (id, residency_id, name, starts_on, ends_on, kind)
  values (sea, res, 'Current semester (fake)', date_trunc('month', current_date)::date - 30,
          date_trunc('month', current_date)::date + 150, 'semester')
  on conflict (id) do nothing;

  insert into public.roster_member (season_id, person_id, is_core, is_admin_lead, joined_on)
  values (sea, 'b0000000-0000-4000-8000-000000000001', true, true,  current_date - 30),
         (sea, 'b0000000-0000-4000-8000-000000000002', true, false, current_date - 30),
         (sea, 'b0000000-0000-4000-8000-000000000003', true, false, current_date - 30),
         (sea, 'b0000000-0000-4000-8000-000000000004', false, false, current_date - 30)
  on conflict (season_id, person_id) do nothing;

  insert into public.staff_assignment (id, residency_id, person_id, role, starts_on)
  values ('a0000000-0000-4000-8000-000000000003', res, 'b0000000-0000-4000-8000-000000000005', 'point_person', current_date - 60)
  on conflict (id) do nothing;

  insert into public.series (id, residency_id, title, default_location_id, weekdays, start_time, minutes, active_from)
  values ('a0000000-0000-4000-8000-000000000004', res, 'Music Café', maple_aud, '{2}', '14:00', 60, current_date - 30),
         ('a0000000-0000-4000-8000-000000000005', res, 'Memory Care Music', birch_lounge, '{4}', '10:30', 45, current_date - 30)
  on conflict (id) do nothing;
  insert into public.series_default_person (series_id, person_id)
  values ('a0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001'),
         ('a0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002'),
         ('a0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003')
  on conflict do nothing;
end $$;
