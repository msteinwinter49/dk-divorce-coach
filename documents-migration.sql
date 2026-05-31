-- Documents feature migration
-- Run in Supabase Dashboard > SQL Editor > New Query

-- Drop old placeholder table (no live data)
drop table if exists public.documents cascade;

-- ============================================
-- DOCUMENTS (practice library)
-- ============================================
create table public.documents (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text not null check (type in ('file', 'form')),
  storage_path text,
  form_definition jsonb,
  file_extension text,
  file_size_bytes bigint,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.documents enable row level security;

create policy "Admin full access on documents"
  on public.documents for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Clients can read own uploads"
  on public.documents for select
  using (created_by = auth.uid());

-- ============================================
-- DOCUMENT SHARES (admin→client + client uploads)
-- ============================================
create table public.document_shares (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references public.documents(id) on delete cascade not null,
  client_id uuid references public.profiles(id) on delete cascade not null,
  shared_by uuid references public.profiles(id) on delete set null,
  shared_at timestamptz default now(),
  client_upload boolean default false,
  require_acknowledgment boolean default false,
  acknowledgment_label text,
  acknowledged_at timestamptz,
  require_completion boolean default false,
  completed_at timestamptz,
  submission_data jsonb,
  unique (document_id, client_id)
);

alter table public.document_shares enable row level security;

create policy "Admin full access on document_shares"
  on public.document_shares for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Clients can read own shares"
  on public.document_shares for select
  using (client_id = auth.uid());

create policy "Clients can update own shares"
  on public.document_shares for update
  using (client_id = auth.uid());
