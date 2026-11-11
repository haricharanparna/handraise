// build-orgs.mjs — turns our hand-researched list of real U.S. nonprofits into verified seed data.
//   1. Geocodes every street address with OpenStreetMap Nominatim (proves the address exists, gives lat/lon)
//   2. Loads every website (proves it's live) and reads its og:image preview photo
// Output: scripts/orgs.verified.json   Run: node scripts/build-orgs.mjs
import { writeFile } from 'node:fs/promises';

const UA = 'Handraise-student-hackathon/1.0 (STEMergent Hacks 2026)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// [name, cause, street address ('' for national/online programs), website, one-line description]
const ORGS = [
  // ---- National, online: anyone in the U.S. can help from home ----
  ['Smithsonian Transcription Center', 'education', '', 'https://transcription.si.edu/', 'Digital volunteers transcribe historic documents and specimen labels from Smithsonian collections.'],
  ['Library of Congress: By the People', 'education', '', 'https://crowd.loc.gov/', 'Crowdsourced transcription that makes historic documents searchable for everyone.'],
  ['Zooniverse', 'environment', '', 'https://www.zooniverse.org/', 'People-powered research platform where volunteers help scientists classify wildlife photos, galaxies and more.'],
  ['Humanitarian OpenStreetMap Team', 'health', '', 'https://www.hotosm.org/', 'Volunteers map communities so disaster responders and health workers can reach people faster.'],
  ['Project Linus', 'health', '', 'https://www.projectlinus.org/', 'Volunteers make and donate handmade blankets for children who are seriously ill or in crisis.'],
  ['Bookshare', 'education', '', 'https://www.bookshare.org/', 'Online library of accessible books for people with dyslexia, blindness and other reading barriers.'],

  // ---- Austin, TX ----
  ['Central Texas Food Bank', 'hunger', '6500 Metropolis Dr, Austin, TX 78744', 'https://www.centraltexasfoodbank.org/', "The region's largest hunger-relief organization, working through partner pantries across Central Texas."],
  ['Austin Pets Alive!', 'animals', '1156 W Cesar Chavez St, Austin, TX 78703', 'https://www.austinpetsalive.org/', 'No-kill animal rescue powered by fosters and volunteers.'],
  ['Meals on Wheels Central Texas', 'seniors', '3227 E 5th St, Austin, TX 78702', 'https://www.mealsonwheelscentraltexas.org/', 'Delivers meals and support so homebound seniors can stay independent at home.'],
  ['Keep Austin Beautiful', 'environment', '', 'https://keepaustinbeautiful.org/', 'Inspires Austinites to beautify green spaces, clean waterways and reduce waste.', 'Austin, TX'],
  ['Austin Partners in Education', 'education', '', 'https://www.austinpartners.org/', 'Connects volunteers with Austin ISD students for math coaching and mentoring.', 'Austin, TX'],
  ['Casa Marianella', 'immigrants', '821 Gunter St, Austin, TX 78702', 'https://www.casamarianella.org/', 'Emergency shelter and support for immigrants and refugees in East Austin.'],

  // ---- New York ----
  ['Food Bank For New York City', 'hunger', '39 Broadway, New York, NY 10006', 'https://www.foodbanknyc.org/', "New York City's largest hunger-relief organization."],
  ['City Harvest', 'hunger', '150 52nd St, Brooklyn, NY 11232', 'https://www.cityharvest.org/', 'Rescues surplus food and delivers it free to New Yorkers in need.'],
  ['Citymeals on Wheels', 'seniors', '355 Lexington Ave, New York, NY 10017', 'https://www.citymeals.org/', 'Provides meals and companionship to homebound older New Yorkers.'],
  ['ASPCA Adoption Center', 'animals', '424 E 92nd St, New York, NY 10128', 'https://www.aspca.org/', 'The ASPCA\'s Manhattan adoption center for cats and dogs.'],
  // ---- Los Angeles ----
  ['Los Angeles Regional Food Bank', 'hunger', '1734 E 41st St, Los Angeles, CA 90058', 'https://www.lafoodbank.org/', 'Distributes food across Los Angeles County through hundreds of partner agencies.'],
  ['Project Angel Food', 'health', '922 Vine St, Los Angeles, CA 90038', 'https://www.angelfood.org/', 'Cooks and delivers medically tailored meals to people living with serious illness.'],
  ['Heal the Bay', 'environment', '1444 9th St, Santa Monica, CA 90401', 'https://healthebay.org/', 'Works to make Southern California\'s coastal waters and watersheds safe, healthy and clean.'],
  ['Best Friends Pet Adoption Center Los Angeles', 'animals', '15321 Brand Blvd, Mission Hills, CA 91345', 'https://bestfriends.org/', 'No-kill adoption center run by Best Friends Animal Society.'],
  // ---- San Diego ----
  ['Feeding San Diego', 'hunger', '9455 Waples St, San Diego, CA 92121', 'https://feedingsandiego.org/', 'Hunger-relief and food rescue organization serving San Diego County.'],
  ['San Diego Humane Society', 'animals', '5500 Gaines St, San Diego, CA 92110', 'https://www.sdhumane.org/', 'Animal welfare organization with adoption, rescue and education programs.'],
  // ---- Bay Area ----
  ['SF-Marin Food Bank', 'hunger', '900 Pennsylvania Ave, San Francisco, CA 94107', 'https://www.sfmfoodbank.org/', 'Provides food to neighbors in San Francisco and Marin.'],
  ['San Francisco SPCA', 'animals', '201 Alabama St, San Francisco, CA 94103', 'https://www.sfspca.org/', 'Animal welfare organization offering adoptions, veterinary care and education.'],
  ['826 Valencia', 'education', '1351 Mission St, San Francisco, CA 94103', 'https://826valencia.org/', 'Supports young people ages 6 to 18 with their creative and expository writing.'],
  ['Second Harvest of Silicon Valley', 'hunger', '4001 N First St, San Jose, CA 95134', 'https://www.shfb.org/', 'One of the largest food banks in the U.S., serving Santa Clara and San Mateo counties.'],
  // ---- Pacific Northwest ----
  ['Food Lifeline', 'hunger', '815 S 96th St, Seattle, WA 98108', 'https://foodlifeline.org/', 'Rescues surplus food and supplies food banks across Western Washington.'],
  ['Seattle Humane', 'animals', '13212 SE Eastgate Way, Bellevue, WA 98005', 'https://www.seattlehumane.org/', 'Pet adoption and animal welfare organization in the Seattle area.'],
  ['Oregon Food Bank', 'hunger', '7900 NE 33rd Dr, Portland, OR 97211', 'https://www.oregonfoodbank.org/', 'Works to end hunger and its root causes across Oregon and SW Washington.'],
  // ---- Mountain West ----
  ['Food Bank of the Rockies', 'hunger', '10700 E 45th Ave, Denver, CO 80239', 'https://www.foodbankrockies.org/', 'Hunger-relief organization serving Colorado and Wyoming.'],
  ['Denver Dumb Friends League', 'animals', '2080 S Quebec St, Denver, CO 80231', 'https://www.ddfl.org/', 'One of the largest animal welfare organizations in the Rocky Mountain region.'],
  ['Utah Food Bank', 'hunger', '3150 S 900 W, Salt Lake City, UT 84119', 'https://www.utahfoodbank.org/', 'Statewide hunger-relief organization serving all 29 Utah counties.'],
  ['Three Square Food Bank', 'hunger', '4190 N Pecos Rd, Las Vegas, NV 89115', 'https://www.threesquare.org/', 'Southern Nevada\'s food bank.'],
  ["St. Mary's Food Bank", 'hunger', '2831 N 31st Ave, Phoenix, AZ 85009', 'https://www.firstfoodbank.org/', 'The world\'s first food bank, serving Arizona.'],
  ['Arizona Humane Society', 'animals', '1521 W Dobbins Rd, Phoenix, AZ 85041', 'https://www.azhumane.org/', 'Animal welfare organization offering rescue, medical care and adoptions.'],
  // ---- Texas ----
  ['Houston Food Bank', 'hunger', '535 Portwall St, Houston, TX 77029', 'https://www.houstonfoodbank.org/', 'Distributes food through partner agencies across Southeast Texas.'],
  ['Houston SPCA', 'animals', '7007 Old Katy Rd, Houston, TX 77024', 'https://www.houstonspca.org/', 'Animal welfare organization providing rescue, rehabilitation and adoption.'],
  ['North Texas Food Bank', 'hunger', '3677 Mapleshade Ln, Plano, TX 75075', 'https://ntfb.org/', 'Hunger-relief organization serving 13 North Texas counties.'],
  ['SPCA of Texas', 'animals', '2400 Lone Star Dr, Dallas, TX 75212', 'https://www.spca.org/', 'Animal welfare organization in North Texas.'],
  ['San Antonio Food Bank', 'hunger', '5200 Enrique M Barrera Pkwy, San Antonio, TX 78227', 'https://safoodbank.org/', 'Fights hunger across Southwest Texas.'],
  // ---- Midwest ----
  ['Greater Chicago Food Depository', 'hunger', '4100 W Ann Lurie Pl, Chicago, IL 60632', 'https://www.chicagosfoodbank.org/', "Chicago's food bank, working with hundreds of partners across Cook County."],
  ['PAWS Chicago', 'animals', '1997 N Clybourn Ave, Chicago, IL 60614', 'https://www.pawschicago.org/', 'No-kill humane organization in Chicago.'],
  ['Little Brothers - Friends of the Elderly Chicago', 'seniors', '355 N Ashland Ave, Chicago, IL 60607', 'https://lbfechicago.org/', 'Relieves isolation and loneliness among older adults.'],
  ['Gleaners Community Food Bank', 'hunger', '2131 Beaufait St, Detroit, MI 48207', 'https://www.gcfb.org/', 'Food bank serving Southeast Michigan.'],
  ['Second Harvest Heartland', 'hunger', '7101 Winnetka Ave N, Brooklyn Park, MN 55428', 'https://www.2harvest.org/', 'One of the largest hunger-relief organizations in the Upper Midwest.'],
  ['Animal Humane Society', 'animals', '845 Meadow Ln N, Golden Valley, MN 55422', 'https://www.animalhumanesociety.org/', 'Minnesota\'s largest animal welfare organization.'],
  ['Mid-Ohio Food Collective', 'hunger', '3960 Brookham Dr, Grove City, OH 43123', 'https://mofc.org/', 'Food bank serving Central and Eastern Ohio.'],
  ['Gleaners Food Bank of Indiana', 'hunger', '3737 Waldemere Ave, Indianapolis, IN 46241', 'https://www.gleaners.org/', 'Hunger-relief organization serving central and southeast Indiana.'],
  ['Harvesters', 'hunger', '3801 Topping Ave, Kansas City, MO 64129', 'https://www.harvesters.org/', 'Community food network serving Kansas and Missouri.'],
  ['St. Louis Area Foodbank', 'hunger', '70 Corporate Woods Dr, Bridgeton, MO 63044', 'https://stlfoodbank.org/', 'Food bank serving Missouri and Illinois.'],
  // ---- South ----
  ['Atlanta Community Food Bank', 'hunger', '3400 N Desert Dr, East Point, GA 30344', 'https://www.acfb.org/', 'Fights hunger across metro Atlanta and north Georgia.'],
  ['Trees Atlanta', 'environment', '225 Chester Ave SE, Atlanta, GA 30316', 'https://www.treesatlanta.org/', 'Protects and improves Atlanta\'s urban forest by planting and caring for trees.'],
  ['Atlanta Humane Society', 'animals', '981 Howell Mill Rd NW, Atlanta, GA 30318', 'https://atlantahumane.org/', 'Animal welfare organization in Atlanta.'],
  ['Second Harvest Food Bank of Middle Tennessee', 'hunger', '331 Great Circle Rd, Nashville, TN 37228', 'https://www.secondharvestmidtn.org/', 'Hunger-relief organization serving 46 Middle Tennessee counties.'],
  ['Second Harvest Food Bank of Metrolina', 'hunger', '500 Spratt St, Charlotte, NC 28206', 'https://www.secondharvestmetrolina.org/', 'Food bank serving the Charlotte region.'],
  ['Food Bank of Central & Eastern North Carolina', 'hunger', '1924 Capital Blvd, Raleigh, NC 27604', 'https://foodbankcenc.org/', 'Hunger-relief organization serving 34 North Carolina counties.'],
  ['Second Harvest Food Bank of Central Florida', 'hunger', '411 Mercy Dr, Orlando, FL 32805', 'https://www.feedhopenow.org/', 'Food bank serving six Central Florida counties.'],
  ['Feeding South Florida', 'hunger', '2501 SW 32nd Terrace, Pembroke Park, FL 33023', 'https://feedingsouthflorida.org/', 'Hunger-relief organization serving South Florida.'],
  ['Second Harvest Food Bank of Greater New Orleans and Acadiana', 'hunger', '700 Edwards Ave, New Orleans, LA 70123', 'https://no-hunger.org/', 'Fights hunger across South Louisiana.'],
  // ---- Northeast ----
  ['Capital Area Food Bank', 'hunger', '4900 Puerto Rico Ave NE, Washington, DC 20017', 'https://www.capitalareafoodbank.org/', 'Largest hunger-relief organization in the Washington, DC region.'],
  ['Humane Rescue Alliance', 'animals', '71 Oglethorpe St NW, Washington, DC 20011', 'https://www.humanerescuealliance.org/', 'Animal welfare organization serving Washington, DC.'],
  ['Philabundance', 'hunger', '3616 S Galloway St, Philadelphia, PA 19148', 'https://www.philabundance.org/', 'Hunger-relief organization serving the Delaware Valley.'],
  ['Pennsylvania SPCA', 'animals', '350 E Erie Ave, Philadelphia, PA 19134', 'https://www.pspca.org/', 'Animal welfare organization based in Philadelphia.'],
  ['Greater Pittsburgh Community Food Bank', 'hunger', '1 N Linden St, Duquesne, PA 15110', 'https://pittsburghfoodbank.org/', 'Food bank serving 11 counties in southwestern Pennsylvania.'],
  ['The Greater Boston Food Bank', 'hunger', '70 S Bay Ave, Boston, MA 02118', 'https://www.gbfb.org/', 'The largest hunger-relief organization in New England.'],
  ['MSPCA-Angell', 'animals', '350 S Huntington Ave, Boston, MA 02130', 'https://www.mspca.org/', 'Animal welfare organization and veterinary hospital in Boston.']
];

