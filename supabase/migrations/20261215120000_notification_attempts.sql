-- Email readiness (Ryan's side, Nov 22, 2026): count delivery attempts so a
-- message that keeps failing (a mistyped address, say) stops after a few
-- tries instead of being retried forever. The admin Outbox shows the error.
-- (Timestamp 20261215 leaves 20261214 for Lauren's #56.)

alter table public.notification add column attempts integer not null default 0 check (attempts >= 0);
comment on column public.notification.attempts is
  'Delivery attempts that failed. Delivery stops after 5 (lib/notify.ts, MAX_ATTEMPTS).';
