-- RLS policies define which rows are visible; these grants let authenticated
-- application users access the roster tables through the Supabase API.
grant select on table public.details, public.assignments, public.profiles to authenticated;
