import { db } from "../db/index.js";

/**
 * Bootstrap escape hatch: admin can only be granted by another admin from the
 * panel, so an install whose first profile belongs to somebody else has no way
 * in. This is the way in. Run it on the machine hosting SunFlix.
 *
 *   npm --prefix backend run make-admin -- <profile name>
 */
const name = process.argv[2];

const profiles = db.prepare("SELECT id, name, is_admin FROM profiles ORDER BY created_at, id").all();

if (!name) {
  console.log("Usage: npm --prefix backend run make-admin -- <profile name>\n");
  console.log("Profiles:");
  for (const p of profiles) {
    console.log(`  ${p.is_admin ? "★" : " "} ${p.name}`);
  }
  process.exit(profiles.length ? 0 : 1);
}

const match = profiles.find((p) => p.name.toLowerCase() === name.toLowerCase());
if (!match) {
  console.error(`No profile named "${name}". Known: ${profiles.map((p) => p.name).join(", ")}`);
  process.exit(1);
}

db.prepare("UPDATE profiles SET is_admin = 1 WHERE id = ?").run(match.id);
console.log(`${match.name} is now an admin.`);
process.exit(0);
