create extension if not exists vector with schema extensions;

create table if not exists public.ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  kind text not null,
  title text not null,
  url text,
  language text not null default 'it',
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  valid_from date,
  valid_to date,
  updated_at timestamptz not null default now(),
  embedding extensions.vector(1024)
);

alter table public.ai_knowledge enable row level security;

create index if not exists ai_knowledge_kind_idx on public.ai_knowledge (kind);
create index if not exists ai_knowledge_validity_idx on public.ai_knowledge (valid_from, valid_to);
create index if not exists ai_knowledge_embedding_hnsw_idx on public.ai_knowledge using hnsw (embedding vector_cosine_ops);

create or replace function public.match_ai_knowledge(
  query_embedding extensions.vector(1024),
  match_threshold double precision default 0.18,
  match_count integer default 8,
  filter_kinds text[] default null
)
returns table (
  id uuid,
  source_key text,
  kind text,
  title text,
  url text,
  language text,
  content text,
  metadata jsonb,
  valid_from date,
  valid_to date,
  updated_at timestamptz,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    k.id, k.source_key, k.kind, k.title, k.url, k.language, k.content, k.metadata,
    k.valid_from, k.valid_to, k.updated_at,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.ai_knowledge k
  where k.embedding is not null
    and (filter_kinds is null or k.kind = any(filter_kinds))
    and (1 - (k.embedding <=> query_embedding)) >= match_threshold
  order by k.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_ai_knowledge(extensions.vector, double precision, integer, text[]) from public;
grant execute on function public.match_ai_knowledge(extensions.vector, double precision, integer, text[]) to service_role;
revoke all on table public.ai_knowledge from anon, authenticated;
grant all on table public.ai_knowledge to service_role;
