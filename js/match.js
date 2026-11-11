// match.js — the matching engine. Scores how well a project fits a student and explains why.
//
//   score = 50% skill fit + 20% cause + 15% time fit + 10% distance + 5% growth
//
// Hard rules first (age limit, outside the student's search radius, in person for a remote-only
// student), then a weighted score so every match comes with plain-English reasons.
window.HR = window.HR || {};
(function (HR) {
  const W = { skill: .50, cause: .20, time: .15, place: .10, growth: .05 };

  function miles(a, b) {
    const R = 3958.8, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Distance from the student to an org, or null when either location is unknown / org is online-only
  function distanceTo(loc, org) {
    if (!loc || org.is_national || org.lat == null) return null;
    return miles(loc, org);
  }

  // s = student profile (may be null when signed out), p = project with p.org, loc = { lat, lon, radius }
  function score(s, p, loc) {
    const { SKILLS, CAUSES, related } = HR.data;
    const org = p.org || {};
    const dist = distanceTo(loc, org);
    const radius = loc?.radius || 25;

    // ---- Hard rules ----
    if (s?.age && s.age < p.min_age) return { ok: false, why: `Ages ${p.min_age}+`, dist };
    if (dist != null && dist > radius) return { ok: false, why: `${Math.round(dist)} miles away`, dist };
    if (!p.remote && s?.mode === 'remote') return { ok: false, why: 'In person only', dist };

    // Without skills we can still filter by age and distance, just not score
    if (!s || !s.skills?.length) return { ok: true, pct: null, reasons: [], gaps: [], dist };

    const reasons = [], gaps = [];
    const perSkill = p.skills.map(k => {
      let best = 0, via = null;
      for (const mine of s.skills) { const r = related(k, mine); if (r > best) { best = r; via = mine; } }
      if (best < 1 && (s.learn || []).includes(k)) { best = Math.max(best, .35); via = 'learn'; }
      return { k, best, via };
    });
    const skill = perSkill.length ? perSkill.reduce((t, x) => t + x.best, 0) / perSkill.length : 0;
    const exact = perSkill.filter(x => x.best === 1).map(x => SKILLS[x.k]);
    if (exact.length) reasons.push(`You know ${exact.join(' and ')}`);
    perSkill.filter(x => x.best > 0 && x.best < 1 && x.via !== 'learn')
      .forEach(x => reasons.push(`Your ${SKILLS[x.via].toLowerCase()} experience carries over to ${SKILLS[x.k].toLowerCase()}`));
    perSkill.filter(x => x.best === 0).forEach(x => gaps.push(SKILLS[x.k]));

    const cause = (s.causes || []).includes(p.cause) ? 1 : 0;
    if (cause) reasons.push(`You care about ${CAUSES[p.cause].label.toLowerCase()}`);

    const perWeek = p.hours / p.weeks;
    const time = Math.min(1, s.hours_per_week / perWeek);
    if (time >= 1) reasons.push(`Fits your ${s.hours_per_week} hours a week`);
    else gaps.push(`About ${perWeek.toFixed(1)} hours a week`);

    // Online programs and remote work score full marks; local work scores by closeness
    const place = org.is_national || (p.remote && dist == null) ? 1 : dist == null ? .5 : Math.max(0, 1 - dist / radius);
    if (org.is_national) reasons.push('Online, so you can help from anywhere');
    else if (dist != null) reasons.push(`${dist < 1 ? 'Under a mile' : dist.toFixed(1) + ' miles'} from you${p.remote ? ', and the work itself is remote' : ''}`);
    else if (p.remote) reasons.push('Remote, so you can do it from home');

    const learnHit = p.skills.filter(k => (s.learn || []).includes(k));
    const growth = learnHit.length ? 1 : 0;
    if (growth) reasons.push(`Builds ${learnHit.map(k => SKILLS[k].toLowerCase()).join(', ')}, which you want to learn`);

    const total = W.skill * skill + W.cause * cause + W.time * time + W.place * place + W.growth * growth;
    return { ok: true, pct: Math.round(total * 100), reasons, gaps, dist };
  }

  HR.match = { score, miles, distanceTo, W };
})(window.HR);
