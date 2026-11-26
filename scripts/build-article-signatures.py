"""Build portable article signatures from original SVG paths and Montserrat 400.

Authoring dependency only: fonttools. Installed plugins use prebuilt SVGs, not Python.
Run --check to compare without writing. No network requests or raster photo edits.
"""
from pathlib import Path
import argparse
import hashlib
import html
import json
import re
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

root = Path(__file__).resolve().parent.parent / 'chatgpt-skill'
directory = root / 'references/Сайт/Референсы/Статьи/Подписи'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
registry = json.loads((directory / 'signatures.json').read_text(encoding='utf-8'))

def inner_svg(relative):
    source = (directory / relative).read_text(encoding='utf-8')
    return re.sub(r'^<svg\b[^>]*>', '', source.strip()).removesuffix('</svg>').strip()

mark = inner_svg(registry['sources']['mark'])
wordmark = inner_svg(registry['sources']['wordmark'])
font = TTFont(directory / registry['sources']['font'])
font = instantiateVariableFont(font, {'wght': 400}, inplace=False)
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
units = font['head'].unitsPerEm

for record in registry['domains']:
    city = record['city']
    pen = SVGPathPen(glyphs)
    advance = 0
    for letter in city:
        glyph_name = cmap[ord(letter)]
        glyphs[glyph_name].draw(TransformPen(pen, (1, 0, 0, 1, advance, 0)))
        advance += font['hmtx'][glyph_name][0]
    size = min(18, 180 * units / advance)
    scale = size / units
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Стройбаза — {html.escape(city, quote=True)}">
<title>Стройбаза — {html.escape(city)}</title>
<g id="article-mark" transform="scale({180/86:.9f})">{mark}</g>
<g id="article-wordmark" transform="translate(0 134) scale({180/699:.9f})">{wordmark}</g>
<g id="article-city" fill="white" transform="translate(0 176) scale({scale:.9f} {-scale:.9f})"><path d="{pen.getCommands()}"/></g>
</svg>
'''
    data = svg.encode('utf-8')
    digest = hashlib.sha256(data).hexdigest()
    target = directory / record['asset']
    if target.parent != directory or target.is_symlink():
        raise ValueError(f'Unsafe asset path: {target}')
    if args.check:
        if not target.is_file() or target.read_bytes() != data or record.get('sha256') != digest:
            raise ValueError(f'Signature differs: {record["domain"]}')
    else:
        if not target.exists() or target.read_bytes() != data:
            target.write_bytes(data)
        record['sha256'] = digest

if not args.check:
    (directory / 'signatures.json').write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f'Article signatures {"checked" if args.check else "built"}: {len(registry["domains"])}; city labels outlined, runtime fonts unnecessary.')
