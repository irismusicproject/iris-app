-- Who plays on published dates, and deleting one-time dates
-- (DOMAIN-MODEL v0.37; Lauren, Nov 22, 2026).
--
-- 1. Published dates (decided in v0.18/v0.28, now built for who plays): the
--    point person, admins and the Admin Lead can add and remove musicians and
--    set the leader on a published date. (Adding was already open to the
--    point person and admins; removing was drafts-only, and the Admin Lead
--    had no rule at all.) Approved weeks stay final (session_assignment
--    approved guard, v0.29).
-- 2. Deleting a one-time date (a special event, or another one-time program):
--    the point person and admins, like deleting a weekly program (v0.34).
--    Refused once it's documented, has relationship building logged against
--    it, or is in an approved week; then "No Program" is the way. Removals
--    are written to audit_log.
--
-- Additive only: new policies and one function.

create policy "session_assignment: admin lead adds to published dates" on public.session_assignment
  for insert to authenticated
  with check (status = 'assigned' and exists (
    select 1 from public.session ss
    where ss.id = session_assignment.session_id and ss.schedule_state = 'published'
      and (select public.is_current_admin_lead(ss.residency_id))));

create policy "session_assignment: admin lead sets leaders on published dates" on public.session_assignment
  for update to authenticated
  using (exists (
    select 1 from public.session ss
    where ss.id = session_assignment.session_id and ss.schedule_state = 'published'
      and (select public.is_current_admin_lead(ss.residency_id))))
  with check (true);

create policy "session_assignment: remove from published dates" on public.session_assignment
  for delete to authenticated
  using (exists (
    select 1 from public.session ss
    where ss.id = session_assignment.session_id and ss.schedule_state = 'published'
      and ((select public.can_schedule(ss.residency_id))
           or (select public.is_current_admin_lead(ss.residency_id)))));

-- Delete a one-time date. Returns nothing; raises with a reason when refused.
create function public.delete_one_time_session(p_session uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare se public.session;
begin
  select * into se from public.session where id = p_session;
  if not found or not public.can_schedule(se.residency_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if se.series_id is not null then
    raise exception 'this date belongs to a weekly program; end or delete the program instead' using errcode = '23514';
  end if;
  if exists (select 1 from public.session_report where session_id = p_session) then
    raise exception 'this event is documented; make it No Program instead' using errcode = '23514';
  end if;
  if exists (select 1 from public.relationship_activity where session_id = p_session) then
    raise exception 'relationship building is logged on this event; make it No Program instead' using errcode = '23514';
  end if;
  if public.is_session_in_approved_week(p_session) then
    raise exception 'this event is in an approved week; make it No Program instead' using errcode = '23514';
  end if;
  perform public.remove_session(p_session);
end;
$$;
revoke all on function public.delete_one_time_session(uuid) from public, anon;
grant execute on function public.delete_one_time_session(uuid) to authenticated;
