-- Collaboration target per season (DOMAIN-MODEL "Target", v0.19; decided by
-- Lauren Nov 22, 2026). Collab? on a session report is now Yes/No, and every
-- "Yes" counts as collaborative (stored as co_led). The number of
-- collaborative programs expected of each musician per season defaults to the
-- handbook's 2, and the point person or an admin can change it per program
-- and season.

create table public.target (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references public.season (id) on delete cascade,
  metric     text not null check (metric in ('collaborative_programs_per_musician')),
  value      integer not null check (value between 0 and 100),
  updated_at timestamptz not null default now(),
  unique (season_id, metric)
);
create trigger target_set_updated_at before update on public.target for each row execute function public.set_updated_at();
create trigger target_audit after insert or update on public.target for each row execute function public.write_audit_log();

alter table public.target enable row level security;
revoke all on public.target from anon, authenticated;
grant select, insert, update on public.target to authenticated;
create policy "target: residency people read" on public.target for select to authenticated
  using ((select public.can_view_residency((select s.residency_id from public.season s where s.id = target.season_id))));
create policy "target: planners add" on public.target for insert to authenticated
  with check ((select public.can_schedule((select s.residency_id from public.season s where s.id = target.season_id))));
create policy "target: planners update" on public.target for update to authenticated
  using ((select public.can_schedule((select s.residency_id from public.season s where s.id = target.season_id))))
  with check ((select public.can_schedule((select s.residency_id from public.season s where s.id = target.season_id))));
