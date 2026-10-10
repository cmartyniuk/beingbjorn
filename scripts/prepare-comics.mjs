import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import sharp from 'sharp';
const root = process.cwd();
const output = path.join(root, 'public/comics');
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
const files = (await fs.readdir('content/strips')).filter(f => f.endsWith('.md')).sort();
const comics = [], numbers = new Set(), slugs = new Set();
const integer = (v, min) => Number.isInteger(v) && v >= min;
for (const file of files) {
  const { data: d, content } = matter(await fs.readFile(path.join('content/strips', file), 'utf8'));
  const fail = message => { throw new Error(file + ': ' + message); };
  if (d.draft !== undefined && typeof d.draft !== 'boolean') fail('draft must be true or false');
  if (d.draft === true) continue;
  if (!d.title || !d.alt || !integer(d.number, 1) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) fail('invalid title, alt, number or slug');
  if (numbers.has(d.number) || slugs.has(d.slug)) fail('duplicate number or slug');
  numbers.add(d.number); slugs.add(d.slug);
  if (typeof d.image !== 'string' || path.basename(d.image) !== d.image || !/\.png$/i.test(d.image)) fail('image must be a PNG filename inside artwork/');
  const source = path.join(root, 'artwork', d.image);
  const meta = await sharp(source).metadata();
  if (meta.width !== d.sourceWidth || meta.height !== d.sourceHeight) fail('source dimensions do not match PNG; remeasure after resizing artwork');
  if (meta.orientation && meta.orientation !== 1) fail('normalize image orientation before measuring');
  if (!Array.isArray(d.panels) || !d.panels.length) fail('panels must contain at least one rectangle');
  const dir = path.join(output, d.slug);
  await fs.mkdir(dir, { recursive: true });
  const base = '/comics/' + d.slug + '/';
  const fullWidth = Math.min(meta.width, 1800);
  await sharp(source).resize({width: fullWidth}).webp({lossless: true}).toFile(path.join(dir, 'full.webp'));
  const panels = [];
  for (const [i, p] of d.panels.entries()) {
    if (!integer(p.x, 0) || !integer(p.y, 0) || !integer(p.width, 1) || !integer(p.height, 1) || p.x + p.width > meta.width || p.y + p.height > meta.height || !p.alt) fail('panel ' + (i + 1) + ' is invalid or out of bounds');
    const widths = [...new Set([360, 720, 1080, p.width].filter(w => w <= p.width))].sort((a,b) => a-b);
    const variants = [];
    for (const width of widths) {
      const name = 'panel-' + (i+1) + '-' + width + '.webp';
      await sharp(source).extract({left:p.x, top:p.y, width:p.width, height:p.height}).resize({width}).webp({lossless:true}).toFile(path.join(dir, name));
      variants.push({width, src:base + name});
    }
    panels.push({...p, variants});
  }
  comics.push({title:d.title, number:d.number, slug:d.slug, alt:d.alt, full:base+'full.webp', fullWidth, fullHeight:Math.round(meta.height*fullWidth/meta.width), panels, transcript:content.trim()});
}
comics.sort((a,b) => a.number-b.number);
await fs.mkdir('src/data', {recursive:true});
await fs.writeFile('src/data/comics.json', JSON.stringify(comics, null, 2));
console.log('Prepared ' + comics.length + ' published strip(s).');
