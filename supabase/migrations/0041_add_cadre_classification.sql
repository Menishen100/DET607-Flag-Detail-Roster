-- Cadre are roster accounts, not flag-detail participants. Their access is
-- controlled separately through admin_level (for example, SUPER_ADMIN).
alter type public.cadet_type add value if not exists 'CADRE';
alter type public.user_role add value if not exists 'CADRE';
