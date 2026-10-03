import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

/**
 * Catalog assertions: what the database actually grants, independent of any
 * policy. These guard the privilege baseline against the next migration.
 */
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
before(() => db.connect());
after(() => db.end());

test("no function in public is executable by anon (SECURITY DEFINER or not)", async () => {
  const { rows } = await db.query(`
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    order by 1`);
  assert.deepEqual(rows.map((r) => r.proname), []);
});

test("trigger-only functions are not executable by authenticated either", async () => {
  const { rows } = await db.query(`
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1`);
  assert.deepEqual(rows.map((r) => r.proname), []);
});

test("anon has no privileges on any public table; authenticated has no DELETE anywhere", async () => {
  const anon = await db.query(`
    select table_name, privilege_type from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' order by 1, 2`);
  assert.deepEqual(anon.rows, []);
  const del = await db.query(`
    select table_name from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'DELETE'`);
  assert.deepEqual(del.rows, []);
});

test("writable columns are exactly the ones the design lists", async () => {
  const { rows } = await db.query(`
    select table_name, privilege_type, string_agg(column_name, ',' order by column_name) as cols
    from information_schema.column_privileges
    where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE')
    group by 1, 2 order by 1, 2`);
  assert.deepEqual(rows, [
    { table_name: "bids", privilege_type: "INSERT", cols: "note,price,request_id,turnaround_days" },
    { table_name: "bids", privilege_type: "UPDATE", cols: "note,price,status,turnaround_days" },
    { table_name: "messages", privilege_type: "INSERT", cols: "body,order_id" },
    { table_name: "profiles", privilege_type: "UPDATE", cols: "display_name" },
    { table_name: "requests", privilege_type: "INSERT", cols: "description,photo_path,title" },
    { table_name: "reviews", privilege_type: "INSERT", cols: "comment,order_id,rating,tailor_id" },
  ]);
});

test("only messages is published to Realtime", async () => {
  const { rows } = await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`);
  assert.deepEqual(rows.map((r) => r.tablename), ["messages"]);
});
