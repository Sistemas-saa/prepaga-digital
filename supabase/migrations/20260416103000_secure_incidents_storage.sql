INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'incidents',
  'incidents',
  false,
  10485760,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS incidents_storage_select ON storage.objects;
CREATE POLICY incidents_storage_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'incidents'
  AND (storage.foldername(name))[1] = 'incidents'
  AND EXISTS (
    SELECT 1
    FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[2]
      AND i.company_id = public.get_user_company_id(auth.uid())
  )
);

DROP POLICY IF EXISTS incidents_storage_insert ON storage.objects;
CREATE POLICY incidents_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'incidents'
  AND (storage.foldername(name))[1] = 'incidents'
  AND EXISTS (
    SELECT 1
    FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[2]
      AND i.company_id = public.get_user_company_id(auth.uid())
  )
);

DROP POLICY IF EXISTS incidents_storage_update ON storage.objects;
CREATE POLICY incidents_storage_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'incidents'
  AND (storage.foldername(name))[1] = 'incidents'
  AND EXISTS (
    SELECT 1
    FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[2]
      AND i.company_id = public.get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'incidents'
  AND (storage.foldername(name))[1] = 'incidents'
  AND EXISTS (
    SELECT 1
    FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[2]
      AND i.company_id = public.get_user_company_id(auth.uid())
  )
);

DROP POLICY IF EXISTS incidents_storage_delete ON storage.objects;
CREATE POLICY incidents_storage_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'incidents'
  AND (storage.foldername(name))[1] = 'incidents'
  AND EXISTS (
    SELECT 1
    FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[2]
      AND i.company_id = public.get_user_company_id(auth.uid())
  )
);
