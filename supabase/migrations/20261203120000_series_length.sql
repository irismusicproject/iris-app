-- Program length set once (DOMAIN-MODEL v0.20; decided by Lauren Nov 22,
-- 2026). The point person or an admin sets a weekly or monthly program's
-- length (series.minutes). Changing it updates every date of that program
-- that hasn't been documented yet, past or future; documented dates keep the
-- length their leader recorded. Musicians no longer type the length when
-- documenting; they change it only if the session ran longer or shorter.
--
-- Only people allowed to update the series (planners, by its RLS policy) can
-- fire this, so the trigger can update the sessions on their behalf.

create function public.series_length_to_sessions()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.session se
     set scheduled_minutes = new.minutes
   where se.series_id = new.id
     and se.has_set_time
     and se.schedule_state <> 'canceled'
     and se.scheduled_minutes is distinct from new.minutes
     and not exists (select 1 from public.session_report r where r.session_id = se.id);
  return new;
end;
$$;
revoke all on function public.series_length_to_sessions() from public, anon, authenticated;

create trigger series_length_to_sessions
  after update of minutes on public.series
  for each row
  when (new.minutes is not null and new.minutes is distinct from old.minutes)
  execute function public.series_length_to_sessions();