async function geocode(address) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1&q=' + encodeURIComponent(address);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const [hit] = await res.json();
  return hit ? { lat: +(+hit.lat).toFixed(5), lon: +(+hit.lon).toFixed(5), match: hit.display_name } : null;
}

async function cityGeocode(label) {
  const [city, state] = label.split(',').map(s => s.trim());
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&countryCode=US&name=${encodeURIComponent(city)}`);
  const hit = (await res.json()).results?.find(r => !state || (r.admin1 || '').startsWith(state === 'TX' ? 'Texas' : state)) ;
  return hit ? { lat: hit.latitude, lon: hit.longitude } : null;
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
    return { ok: res.ok, status: res.status, finalUrl: res.url, image: img && img.startsWith('https://') ? img : null };
  } catch (e) { return { ok: false, status: String(e.name || e.message) }; }
}

const out = [], problems = [];
for (const [name, cause, address, url, blurb, cityOnly] of ORGS) {
  let geo = null, city = null, state = null, zip = null;
  if (address) {
    geo = await geocode(address); await sleep(1100);
    const m = address.match(/,\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?$/);
    if (m) { city = m[1]; state = m[2]; zip = m[3] || null; }
    if (!geo && zip) { const z = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&postalcode=${zip}`, { headers: { 'User-Agent': UA } }).then(r => r.json()); await sleep(1100); if (z[0]) geo = { lat: +(+z[0].lat).toFixed(4), lon: +(+z[0].lon).toFixed(4), match: 'ZIP centroid ' + zip }; }
    if (!geo) problems.push(`${name}: address not found (${address})`);
  } else if (cityOnly) {
    geo = await cityGeocode(cityOnly);
    [city, state] = cityOnly.split(',').map(s => s.trim());
  }
  const page = await pageInfo(url);
  if (!page.ok) problems.push(`${name}: website ${page.status} (${url})`);
  out.push({ name, cause, blurb, url, address: address || null, city, state, zip,
    lat: geo?.lat ?? null, lon: geo?.lon ?? null, national: !address && !cityOnly,
    image_url: page.image || null, verified_site: page.ok, geo_match: geo?.match || null });
  process.stdout.write(`${geo || !address ? 'OK ' : '?? '}${page.ok ? 'web ' : 'WEB?'} ${page.image ? 'img ' : '--- '} ${name}\n`);
}
await writeFile(new URL('./orgs.verified.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\n' + out.length + ' orgs. Problems:\n' + (problems.join('\n') || 'none'));
