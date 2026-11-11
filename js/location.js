// location.js — opt-in location. Students can share their device location or type a city/ZIP.
// We only keep an approximate point (rounded to ~1 km) plus a "City, ST" label, never an exact address.
window.HR = window.HR || {};
(function (HR) {
  const KEY = 'hr.location';
  const round = n => Math.round(n * 100) / 100;
  const STATES = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
  const abbr = s => STATES[s] || s || '';

  async function getJSON(url) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
    try { const r = await fetch(url, { signal: ctrl.signal }); if (!r.ok) throw new Error('Location service error'); return await r.json(); }
    finally { clearTimeout(t); }
  }

  // Device location (asks the browser for permission)
  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('This browser can\'t share location. Type your city or ZIP instead.'));
      navigator.geolocation.getCurrentPosition(async pos => {
        const lat = round(pos.coords.latitude), lon = round(pos.coords.longitude);
        let label = 'Your area';
        try {
          const r = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`);
          const a = r.address || {};
          const city = a.city || a.town || a.village || a.suburb || a.county;
          if (city) label = `${city}, ${abbr(a.state)}`;
        } catch (e) { /* label stays generic */ }
        resolve({ lat, lon, label });
      }, err => reject(new Error(err.code === 1 ? 'Location permission was turned off. Type your city or ZIP instead.' : 'Couldn\'t get your location. Type your city or ZIP instead.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    });
  }

  // City name or 5-digit ZIP -> up to 5 U.S. matches
  async function search(q) {
    q = q.trim();
    if (!q) return [];
    const zip = /^\d{5}$/.test(q);
    const d = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=${zip ? 1 : 5}&countryCode=US&language=en&name=${encodeURIComponent(q)}`);
    return (d.results || []).map(r => ({ lat: round(r.latitude), lon: round(r.longitude), label: `${zip ? q + ' · ' : ''}${r.name}, ${abbr(r.admin1)}` }));
  }

  // A nonprofit's street address -> point + city/state/zip (OpenStreetMap Nominatim)
  async function geocodeAddress(address) {
    const [r] = await getJSON('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1&q=' + encodeURIComponent(address));
    if (!r) return null;
    const a = r.address || {};
    return { lat: +(+r.lat).toFixed(5), lon: +(+r.lon).toFixed(5), city: a.city || a.town || a.village || a.suburb || null, state: abbr(a.state) || null, zip: a.postcode || null };
  }

  // Signed-out visitors: remember location in this browser only
  function saved() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function remember(loc) { try { loc ? localStorage.setItem(KEY, JSON.stringify(loc)) : localStorage.removeItem(KEY); } catch (e) { /* private mode */ } }

  // Reusable "use my location / city or ZIP" control. onPick({lat, lon, label})
  function widget(el, current, onPick) {
    el.innerHTML = `
      <div class="loc-now">${current ? `<span>Near <b>${esc(current.label)}</b></span> <button type="button" class="linkish small" data-clear>Clear</button>` : '<span class="muted small">No location set</span>'}</div>
      <div class="loc-controls">
        <button type="button" class="btn sm" data-gps>Use my location</button>
        <span class="muted small">or</span>
        <input type="text" data-q placeholder="City or ZIP code" aria-label="City or ZIP code" autocomplete="postal-code">
        <button type="button" class="btn sm" data-find>Find</button>
      </div>
      <div class="loc-results" data-results></div>
      <p class="form-error" data-err hidden></p>`;
    const err = el.querySelector('[data-err]'), results = el.querySelector('[data-results]');
    const fail = m => { err.textContent = m; err.hidden = false; };
    el.querySelector('[data-gps]').onclick = async e => {
      err.hidden = true; e.target.disabled = true; e.target.textContent = 'Locating…';
      try { onPick(await locate()); } catch (x) { fail(x.message); e.target.disabled = false; e.target.textContent = 'Use my location'; }
    };
    const find = async () => {
      err.hidden = true;
      try {
        const list = await search(el.querySelector('[data-q]').value);
        if (!list.length) return fail('No U.S. place found. Try a city name or 5-digit ZIP.');
        if (list.length === 1) return onPick(list[0]);
        results.innerHTML = list.map((r, i) => `<button type="button" class="linkish small" data-i="${i}">${esc(r.label)}</button>`).join('');
        results.querySelectorAll('[data-i]').forEach(b => b.onclick = () => onPick(list[b.dataset.i]));
      } catch (x) { fail('Couldn\'t reach the location service. Check your connection.'); }
    };
    el.querySelector('[data-find]').onclick = find;
    el.querySelector('[data-q]').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); find(); } };
    const clr = el.querySelector('[data-clear]'); if (clr) clr.onclick = () => onPick(null);
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  HR.location = { locate, search, geocodeAddress, saved, remember, widget };
})(window.HR);
