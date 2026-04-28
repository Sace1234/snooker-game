alter table public.frames enable row level security;

create policy "Frames are viewable by everyone"
  on public.frames for select using (true);

create policy "Authenticated users can insert frames"
  on public.frames for insert with check (auth.uid() = player1_id);
