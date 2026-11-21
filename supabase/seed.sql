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
