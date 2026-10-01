"""One-time migration; keep originals and generate responsive display copies."""
import json, re
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
if (root / 'content' / 'gallery.json').exists():
    raise SystemExit('Migration is already complete. Use the admin to edit content; this tool will not overwrite it.')
photos = []
seen = set()
landscape = {'MTL_X.jpg', 'CNT_626R.jpg', 'YVR_BOAT.jpg', 'BDR_JN1_WEB.jpg', 'BDR_JL14-8R.jpg', 'YYZ_DT_X.jpg', 'Slr_EcpRE.jpg'}
wildlife = {'NF436.jpg', 'NF736.jpg', 'OspreyK.jpg', 'EN_NSRT-2EHC.jpg'}
for page, default_category in [('index.html', 'aviation'), ('ptr.html', 'portrait')]:
    html = (root / page).read_text(encoding='utf-8')
    for name in re.findall(r'<img\b[^>]*\bsrc\s*=\s*[\"\']assets/([^\"\']+)', html, re.I):
        path = root / 'assets' / name
        if name in seen or not path.exists() or path.suffix.lower() != '.jpg':
            continue
        seen.add(name)
        category = 'landscape' if name in landscape else 'wildlife' if name in wildlife else default_category
        photo_id = re.sub(r'[^a-z0-9]+', '-', path.stem.lower()).strip('-')
        with Image.open(path) as original:
            image = ImageOps.exif_transpose(original).convert('RGB')
            width, height = image.size
            for size in [640, 1280, 1920]:
                copy = image.copy()
                copy.thumbnail((size, size))
                destination = root / 'media' / f'{photo_id}-{size}.webp'
                destination.parent.mkdir(exist_ok=True)
                copy.save(destination, 'WEBP', quality=83, method=6)
        photos.append({'id': photo_id, 'title': path.stem.replace('_', ' ').replace('-', ' '),
            'alt': f'{category.capitalize()} photograph by Mingyao Li — {path.stem}',
            'category': category, 'image': f'assets/{name}',
            'thumbnail': f'media/{photo_id}-640.webp', 'display': f'media/{photo_id}-1280.webp',
            'large': f'media/{photo_id}-1920.webp', 'width': width, 'height': height,
            'published': True, 'featured': name == 'AF1CvrR.jpg'})

data = {'version': 1, 'site': {'name': 'Mingyao Li', 'tagline': 'Photography',
    'location': 'Montréal, Canada', 'intro': 'A different way of seeing.',
    'description': 'Aircraft in motion. Quiet landscapes. People, as they are. A collection of moments through my lens.',
    'email': 'MingyaoLee520@gmail.com', 'aboutTitle': "Hello, I’m Mingyao.",
    'about': 'I’m a Montréal-based photographer with years of experience capturing beautiful moments. Alongside landscape and portrait photography, I am passionate about aviation. Whether photographing a commercial airliner or a warbird, I love the challenge of capturing the speed, power and grace of these amazing machines.',
    'aboutImage': 'assets/MYL_PTR-13R2_4K.jpg',
    'gear': 'FUJIFILM X-H2S · FUJINON XF10–24mm, XF16–55mm, XF50–140mm, XF90mm, XF200mm · XF1.4X / XF2X teleconverters · SIGMA 56mm',
    'socials': [
        {'label': 'Instagram', 'url': 'https://instagram.com/myl_yul'},
        {'label': 'JetPhotos', 'url': 'https://www.jetphotos.com/photographer/240672'},
        {'label': 'Facebook', 'url': 'https://www.facebook.com/profile.php?id=100028061147610'},
        {'label': 'X', 'url': 'https://twitter.com/Mingyao_Li_'}]},
    'categories': [{'id': 'aviation', 'label': 'Aviation'}, {'id': 'landscape', 'label': 'Landscapes'},
                   {'id': 'portrait', 'label': 'Portraits'}, {'id': 'wildlife', 'label': 'Wildlife'}],
    'photos': photos}
(root / 'content').mkdir(exist_ok=True)
(root / 'content' / 'gallery.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Migrated {len(photos)} photographs; original files preserved.')
