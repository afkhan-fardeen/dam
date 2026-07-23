-- Allow admins to read any user's favorites (view-as)

drop policy if exists "favorites_select_own" on asset_favorites;
create policy "favorites_select_own" on asset_favorites
  for select using (user_id = auth.uid() or public.is_admin());
