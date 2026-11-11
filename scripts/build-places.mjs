// build-places.mjs — volunteer opportunities that aren't nonprofits: public libraries, parks departments,
// hospitals, museums, government and university programs. Same checks as build-orgs.mjs:
//   1. Geocodes every street address with OpenStreetMap Nominatim
//   2. Loads every website (proves it's live) and reads its og:image preview photo
// Output: scripts/places.verified.json   Run: node scripts/build-places.mjs
import { writeFile } from 'node:fs/promises';

const UA = 'Handraise-student-hackathon/1.0 (STEMergent Hacks 2026)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const STATE_NAMES = { TX: 'Texas', NY: 'New York', CA: 'California', IL: 'Illinois', WA: 'Washington', CO: 'Colorado', MA: 'Massachusetts', PA: 'Pennsylvania', VA: 'Virginia' };

// [type, name, cause, street address ('' for online programs), website, one-line description, city (when there's no single address)]
const PLACES = [
  // ---- Online, anywhere in the U.S. ----
  ['government', 'National Archives Citizen Archivist', 'education', '', 'https://www.archives.gov/citizen-archivist', 'Volunteers tag and transcribe records held by the U.S. National Archives so anyone can search them.'],
  ['government', 'NASA GLOBE Observer', 'environment', '', 'https://observer.globe.gov/', 'NASA citizen-science app: photograph clouds, trees and land cover to help scientists check satellite data.'],
  ['government', 'USGS National Map Corps', 'environment', '', 'https://edits.nationalmap.gov/tnmcorps/', "Volunteers check and update the locations of schools, fire stations and other buildings on the U.S. Geological Survey's national map."],
  ['research', 'Cornell Lab of Ornithology: eBird', 'environment', '', 'https://ebird.org/', 'Birdwatchers report the birds they see so Cornell University scientists can track bird populations.'],

  // ---- Public libraries (teen volunteer programs) ----
  ['library', 'Austin Public Library', 'education', '710 W Cesar Chavez St, Austin, TX 78701', 'https://library.austintexas.gov/', "Austin's public library system, with teen volunteer roles at the Central Library and branches."],
  ['library', 'New York Public Library', 'education', '476 5th Ave, New York, NY 10018', 'https://www.nypl.org/', 'Public library serving the Bronx, Manhattan and Staten Island, with teen volunteer and tutoring programs.'],
  ['library', 'Los Angeles Public Library', 'education', '630 W 5th St, Los Angeles, CA 90071', 'https://www.lapl.org/', "The city's public library system, with teen volunteers helping at the Central Library and branches."],
  ['library', 'San Francisco Public Library', 'education', '100 Larkin St, San Francisco, CA 94102', 'https://sfpl.org/', "San Francisco's public library, with teen volunteer roles at the Main Library and neighborhood branches."],
  ['library', 'San Diego Public Library', 'education', '330 Park Blvd, San Diego, CA 92101', 'https://www.sandiego.gov/public-library', "The city's public library system, with teen volunteers supporting reading and homework programs."],
  ['library', 'Seattle Public Library', 'education', '1000 4th Ave, Seattle, WA 98104', 'https://www.spl.org/', "Seattle's public library, with teen volunteer and homework help programs."],
  ['library', 'Chicago Public Library', 'education', '400 S State St, Chicago, IL 60605', 'https://www.chipublib.org/', "Chicago's public library system, with teen volunteer roles across its branches."],
  ['library', 'Houston Public Library', 'education', '500 McKinney St, Houston, TX 77002', 'https://houstonlibrary.org/', "Houston's public library system, with teen volunteers helping at the Central Library and branches."],
  ['library', 'Denver Public Library', 'education', '10 W 14th Ave Pkwy, Denver, CO 80204', 'https://www.denverlibrary.org/', "Denver's public library, with teen volunteer roles in reading and tech programs."],
  ['library', 'Boston Public Library', 'education', '700 Boylston St, Boston, MA 02116', 'https://www.bpl.org/', "Boston's public library, with teen volunteer roles at Central Library and branches."],
  ['library', 'Free Library of Philadelphia', 'education', '1901 Vine St, Philadelphia, PA 19103', 'https://www.freelibrary.org/', "Philadelphia's public library system, with teen volunteer and tutoring programs."],

  // ---- City parks departments ----
  ['parks', 'Austin Parks and Recreation', 'environment', '', 'https://www.austintexas.gov/department/parks-and-recreation', 'City department that runs Austin parks, trails and pools, with volunteer cleanup and planting days.', 'Austin, TX'],
  ['parks', 'NYC Parks', 'environment', '', 'https://www.nycgovparks.org/opportunities/volunteer', "New York City's parks department, with volunteer days for planting, cleanup and stewardship.", 'New York, NY'],
  ['parks', 'Chicago Park District', 'environment', '', 'https://www.chicagoparkdistrict.com/', "Runs Chicago's parks and beaches, with volunteer stewardship and cleanup days.", 'Chicago, IL'],
  ['parks', 'Seattle Parks and Recreation', 'environment', '', 'https://www.seattle.gov/parks', "City department that runs Seattle's parks, with volunteer restoration and cleanup events.", 'Seattle, WA'],

  // ---- Hospitals (teen volunteer programs) ----
  ['hospital', "Dell Children's Medical Center", 'health', '4900 Mueller Blvd, Austin, TX 78723', 'https://www.dellchildrens.net/', "Central Texas's children's hospital, with a teen volunteer program."],
  ['hospital', "Texas Children's Hospital", 'health', '6621 Fannin St, Houston, TX 77030', 'https://www.texaschildrens.org/', "Children's hospital in the Texas Medical Center, with volunteer programs for teens."],
  ['hospital', "Seattle Children's Hospital", 'health', '4800 Sand Point Way NE, Seattle, WA 98105', 'https://www.seattlechildrens.org/', "Children's hospital serving Washington, Alaska, Montana and Idaho, with volunteer roles for young people."],

  // ---- Museums (teen volunteer programs) ----
  ['museum', 'Museum of Science, Boston', 'education', '1 Science Park, Boston, MA 02114', 'https://www.mos.org/', 'Hands-on science museum with a teen volunteer program at exhibits and demos.'],
  ['museum', 'Field Museum', 'education', '1400 S DuSable Lake Shore Dr, Chicago, IL 60605', 'https://www.fieldmuseum.org/', "Chicago's natural history museum, with volunteer roles for teens."],
  ['museum', 'Perot Museum of Nature and Science', 'education', '2201 N Field St, Dallas, TX 75201', 'https://www.perotmuseum.org/', 'Science museum in downtown Dallas with a teen volunteer program.'],
  ['museum', 'Thinkery', 'education', '1830 Simond Ave, Austin, TX 78723', 'https://thinkeryaustin.org/', "Austin's children's museum, where teen volunteers help kids explore hands-on science."],

  // ---- Washington, DC and Northern Virginia ----
  ['library', 'Fairfax County Public Library', 'education', '768 Center St, Herndon, VA 20170', 'https://www.fairfaxcounty.gov/library/', "Fairfax County's public library system, with teen volunteer roles at its branches. This is the Herndon Fortnightly branch."],
  ['library', 'Loudoun County Public Library', 'education', '43316 Hay Rd, Ashburn, VA 20147', 'https://library.loudoun.gov/', "Loudoun County's public library system, with teen volunteer roles at its branches. This is the Ashburn branch."],
  ['library', 'DC Public Library', 'education', '901 G St NW, Washington, DC 20001', 'https://www.dclibrary.org/', "Washington, DC's public library, with teen volunteer roles at the MLK Jr. Memorial Library and neighborhood branches."],
  ['parks', 'Fairfax County Park Authority', 'environment', '', 'https://www.fairfaxcounty.gov/parks/', 'Runs the parks, trails and nature centers of Fairfax County, with volunteer roles for teens.', 'Fairfax, VA'],
  ['parks', 'Great Falls Park (National Park Service)', 'environment', '9200 Old Dominion Dr, McLean, VA 22102', 'https://www.nps.gov/grfa/', 'National park along the Potomac River with volunteer trail, cleanup and invasive plant removal days.'],
  ['hospital', 'Inova Fairfax Hospital', 'health', '3300 Gallows Rd, Falls Church, VA 22042', 'https://www.inova.org/', 'Northern Virginia hospital, with a teen volunteer program.'],
  ['hospital', "Children's National Hospital", 'health', '111 Michigan Ave NW, Washington, DC 20010', 'https://www.childrensnational.org/', "Washington, DC's children's hospital, with volunteer roles for young people."],
  ['museum', 'Smithsonian Udvar-Hazy Center', 'education', '14390 Air and Space Museum Pkwy, Chantilly, VA 20151', 'https://airandspace.si.edu/udvar-hazy-center', "The Smithsonian's air and space museum near Dulles Airport, home to the Space Shuttle Discovery."]
];

