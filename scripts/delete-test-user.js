#!/usr/bin/env node
// Usage: node scripts/delete-test-user.js test@example.com
//
// Deletes a user from auth.users by email (service role required).
// Cascades to: profiles, purchases, balance_ledger, bookings, documents.
// Note: messages rows where sender_id = deleted user are left orphaned (harmless).

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Parse .env.local manually — no dotenv dependency needed
const envPath = path.join(__dirname, "../.env.local");
fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
});

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/delete-test-user.js <email>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
  // Find user by email
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) { console.error("Could not list users:", listErr.message); process.exit(1); }

  const user = users.find(u => u.email === email);
  if (!user) { console.error(`No user found with email: ${email}`); process.exit(1); }

  console.log(`Found user: ${user.id} (${user.email})`);
  console.log("Deleting...");

  const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
  if (delErr) { console.error("Delete failed:", delErr.message); process.exit(1); }

  console.log("Done. Cascaded: profiles, purchases, balance_ledger, bookings, documents.");
}

run();
