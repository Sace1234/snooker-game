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