async function geocode(address) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(address);
  const [hit] = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  return hit ? { lat: +(+hit.lat).toFixed(5), lon: +(+hit.lon).toFixed(5), match: hit.display_name } : null;
}

async function cityGeocode(label) {
  const [city, state] = label.split(',').map(s => s.trim());
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=10&countryCode=US&name=${encodeURIComponent(city)}`);
  const hit = (await res.json()).results?.find(r => r.admin1 === STATE_NAMES[state]);
  return hit ? { lat: +hit.latitude.toFixed(5), lon: +hit.longitude.toFixed(5), match: `${hit.name}, ${hit.admin1}` } : null;
}

async function pageInfo(url) {
  try {
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }, redirect: 'follow', signal: ctrl.signal });
    const html = await res.text();
    const meta = p => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*>`, 'i')) || [])[0];
    const content = tag => tag && (tag.match(/content=["']([^"']+)["']/i) || [])[1];
    let img = content(meta('og:image')) || content(meta('twitter:image'));
    if (img) img = new URL(img.replace(/&amp;/g, '&'), res.url).href;
    return { ok: res.ok, status: res.status, image: img && img.startsWith('https://') ? img : null };
  } catch (e) { return { ok: false, status: String(e.name || e.message) }; }
}

const out = [], problems = [];
for (const [type, name, cause, address, url, blurb, cityOnly] of PLACES) {
  let geo = null, city = null, state = null, zip = null;
  if (address) {
    geo = await geocode(address); await sleep(1100);
    const m = address.match(/,\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?$/);
    if (m) { city = m[1]; state = m[2]; zip = m[3] || null; }
    if (!geo) problems.push(`${name}: address not found (${address})`);
  } else if (cityOnly) {
    geo = await cityGeocode(cityOnly);
    [city, state] = cityOnly.split(',').map(s => s.trim());
    if (!geo) problems.push(`${name}: city not found (${cityOnly})`);
  }
  const page = await pageInfo(url);
  if (!page.ok) problems.push(`${name}: website ${page.status} (${url})`);
  out.push({ type, name, cause, blurb, url, address: address || (cityOnly ? cityOnly : null), city, state, zip,
    lat: geo?.lat ?? null, lon: geo?.lon ?? null, national: !address && !cityOnly,
    image_url: page.image || null, verified_site: page.ok, geo_match: geo?.match || null });
  process.stdout.write(`${geo || (!address && !cityOnly) ? 'OK ' : '?? '}${page.ok ? 'web ' : 'WEB?'} ${page.image ? 'img ' : '--- '} ${name}  ${geo?.match ? '→ ' + geo.match.slice(0, 70) : ''}\n`);
}
await writeFile(new URL('./places.verified.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\n' + out.length + ' places. Problems:\n' + (problems.join('\n') || 'none'));
