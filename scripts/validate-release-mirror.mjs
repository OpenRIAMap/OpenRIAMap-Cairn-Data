import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const releases = path.join(root, 'releases');
if (!fs.existsSync(releases)) { console.log('Release mirror: PASS (no mirrored releases yet)'); process.exit(0); }
const errors = [];
for (const name of fs.readdirSync(releases)) {
  const manifestPath = path.join(releases, name, 'mirror-manifest.json');
  if (!fs.existsSync(manifestPath)) { errors.push(`${name}: missing mirror manifest`); continue; }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 'openriamap.data-release-mirror-manifest.v1' || !String(manifest.cosSource).startsWith('cos://')) errors.push(`${name}: invalid COS provenance`);
  if (!/^[0-9a-f]{40}$/.test(manifest.controlCommit ?? '')) errors.push(`${name}: missing immutable Control commit`);
  for (const file of manifest.files ?? []) if (/^(control|review|secrets?)(\/|$)/i.test(file.path)) errors.push(`${name}: prohibited mirrored path ${file.path}`);
}
if (errors.length) { console.error('Release mirror: FAIL'); errors.forEach((error) => console.error(`- ${error}`)); process.exitCode = 1; }
else console.log('Release mirror: PASS');
