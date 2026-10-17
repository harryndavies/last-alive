-- Scheduled jobs via pg_cron.
create extension if not exists pg_cron with schema pg_catalog;

-- Every 5 minutes: auto-confirm claims older than 12 hours.
select cron.schedule(
  'last-alive-auto-confirm-kills',
  '*/5 * * * *',
  $$select private.auto_confirm_expired_kills()$$
);

-- Daily at 03:17 UTC: delete finished games older than 7 days.
select cron.schedule(
  'last-alive-cleanup-games',
  '17 3 * * *',
  $$select private.cleanup_old_games()$$
);
