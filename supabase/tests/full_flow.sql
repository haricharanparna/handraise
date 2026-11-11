-- Full-flow permission test: a simulated student and nonprofit go through
-- sign-up -> post -> apply -> accept -> log -> verify, plus the things that must be blocked.
-- Run it in the Supabase SQL editor. It never commits: the last line raises an error that
-- prints the results, which also rolls everything back. Last run: all 16 steps as expected.
begin;
create temp table r(n serial, step text, result text);
grant all on r to anon, authenticated; grant usage on sequence r_n_seq to anon, authenticated;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sim-student@example.test','{"first_name":"Sim","age":15,"lat":30.27,"lon":-97.74,"location_label":"Austin, TX"}', now(), now()),
       ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sim-org@example.test','{"first_name":"Org"}', now(), now());
insert into r(step,result) values ('1 trigger made 2 profiles', (select count(*)::text from profiles where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2')));

-- nonprofit creates org + project
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',true);
set local role authenticated;
insert into orgs (id, owner_id, name, org_type, cause, is_national, lat, lon) values ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b2','Sim Club','school','Arts and music',false,30.28,-97.73);
insert into projects (id, org_id, title, description, skills, hours, weeks, min_age, remote, cause, deliverables)
values ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000c3','Design flyers','Need flyers','{design}',6,2,13,true,'Arts and music','{Flyer}');
insert into r(step,result) values ('2 school club posted project (custom cause), type saved as', (select org_type from orgs where id='00000000-0000-0000-0000-0000000000c3'));
with u as (update projects set title='hacked' where is_example returning 1) insert into r(step,result) select '3 org edits example listings (want 0)', count(*)::text from u;

-- student applies
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
set local role authenticated;
insert into applications (id, student_id, project_id) values ('00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4');
insert into r(step,result) values ('4 student applied', 'ok');
with u as (update applications set status='accepted' where id='00000000-0000-0000-0000-0000000000e5' returning 1) insert into r(step,result) select '5 student self-accepts (want 0)', count(*)::text from u;
do $$ begin insert into hour_logs (student_id, project_id, work_date, hours, note) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4', current_date, 2, 'early'); insert into r(step,result) values ('6 log hours before accepted (want blocked)', 'ALLOWED');
exception when others then insert into r(step,result) values ('6 log hours before accepted (want blocked)', 'blocked'); end $$;
do $$ begin insert into applications (student_id, project_id) select '00000000-0000-0000-0000-0000000000a1', id from projects where is_example limit 1; insert into r(step,result) values ('7 apply to example listing (want blocked)', 'ALLOWED');
exception when others then insert into r(step,result) values ('7 apply to example listing (want blocked)', 'blocked'); end $$;

-- nonprofit reviews
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',true);
set local role authenticated;
insert into r(step,result) values ('8 org sees applicant first name', coalesce((select first_name from profiles where id='00000000-0000-0000-0000-0000000000a1'),'none'));
insert into r(step,result) values ('9 org sees student location (want 0)', (select count(*)::text from student_locations where id='00000000-0000-0000-0000-0000000000a1'));
with u as (update applications set status='accepted' where id='00000000-0000-0000-0000-0000000000e5' returning 1) insert into r(step,result) select '10 org accepts (want 1)', count(*)::text from u;

-- student logs hours, tries to verify their own
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
set local role authenticated;
insert into hour_logs (id, student_id, project_id, work_date, hours, note) values ('00000000-0000-0000-0000-0000000000f6','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4', current_date, 2, 'Made 3 flyers');
insert into r(step,result) values ('11 student logs 2 hours', 'ok');
with u as (update hour_logs set status='verified' where id='00000000-0000-0000-0000-0000000000f6' returning 1) insert into r(step,result) select '12 student self-verifies (want 0)', count(*)::text from u;

-- nonprofit verifies
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',true);
set local role authenticated;
with u as (update hour_logs set status='verified', verified_at=now() where id='00000000-0000-0000-0000-0000000000f6' returning 1) insert into r(step,result) select '13 org verifies (want 1)', count(*)::text from u;

-- signed-out visitor
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
insert into r(step,result) values ('14 anon reads profiles (want 0)', (select count(*)::text from profiles));
insert into r(step,result) values ('15 anon community_stats verified hours', (select (community_stats()->>'verified_hours')));
reset role;

-- under-13 sign-up
do $$ begin insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sim-kid@example.test','{"age":12}', now(), now()); insert into r(step,result) values ('16 under-13 signup (want blocked)', 'ALLOWED');
exception when others then insert into r(step,result) values ('16 under-13 signup (want blocked)', 'blocked'); end $$;

do $$ begin raise exception E'RESULTS (rolled back):\n%', (select string_agg(step || ' => ' || result, E'\n' order by n) from r); end $$;
