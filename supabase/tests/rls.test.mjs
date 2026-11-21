import { PGlite } from "@electric-sql/pglite";
// Row Level Security tests for supabase/migrations, run in an in-memory
// Postgres (PGlite) with a minimal stand-in for Supabase's auth schema.
// Run with: npm run test:db
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const db = new PGlite();
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrations = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`);
for (const f of migrations) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
const A='00000000-0000-0000-0000-00000000000a', M='00000000-0000-0000-0000-00000000000b', X='00000000-0000-0000-0000-00000000000c', N='00000000-0000-0000-0000-00000000000d';
await db.exec(`insert into auth.users values ('${A}','admin@example.org'),('${M}','musician@example.org'),('${X}','former@example.org'),('${N}','new@example.org');
insert into public.person (id,name,email,employment_type,system_roles) values
 ('${A}','Ada Admin','admin@example.org','employee_w2','{admin}'),
 ('${M}','Max Musician','musician@example.org','contractor_1099','{}'),
 ('${X}','Fay Former','former@example.org','contractor_1099','{}');
update public.person set active=false where id='${X}';`);
let pass=0, fail=0;
async function as(uid, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid??""}',false);`);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try { const r = await db.query(sql); return { ok:true, rows:r.rows, n:r.affectedRows }; }
  catch(e){ return { ok:false, err:e.message }; }
  finally { await db.exec('reset role'); }
}
function check(name, cond, detail){ if(cond){pass++;console.log("PASS",name);} else {fail++;console.log("FAIL",name,JSON.stringify(detail));} }
let r;
r=await as(null,`select * from public.person`); check("anon reads nothing", !r.ok || r.rows.length===0, r);
r=await as(A,`select id from public.person`); check("admin reads all 3", r.ok && r.rows.length===3, r);
r=await as(M,`select id from public.person`); check("musician reads only self", r.ok && r.rows.length===1 && r.rows[0].id===M, r);
r=await as(X,`select id from public.person`); check("deactivated reads nothing", r.ok && r.rows.length===0, r);
r=await as(M,`update public.person set phone='555-0100', instruments='{viola}' where id='${M}'`); check("musician edits own phone/instruments", r.ok && r.n===1, r);
r=await as(M,`update public.person set name='Maximilian' where id='${M}'`); check("musician cannot edit own name", !r.ok, r);
r=await as(M,`update public.person set system_roles='{admin}' where id='${M}'`); check("musician cannot make self admin", !r.ok, r);
r=await as(M,`update public.person set active=true, phone='x' where id='${X}'`); check("musician cannot touch others (0 rows)", r.ok && r.n===0, r);
r=await as(X,`update public.person set phone='1' where id='${X}'`); check("deactivated cannot edit self", r.ok && r.n===0, r);
r=await as(M,`insert into public.person (id,name,email,employment_type) values ('${N}','New','new@example.org','volunteer')`); check("musician cannot insert", !r.ok, r);
r=await as(M,`delete from public.person where id='${M}'`); check("musician cannot delete", !r.ok, r);
r=await as(A,`delete from public.person where id='${M}'`); check("admin cannot delete either", !r.ok, r);
r=await as(A,`insert into public.person (id,name,email,employment_type) values ('${N}','New Person','new@example.org','volunteer')`); check("admin can insert", r.ok, r);
r=await as(A,`update public.person set name='Maxine', job_title='Musician in Residence 1', active=false where id='${M}'`); check("admin edits & deactivates others", r.ok && r.n===1, r);
r=await as(M,`select id from public.person`); check("newly deactivated musician now reads nothing", r.ok && r.rows.length===0, r);
r=await as(A,`update public.person set email='other@example.org' where id='${N}'`); check("admin cannot change email", !r.ok, r);
r=await as(A,`update public.person set active=false where id='${A}'`); check("admin cannot deactivate self", !r.ok, r);
r=await as(A,`update public.person set system_roles='{}' where id='${A}'`); check("admin cannot drop own admin role", !r.ok, r);
r=await as(M,`select public.is_admin()`); check("is_admin false for deactivated musician", r.ok && r.rows[0].is_admin===false, r);
r=await as(null,`select public.is_admin()`); check("anon cannot call is_admin", !r.ok, r);
r=await as(A,`insert into public.person (id,name,email,employment_type) values ('${N}','Dup','NEW@example.org','volunteer')`); check("uppercase email rejected", !r.ok, r);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
