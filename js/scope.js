// scope.js — Smart Project Builder.
// A busy nonprofit director types their problem in everyday words ("our flyers look bad and nobody
// comes to our food drive"). We turn that into a clear, student-sized micro-project:
// skills needed, hours, timeline, remote or not, and deliverables.
//
// How: keyword/phrase detection over a skill vocabulary (a simple natural-language-processing
// technique), with each match shown to the user so they can see and fix what it found.
window.HR = window.HR || {};
(function (HR) {
  const VOCAB = {
    design: ['flyer', 'flier', 'poster', 'logo', 'canva', 'graphic', 'brochure', 'banner', 'design', 'look bad', 'ugly', 'layout'],
    social: ['instagram', 'tiktok', 'social media', 'facebook', 'followers', 'posts', 'post more', 'nobody knows', 'awareness', 'content'],
    writing: ['newsletter', 'write', 'writing', 'blog', 'letter', 'stories', 'story', 'edit', 'proofread', 'thank-you', 'thank you'],
    web: ['website', 'web site', 'web page', 'webpage', 'donation page', 'wix', 'squarespace', 'online form', 'google site'],
    photo: ['photo', 'make a video', 'video editing', 'film', 'pictures', 'camera', 'reel', 'youtube'],
    tutoring: ['tutor', 'homework', 'reading', 'math', 'teach', 'lesson', 'mentor', 'kids learn'],
    translate: ['translate', 'translation', 'spanish', 'bilingual', 'language', 'vietnamese', 'arabic', 'chinese', 'english learners', "don't speak english"],
    data: ['spreadsheet', 'excel', 'google sheet', 'data', 'database', 'track', 'records', 'inventory', 'paper', 'organize'],
    coding: ['app', 'code', 'coding', 'program', 'automate', 'software', 'chatbot'],
    research: ['research', 'find grants', 'look up', 'survey', 'compare', 'list of', 'scholarship', 'map'],
    outreach: ['donor', 'fundrais', 'raise money', 'outreach', 'sponsor', 'recruit', 'partners'],
    techhelp: ['seniors', 'elderly', 'smartphone', 'tablet', 'zoom', 'video call', 'email account', 'older adults'],
    events: ['event', 'festival', 'gala', 'set up', 'setup', 'volunteer day', 'check-in', 'booth'],
    gardening: ['garden', 'plant', 'compost', 'trees', 'weeds', 'harvest'],
    animals: ['dog', 'cat', 'animal', 'shelter', 'pets', 'adopt', 'kennel'],
    music: ['music', 'perform', 'piano', 'sing', 'concert', 'band'],
    crafts: ['blanket', 'sew', 'knit', 'crochet', 'craft', 'handmade', 'toys']
  };

  // Typical total hours for a student-sized version of each kind of task
  const HOURS = { design: 6, social: 10, writing: 6, web: 15, photo: 8, tutoring: 12, translate: 6, data: 8,
    coding: 18, research: 6, outreach: 8, techhelp: 10, events: 5, gardening: 5, animals: 8, music: 6, crafts: 4 };
  const REMOTE_OK = ['design', 'social', 'writing', 'web', 'translate', 'data', 'coding', 'research', 'outreach', 'crafts'];

  const TITLES = {
    design: 'Design eye-catching flyers & graphics', social: 'Grow our social media for a month',
    writing: 'Write our newsletter & stories', web: 'Build or refresh our website',
    photo: 'Photograph & film our work', tutoring: 'Tutor the kids we serve',
    translate: 'Translate our materials', data: 'Organize our records in a spreadsheet',
    coding: 'Build a simple tech tool for us', research: 'Research resources for us',
    outreach: 'Help us reach donors & partners', techhelp: 'Teach tech skills to seniors',
    events: 'Help run our event', gardening: 'Help in our garden', animals: 'Care for our animals',
    music: 'Perform for our community', crafts: 'Make handmade items for the people we serve'
  };
  const DELIVERABLES = {
    design: ['Print-ready flyer', '3 social media graphics', 'Editable source files'],
    social: ['12 scheduled posts', 'A simple content calendar', 'Follower-growth summary'],
    writing: ['Finished written pieces', 'One round of edits with our team'],
    web: ['A working website (3–5 pages)', 'How-to-update guide'],
    photo: ['20+ edited photos or a 60-second video', 'Files organized in a shared folder'],
    tutoring: ['Weekly tutoring sessions', 'Short progress notes'],
    translate: ['Translated documents', 'A glossary of key terms'],
    data: ['Organized spreadsheet with formulas', '1-page guide for staff'],
    coding: ['Working prototype', 'Short demo + handoff notes'],
    research: ['Researched list with sources', '1-page summary'],
    outreach: ['Outreach list', 'Email or letter templates'],
    techhelp: ['Weekly help sessions', 'Large-print how-to handout'],
    events: ['Event-day volunteer shifts'], gardening: ['Garden work shifts'],
    animals: ['Animal care shifts'], music: ['A live performance'], crafts: ['Finished handmade items']
  };

  function analyze(text, orgCause) {
    const t = ' ' + text.toLowerCase() + ' ';
    const hits = {};
    for (const [skill, words] of Object.entries(VOCAB)) {
      for (const w of words) if (t.includes(w)) (hits[skill] = hits[skill] || []).push(w);
    }
    const ranked = Object.entries(hits).sort((a, b) => b[1].length - a[1].length);
    const skills = ranked.slice(0, 3).map(([k]) => k);
    if (!skills.length) return null;

    const sortedH = skills.map(k => HOURS[k]).sort((a, b) => b - a);
    const hours = Math.min(24, sortedH[0] + sortedH.slice(1).reduce((s, h) => s + h * .35, 0));
    const inPerson = /in person|in-person|on site|onsite|at our (center|pantry|shelter|garden|building)/.test(t);
    const remote = !inPerson && skills.every(k => REMOTE_OK.includes(k));
    const minAge = skills.includes('techhelp') || skills.includes('coding') ? 14 : 13;
    const roundedHours = Math.round(hours);

    return {
      title: TITLES[skills[0]],
      skills,
      hours: roundedHours,
      weeks: roundedHours <= 6 ? 2 : roundedHours <= 12 ? 4 : 6,
      remote, minAge,
      cause: orgCause,
      deliverables: [...new Set(skills.flatMap(k => DELIVERABLES[k]))].slice(0, 4),
      evidence: ranked.slice(0, 3).map(([k, w]) => ({ skill: k, words: [...new Set(w)] }))
    };
  }

  HR.scope = { analyze };
})(window.HR);
