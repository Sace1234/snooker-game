-- Profiles (one per registered user)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Frames (completed games)
create table public.frames (
  id uuid default gen_random_uuid() primary key,
  player1_id uuid references public.profiles(id) not null,
  player1_name text not null,
  player2_name text not null,
  player1_score integer not null default 0,
  player2_score integer not null default 0,
  winner text check (winner in ('player1', 'player2', 'draw')),
  played_at timestamptz default now() not null
);

alter table public.frames enable row level security;

create policy "Frames are viewable by everyone"
  on public.frames for select using (true);

create policy "Authenticated users can insert frames"
  on public.frames for insert with check (auth.uid() = player1_id);
