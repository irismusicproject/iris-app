-- D20 part 3 (Ryan, Nov 27, 2026): no "Make No Program" button. Typing
-- "No Program" as a date's title (any capitals, spaces or punctuation) makes
-- the date No Program, exactly as the button did: schedule_state = canceled,
-- so it isn't paid or billed, and the partner calendar prints "No Program".
-- The reason is "other" (only "partner" is ever billable). Typing a different
-- title on such a date restores it as a draft.
--
-- This trigger only turns the title into the state change. It runs before the
-- existing guards (triggers run in name order: session_a0_ < session_aa_ <
-- session_canceled_at_guard < session_guard < session_month_rules), so the
-- same people as before may do it: whoever may edit the title and may make the
-- date No Program; restoring stays with the Lead Musician, the Iris
-- Supervisor and admins.

create or replace function public.is_no_program_title(p_title text)
returns boolean language sql immutable set search_path = ''
as $$ select regexp_replace(lower(coalesce(p_title, '')), '[^a-z]', '', 'g') = 'noprogram' $$;

create or replace function public.session_no_program_title()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.title is distinct from old.title then
    if public.is_no_program_title(new.title) and old.schedule_state <> 'canceled' then
      new.title := 'No Program';
      new.schedule_state := 'canceled';
      new.cancellation_reason := coalesce(new.cancellation_reason, 'other');
    elsif old.schedule_state = 'canceled' and new.schedule_state = 'canceled'
          and public.is_no_program_title(old.title) and not public.is_no_program_title(new.title) then
      new.schedule_state := 'draft';
      new.cancellation_reason := null;
      new.canceled_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists session_a0_no_program_title on public.session;
create trigger session_a0_no_program_title before update on public.session
  for each row execute function public.session_no_program_title();

-- The Iris Supervisor's "No Program" email fired only when schedule_state was
-- in the update itself; a typed title changes it inside the trigger above, so
-- the email trigger now watches the title too (same condition, same email).
drop trigger if exists notify_no_program on public.session;
create trigger notify_no_program after update of schedule_state, title on public.session
  for each row when (new.schedule_state = 'canceled' and old.schedule_state is distinct from 'canceled')
  execute function public.notify_no_program();
