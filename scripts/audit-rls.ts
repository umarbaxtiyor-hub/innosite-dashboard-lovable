#!/usr/bin/env bun
/**
 * Migratsiyadan keyin RLS, policy va GRANT holatini tekshiradi.
 * Ishlatish: bun run audit:rls
 *
 * Talab: PG* env vars (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) yoki DATABASE_URL.
 */
import { spawnSync } from "node:child_process";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

function psql(sql: string): string {
  const res = spawnSync("psql", ["-X", "-A", "-t", "-F", "\t", "-c", sql], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(RED + (res.stderr || "psql failed") + RESET);
    process.exit(1);
  }
  return res.stdout.trim();
}

function rows(out: string): string[][] {
  return out ? out.split("\n").map((l) => l.split("\t")) : [];
}

function section(title: string) {
  console.log("\n" + BOLD + CYAN + "▸ " + title + RESET);
}

// 1) Jadvallar — RLS + policy
section("RLS & policy holati");
const tables = rows(psql(`SELECT table_name, rls_enabled::text, policy_count::text,
  permissive_write_policies::text, status FROM public.v_security_audit;`));
let bad = 0;
for (const [t, rls, pc, pw, status] of tables) {
  if (status === "OK") continue;
  bad++;
  const color = status.startsWith("CRITICAL") ? RED : YELLOW;
  console.log(`  ${color}${status}${RESET}  ${t}  (rls=${rls}, policies=${pc}, permissive_write=${pw})`);
}
if (bad === 0) console.log(`  ${GREEN}✓ Barcha ${tables.length} jadval OK${RESET}`);
else console.log(`  ${BOLD}${bad}${RESET} ta jadval e'tibor talab qiladi.`);

// 2) SECURITY DEFINER funksiyalar — risky grants
section("SECURITY DEFINER funksiyalar (anon/PUBLIC EXECUTE)");
const grants = rows(psql(`
  SELECT p.proname,
    array_to_string(array_agg(DISTINCT a.grantee || ':' || a.privilege_type), ', ')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN information_schema.routine_privileges a
    ON a.routine_schema = n.nspname AND a.routine_name = p.proname
  WHERE n.nspname='public' AND p.prosecdef = true
    AND (a.grantee IN ('anon','PUBLIC'))
  GROUP BY p.proname;
`));
if (grants.length === 0) console.log(`  ${GREEN}✓ Anon yoki PUBLIC EXECUTE huquqi yo'q${RESET}`);
else {
  for (const [name, gs] of grants) {
    console.log(`  ${RED}✗${RESET} ${name}  →  ${gs}`);
  }
}

// 3) RLS o'chirilgan public jadvallar
section("RLS o'chirilgan jadvallar");
const rlsOff = rows(psql(`
  SELECT c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
`));
if (rlsOff.length === 0) console.log(`  ${GREEN}✓ Barcha jadvallar RLS bilan${RESET}`);
else for (const [t] of rlsOff) console.log(`  ${RED}✗${RESET} ${t}`);

// 4) So'nggi trigger xatolari
section("So'nggi trigger xatolari (oxirgi 24 soat)");
const errs = rows(psql(`
  SELECT table_name, action, error_message, error_sqlstate, created_at
  FROM public.audit_log
  WHERE action LIKE 'TRIGGER_ERROR:%' AND created_at > now() - interval '24 hours'
  ORDER BY created_at DESC LIMIT 20;
`));
if (errs.length === 0) console.log(`  ${GREEN}✓ Xato yo'q${RESET}`);
else for (const [t, a, msg, ss, ts] of errs) {
  console.log(`  ${YELLOW}${ts}${RESET}  ${t} · ${a}  ${RED}${msg}${RESET} (${ss})`);
}

console.log("\n" + BOLD + (bad + grants.length + rlsOff.length === 0 ? GREEN + "✅ Audit toza" : YELLOW + "⚠️  Audit muammolarni topdi") + RESET + "\n");
process.exit(bad + grants.length + rlsOff.length === 0 ? 0 : 1);
