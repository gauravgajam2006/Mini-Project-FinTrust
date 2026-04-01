-- Create a table for public profiles
create table profiles (
  id uuid references auth.users not null primary key,
  email text,
  name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table profiles enable row level security;

-- Create policies for profiles
create policy "Public profiles are viewable by everyone." on profiles
  for select using (true);

create policy "Users can insert their own profile." on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on profiles
  for update using (auth.uid() = id);

-- Create a table for loans
create table loans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  type text not null check (type in ('lent', 'borrowed')),
  amount numeric not null,
  amount_paid numeric default 0,
  currency text default 'INR',
  interest_rate numeric default 0,
  borrower_name text,
  borrower_email text,
  lender_name text,
  lender_email text,
  status text default 'active' check (status in ('active', 'completed', 'overdue')),
  due_date date,
  description text,
  repayment_schedule text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for loans
alter table loans enable row level security;

-- Policy: Users can only see their own loans
create policy "Users can view their involved loans" on loans
  for select using (
    auth.uid() = user_id OR
    lower(borrower_email) = lower((select email from profiles where id = auth.uid())) OR
    lower(lender_email) = lower((select email from profiles where id = auth.uid()))
  );

create policy "Users can insert own loans" on loans
  for insert with check (auth.uid() = user_id);

create policy "Users can update their involved loans" on loans
  for update using (
    auth.uid() = user_id OR
    lower(borrower_email) = lower((select email from profiles where id = auth.uid())) OR
    lower(lender_email) = lower((select email from profiles where id = auth.uid()))
  );

create policy "Users can delete their created loans" on loans
  for delete using (auth.uid() = user_id);

-- Create a table for payments
create table payments (
  id uuid default gen_random_uuid() primary key,
  loan_id uuid references loans(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  amount numeric not null,
  date timestamp with time zone default timezone('utc'::text, now()) not null,
  status text default 'completed',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for payments
alter table payments enable row level security;

create policy "Users can view payments for their involved loans" on payments
  for select using (
    exists (
      select 1 from loans
      where loans.id = payments.loan_id
      and (
        loans.user_id = auth.uid() or
        lower(loans.borrower_email) = lower((select email from profiles where id = auth.uid())) or
        lower(loans.lender_email) = lower((select email from profiles where id = auth.uid()))
      )
    )
  );

create policy "Users can insert payments if involved" on payments
  for insert with check (
    auth.uid() = user_id
  );

-- Create a table for activities
create table activities (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  loan_id uuid references loans(id) on delete set null,
  type text not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for activities
alter table activities enable row level security;

create policy "Users can view own activities" on activities
  for select using (auth.uid() = user_id);

create policy "Users can insert own activities" on activities
  for insert with check (auth.uid() = user_id);

-- Trigger to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
