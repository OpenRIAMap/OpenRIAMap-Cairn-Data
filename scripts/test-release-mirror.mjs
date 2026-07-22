import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateMirrorRepository } from './validate-release-mirror.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-data-mirror-'));
const releaseId = 'release-test-1';
const controlCommit = 'a'.repeat(40);
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const write = (file, value) => {
  const output = path.join(root, ...file.split('/'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, value);
  return sha(value);
};

try {
  const worldManifest = JSON.stringify({ world: 'demo' });
  const worldManifestSha = write(`releases/${releaseId}/manifests/worlds/demo.json`, worldManifest);
  const chunkSha = write(`releases/${releaseId}/data-merge/demo/demo-chunk-001.json`, '[]');
  const releaseSet = JSON.stringify({ schemaVersion: 'openriamap.current-release-set.v2', releaseId, controlCommit, publishedAt: '2026-07-22T00:00:00.000Z', worlds: ['demo'] });
  const releaseSetSha = write('current/worlds/_release-set.json', releaseSet);
  const worldPointer = JSON.stringify({ schemaVersion: 'openriamap.current-world.v2', worldId: 'demo', releaseId, worldManifestKey: `releases/${releaseId}/manifests/worlds/demo.json`, worldManifestSha256: worldManifestSha, dataRoot: `releases/${releaseId}/data-merge/demo/`, mediaIndexRoot: `releases/${releaseId}/media-index-merge/demo/`, controlCommit, publishedAt: '2026-07-22T00:00:00.000Z' });
  const worldPointerSha = write('current/worlds/demo.json', worldPointer);
  const manifest = JSON.stringify({ schemaVersion: 'openriamap.data-release-mirror-manifest.v1', releaseId, cosSource: 'cos://example-data-123/', controlCommit, mirroredAt: '2026-07-22T00:00:00.000Z', files: [
    { path: `releases/${releaseId}/manifests/worlds/demo.json`, sha256: worldManifestSha },
    { path: `releases/${releaseId}/data-merge/demo/demo-chunk-001.json`, sha256: chunkSha },
    { path: 'current/worlds/_release-set.json', sha256: releaseSetSha },
    { path: 'current/worlds/demo.json', sha256: worldPointerSha }
  ] }, null, 2);
  write(`releases/${releaseId}/mirror-manifest.json`, manifest);
  write('.cairn/data-mirror-mode.json', JSON.stringify({ schemaVersion: 'openriamap.data-mirror-mode.v1', mode: 'cos-authoritative-github-mirror', cosDataAuthority: 'cos://example-data-123/', mirrorRepository: 'OpenRIAMap/OpenRIAMap-Cairn-Data', mirrorBranch: 'main', firstFormalRelease: { releaseId, controlCommit, mirrorCommit: 'b'.repeat(40), mirroredAt: '2026-07-22T00:00:00.000Z', outboxSha256: 'c'.repeat(64) } }));

  assert.deepEqual(validateMirrorRepository(root).errors, []);
  fs.writeFileSync(path.join(root, 'current', 'worlds', 'demo.json'), '{}');
  assert.match(validateMirrorRepository(root).errors.join('\n'), /checksum mismatch|does not attest/);
  console.log('Release mirror validator: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
