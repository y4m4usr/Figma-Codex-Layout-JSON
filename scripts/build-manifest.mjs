import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const pubDir = 'public/assets/images';
const layoutsDir = 'public/layouts';

function contentHash(buf){ return createHash('md5').update(buf).digest('hex').slice(0,8); }

const files = await fs.readdir(pubDir);
const map = {}; // id -> { png:[sizes], webp:[sizes], avif:[sizes] }

for (const f of files) {
  const p = path.join(pubDir,f);
  const stat = await fs.stat(p);
  if (!stat.isFile()) continue;
  const buf = await fs.readFile(p);
  const hash = contentHash(buf);
  const ext = path.extname(f); const base = path.basename(f, ext);
  const hashed = `${base}.${hash}${ext}`;
  await fs.rename(p, path.join(pubDir, hashed));
  const id = base.replace(/\.\d+$/,''); // "name.640" -> "name"
  map[id] ||= { png:[], webp:[], avif:[] };
  if(ext==='.png') map[id].png.push(hashed);
  if(ext==='.webp') map[id].webp.push(hashed);
  if(ext==='.avif') map[id].avif.push(hashed);
}

const owner = process.env.GITHUB_REPOSITORY_OWNER;
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const baseUrl = `https://${owner}.github.io/${repo}/assets/images`;

const manifest = { images: [] };
for (const [id, v] of Object.entries(map)) {
  const pick = (arr)=>arr.sort((a,b)=>b.localeCompare(a))[0];
  const toUrl = (name)=>`${baseUrl}/${name}`;
  const png = pick(v.png);
  const webp = pick(v.webp);
  const avif = pick(v.avif);
  manifest.images.push({
    id,
    src: png ? toUrl(png) : undefined,
    src_webp: webp ? toUrl(webp) : undefined,
    src_avif: avif ? toUrl(avif) : undefined,
    srcset_png: v.png.map(toUrl),
    srcset_webp: v.webp.map(toUrl),
    srcset_avif: v.avif.map(toUrl)
  });
}
await fs.writeFile('public/image-manifest.json', JSON.stringify(manifest,null,2));

const layouts = await fs.readdir(layoutsDir);
for (const f of layouts) {
  if(!f.endsWith('.json')) continue;
  const p = path.join(layoutsDir,f);
  const data = JSON.parse(await fs.readFile(p,'utf8'));
  for (const c of data.components || []) {
    if (c.type === 'image') {
      const ent = manifest.images.find(x=>x.id===c.id);
      if (ent) {
        c.src = ent.src; c.src_webp = ent.src_webp; c.src_avif = ent.src_avif;
        c.srcset = { png: ent.srcset_png, webp: ent.srcset_webp, avif: ent.srcset_avif };
      }
    }
  }
  await fs.writeFile(p, JSON.stringify(data,null,2));
}
