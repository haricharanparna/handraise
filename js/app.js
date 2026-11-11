// app.js — screens and interactions
(function (HR) {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { SKILLS, CAUSES, ORG_TYPES, HOUR_VALUE } = HR.data;
  const db = HR.db;

  // Signed-in state
  let session = null, profile = null;
  let charts = [];
  let renderId = 0, shownRoute = '';
  const filters = { cause: '', type: '', remote: false, all: false };

  // ---------- helpers ----------
  const sum = a => a.reduce((s, v) => s + Number(v), 0);
  const money = n => '$' + Math.round(n).toLocaleString();
  const hrs = n => (Math.round(Number(n) * 10) / 10).toLocaleString();
  const fmtDate = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const fmtLong = d => new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const ago = d => { const n = Math.floor((Date.now() - new Date(d)) / 864e5); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago'; };
  // Causes are one of CAUSES' keys, or text a nonprofit typed in under "Other"
  const causeLabel = c => CAUSES[c]?.label || c || '';
  const causeTag = c => `<span class="tag cause">${esc(causeLabel(c))}</span>`;
  // What kind of place an organization is (nonprofit, public library, hospital…), shown on every listing
  const typeOf = o => o?.org_type || 'nonprofit';
  const typeLabel = o => ORG_TYPES[typeOf(o)] || ORG_TYPES.nonprofit;
  const typeTag = o => `<span class="tag kind">${esc(typeLabel(o))}</span>`;
  // Red asterisk for required fields
  const REQ = '<span class="req" aria-hidden="true">*</span>';
  // Cause dropdown with an "Other" choice that reveals a text box. selected may be a custom cause.
  function causeField(label, selected) {
    const custom = selected && !CAUSES[selected];
    return `<label class="f">${label}${REQ}<select name="cause">${Object.entries(CAUSES).map(([k, c]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${c.label}</option>`).join('')}
        <option value="__other" ${custom ? 'selected' : ''}>Other…</option></select></label>
      <label class="f" data-other ${custom ? '' : 'hidden'}>Type your cause${REQ}<input name="cause_other" maxlength="40" placeholder="Arts and music" value="${custom ? esc(selected) : ''}"></label>`;
  }
  function wireCause(f) {
    f.cause.onchange = () => { const other = f.cause.value === '__other'; $('[data-other]', f).hidden = !other; if (other) f.cause_other.focus(); };
  }
  function readCause(f) {
    if (f.cause.value !== '__other') return f.cause.value;
    const c = f.cause_other.value.trim().replace(/\s+/g, ' ');
    if (c.length < 2) throw new Error('Type your cause, or pick one from the list.');
    // If they typed a cause we already have, use it so matching and filters still work
    const known = Object.entries(CAUSES).find(([k, v]) => v.label.toLowerCase() === c.toLowerCase() || k === c.toLowerCase());
    return known ? known[0] : c;
  }
  const skillTags = ks => (ks || []).map(k => `<span class="tag">${esc(SKILLS[k] || k)}</span>`).join('');
  const uid = () => session?.user?.id;
  const profileReady = () => profile && profile.skills.length > 0;

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3400);
  }
  function clearCharts() { charts.forEach(c => c.destroy()); charts = []; }
  const go = h => { if (location.hash === h) render(); else location.hash = h; };

  // Run an async action from a button, showing errors instead of failing silently
  async function act(btn, fn) {
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message || 'Something went wrong'); if (btn) btn.disabled = false; }
  }

  // ---------- router ----------
  const ROUTES = {
    home, browse, impact, orgs: nearbyOrgs, signin: el => auth(el, 'signin'), signup: el => auth(el, 'signup'),
    me: myVolunteering, 'me/profile': myProfile, 'me/certificate': certificate,
    org: orgHome, 'org/new': orgNew, about
  };
  const PRIVATE = ['me', 'me/profile', 'me/certificate', 'org', 'org/new'];
  const TITLES = { browse: 'Find projects', orgs: 'Places to volunteer near you', impact: 'Community impact', about: 'How it works', signin: 'Sign in', signup: 'Create account',
    me: 'My volunteering', 'me/profile': 'My profile', 'me/certificate': 'My certificate', org: 'For nonprofits', 'org/new': 'Post a project' };

  async function render() {
    const id = ++renderId;
    const r = (location.hash || '#home').slice(1);
    const route = ROUTES[r] ? r : 'home';
    document.title = (TITLES[route] ? TITLES[route] + ' · ' : '') + 'Handraise · Skills-based volunteering for students';
    $$('.nav a').forEach(a => {
      const on = a.dataset.tab === route.split('/')[0];
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    clearCharts();
    const el = $('#view');
    if (PRIVATE.includes(route) && !session) { shownRoute = ''; return gate(el, route); }
    // Re-rendering the same page (a filter or radius change) keeps it on screen instead of flashing "Loading…"
    if (route !== shownRoute) el.innerHTML = '<p class="loading">Loading…</p>';
    shownRoute = route;
    try {
      await ROUTES[route](el, () => id === renderId);
    } catch (e) {
      if (id === renderId) el.innerHTML = `<div class="notice">Couldn't load this page: ${esc(e.message)}. Check your connection and try again.</div>`;
    }
  }

  function gate(el, route) {
    const org = route.startsWith('org');
    el.innerHTML = `<div class="auth"><div class="panel">
      <h1>${org ? 'Bring student skills to your nonprofit' : 'Track your volunteering'}</h1>
      <p class="muted">${org ? 'Create a free account to post projects, review applicants and verify hours.' : 'Create a free account to apply to projects, log hours and get a verified certificate.'}</p>
      <div class="btn-row"><a class="btn primary" href="#signup">Create an account</a><a class="btn" href="#signin">Sign in</a></div></div></div>`;
    sessionStorage.setItem('hr.after', '#' + route);
  }

  function renderAccount() {
    const a = $('#account');
    if (!session) { a.innerHTML = '<a href="#signin">Sign in</a><a class="btn primary sm" href="#signup">Join</a>'; return; }
    a.innerHTML = `<span class="muted">${esc(profile?.first_name || session.user.email)}</span><button class="linkish" id="signout">Sign out</button>`;
    $('#signout').onclick = async () => { await db.signOut(); toast('Signed out'); go('#home'); };
  }

  // ================= LOCATION + ORG HELPERS =================
  // Where the student is searching from: their saved profile when signed in, otherwise this browser
  function myLoc() {
    const saved = HR.location.saved();
    const radius = profile?.radius_miles || saved?.radius || 25;
    if (profile?.lat != null) return { lat: Number(profile.lat), lon: Number(profile.lon), label: profile.location_label || 'Your area', radius };
    return saved?.lat != null ? { ...saved, radius } : null;
  }
  // loc: {lat, lon, label} to set, null to clear, undefined to keep. radius: miles or undefined.
  async function setLoc(loc, radius) {
    if (session) {
      const f = {};
      if (loc !== undefined) Object.assign(f, loc ? { lat: loc.lat, lon: loc.lon, location_label: loc.label } : { lat: null, lon: null, location_label: null });
      if (radius) f.radius_miles = radius;
      profile = await db.saveProfile(uid(), f);
    } else {
      const cur = HR.location.saved() || {};
      const next = loc === undefined ? cur : loc || {};
      HR.location.remember({ ...next, radius: radius || cur.radius || 25 });
    }
  }

  const causeColor = c => CAUSES[c]?.color || '#1f5a43';
  // Line icons used when an org has no photo (or its photo fails to load)
  const CAUSE_ICONS = {
    hunger: '<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z"/><path d="M8.5 7.5c0-1.5 1.5-1.5 1.5-3M13 7.5c0-1.5 1.5-1.5 1.5-3"/>',
    animals: '<circle cx="6.5" cy="10" r="1.7"/><circle cx="10" cy="6.3" r="1.7"/><circle cx="14.5" cy="6.3" r="1.7"/><circle cx="18" cy="10" r="1.7"/><path d="M7.8 17.2c0-3 2-5.2 4.4-5.2s4.4 2.2 4.4 5.2c0 1.8-1.9 2.3-4.4 2.3s-4.4-.5-4.4-2.3z"/>',
    seniors: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
    environment: '<path d="M5 19.5C5 11 10.5 5 20 4.5c0 9.5-6 15-14 15z"/><path d="M5 19.5l8.5-8.5"/>',
    education: '<path d="M3.5 5.5H10a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H3.5zM20.5 5.5H14a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6.5z"/>',
    immigrants: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>',
    health: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M7.5 12h9"/>',
    arts: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.8-1.2 1.2-2.2-.7-1.2.1-2.6 1.5-2.6h1.6a4.2 4.2 0 0 0 4.2-4.2c0-4.4-3.8-8-8.5-8z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/>'
  };
  const causeArt = (cause, size) => `<div class="thumb ph ${size}" style="--c:${causeColor(cause)}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${CAUSE_ICONS[cause] || CAUSE_ICONS.health}</svg></div>`;
  function orgThumb(org, size = '') {
    if (!org.image_url) return causeArt(org.cause, size);
    const logo = /logo|icon|favicon|socialimg|@\dx/i.test(org.image_url) ? ' logo' : '';
    return `<img class="thumb ${size}${logo}" src="${esc(org.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-cause="${esc(org.cause)}">`;
  }
  const distLabel = d => d < 1 ? 'under 1 mile' : d < 10 ? d.toFixed(1) + ' miles' : Math.round(d) + ' miles';
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  function orgFacts(org, dist) {
    const parts = [];
    if (org.is_national) parts.push('Online, anywhere in the U.S.');
    else {
      if (dist != null) parts.push(`<b>${distLabel(dist)} away</b>`);
      if (org.address) parts.push(`<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(org.name + ', ' + org.address)}" target="_blank" rel="noopener">${esc(org.address)}</a>`);
    }
    if (org.url) parts.push(`<a href="${esc(org.url)}" target="_blank" rel="noopener">${esc(host(org.url))} ↗</a>`);
    return parts.join('<span class="sep">·</span>');
  }

  // Location bar shown above lists: current place, radius, and a way to change it
  function locBar(el, loc, onChange) {
    el.innerHTML = `<div class="locbar">
      <div class="locbar-now">${loc ? `Showing results within
        <select data-radius aria-label="Search radius">${HR.data.RADII.map(r => `<option value="${r}" ${r === loc.radius ? 'selected' : ''}>${r} miles</option>`).join('')}</select>
        of <b>${esc(loc.label)}</b>` : '<b>Set your location</b> to see places to volunteer near you.'}
        <button type="button" class="linkish small" data-change>${loc ? 'Change' : ''}</button></div>
      <div data-widget ${loc ? 'hidden' : ''}></div></div>`;
    const w = $('[data-widget]', el);
    HR.location.widget(w, loc, async picked => { await setLoc(picked); onChange(); });
    const ch = $('[data-change]', el); if (ch) ch.onclick = () => { w.hidden = !w.hidden; };
    const r = $('[data-radius]', el); if (r) r.onchange = async () => { await setLoc(undefined, Number(r.value)); onChange(); };
  }

  // ================= HOME =================
  async function home(el, live) {
    const [stats, orgs] = await Promise.all([db.stats(), db.orgs()]);
    if (!live()) return;
    const loc = myLoc();
    const stateSet = new Set(orgs.filter(o => o.state).map(o => o.state));
    const states = stateSet.size - (stateSet.has('DC') ? 1 : 0) + ' states' + (stateSet.has('DC') ? ', DC' : '');
    const projectCount = orgs.reduce((s, o) => s + (o.projects?.[0]?.count || 0), 0);
    const near = loc ? orgs.filter(o => !o.is_national).map(o => ({ o, d: HR.match.distanceTo(loc, o) })).filter(x => x.d <= loc.radius).sort((a, b) => a.d - b.d) : [];
    el.innerHTML = `
      <section class="hero">
        <div>
          <div class="eyebrow">Skills-based volunteering for students</div>
          <h1>Small nonprofits need <em>skills</em>. Students need hours that <em>matter</em>.</h1>
          <p class="lead">Handraise matches what students are already good at, like design, translation, coding and tutoring, to small projects at nonprofits near them, then turns the work into verified service hours.</p>
          <div class="btn-row" style="margin-top:22px">
            <a class="btn primary lg" href="${session ? '#browse' : '#signup'}">${session ? 'Find a project' : 'Join as a student'}</a>
            <a class="btn lg" href="#orgs">Places near me</a>
          </div>
        </div>
        <div class="figures">
          <div class="figure"><b>${orgs.length}</b><span>organizations in ${states} and online</span></div>
          <div class="figure"><b>${projectCount}</b><span>projects</span></div>
          <div class="figure"><b>${hrs(stats.verified_hours)}</b><span>hours verified</span></div>
          <div class="figure"><b>${money(stats.verified_hours * HOUR_VALUE)}</b><span>value of student help</span></div>
        </div>
      </section>

      <div class="section-title"><h2>${loc ? `Near ${esc(loc.label)}` : 'Near you'}</h2><a class="small" href="#orgs">All places near you</a></div>
      ${loc ? (near.length ? `<div class="orgrow">${near.slice(0, 4).map(({ o, d }) => `<a class="orgtile" href="#orgs">${orgThumb(o, 'wide')}<b>${esc(o.name)}</b><span>${distLabel(d)} · ${esc(typeLabel(o))}</span></a>`).join('')}</div>`
        : `<p class="muted">No places to volunteer on Handraise within ${loc.radius} miles yet. Try a bigger radius on the <a href="#orgs">places page</a>, or help from anywhere with an online program below.</p>`)
        : '<div id="home-loc"></div>'}

      <div class="section-title"><h2>The problem</h2></div>
      <div class="grid g3">
        <div class="fact"><b>92%</b><p>of U.S. nonprofits run on budgets under $1 million. Most can't hire a designer, web developer or translator.</p><cite>National Council of Nonprofits</cite></div>
        <div class="fact"><b>30% to 23%</b><p>The share of Americans who formally volunteer fell between 2019 and 2021, and many nonprofits are still short-handed.</p><cite>AmeriCorps, Volunteering and Civic Life in America</cite></div>
        <div class="fact"><b>Paper forms</b><p>Students need service hours for graduation, honor societies and college, but most listings are generic shifts and hours live on forms that get lost.</p></div>
      </div>

      <div class="section-title"><h2>How it works</h2></div>
      <div class="grid g2">
        <div><h3>For students</h3><ol class="steps">
          <li>Share your location (or type a city or ZIP), your age, skills and the causes you care about.</li>
          <li>See nearby projects you're old enough for, ranked by fit, with the reasons each one suits you.</li>
          <li>Do real work and log your hours. The nonprofit verifies them.</li>
          <li>Download a certificate of verified hours for school or college applications.</li></ol>
          <a href="#browse">Browse projects →</a></div>
        <div><h3>For nonprofits</h3><ol class="steps">
          <li>Describe what you need in plain words.</li>
          <li>The project builder turns it into a clear, student-sized project.</li>
          <li>Review applicants ranked by fit and accept with one click.</li>
          <li>Verify hours in seconds and see the value of the help you received.</li></ol>
          <a href="#org">Post a project →</a></div>
      </div>
      <div class="notice green" style="margin-top:20px">Curious how projects are ranked, or how the database keeps hours honest? <a href="#about">Try the matching engine and project builder</a>. No account needed.</div>

      <div class="section-title"><h2>Help from anywhere</h2></div>
      <ul class="orglist">${orgs.filter(o => o.is_national).map(o => `<li><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.name)}</a> ${typeTag(o)}<span>${esc(o.blurb)}</span></li>`).join('')}</ul>`;

    const hl = $('#home-loc');
    if (hl) locBar(hl, null, render);
  }

  // ================= AUTH =================
  function auth(el, mode) {
    if (session) return go('#me');
    let pickedLoc = mode === 'signup' ? HR.location.saved() : null;
    if (pickedLoc && pickedLoc.lat == null) pickedLoc = null;
    const google = `<button type="button" class="btn google" id="g-btn"><svg viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Continue with Google</button>
      <div class="or">or ${mode === 'signup' ? 'sign up' : 'sign in'} with email</div>`;
    el.innerHTML = `<div class="auth"><div class="panel">
      <h1 class="sr-only">${mode === 'signup' ? 'Create a Handraise account' : 'Sign in to Handraise'}</h1>
      <div class="auth-switch"><button data-m="signin" class="${mode === 'signin' ? 'active' : ''}">Sign in</button><button data-m="signup" class="${mode === 'signup' ? 'active' : ''}">Create account</button></div>
      <form id="af" novalidate>
        ${mode === 'signin' ? google : ''}
        ${mode === 'signup' ? `
          <fieldset><legend>I'm joining as</legend><div class="choice">
            <label><input type="radio" name="role" value="student" checked><div>A student<span>Find projects and earn verified hours</span></div></label>
            <label><input type="radio" name="role" value="org"><div>A nonprofit<span>Post projects and verify hours</span></div></label></div></fieldset>
          ${google}
          <div class="row">
            <label class="f" style="flex:2">First name${REQ}<input name="first" autocomplete="given-name" required maxlength="30"></label>
            <label class="f" data-student>Age${REQ}<input name="age" type="number" inputmode="numeric" min="13" max="25" required></label>
          </div>
          <div class="f" data-student><b class="small">Location</b> <span class="hint small">(optional, used to find places to volunteer near you)</span>
            <div id="su-loc" style="margin-top:6px"></div>
            <p class="xs muted" style="margin:6px 0 0">We store only an approximate area (about 1 km), never your exact address.</p></div>` : ''}
        <label class="f">Email${REQ}<input name="email" type="email" autocomplete="email" required></label>
        <label class="f">Password${REQ} ${mode === 'signup' ? '<span class="hint">(at least 8 characters)</span>' : ''}<input name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required minlength="${mode === 'signup' ? 8 : 1}"></label>
        <p class="form-error" id="af-err" hidden></p>
        <button class="btn primary" style="width:100%">${mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        ${mode === 'signup' ? '<p class="xs muted" style="margin:12px 0 0">Handraise is for students ages 13 to 25. If you\'re under 18, check with a parent or guardian before volunteering in person.</p>' : ''}
      </form></div></div>`;
    $$('[data-m]', el).forEach(b => b.onclick = () => go('#' + b.dataset.m));
    const f = $('#af'), err = $('#af-err');
    $('#g-btn').onclick = async () => {
      err.hidden = true;
      if (mode === 'signup') {
        // Google doesn't give us an age, so new students finish their profile (age is required there) right after
        sessionStorage.setItem('hr.after', f.role.value === 'org' ? '#org' : '#me/profile');
        if (f.role.value === 'student' && pickedLoc) HR.location.remember({ ...pickedLoc, radius: pickedLoc.radius || 25 });
      }
      try { await db.signInWithGoogle(); }
      catch (e2) { err.textContent = e2.message; err.hidden = false; }
    };
    if (mode === 'signup') {
      const drawLoc = () => HR.location.widget($('#su-loc'), pickedLoc, p => { pickedLoc = p; drawLoc(); });
      drawLoc();
      const syncRole = () => $$('[data-student]', f).forEach(x => x.hidden = f.role.value !== 'student');
      $$('input[name=role]', f).forEach(r => r.onchange = syncRole);
    }
    f.onsubmit = async e => {
      e.preventDefault();
      err.hidden = true;
      const btn = $('button.primary', f);
      const email = f.email.value.trim(), password = f.password.value;
      if (!email || !password) { err.textContent = 'Enter your email and password.'; err.hidden = false; return; }
      btn.disabled = true;
      try {
        if (mode === 'signup') {
          const role = f.role.value, age = Number(f.age.value);
          if (!f.first.value.trim()) throw new Error('Enter your first name.');
          if (role === 'student') {
            if (!age) throw new Error('Enter your age so we only show projects you can join.');
            if (age < 13) throw new Error('Handraise is for students 13 and older.');
            if (age > 25) throw new Error('Student accounts are for ages 13 to 25. Nonprofit staff can join as a nonprofit.');
          }
          if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
          const extra = role === 'student' ? { age, ...(pickedLoc ? { lat: pickedLoc.lat, lon: pickedLoc.lon, location_label: pickedLoc.label } : {}) } : {};
          const res = await db.signUp(email, password, f.first.value.trim(), role, extra);
          sessionStorage.setItem('hr.after', role === 'org' ? '#org' : '#me/profile');
          if (!res.session) {
            el.innerHTML = `<div class="auth"><div class="panel"><h1>Check your email</h1><p>We sent a confirmation link to <b>${esc(email)}</b>. Click it to finish creating your account, then come back and sign in.</p><a class="btn" href="#signin">Back to sign in</a></div></div>`;
            return;
          }
        } else {
          await db.signIn(email, password);
        }
      } catch (e2) {
        err.textContent = e2.message; err.hidden = false; btn.disabled = false;
      }
    };
  }

  // ================= PLACES TO VOLUNTEER NEAR YOU =================
  async function nearbyOrgs(el, live) {
    const orgs = await db.orgs();
    if (!live()) return;
    const loc = myLoc();
    const local = orgs.filter(o => !o.is_national).map(o => ({ o, d: HR.match.distanceTo(loc, o) }));
    const allNear = loc ? local.filter(x => x.d <= loc.radius).sort((a, b) => a.d - b.d) : [];
    const online = orgs.filter(o => o.is_national).map(o => ({ o, d: null }));
    // Kind-of-place filter, with counts for what's near you and online
    const counts = {};
    [...allNear, ...online].forEach(({ o }) => { counts[typeOf(o)] = (counts[typeOf(o)] || 0) + 1; });
    if (filters.type && !counts[filters.type]) filters.type = '';
    const keep = x => !filters.type || typeOf(x.o) === filters.type;
    const near = allNear.filter(keep);
    const typeChips = `<div class="chips" role="group" aria-label="Kind of place">
      <button type="button" class="chip" data-type="" aria-pressed="${!filters.type}">All <span>${allNear.length + online.length}</span></button>
      ${Object.keys(ORG_TYPES).filter(k => counts[k]).map(k => `<button type="button" class="chip" data-type="${k}" aria-pressed="${filters.type === k}">${esc(ORG_TYPES[k])} <span>${counts[k]}</span></button>`).join('')}</div>`;
    const card = ({ o, d }) => `<article class="ocard">
        ${orgThumb(o, 'card')}
        <div>
          <div class="org-kind">${typeTag(o)}<span class="org-cause">${esc(causeLabel(o.cause))}${o.is_example ? ' · example listing' : ''}</span></div>
          <h3>${esc(o.name)}</h3>
          <p>${esc(o.blurb || '')}</p>
          <div class="facts">${orgFacts(o, d)}</div>
          <div class="btn-row" style="margin-top:10px"><a class="btn sm" href="#browse">See ${o.projects?.[0]?.count || 0} project idea${o.projects?.[0]?.count === 1 ? '' : 's'}</a>${o.url ? `<a class="btn quiet sm" href="${esc(o.url)}" target="_blank" rel="noopener">Volunteer page ↗</a>` : ''}</div>
        </div></article>`;
    el.innerHTML = `
      <div class="page-head"><div><h1>Places to volunteer near you</h1><p>Nonprofits, public libraries, parks departments, hospitals, museums and government programs, with their address, distance and website. Each one is labeled with what kind of place it is. Listings marked “example listing” aren't affiliated with Handraise. Contact them through their own volunteer page.</p></div></div>
      <div id="locbar"></div>
      ${typeChips}
      ${loc ? (near.length ? `<div class="ocards">${near.map(card).join('')}</div>`
        : `<p class="empty">No ${filters.type ? esc(ORG_TYPES[filters.type].toLowerCase()) + ' listings' : 'places to volunteer'} on Handraise within ${loc.radius} miles of ${esc(loc.label)} yet. Try a larger radius, or help from anywhere with an online program below.</p>`) : ''}
      <div class="section-title"><h2>Help from anywhere</h2><span class="small muted">Online programs open to students across the U.S.</span></div>
      <div class="ocards">${online.filter(keep).map(card).join('') || '<p class="empty">No online programs of this kind yet.</p>'}</div>`;
    $$('[data-type]', el).forEach(b => b.onclick = () => { filters.type = b.dataset.type; render(); });
    locBar($('#locbar'), loc, render);
  }

  // ================= BROWSE =================
  async function browse(el, live) {
    const [projects, apps] = await Promise.all([db.projects(), session ? db.myApplications(uid()) : []]);
    if (!live()) return;
    const loc = myLoc();
    const appBy = new Map(apps.map(a => [a.project_id, a]));
    let list = projects.filter(p => p.status === 'open')
      // Without a location, only show online programs (otherwise it's every city in the U.S.)
      .filter(p => loc || p.org?.is_national || !p.org?.is_example || appBy.has(p.id))
      .map(p => ({ p, m: HR.match.score(profile, p, loc) }));
    if (filters.cause) list = list.filter(x => x.p.cause === filters.cause);
    if (filters.type) list = list.filter(x => typeOf(x.p.org) === filters.type);
    if (filters.remote) list = list.filter(x => x.p.remote);
    const tooYoung = list.filter(x => !x.m.ok && x.m.why.startsWith('Ages')).length;
    if (!filters.all) list = list.filter(x => x.m.ok);
    else list = list.filter(x => x.m.ok || x.m.why.startsWith('Ages') || x.m.why === 'In person only');
    const scored = profileReady();
    list.sort((a, b) => (b.m.ok - a.m.ok) || (scored ? (b.m.pct || 0) - (a.m.pct || 0) : 0) || ((a.m.dist ?? 9999) - (b.m.dist ?? 9999)));

    el.innerHTML = `
      <div class="page-head"><div><h1>Find a project</h1>
        <p>${scored ? 'Ranked by how well each project fits your skills, causes, schedule and location.' : 'Small, skills-based projects at nonprofits, libraries, parks, hospitals and more, near you and online.'}</p></div></div>
      <div id="locbar"></div>
      ${!session ? '<div class="notice green"><a href="#signup">Create an account</a> and add your skills to see how well each project fits you.</div>'
        : !scored ? '<div class="notice green"><a href="#me/profile">Add your skills</a> to see your fit for each project.</div>' : ''}
      <div class="grid side">
        <aside>
          ${scored ? `<div class="eyebrow">Your profile</div>
            <p class="small" style="margin-bottom:8px">${esc(profile.first_name)}${profile.age ? ', ' + profile.age : ''} · ${profile.hours_per_week} hrs/week</p>
            <div class="tags" style="margin-bottom:10px">${skillTags(profile.skills)}</div>
            <a class="small" href="#me/profile">Edit profile</a><hr>` : ''}
          <label class="f">Cause<select id="f-cause"><option value="">All causes</option>${[...Object.keys(CAUSES), ...new Set(projects.map(p => p.cause).filter(c => c && !CAUSES[c]))].map(k => `<option value="${esc(k)}" ${filters.cause === k ? 'selected' : ''}>${esc(causeLabel(k))}</option>`).join('')}</select></label>
          <label class="f">Kind of place<select id="f-type"><option value="">All kinds</option>${Object.entries(ORG_TYPES).filter(([k]) => k === filters.type || projects.some(p => typeOf(p.org) === k)).map(([k, v]) => `<option value="${k}" ${filters.type === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <label class="small" style="display:flex;align-items:center;margin-bottom:8px"><input type="checkbox" id="f-remote" ${filters.remote ? 'checked' : ''}>Remote only</label>
          ${profile?.age ? `<label class="small" style="display:flex;align-items:center"><input type="checkbox" id="f-all" ${filters.all ? 'checked' : ''}>Show projects for older students (${tooYoung})</label>` : ''}
          ${scored ? '<p class="xs muted" style="margin-top:18px">Fit = 50% skills · 20% cause · 15% time · 10% distance · 5% skills you want to learn.</p>' : ''}
        </aside>
        <section>
          <p class="small muted" style="margin:0 0 8px">${list.length} project${list.length === 1 ? '' : 's'}${profile?.age ? ` open to a ${profile.age}-year-old` : ''}</p>
          <div class="plist">${list.map(x => projectRow(x, appBy.get(x.p.id))).join('') || '<p class="empty">No projects match these filters. Try a larger radius or another cause.</p>'}</div>
        </section>
      </div>`;

    locBar($('#locbar'), loc, render);
    $('#f-cause').onchange = e => { filters.cause = e.target.value; render(); };
    $('#f-type').onchange = e => { filters.type = e.target.value; render(); };
    $('#f-remote').onchange = e => { filters.remote = e.target.checked; render(); };
    const fa = $('#f-all'); if (fa) fa.onchange = e => { filters.all = e.target.checked; render(); };
    $$('[data-apply]', el).forEach(b => b.onclick = () => act(b, async () => {
      if (!session) return go('#signup');
      if (!profileReady()) { toast('Add your skills first so the nonprofit can see your fit.'); return go('#me/profile'); }
      await db.apply(uid(), b.dataset.apply);
      toast('Applied. The nonprofit will see your skills and fit.');
      render();
    }));
    $$('[data-withdraw]', el).forEach(b => b.onclick = () => act(b, async () => { await db.withdraw(b.dataset.withdraw); render(); }));
  }

  function projectRow({ p, m }, app) {
    const org = p.org || {};
    let action;
    if (!m.ok) action = `<span class="tag wait">${esc(m.why)}</span>`;
    else if (p.is_example) action = `<a class="btn sm" href="${esc(org.url)}" target="_blank" rel="noopener">Volunteer with ${esc(org.name)} ↗</a><span class="xs muted">Example idea, not posted by this organization</span>`;
    else if (!app) action = `<button class="btn primary sm" data-apply="${p.id}">Apply</button>`;
    else if (app.status === 'applied') action = `<span class="tag wait">Applied ${ago(app.created_at)}</span><button class="btn quiet sm" data-withdraw="${app.id}">Withdraw</button>`;
    else if (app.status === 'accepted') action = `<span class="tag ok">You're on this project</span><a class="btn quiet sm" href="#me">Log hours</a>`;
    else action = '<span class="tag">Not selected this time</span>';
    return `<article class="project ${m.ok ? '' : 'dim'}">
      ${orgThumb(org)}
      <div>
        <div class="org"><b>${esc(org.name)}</b> ${typeTag(org)} ${causeTag(p.cause)}${p.is_example ? '<span class="tag example">Example listing</span>' : ''}</div>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.description)}</p>
        <div class="facts">${orgFacts(org, m.dist)}</div>
        <div class="tags" style="margin-top:8px">${skillTags(p.skills)}</div>
        <div class="meta"><span>About ${p.hours} hours over ${p.weeks} week${p.weeks > 1 ? 's' : ''}</span><span>${p.remote ? 'Remote work' : 'In person'}</span><span>Ages ${p.min_age}+</span></div>
        ${m.ok && m.reasons.length ? `<ul class="why">${m.reasons.map(r => `<li>${esc(r)}</li>`).join('')}${m.gaps.map(g => `<li class="gap">New for you: ${esc(g)}</li>`).join('')}</ul>` : ''}
        <div class="btn-row">${action}</div>
      </div>
      <div class="fit">${m.ok && m.pct != null ? `<b>${m.pct}%</b><span>fit for you</span><div class="bar"><i style="width:${m.pct}%"></i></div>` : ''}</div>
    </article>`;
  }

  // ================= MY VOLUNTEERING =================
  function meNav(active, pending = 0) {
    const items = [['me', 'Projects & hours' + (pending ? `<span class="count">${pending}</span>` : '')], ['me/certificate', 'Certificate'], ['me/profile', 'Profile']];
    return `<div class="page-head"><div><h1>My volunteering</h1></div></div>
      <nav class="subnav no-print">${items.map(([h, l]) => `<a href="#${h}" class="${h === active ? 'active' : ''}">${l}</a>`).join('')}</nav>`;
  }

  async function myVolunteering(el, live) {
    const [apps, logs] = await Promise.all([db.myApplications(uid()), db.myLogs(uid())]);
    if (!live()) return;
    const accepted = apps.filter(a => a.status === 'accepted');
    const ver = sum(logs.filter(l => l.status === 'verified').map(l => l.hours));
    const pen = logs.filter(l => l.status === 'pending');
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const statusTag = s => ({ applied: '<span class="tag wait">Waiting for reply</span>', accepted: '<span class="tag ok">Accepted</span>', declined: '<span class="tag">Not selected</span>' }[s]);

    el.innerHTML = `${meNav('me', pen.length)}
      ${!profileReady() ? '<div class="notice green">Start by <a href="#me/profile">adding your skills</a>. Then <a href="#browse">find a project</a>.</div>' : ''}
      <div class="stats">
        <div class="stat"><b>${hrs(ver)}</b><span>verified hours</span></div>
        <div class="stat"><b>${hrs(sum(pen.map(l => l.hours)))}</b><span>waiting for verification</span></div>
        <div class="stat"><b>${accepted.length}</b><span>projects joined</span></div>
        <div class="stat"><b>${money(ver * HOUR_VALUE)}</b><span>value of your help</span></div>
      </div>
      <div class="grid side">
        <form class="panel" id="lf">
          <h3>Log hours</h3>
          ${accepted.length ? `
            <label class="f">Project<select name="project">${accepted.map(a => `<option value="${a.project_id}">${esc(a.project.title)}</option>`).join('')}</select></label>
            <div class="row"><label class="f">Date<input type="date" name="date" value="${today}" max="${today}" required></label>
            <label class="f">Hours<input type="number" name="hours" min="0.25" max="12" step="0.25" value="1" required></label></div>
            <label class="f">What did you do?<textarea name="note" rows="3" required maxlength="300" placeholder="Finished three social graphics and sent them for review"></textarea></label>
            <button class="btn primary" style="width:100%">Send for verification</button>`
            : '<p class="small muted">Once a nonprofit accepts you to a project, you can log hours here.</p><a class="btn sm" href="#browse">Find a project</a>'}
        </form>
        <div>
          <h3>Applications</h3>
          ${apps.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Status</th><th class="num">Applied</th></tr></thead><tbody>
            ${apps.map(a => `<tr><td>${esc(a.project.title)}<div class="xs muted">${esc(a.project.org?.name)}</div></td><td>${statusTag(a.status)}</td><td class="num">${fmtDate(a.created_at)}</td></tr>`).join('')}</tbody></table></div>`
            : '<p class="empty">No applications yet. <a href="#browse">Browse projects</a>.</p>'}
          <h3 style="margin-top:28px">Hour log</h3>
          ${logs.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Project</th><th>What I did</th><th class="num">Hours</th><th>Status</th></tr></thead><tbody>
            ${logs.map(l => `<tr><td>${fmtDate(l.work_date)}</td><td>${esc(l.project?.title)}</td><td class="small">${esc(l.note)}</td><td class="num">${hrs(l.hours)}</td>
              <td>${{ verified: '<span class="tag ok">Verified</span>', pending: '<span class="tag wait">Pending</span>', rejected: '<span class="tag">Not approved</span>' }[l.status]}</td></tr>`).join('')}</tbody></table></div>`
            : '<p class="empty">No hours logged yet.</p>'}
        </div>
      </div>`;

    const f = $('#lf');
    if (f.project) f.onsubmit = e => {
      e.preventDefault();
      act($('button', f), async () => {
        await db.logHours(uid(), f.project.value, f.date.value, Number(f.hours.value), f.note.value.trim());
        toast('Hours sent. The nonprofit will verify them.');
        render();
      });
    };
  }

  // ================= PROFILE =================
  async function myProfile(el) {
    profile = await db.profile(uid());
    const p = profile;
    let loc = p.lat != null ? { lat: Number(p.lat), lon: Number(p.lon), label: p.location_label || 'Your area' } : null;
    const checks = (name, map, sel) => `<div class="checks">${Object.entries(map).map(([k, v]) =>
      `<label><input type="checkbox" name="${name}" value="${k}" ${sel.includes(k) ? 'checked' : ''}>${esc(typeof v === 'string' ? v : v.label)}</label>`).join('')}</div>`;
    el.innerHTML = `${meNav('me/profile')}
      <form id="pf" style="max-width:760px">
        <p class="xs muted" style="margin:0 0 14px">Fields marked ${REQ} are required.</p>
        <div class="row">
          <label class="f">First name${REQ}<input name="first_name" value="${esc(p.first_name)}" required maxlength="30"></label>
          <label class="f">Age${REQ}<input name="age" type="number" min="13" max="25" value="${p.age ?? ''}" required></label>
          <label class="f">Grade<select name="grade">${['7th', '8th', '9th', '10th', '11th', '12th', 'College'].map(g => `<option ${g === p.grade ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        </div>
        <fieldset><legend>Location <span class="hint">Used to find places to volunteer near you. Only an approximate area is saved.</span></legend>
          <div id="pf-loc"></div>
          <label class="f" style="margin-top:10px;max-width:240px">Search within<select name="radius_miles">${HR.data.RADII.map(r => `<option value="${r}" ${r === p.radius_miles ? 'selected' : ''}>${r} miles</option>`).join('')}</select></label>
        </fieldset>
        <fieldset><legend>What are you good at?${REQ}</legend>${checks('skills', SKILLS, p.skills)}</fieldset>
        <fieldset><legend>What do you want to learn? <span class="hint">Projects that teach these get a small boost.</span></legend>${checks('learn', SKILLS, p.learn)}</fieldset>
        <fieldset><legend>Causes you care about</legend>${checks('causes', CAUSES, p.causes)}</fieldset>
        <div class="row">
          <label class="f">Hours per week: <span id="hpw">${p.hours_per_week}</span><input name="hours_per_week" type="range" min="1" max="10" value="${p.hours_per_week}"></label>
          <label class="f">I can help<select name="mode">
            <option value="both" ${p.mode === 'both' ? 'selected' : ''}>Remote or in person</option>
            <option value="remote" ${p.mode === 'remote' ? 'selected' : ''}>Remote only</option>
            <option value="local" ${p.mode === 'local' ? 'selected' : ''}>In person near me</option></select></label>
        </div>
        <button class="btn primary">Save profile</button>
      </form>`;
    const f = $('#pf');
    const drawLoc = () => HR.location.widget($('#pf-loc'), loc, picked => { loc = picked; drawLoc(); });
    drawLoc();
    f.hours_per_week.oninput = e => $('#hpw').textContent = e.target.value;
    f.onsubmit = e => {
      e.preventDefault();
      const picked = n => $$(`input[name=${n}]:checked`, f).map(x => x.value);
      const age = Number(f.age.value);
      if (!age || age < 13 || age > 25) return toast('Enter an age from 13 to 25.');
      if (!picked('skills').length) return toast('Pick at least one skill.');
      act($('button.primary', f), async () => {
        profile = await db.saveProfile(uid(), { first_name: f.first_name.value.trim(), age, grade: f.grade.value,
          skills: picked('skills'), learn: picked('learn'), causes: picked('causes'), hours_per_week: Number(f.hours_per_week.value), mode: f.mode.value,
          lat: loc?.lat ?? null, lon: loc?.lon ?? null, location_label: loc?.label ?? null, radius_miles: Number(f.radius_miles.value) });
        renderAccount();
        toast('Profile saved. Here are your matches.');
        go('#browse');
      });
    };
  }

  // ================= CERTIFICATE =================
  async function certificate(el, live) {
    const logs = (await db.myLogs(uid())).filter(l => l.status === 'verified').sort((a, b) => a.work_date.localeCompare(b.work_date));
    if (!live()) return;
    const byProject = {};
    logs.forEach(l => (byProject[l.project_id] = byProject[l.project_id] || []).push(l));
    const total = sum(logs.map(l => l.hours));
    const skills = [...new Set(logs.flatMap(l => l.project?.skills || []))];
    const code = 'HR-' + [...logs.map(l => l.id).join('') + total].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36).toUpperCase().slice(0, 6);

    el.innerHTML = `${meNav('me/certificate')}
      ${logs.length ? `<div class="btn-row no-print" style="margin-bottom:18px"><button class="btn primary" id="print">Print or save as PDF</button><span class="small muted">For graduation, honor society, scholarship or college applications.</span></div>
      <article class="cert">
        <div class="eyebrow">Handraise · Certificate of verified service</div>
        <h1>${esc(profile.first_name)}</h1>
        <p class="muted">${esc(profile.grade || '')}${profile.grade ? ' grade · ' : ''}issued ${fmtLong(Date.now())}</p>
        <div class="total">${hrs(total)} hours</div>
        <p>of skills-based community service. Each entry was verified by the organization served. The estimated value to the community is ${money(total * HOUR_VALUE)}.</p>
        <div class="table-wrap"><table><thead><tr><th>Organization</th><th>Project</th><th>Dates</th><th class="num">Hours</th></tr></thead><tbody>
        ${Object.values(byProject).map(ls => `<tr><td>${esc(ls[0].project?.org?.name)}</td><td>${esc(ls[0].project?.title)}</td><td>${fmtDate(ls[0].work_date)}${ls.length > 1 ? ' – ' + fmtDate(ls.at(-1).work_date) : ''}</td><td class="num">${hrs(sum(ls.map(l => l.hours)))}</td></tr>`).join('')}
        </tbody></table></div>
        ${skills.length ? `<p class="small" style="margin-top:18px"><b>Skills applied:</b> ${skills.map(k => esc(SKILLS[k] || k)).join(', ')}</p>` : ''}
        <div class="sig"><span>Verification ID ${code}</span><span>handraise · verified hours only</span></div>
      </article>` : '<p class="empty">No verified hours yet. When a nonprofit verifies your hours, your certificate appears here.</p>'}`;
    const pb = $('#print'); if (pb) pb.onclick = () => window.print();
  }

  // ================= NONPROFIT =================
  async function orgHome(el, live) {
    const org = await db.myOrg(uid());
    if (!live()) return;
    if (!org) return orgSetup(el);
    const [projects, apps, logs] = await Promise.all([db.orgProjects(org.id), db.orgApplications(org.id), db.orgLogs(org.id)]);
    if (!live()) return;
    const waiting = apps.filter(a => a.status === 'applied');
    const pending = logs.filter(l => l.status === 'pending');
    const vh = sum(logs.filter(l => l.status === 'verified').map(l => l.hours));

    el.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Your organization</div><h1>${esc(org.name)}</h1><p>${esc(org.blurb || '')}</p></div>
        <a class="btn primary" href="#org/new">Post a project</a></div>
      <div class="stats">
        <div class="stat"><b>${projects.filter(p => p.status === 'open').length}</b><span>open projects</span></div>
        <div class="stat"><b>${waiting.length}</b><span>new applicants</span></div>
        <div class="stat"><b>${hrs(sum(pending.map(l => l.hours)))}</b><span>hours to verify</span></div>
        <div class="stat"><b>${money(vh * HOUR_VALUE)}</b><span>value received (${hrs(vh)} hrs)</span></div>
      </div>
      <div class="grid g2">
        <div class="stack">
          <div class="panel"><h2>Hours to verify</h2><p class="panel-sub">Verifying gives students hours they can prove.</p>
            ${pending.length ? pending.map(l => `<div class="person"><div><div class="nm">${esc(l.student?.first_name || 'Student')} · ${hrs(l.hours)} hrs · ${fmtDate(l.work_date)}</div>
              <div class="sub">${esc(l.project.title)}</div><div class="small" style="margin-top:4px">${esc(l.note)}</div></div>
              <div class="btn-row"><button class="btn primary sm" data-ver="${l.id}">Verify</button><button class="btn sm" data-rej="${l.id}">Decline</button></div></div>`).join('') : '<p class="empty" style="padding:4px 0">Nothing waiting.</p>'}</div>
          <div class="panel"><h2>Applicants</h2><p class="panel-sub">Ranked by fit. You see first name, age, grade and skills only.</p>
            ${waiting.length ? waiting.map(a => ({ a, m: HR.match.score(a.student, a.project, null) })).sort((x, y) => (y.m.pct || 0) - (x.m.pct || 0)).map(({ a, m }) => `
              <div class="person"><div><div class="nm">${esc(a.student.first_name)} · ${a.student.age ?? '?'} · ${esc(a.student.grade || '')}${m.ok ? ` · <span style="color:var(--green)">${m.pct}% fit</span>` : ''}</div>
              <div class="sub">For: ${esc(a.project.title)}</div><div class="tags" style="margin-top:6px">${skillTags(a.student.skills)}</div></div>
              <div class="btn-row"><button class="btn primary sm" data-acc="${a.id}">Accept</button><button class="btn sm" data-dec="${a.id}">Decline</button></div></div>`).join('') : '<p class="empty" style="padding:4px 0">No new applicants.</p>'}</div>
        </div>
        <div class="panel"><h2>Your projects</h2>
          ${projects.length ? projects.map(p => {
            const team = apps.filter(a => a.project_id === p.id && a.status === 'accepted').map(a => a.student.first_name);
            return `<div class="person"><div><div class="nm">${esc(p.title)}</div>
              <div class="sub">About ${p.hours} hrs · ${p.remote ? 'Remote' : 'In person'} · posted ${ago(p.created_at)}${team.length ? ' · Team: ' + team.map(esc).join(', ') : ''}</div>
              <div class="tags" style="margin-top:6px">${skillTags(p.skills)}</div></div>
              <div class="btn-row">${{ open: '<span class="tag wait">Open</span>', filled: '<span class="tag">Team full</span>', done: '<span class="tag ok">Complete</span>' }[p.status]}
              <select class="sm" data-status="${p.id}" aria-label="Project status" style="width:auto;margin:0;padding:4px 6px;font-size:.82rem">
                ${['open', 'filled', 'done'].map(s => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${{ open: 'Open', filled: 'Team full', done: 'Complete' }[s]}</option>`).join('')}</select></div></div>`;
          }).join('') : '<p class="empty">No projects yet. <a href="#org/new">Post your first one</a>.</p>'}
        </div>
      </div>`;

    $$('[data-ver]', el).forEach(b => b.onclick = () => act(b, async () => { await db.verify(b.dataset.ver, true); toast('Hours verified.'); render(); }));
    $$('[data-rej]', el).forEach(b => b.onclick = () => act(b, async () => { await db.verify(b.dataset.rej, false); render(); }));
    $$('[data-acc]', el).forEach(b => b.onclick = () => act(b, async () => { await db.decide(b.dataset.acc, 'accepted'); toast('Accepted. The student can start and log hours.'); render(); }));
    $$('[data-dec]', el).forEach(b => b.onclick = () => act(b, async () => { await db.decide(b.dataset.dec, 'declined'); render(); }));
    $$('[data-status]', el).forEach(s => s.onchange = () => act(null, async () => { await db.setProjectStatus(s.dataset.status, s.value); toast('Project updated'); render(); }));
  }

  function orgSetup(el) {
    el.innerHTML = `<div style="max-width:640px">
      <div class="eyebrow">For nonprofits</div><h1>Register your organization</h1>
      <p class="muted">Takes a minute. Then describe what you need and Handraise turns it into a project students can apply to.</p>
      <form id="of" class="panel" style="margin-top:18px">
        <p class="xs muted" style="margin:0 0 14px">Fields marked ${REQ} are required.</p>
        <label class="f">Organization name${REQ}<input name="name" required maxlength="120"></label>
        <label class="f">Type of organization${REQ}<select name="org_type" required>${Object.entries(ORG_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        ${causeField('Main cause')}
        <label class="f">What you do <span class="hint">(one or two sentences)</span><textarea name="blurb" rows="3" maxlength="400"></textarea></label>
        <label class="f">Street address<span id="addr-req">${REQ}</span> <span class="hint">(so nearby students can find you)</span><input name="address" required placeholder="123 Main St, Austin, TX 78701" autocomplete="street-address"></label>
        <label class="f" style="display:flex;align-items:center;font-weight:400"><input type="checkbox" name="online">We're online-only (students anywhere can help)</label>
        <div class="row"><label class="f">Website<input name="url" type="url" placeholder="https://"></label>
        <label class="f">Photo URL <span class="hint">(optional)</span><input name="image_url" type="url" placeholder="https://…/photo.jpg"></label></div>
        <button class="btn primary">Create organization</button>
      </form></div>`;
    const f = $('#of');
    wireCause(f);
    f.online.onchange = () => { f.address.required = !f.online.checked; f.address.disabled = f.online.checked; $('#addr-req').hidden = f.online.checked; };
    f.onsubmit = e => {
      e.preventDefault();
      act($('button.primary', f), async () => {
        const url = f.url.value.trim(), img = f.image_url.value.trim();
        if (f.name.value.trim().length < 2) throw new Error('Enter your organization\'s name.');
        const cause = readCause(f);
        let place = null;
        if (!f.online.checked) {
          if (!f.address.value.trim()) throw new Error('Enter your street address, or check online-only.');
          place = await HR.location.geocodeAddress(f.address.value.trim());
          if (!place) throw new Error('We couldn\'t find that address. Include the city, state and ZIP.');
        }
        await db.createOrg({ owner_id: uid(), name: f.name.value.trim(), org_type: f.org_type.value, cause, blurb: f.blurb.value.trim(),
          url: /^https:\/\//.test(url) ? url : null, image_url: /^https:\/\//.test(img) ? img : null,
          is_national: f.online.checked, address: place ? f.address.value.trim() : null,
          city: place?.city || null, state: place?.state || null, zip: place?.zip || null, lat: place?.lat ?? null, lon: place?.lon ?? null });
        toast('Organization created. Now post your first project.');
        go('#org/new');
      });
    };
  }

  async function orgNew(el, live) {
    const org = await db.myOrg(uid());
    if (!live()) return;
    if (!org) return go('#org');
    const examples = [
      'We want more people to come to our food drive. Our flyers are plain and we barely post on Instagram.',
      'Half the families we serve speak Spanish, but our sign-up form is only in English.',
      'We track donations on paper and keep running out of rice and canned beans.',
      'Our seniors have tablets but don\'t know how to video call their families. It would be in person at our center.'
    ];
    el.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">${esc(org.name)}</div><h1>Post a project</h1>
        <p>Describe what you need in your own words. Handraise suggests a student-sized project you can edit before publishing.</p></div></div>
      <div class="grid g2">
        <div>
          <label class="f">What do you need help with?<textarea id="need" rows="6" placeholder="We want more people to come to our food drive…"></textarea></label>
          <button class="btn primary" id="build">Suggest a project</button>
          <div class="examples"><span class="xs muted">Or try an example:</span>${examples.map((x, i) => `<button class="linkish small" data-ex="${i}">${esc(x.slice(0, 60))}…</button>`).join('')}</div>
          <div id="found"></div>
        </div>
        <form class="panel" id="pf">
          <p class="xs muted" style="margin:0 0 14px">Fields marked ${REQ} are required.</p>
          <label class="f">Title${REQ}<input name="title" required maxlength="120"></label>
          <label class="f">Description${REQ}<textarea name="description" rows="3" required maxlength="600"></textarea></label>
          <fieldset><legend>Skills needed${REQ}</legend><div class="checks">${Object.entries(SKILLS).map(([k, v]) => `<label><input type="checkbox" name="skills" value="${k}">${esc(v)}</label>`).join('')}</div></fieldset>
          <div class="row">
            <label class="f">Total hours${REQ}<input name="hours" type="number" min="1" max="80" value="6" required></label>
            <label class="f">Weeks${REQ}<input name="weeks" type="number" min="1" max="26" value="2" required></label>
            <label class="f">Minimum age${REQ}<select name="min_age">${[13, 14, 15, 16, 18].map(a => `<option>${a}</option>`).join('')}</select></label>
          </div>
          <div class="row">
            <label class="f">Where${REQ}<select name="remote"><option value="1">Remote</option><option value="0">In person</option></select></label>
            <div style="flex:1">${causeField('Cause', org.cause)}</div>
          </div>
          <label class="f">Deliverables <span class="hint">(one per line)</span><textarea name="deliverables" rows="3"></textarea></label>
          <button class="btn primary" style="width:100%">Publish project</button>
        </form>
      </div>`;

    const f = $('#pf');
    wireCause(f);
    $$('[data-ex]', el).forEach(b => b.onclick = () => { $('#need').value = examples[b.dataset.ex]; $('#build').click(); });
    $('#build').onclick = () => {
      const text = $('#need').value.trim();
      if (!text) return toast('Describe what you need first.');
      const r = HR.scope.analyze(text, org.cause);
      if (!r) { $('#found').innerHTML = '<div class="found">No specific skills found. Try naming what you want made or done, like a flyer, website, translation or tutoring.</div>'; return; }
      f.title.value = r.title; f.description.value = text.slice(0, 600);
      $$('input[name=skills]', f).forEach(c => c.checked = r.skills.includes(c.value));
      f.hours.value = r.hours; f.weeks.value = r.weeks; f.min_age.value = r.minAge; f.remote.value = r.remote ? '1' : '0';
      f.deliverables.value = r.deliverables.join('\n');
      let shown = esc(text);
      r.evidence.flatMap(e => e.words).sort((a, b) => b.length - a.length).forEach(w => {
        shown = shown.replace(new RegExp('(' + esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![^<]*>)', 'ig'), '<mark>$1</mark>');
      });
      $('#found').innerHTML = `<div class="found"><p style="margin:0 0 8px">${shown}</p>
        ${r.evidence.map(e => `<b>${esc(SKILLS[e.skill])}</b>, from “${e.words.map(esc).join('”, “')}”`).join('<br>')}
        <br><b>${r.remote ? 'Remote' : 'In person'}</b>, about ${r.hours} hours over ${r.weeks} weeks</div>
        <p class="small muted">Review the details, change anything you like, then publish.</p>`;
    };
    f.onsubmit = e => {
      e.preventDefault();
      const skills = $$('input[name=skills]:checked', f).map(x => x.value);
      if (!skills.length) return toast('Pick at least one skill.');
      act($('button.primary', f), async () => {
        if (f.title.value.trim().length < 3) throw new Error('Give the project a title.');
        if (!f.description.value.trim()) throw new Error('Add a short description.');
        const cause = readCause(f);
        await db.addProject({ org_id: org.id, title: f.title.value.trim(), description: f.description.value.trim(), skills,
          hours: Number(f.hours.value), weeks: Number(f.weeks.value), min_age: Number(f.min_age.value), remote: f.remote.value === '1',
          cause, deliverables: f.deliverables.value.split('\n').map(s => s.trim()).filter(Boolean) });
        toast('Published. Students can apply now.');
        go('#org');
      });
    };
  }

  // ================= HOW IT WORKS =================
  // One page that explains the problem, the approach and the tech, with two demos that work without an account
  async function about(el, live) {
    const projects = await db.projects();
    if (!live()) return;
    // The demo ranks online programs, so it works for anyone, anywhere
    const pool = projects.filter(p => p.status === 'open' && p.org?.is_national);
    const weights = [['Skills', HR.match.W.skill, 'Your best related skill for each one the project needs'], ['Cause', HR.match.W.cause, 'You picked the project\'s cause'],
      ['Time', HR.match.W.time, 'Your hours per week ÷ the hours it needs'], ['Distance', HR.match.W.place, 'Closer is better; remote work gets full marks'], ['Growth', HR.match.W.growth, 'It uses a skill you want to learn']];
    const compare = [
      ['What you do', 'Generic shifts: sort cans, stuff envelopes', 'Real work that uses your skills: a flyer, a translated form, a spreadsheet'],
      ['Finding a fit', 'The same long list for everyone', 'Ranked for you by skills, causes, schedule, age and distance, with the reasons'],
      ['Posting a need', 'Long forms a busy director has to fill in', 'One sentence in plain words becomes a student-sized project'],
      ['Proving hours', 'Paper forms that need a signature and get lost', 'The nonprofit verifies hours in the app, and the database stops anyone faking them'],
      ['Small nonprofits', 'Skilled help costs money they don\'t have', 'Free help sized to what a student can finish in a few weeks']];

    el.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">How it works</div><h1>A matchmaker for student skills and small nonprofits</h1>
        <p>Who Handraise is for, what makes it different, and how it's built. Both demos below work without an account.</p></div></div>

      <div class="section-title"><h2>Who it's for</h2></div>
      <div class="grid g3">
        <div class="panel"><h3>Students, 13 to 25</h3><p class="small">They need service hours for graduation, the National Honor Society, scholarships and college applications. Many can already design, translate, code or tutor, but the usual listings don't ask for any of that.</p></div>
        <div class="panel"><h3>Small nonprofits</h3><p class="small">92% of U.S. nonprofits have budgets under $1 million (National Council of Nonprofits). A flyer, a translated sign-up form or a cleaner spreadsheet is work they need done but can't pay for.</p></div>
        <div class="panel"><h3>Schools and service clubs</h3><p class="small">Counselors and club advisors need hour records they can trust. Handraise records hours only after the nonprofit verifies them, and every certificate has a verification ID.</p></div>
      </div>

      <div class="section-title"><h2>What's different</h2></div>
      <div class="table-wrap"><table class="compare"><thead><tr><th></th><th>Typical volunteer listings</th><th>Handraise</th></tr></thead><tbody>
        ${compare.map(([a, b, c]) => `<tr><th scope="row">${a}</th><td class="muted">${b}</td><td>${c}</td></tr>`).join('')}</tbody></table></div>

      <div class="section-title"><h2>Try the matching engine</h2></div>
      <div class="grid side">
        <form class="panel" id="demo-m">
          <p class="small" style="margin-top:0">Pick a few skills and a cause, like a student would. Online programs are re-ranked instantly.</p>
          <fieldset><legend>Skills</legend><div class="checks">${['design', 'writing', 'translate', 'coding', 'research', 'tutoring', 'social', 'data'].filter(k => SKILLS[k]).map(k => `<label><input type="checkbox" name="skills" value="${k}" ${k === 'writing' || k === 'research' ? 'checked' : ''}>${esc(SKILLS[k])}</label>`).join('')}</div></fieldset>
          <label class="f">Cause<select name="cause"><option value="">None</option>${Object.entries(CAUSES).map(([k, c]) => `<option value="${k}" ${k === 'education' ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>
          <label class="f">Hours per week: <span id="dm-h">3</span><input type="range" name="hours" min="1" max="10" value="3"></label>
        </form>
        <div><div id="demo-out" aria-live="polite"></div>
          <h3 style="margin-top:24px">How the score works</h3>
          <p class="small muted">First, hard rules: projects for older students, projects outside your radius and in-person work for remote-only students are filtered out. Then each project gets a weighted score:</p>
          <div class="weights">${weights.map(([n, w, d]) => `<div class="weight"><span class="wn">${n}</span><span class="wbar"><i style="width:${w * 200}%"></i></span><b>${Math.round(w * 100)}%</b><span class="wd xs muted">${d}</span></div>`).join('')}</div>
          <p class="small muted">Related skills earn partial credit (design counts 50% toward social media, website building 70% toward coding), so good matches aren't hidden by exact wording. Every point of the score comes with a plain-English reason, so students can see why a project was suggested.</p>
        </div>
      </div>

      <div class="section-title"><h2>Try the project builder</h2></div>
      <div class="grid g2">
        <div>
          <label class="f">A nonprofit describes what it needs<textarea id="demo-need" rows="4">Half the families we serve speak Spanish, but our sign-up form is only in English.</textarea></label>
          <button class="btn primary" id="demo-build">Build the project</button>
          <p class="xs muted" style="margin-top:10px">It looks for about 140 phrases across ${Object.keys(SKILLS).length} skills (“flyer” → graphic design, “Instagram” → social media), then sizes the project for a student. It's rule-based, so it's fast, free and shows exactly which words it used.</p>
        </div>
        <div id="demo-proj" aria-live="polite"></div>
      </div>

      <div class="section-title"><h2>Built for trust and safety</h2></div>
      <div class="grid g2">
        <ul class="checklist">
          <li><b>Rules live in the database.</b> Row-level security means students can only log hours on projects that accepted them, and only the nonprofit can verify them. Hiding buttons isn't enough, because anyone can call the API from the browser console.</li>
          <li><b>Ages 13 and up.</b> The database refuses sign-ups under 13, and students only see projects they're old enough for.</li>
          <li><b>Location stays private.</b> It's opt-in, rounded to about 1 km, and stored in a table only the student can read. Nonprofits never see it.</li>
        </ul>
        <ul class="checklist">
          <li><b>Nonprofits see only their applicants.</b> A student's profile is shared only with nonprofits they applied to, and visitors who aren't signed in see no personal information.</li>
          <li><b>Real organizations, labeled honestly.</b> The ${new Set(projects.filter(p => p.is_example).map(p => p.org_id)).size} real organizations (nonprofits, public libraries, parks departments, hospitals, museums and government programs) are example listings with links to their own volunteer pages, and each is labeled with what kind of place it is. The database blocks applications to them.</li>
          <li><b>Public totals only.</b> The Impact page uses a database function that returns totals, never names. <a href="privacy.html">Privacy policy</a></li>
        </ul>
      </div>

      <div class="section-title"><h2>How it's built</h2></div>
      <div class="arch" role="img" aria-label="The browser app talks to Supabase for sign-in and data, and to OpenStreetMap and Open-Meteo for locations. Netlify hosts the site.">
        <div class="node"><b>Browser app</b><span>HTML, CSS and JavaScript with no build step. Matching, project builder and charts run here.</span></div>
        <div class="link" aria-hidden="true">→</div>
        <div class="node"><b>Supabase</b><span>Sign-in (email or Google) and a Postgres database with row-level security on every table</span></div>
        <div class="link" aria-hidden="true">+</div>
        <div class="node"><b>Maps</b><span>OpenStreetMap and Open-Meteo turn addresses and ZIP codes into coordinates. Distances use the haversine formula.</span></div>
      </div>
      <p class="small muted" style="margin-top:12px">Hosted on Netlify. It costs nothing to run at school scale, and a new city only needs nonprofits to sign up, with no new code.</p>

      <div class="section-title"><h2>What's next</h2></div>
      <ol class="steps">
        <li>Pilot with a local nonprofit and a school service club, and measure how many projects get finished.</li>
        <li>Parent consent for students under 18, and sign-in with school email accounts.</li>
        <li>A counselor view, so schools can accept Handraise certificates directly.</li>
        <li>Learn the matching weights from which matches lead to finished projects.</li>
        <li>A Spanish-language version for nonprofits and families.</li>
      </ol>`;

    // ---- matching demo ----
    const mf = $('#demo-m');
    const runMatch = () => {
      $('#dm-h').textContent = mf.hours.value;
      const s = { age: 16, mode: 'both', skills: $$('input[name=skills]:checked', mf).map(x => x.value), learn: [], causes: mf.cause.value ? [mf.cause.value] : [], hours_per_week: Number(mf.hours.value) };
      if (!s.skills.length) { $('#demo-out').innerHTML = '<p class="empty">Pick at least one skill.</p>'; return; }
      const top = pool.map(p => ({ p, m: HR.match.score(s, p, null) })).filter(x => x.m.ok).sort((a, b) => b.m.pct - a.m.pct).slice(0, 3);
      $('#demo-out').innerHTML = `<p class="eyebrow">Top matches for this student</p>` + top.map(({ p, m }) => `<div class="demo-row">
        <div class="fit"><b>${m.pct}%</b><span>fit</span></div>
        <div><b>${esc(p.title)}</b><div class="xs muted">${esc(p.org.name)}</div>
          <ul class="why">${m.reasons.map(r => `<li>${esc(r)}</li>`).join('')}${m.gaps.map(g => `<li class="gap">${esc(g)}</li>`).join('')}</ul></div></div>`).join('');
    };
    mf.oninput = runMatch;
    runMatch();

    // ---- project builder demo ----
    const build = () => {
      const text = $('#demo-need').value.trim();
      const r = text && HR.scope.analyze(text, 'education');
      if (!r) { $('#demo-proj').innerHTML = '<div class="found">No specific skills found. Try naming something to make or do, like a flyer, a website, a translation or tutoring.</div>'; return; }
      $('#demo-proj').innerHTML = `<div class="panel"><div class="eyebrow">Suggested project</div><h3>${esc(r.title)}</h3>
        <div class="tags" style="margin:8px 0 12px">${skillTags(r.skills)}</div>
        <p class="small" style="margin-bottom:8px">About <b>${r.hours} hours</b> over <b>${r.weeks} week${r.weeks > 1 ? 's' : ''}</b> · ${r.remote ? 'Remote' : 'In person'} · Ages ${r.minAge}+</p>
        ${r.deliverables.length ? `<ul class="small" style="margin:0 0 10px;padding-left:18px">${r.deliverables.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        <p class="xs muted" style="margin:0">Found from: ${r.evidence.map(e => `<b>${esc(SKILLS[e.skill])}</b> ← “${e.words.map(esc).join('”, “')}”`).join(' · ')}</p></div>`;
    };
    $('#demo-build').onclick = build;
    build();
  }

  // ================= IMPACT =================
  async function impact(el, live) {
    const [s, projects] = await Promise.all([db.stats(), db.projects()]);
    if (!live()) return;
    const open = projects.filter(p => p.status === 'open');
    const supply = s.skill_supply || {};
    const gap = Object.keys(SKILLS).map(k => ({ k, demand: open.filter(p => p.skills.includes(k)).length, supply: supply[k] || 0 }))
      .filter(x => x.demand || x.supply).sort((a, b) => (b.demand - b.supply) - (a.demand - a.supply));
    const worst = gap[0];
    const hasHours = Number(s.verified_hours) > 0;

    el.innerHTML = `
      <div class="page-head"><div><h1>Community impact</h1><p>Live from the Handraise database. Hours count only after a nonprofit verifies them.</p></div></div>
      <div class="stats">
        <div class="stat"><b>${hrs(s.verified_hours)}</b><span>verified hours</span></div>
        <div class="stat"><b>${money(s.verified_hours * HOUR_VALUE)}</b><span>value to nonprofits</span></div>
        <div class="stat"><b>${s.orgs_helped}</b><span>organizations helped</span></div>
        <div class="stat"><b>${s.students}</b><span>students with profiles</span></div>
        <div class="stat"><b>${s.projects_done}</b><span>projects completed</span></div>
      </div>
      <div class="grid g2">
        <div><div class="section-title" style="margin-top:0"><h2>Hours by cause</h2></div>${hasHours ? '<div class="chart-box"><canvas id="c-cause"></canvas></div>' : '<p class="empty">Charts appear once the first hours are verified.</p>'}</div>
        <div><div class="section-title" style="margin-top:0"><h2>Verified hours by week</h2></div>${hasHours ? '<div class="chart-box"><canvas id="c-week"></canvas></div>' : '<p class="empty">No verified hours yet.</p>'}</div>
      </div>
      <div class="section-title"><h2>Skills gap</h2></div>
      <p class="muted small">Open projects that need each skill, compared with students who list it. It shows schools and clubs which workshops would help most.</p>
      <div class="chart-box" style="height:${Math.max(240, gap.length * 28)}px"><canvas id="c-gap"></canvas></div>
      ${worst && worst.demand > worst.supply ? `<div class="notice green" style="margin-top:16px"><b>Biggest gap: ${esc(SKILLS[worst.k])}.</b> ${worst.demand} open project${worst.demand > 1 ? 's need' : ' needs'} it and ${worst.supply} student${worst.supply === 1 ? ' lists' : 's list'} it. One ${esc(SKILLS[worst.k]).toLowerCase()} workshop at a school club could open up these projects.</div>` : ''}
      <p class="xs muted" style="margin-top:14px">Dollar value uses Independent Sector's estimate of $${HOUR_VALUE} per volunteer hour (2023).</p>`;

    if (!window.Chart) return;
    const css = getComputedStyle(document.documentElement);
    const v = n => css.getPropertyValue(n).trim();
    Object.assign(Chart.defaults, { color: v('--muted'), borderColor: v('--rule'), maintainAspectRatio: false });
    Chart.defaults.font.family = 'Public Sans, system-ui, sans-serif';

    if (hasHours) {
      const bc = s.by_cause, keys = Object.keys(bc);
      charts.push(new Chart($('#c-cause'), { type: 'bar',
        data: { labels: keys.map(k => CAUSES[k]?.label || k), datasets: [{ data: keys.map(k => bc[k]), backgroundColor: v('--green'), borderRadius: 2 }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, title: { display: true, text: 'Hours' } } } } }));
      charts.push(new Chart($('#c-week'), { type: 'bar',
        data: { labels: s.weekly.map(w => fmtDate(w.week)), datasets: [{ data: s.weekly.map(w => w.hours), backgroundColor: v('--green'), borderRadius: 2 }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours' } } } } }));
    }
    charts.push(new Chart($('#c-gap'), { type: 'bar',
      data: { labels: gap.map(x => SKILLS[x.k]), datasets: [
        { label: 'Open projects needing it', data: gap.map(x => x.demand), backgroundColor: v('--orange'), borderRadius: 2 },
        { label: 'Students with the skill', data: gap.map(x => x.supply), backgroundColor: v('--green'), borderRadius: 2 }] },
      options: { indexAxis: 'y', plugins: { legend: { position: 'top', align: 'start', labels: { boxWidth: 10 } } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } } }));
  }

  // ---------- boot ----------
  async function setSession(s) {
    const was = uid();
    session = s;
    profile = s ? await db.profile(s.user.id).catch(() => null) : null;
    renderAccount();
    if (s && !was) {
      // Just signed in: send them where they were heading
      const after = sessionStorage.getItem('hr.after');
      sessionStorage.removeItem('hr.after');
      const target = after || (location.hash === '#signin' || location.hash === '#signup' ? '#browse' : location.hash || '#home');
      if (location.hash !== target) { location.hash = target; return; }
    }
    render();
  }

  // Move keyboard and screen-reader focus to the new page, like a real page load would
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); $('#view').focus({ preventScroll: true }); });
  $('.skip').onclick = e => { e.preventDefault(); $('#view').focus(); };

  // ---------- light / dark mode ----------
  // No saved choice = follow the device setting. The choice is applied before paint by a script in index.html.
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (document.documentElement.dataset.theme || (darkMQ.matches ? 'dark' : 'light')) === 'dark';
  function syncThemeBtn() {
    const b = $('#theme');
    b.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
    b.title = b.getAttribute('aria-label');
    $('meta[name=theme-color]').content = isDark() ? '#161917' : '#1f5a43';
  }
  $('#theme').onclick = () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('hr.theme', next); } catch (e) {}
    syncThemeBtn();
    if (charts.length) render(); // charts read colors when drawn
  };
  darkMQ.addEventListener('change', () => { syncThemeBtn(); if (charts.length) render(); });
  syncThemeBtn();
  // Org photos come from their own websites; if one fails to load, show initials instead
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('thumb')) return;
    const size = ['card', 'wide'].find(s => img.classList.contains(s)) || '';
    img.outerHTML = causeArt(img.dataset.cause, size);
  }, true);
  (async () => {
    await setSession(await db.session());
    db.onAuth(s => { if ((s?.user?.id) !== uid()) setSession(s); });
  })();
})(window.HR);
