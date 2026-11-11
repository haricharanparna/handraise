// data.js — skills vocabulary, how skills relate, and causes
window.HR = window.HR || {};
(function (HR) {
  const SKILLS = {
    design: 'Graphic design',
    social: 'Social media',
    writing: 'Writing & editing',
    web: 'Website building',
    photo: 'Photo & video',
    tutoring: 'Tutoring',
    translate: 'Translation',
    data: 'Spreadsheets & data',
    coding: 'Coding',
    research: 'Research',
    outreach: 'Outreach & fundraising',
    techhelp: 'Tech help for seniors',
    events: 'Event help',
    gardening: 'Gardening',
    animals: 'Animal care',
    music: 'Music & performance',
    crafts: 'Crafts & sewing'
  };

  // How much one skill transfers to another (0–1). A student who knows design
  // gets partial credit on a social media project instead of a hard "no match".
  const RELATED = {
    'design|social': .5, 'design|photo': .4, 'design|web': .4,
    'web|coding': .7, 'writing|research': .5, 'writing|outreach': .4,
    'social|outreach': .6, 'social|photo': .5, 'social|writing': .4,
    'data|research': .5, 'data|coding': .5, 'techhelp|coding': .5,
    'techhelp|tutoring': .5, 'tutoring|writing': .3, 'events|outreach': .5,
    'translate|writing': .4, 'crafts|design': .4, 'gardening|events': .3, 'animals|events': .2
  };
  const related = (a, b) => a === b ? 1 : (RELATED[a + '|' + b] || RELATED[b + '|' + a] || 0);

  const CAUSES = {
    hunger: { label: 'Hunger', color: '#c95f2b' },
    animals: { label: 'Animals', color: '#9c5b8a' },
    seniors: { label: 'Seniors', color: '#6a5fa8' },
    environment: { label: 'Environment', color: '#1f5a43' },
    education: { label: 'Education', color: '#2f6690' },
    immigrants: { label: 'Immigrants & refugees', color: '#a3772c' },
    health: { label: 'Health', color: '#3d8a8a' },
    arts: { label: 'Arts', color: '#8a6a4f' }
  };

  // Independent Sector's estimated value of a U.S. volunteer hour (2023 national figure)
  const HOUR_VALUE = 33.49;

  // Search radius choices (miles)
  const RADII = [10, 25, 50, 100];

  HR.data = { SKILLS, CAUSES, related, HOUR_VALUE, RADII };
})(window.HR);
