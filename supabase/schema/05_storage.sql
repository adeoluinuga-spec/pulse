-- ═══════════════════════════════════════════════════════════════
-- PULSE DATABASE — CHUNK 5 OF 5: STORAGE BUCKETS
-- Run after 04_seed.sql in the Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════

-- ── Documents bucket (private, RLS-protected) ────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760, -- 10 MB
  array['application/pdf','image/jpeg','image/png','image/webp','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

-- ── Avatars bucket (public read, authenticated write) ────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- ── Storage RLS: documents ───────────────────────────────────────────────────
create policy "documents_upload_own"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = auth_employee_id()::text
  );

create policy "documents_read_own_or_hr"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[2] = auth_employee_id()::text
      or auth_is_hr()
    )
  );

create policy "documents_delete_hr"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and auth_is_hr()
  );

-- ── Storage RLS: avatars ─────────────────────────────────────────────────────
create policy "avatars_upload_own"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth_employee_id()::text
  );

create policy "avatars_update_own"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth_employee_id()::text
  );

create policy "avatars_read_public"
  on storage.objects for select
  using (bucket_id = 'avatars');
