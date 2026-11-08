-- Isolated helper state; no changes to cinema or screening tables.
create table public.scraper_builder_sessions (
    id text primary key check (id ~ '^[a-f0-9]{64}$'),
    payload text not null,
    expires_at timestamptz not null,
    lock_id uuid,
    locked_until timestamptz not null default '1970-01-01T00:00:00Z'
);
create index scraper_builder_sessions_expiry on public.scraper_builder_sessions(expires_at);
create table public.scraper_builder_validations (
    id uuid primary key,
    session_id text not null references public.scraper_builder_sessions(id) on delete cascade,
    config jsonb not null,
    result jsonb not null,
    base_sha text not null,
    state text not null check (state in ('ready', 'submitting', 'submitted', 'failed')),
    submitted jsonb,
    expires_at timestamptz not null
);
create index scraper_builder_validations_expiry on public.scraper_builder_validations(expires_at);
create table public.scraper_builder_rate_limits (
    key text primary key,
    calls integer not null,
    expires_at timestamptz not null
);

alter table public.scraper_builder_sessions enable row level security;
alter table public.scraper_builder_validations enable row level security;
alter table public.scraper_builder_rate_limits enable row level security;
revoke all on public.scraper_builder_sessions, public.scraper_builder_validations, public.scraper_builder_rate_limits from public, anon, authenticated;
grant all on public.scraper_builder_sessions, public.scraper_builder_validations, public.scraper_builder_rate_limits to service_role;

create function public.scraper_builder_rate_limit(bucket text, max_calls integer, window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
    if length(bucket) > 150 or max_calls < 1 or max_calls > 2000 or window_seconds < 1 or window_seconds > 86400 then
        raise exception 'Invalid rate limit';
    end if;
    delete from public.scraper_builder_sessions where expires_at < now();
    delete from public.scraper_builder_validations where expires_at < now();
    delete from public.scraper_builder_rate_limits where expires_at < now();
    insert into public.scraper_builder_rate_limits(key, calls, expires_at)
    values (bucket, 1, now() + make_interval(secs => window_seconds))
    on conflict (key) do update set
        calls = public.scraper_builder_rate_limits.calls + 1
    returning calls into used;
    return used <= max_calls;
end;
$$;
revoke all on function public.scraper_builder_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.scraper_builder_rate_limit(text, integer, integer) to service_role;
