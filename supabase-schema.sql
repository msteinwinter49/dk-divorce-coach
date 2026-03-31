-- DK Divorce Coach — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================
-- 1. PROFILES (extends auth.users)
-- ============================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  role text not null default 'client' check (role in ('client', 'admin')),
  created_at timestamptz default now()
);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'client');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Admins can read all profiles" on public.profiles for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- ============================================
-- 2. CONTACT SUBMISSIONS (public form)
-- ============================================
create table public.contact_submissions (
  id uuid default gen_random_uuid() primary key,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  process_stage text,
  message text,
  created_at timestamptz default now()
);

alter table public.contact_submissions enable row level security;
create policy "Anyone can insert contact submissions" on public.contact_submissions for insert with check (true);
create policy "Admin can read contact submissions" on public.contact_submissions for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================
-- 3. DOCUMENTS (metadata — files in Storage)
-- ============================================
create table public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  tag text check (tag in ('Resource', 'Notes', 'Admin')),
  storage_path text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table public.documents enable row level security;
create policy "Clients can read own documents" on public.documents for select using (auth.uid() = user_id);
create policy "Admin can read all documents" on public.documents for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Admin can insert documents" on public.documents for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Admin can delete documents" on public.documents for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================
-- 4. AVAILABILITY (Diana's open slots)
-- ============================================
create table public.availability (
  id uuid default gen_random_uuid() primary key,
  date date not null unique,
  slots text[] not null default '{}',
  created_at timestamptz default now()
);

alter table public.availability enable row level security;
create policy "Authenticated can read availability" on public.availability for select using (auth.uid() is not null);
create policy "Admin can manage availability" on public.availability for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================
-- 5. BOOKINGS
-- ============================================
create table public.bookings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  time_slot text not null,
  status text default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz default now(),
  unique(date, time_slot)
);

alter table public.bookings enable row level security;
create policy "Clients can read own bookings" on public.bookings for select using (auth.uid() = user_id);
create policy "Clients can insert bookings" on public.bookings for insert with check (auth.uid() = user_id);
create policy "Admin can read all bookings" on public.bookings for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Admin can update bookings" on public.bookings for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================
-- 6. MESSAGES (with Realtime)
-- ============================================
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid not null,
  sender_id uuid references auth.users(id) not null,
  content text not null,
  created_at timestamptz default now()
);

create index idx_messages_conversation on public.messages(conversation_id, created_at);

alter table public.messages enable row level security;
create policy "Users can read own messages" on public.messages for select using (
  auth.uid() = conversation_id
  or auth.uid() = sender_id
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Users can insert messages" on public.messages for insert with check (
  auth.uid() = sender_id
  and (
    auth.uid() = conversation_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
);

-- Enable Realtime on messages
alter publication supabase_realtime add table public.messages;

-- ============================================
-- AFTER SETUP: Promote Diana to admin
-- ============================================
-- 1. Create Diana's account via Dashboard > Authentication > Add User
-- 2. Find her user ID, then run:
-- update public.profiles set role = 'admin' where id = '<diana-user-id>';

-- ============================================
-- STORAGE: Create a private "documents" bucket
-- ============================================
-- Go to Dashboard > Storage > New Bucket
-- Name: documents
-- Public: OFF (private)
-- Then add policies:
--   Upload: admin only (role = 'admin')
--   Download: users can access paths starting with their own user_id, admin can access all
