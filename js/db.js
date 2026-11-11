// db.js — every read and write goes through Supabase. Security lives in the database
// (row-level security), so the browser can only see and change what the signed-in user is allowed to.
window.HR = window.HR || {};
(function (HR) {
  // PKCE returns from Google with ?code= in the query string, which keeps the #route hash free for the router
  const sb = supabase.createClient(HR.config.supabaseUrl, HR.config.supabaseKey, { auth: { flowType: 'pkce' } });

  // Throw readable errors instead of returning { data, error } everywhere
  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(error.message);
    return data;
  }

  const ORG_FIELDS = 'id, name, cause, blurb, url, address, city, state, zip, lat, lon, image_url, is_national, is_example, org_type, owner_id';
  const PROJECT_FIELDS = '*, org:orgs(' + ORG_FIELDS + ')';

  const db = {
    sb,

    // ---------- auth ----------
    async session() { return (await sb.auth.getSession()).data.session; },
    onAuth(cb) { sb.auth.onAuthStateChange((_event, session) => cb(session)); },
    // extra = { age, lat, lon, location_label }; the database trigger copies these into the profile
    async signUp(email, password, firstName, role, extra = {}) {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { first_name: firstName, role, ...extra }, emailRedirectTo: location.origin + location.pathname }
      });
      if (error) throw new Error(error.message);
      return data; // data.session is null when email confirmation is required
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return data;
    },
    // Leaves the page for Google's sign-in, then Supabase sends the user back here
    async signInWithGoogle() {
      // Check first, so a missing setup shows a readable message instead of a raw error page
      const res = await fetch(HR.config.supabaseUrl + '/auth/v1/settings', { headers: { apikey: HR.config.supabaseKey } });
      const settings = res.ok ? await res.json() : null;
      if (settings && !settings.external?.google) throw new Error('Google sign-in isn\'t turned on for Handraise yet. Use email and password for now.');
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
      if (error) throw new Error(error.message);
    },
    async signOut() { await sb.auth.signOut(); },

    // ---------- profile ----------
    // The student's location is kept in a separate table only they can read, then merged in here
    async profile(uid) {
      const [p, loc] = await Promise.all([
        q(sb.from('profiles').select('*').eq('id', uid).maybeSingle()),
        q(sb.from('student_locations').select('lat, lon, location_label, radius_miles').eq('id', uid).maybeSingle())
      ]);
      return p && { ...p, lat: null, lon: null, location_label: null, radius_miles: 25, ...(loc || {}) };
    },
    async saveProfile(uid, fields) {
      const LOC = ['lat', 'lon', 'location_label', 'radius_miles'];
      const locFields = Object.fromEntries(Object.entries(fields).filter(([k]) => LOC.includes(k)));
      const rest = Object.fromEntries(Object.entries(fields).filter(([k]) => !LOC.includes(k)));
      if (Object.keys(locFields).length) await q(sb.from('student_locations').upsert({ id: uid, ...locFields }));
      if (Object.keys(rest).length) await q(sb.from('profiles').update(rest).eq('id', uid));
      return db.profile(uid);
    },

    // ---------- projects ----------
    projects: () => q(sb.from('projects').select(PROJECT_FIELDS).order('is_example').order('created_at', { ascending: false })),
    orgs: () => q(sb.from('orgs').select(ORG_FIELDS + ', projects(count)').order('name')),

    // ---------- student side ----------
    myApplications: uid => q(sb.from('applications').select('*, project:projects(' + PROJECT_FIELDS + ')').eq('student_id', uid).order('created_at', { ascending: false })),
    apply: (uid, projectId) => q(sb.from('applications').insert({ student_id: uid, project_id: projectId })),
    withdraw: appId => q(sb.from('applications').delete().eq('id', appId)),
    myLogs: uid => q(sb.from('hour_logs').select('*, project:projects(title, skills, org:orgs(name))').eq('student_id', uid).order('work_date', { ascending: false })),
    logHours: (uid, projectId, workDate, hours, note) =>
      q(sb.from('hour_logs').insert({ student_id: uid, project_id: projectId, work_date: workDate, hours, note })),

    // ---------- nonprofit side ----------
    myOrg: uid => q(sb.from('orgs').select('*').eq('owner_id', uid).order('created_at').limit(1).maybeSingle()),
    createOrg: org => q(sb.from('orgs').insert(org).select().single()),
    orgProjects: orgId => q(sb.from('projects').select(PROJECT_FIELDS).eq('org_id', orgId).order('created_at', { ascending: false })),
    orgApplications: orgId => q(sb.from('applications')
      .select('*, project:projects!inner(id, title, skills, hours, weeks, remote, min_age, cause, org_id, org:orgs(lat, lon, is_national)), student:profiles(*)')
      .eq('project.org_id', orgId).order('created_at', { ascending: false })),
    orgLogs: orgId => q(sb.from('hour_logs')
      .select('*, project:projects!inner(title, org_id), student:profiles(first_name)')
      .eq('project.org_id', orgId).order('work_date', { ascending: false })),
    decide: (appId, status) => q(sb.from('applications').update({ status }).eq('id', appId)),
    verify: (logId, ok) => q(sb.from('hour_logs').update({ status: ok ? 'verified' : 'rejected', verified_at: ok ? new Date().toISOString() : null }).eq('id', logId)),
    addProject: p => q(sb.from('projects').insert(p).select(PROJECT_FIELDS).single()),
    setProjectStatus: (id, status) => q(sb.from('projects').update({ status }).eq('id', id)),

    // ---------- community ----------
    stats: () => q(sb.rpc('community_stats'))
  };

  HR.db = db;
})(window.HR);
