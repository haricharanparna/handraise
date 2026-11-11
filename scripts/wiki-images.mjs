// wiki-images.mjs: for orgs whose own site gave no preview image, look for a freely licensed
// image on their Wikipedia article (official Wikipedia REST API). Only exact-ish title matches are used.
import { readFile, writeFile } from 'node:fs/promises';
const UA = { 'User-Agent': 'Handraise/1.0 (student volunteering project)' };
const file = new URL('./orgs.verified.json', import.meta.url);
const orgs = JSON.parse(await readFile(file, 'utf8'));
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(the|of|and)\b/g, '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const o of orgs.filter(o => !o.image_url)) {
  await sleep(2500);
  try {
  const s = await fetch('https://en.wikipedia.org/w/api.php?action=opensearch&limit=3&format=json&search=' + encodeURIComponent(o.name), { headers: UA }).then(r => r.json());
  const title = (s[1] || []).find(t => norm(t) === norm(o.name) || norm(t).startsWith(norm(o.name)));
  if (!title) { console.log('--  ', o.name); continue; }
  const sum = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title), { headers: UA }).then(r => r.json());
  await sleep(1500);
  const img = (sum.thumbnail?.source || '').split('?')[0];
  if (img) { o.image_url = img; o.image_credit = 'Wikipedia: ' + title; }
  console.log(img ? 'IMG ' : 'no  ', o.name, '->', title, img ? img.split('/').pop() : '');
  } catch (e) { console.log('ERR ', o.name, e.message.slice(0, 60)); }
}
await writeFile(file, JSON.stringify(orgs, null, 2));
