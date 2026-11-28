-- STAGING ONLY (Ryan, Nov 27, 2026): clear every partner, building, room,
-- contract, program, season, roster, weekly program and date, and everything
-- hanging off them (documentation, hours, invoices, calendars, residents,
-- requests), so a new location and program can be set up from scratch.
-- People, logins, settings and the edited lists (interaction types, time
-- categories) stay. Run only by the "clear-staging-programs" task of the
-- Database migrations workflow, which has staging's DATABASE_URL only.
begin;
truncate table public.partner, public.site, public.residency cascade;
commit;
