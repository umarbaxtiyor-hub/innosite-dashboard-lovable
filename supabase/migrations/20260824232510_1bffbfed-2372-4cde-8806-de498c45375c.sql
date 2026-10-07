revoke all on schema cron from anon, authenticated;
revoke all on all tables in schema cron from anon, authenticated;
revoke all on all functions in schema cron from anon, authenticated;

revoke execute on function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) from anon, authenticated;
revoke execute on function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) from anon, authenticated;
revoke all on all functions in schema net from anon, authenticated;
revoke all on all tables in schema net from anon, authenticated;
revoke usage on schema net from anon, authenticated;