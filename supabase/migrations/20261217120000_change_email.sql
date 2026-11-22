-- v0.32 (Lauren, Nov 22, 2026): admins may change anyone's email (a typo in
-- the import, or someone asking for a new address), before or after they've
-- signed in. If they've signed in, a notice goes to the old and new address.
--
-- The change goes through the server (Admin → People → Change email), which
-- updates the sign-in account first and then this row with the service key.
-- So the rule here is: email changes only without a signed-in caller (the
-- server's admin task); nobody changes an email straight from the browser.

create or replace function public.person_guard_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'id and created_at cannot be changed'
      using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    if (select auth.uid()) is not null then
      raise exception 'change an email with Change email on the person''s page'
        using errcode = '42501';
    end if;
  end if;

  -- The service role (server-side admin tasks) and SQL editor have no auth.uid().
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.name            is distinct from old.name
       or new.employment_type is distinct from old.employment_type
       or new.system_roles    is distinct from old.system_roles
       or new.job_title       is distinct from old.job_title
       or new.active          is distinct from old.active
       or new.certified_on    is distinct from old.certified_on then
      raise exception 'only admins can change that field'
        using errcode = '42501';
    end if;
  end if;

  -- An admin can't remove their own admin role or deactivate themselves,
  -- so Iris can't be locked out by accident.
  if old.id = (select auth.uid())
     and ('admin' = any (old.system_roles))
     and (not ('admin' = any (new.system_roles)) or not new.active) then
    raise exception 'admins cannot remove their own admin role or deactivate themselves'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
