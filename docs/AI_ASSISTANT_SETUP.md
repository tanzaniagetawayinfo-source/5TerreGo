# 5TerreGo multilingual AI assistant

This branch replaces the placeholder AI reply in the global action bar with a grounded assistant that reads 5TerreGo content and checks transport data.

## What it covers

- articles and guide content;
- discounts stored in Supabase;
- trails and official notices;
- ferry and bus timetable pages or PDFs;
- the existing `/api/trains/realtime` endpoint for live train questions;
- replies in Italian, English, French, German and Chinese.

## Architecture

- `assets/ftg-ai-client.js`: connects the existing AI panel to `/api/ai/chat`.
- `functions/global-actionbar.html.js`: injects the client without rewriting the large actionbar partial.
- `functions/api/ai/chat.js`: Cloudflare Workers AI chat endpoint with RAG and live train lookup.
- `functions/api/ai/reindex.js`: protected indexer for web pages, PDFs and Supabase tables.
- `supabase/migrations/20260718_ai_knowledge.sql`: pgvector table and similarity RPC.
- `.github/workflows/ai-reindex.yml`: daily refresh.

## Cloudflare Pages configuration

Add a Workers AI binding named `AI`.

Add encrypted variables for Production and Preview:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_ADMIN_TOKEN` (random value, at least 24 characters)

Optional:

- `AI_CHAT_MODEL` (default `@cf/meta/llama-3.1-8b-instruct-fast`)
- `AI_EMBED_MODEL` (default `@cf/qwen/qwen3-embedding-0.6b`)
- `AI_ALLOWED_HOSTS` for extra official timetable domains

Never expose the Supabase service-role key in browser JavaScript.

## Supabase

Run `supabase/migrations/20260718_ai_knowledge.sql` in the SQL editor or through the Supabase CLI.

The knowledge table has RLS enabled and is available only to the server-side service role.

## GitHub Actions

Add repository secrets:

- `AI_REINDEX_URL=https://www.5terrego.com/api/ai/reindex`
- `AI_ADMIN_TOKEN` equal to the Cloudflare secret

Run **Refresh AI knowledge** once manually. It then runs daily at 03:17 UTC.

Edit `ai-sources.json` to add exact official ferry or bus timetable URLs. For seasonal schedules include `valid_from` and `valid_to`, for example:

```json
{
  "url": "https://official.example/timetable.pdf",
  "kind": "ferry_schedule",
  "language": "it",
  "valid_from": "2026-04-20",
  "valid_to": "2026-09-27"
}
```

## Accuracy and safety

The assistant is instructed not to invent schedules, trail status, discounts, prices or delays. Train data is labelled live; ferry and bus data is treated as scheduled unless the indexed source explicitly says it is live. The API also applies same-origin checks, message limits, a basic rate limit and a protected reindex endpoint.
