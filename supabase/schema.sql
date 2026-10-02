-- Run in a new Supabase project. No password or service key belongs in this file.
begin;

create table public.gallery_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.gallery_admins enable row level security;
revoke all on public.gallery_admins from anon, authenticated;

create function public.is_gallery_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.gallery_admins where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_gallery_admin() from public, anon;
grant execute on function public.is_gallery_admin() to authenticated;

create table public.gallery_settings (
  id boolean primary key default true check (id),
  version bigint not null default 1 check (version >= 1),
  site jsonb not null check (jsonb_typeof(site) = 'object'),
  check (site ? 'aboutImage' and jsonb_typeof(site -> 'aboutImage') = 'string'
    and (site ->> 'aboutImage') ~* '^(assets|media)/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp)$'
    and position('..' in (site ->> 'aboutImage')) = 0)
);
create table public.gallery_categories (
  id text primary key check (id ~ '^[a-z0-9-]+$' and id <> 'all'),
  label text not null check (length(trim(label)) between 1 and 80),
  position integer not null check (position >= 0),
  unique (position) deferrable initially deferred
);
create table public.gallery_photos (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  category text not null references public.gallery_categories(id),
  title text not null check (length(trim(title)) between 1 and 180),
  alt text not null check (length(trim(alt)) between 1 and 1000),
  width integer not null check (width between 1 and 16000),
  height integer not null check (height between 1 and 16000),
  placement text not null default 'gallery' check (placement in ('gallery', 'hero')),
  published boolean not null default false,
  home_selected boolean not null default false,
  featured boolean not null default false,
  position integer not null check (position >= 0),
  image text not null,
  thumbnail text,
  display text,
  large text,
  unique (position) deferrable initially deferred,
  check (image ~* '^(assets|media)/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp)$' and position('..' in image) = 0),
  check (thumbnail is null or (thumbnail ~* '^(assets|media)/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp)$' and position('..' in thumbnail) = 0)),
  check (display is null or (display ~* '^(assets|media)/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp)$' and position('..' in display) = 0)),
  check (large is null or (large ~* '^(assets|media)/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp)$' and position('..' in large) = 0))
);
create index gallery_photos_category_order on public.gallery_photos(category, position);
create table public.gallery_originals (
  photo_id text primary key references public.gallery_photos(id) on delete cascade,
  path text not null check (path ~* '^(assets|media)/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp)$' and position('..' in path) = 0)
);

alter table public.gallery_settings enable row level security;
alter table public.gallery_categories enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.gallery_originals enable row level security;
revoke all on public.gallery_settings, public.gallery_categories, public.gallery_photos, public.gallery_originals from anon, authenticated;
grant select on public.gallery_settings, public.gallery_categories, public.gallery_photos to anon;
grant select, insert, update, delete on public.gallery_settings, public.gallery_categories, public.gallery_photos, public.gallery_originals to authenticated;

create policy settings_read on public.gallery_settings for select to anon, authenticated using (true);
create policy categories_read on public.gallery_categories for select to anon, authenticated using (true);
create policy photos_public_read on public.gallery_photos for select to anon using (published);
create policy photos_signed_in_read on public.gallery_photos for select to authenticated using (published or public.is_gallery_admin());
create policy settings_admin_write on public.gallery_settings for all to authenticated using (public.is_gallery_admin()) with check (public.is_gallery_admin());
create policy categories_admin_write on public.gallery_categories for all to authenticated using (public.is_gallery_admin()) with check (public.is_gallery_admin());
create policy photos_admin_write on public.gallery_photos for all to authenticated using (public.is_gallery_admin()) with check (public.is_gallery_admin());
create policy originals_admin_only on public.gallery_originals for all to authenticated using (public.is_gallery_admin()) with check (public.is_gallery_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('gallery-images', 'gallery-images', false, 26214400, array['image/jpeg', 'image/png', 'image/webp']),
  ('gallery-originals', 'gallery-originals', false, 26214400, array['image/jpeg', 'image/png', 'image/webp']);

create policy gallery_published_images on storage.objects for select to anon, authenticated using (
  bucket_id = 'gallery-images' and (
    exists (select 1 from public.gallery_photos p where p.published and storage.objects.name in (p.image, p.thumbnail, p.display, p.large))
    or exists (select 1 from public.gallery_settings s where storage.objects.name = (s.site ->> 'aboutImage'))
  )
);
create policy gallery_admin_media on storage.objects for all to authenticated
using (bucket_id in ('gallery-images', 'gallery-originals') and public.is_gallery_admin())
with check (bucket_id in ('gallery-images', 'gallery-originals') and public.is_gallery_admin());

-- Add an administrator AFTER creating that user in Auth, through the project SQL editor:
-- insert into public.gallery_admins(user_id) values ('AUTH-USER-UUID');
commit;
