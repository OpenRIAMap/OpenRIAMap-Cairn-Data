import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function relativePath(root, candidate) {
  if (typeof candidate !== 'string' || !candidate || candidate.includes('\\') || candidate.startsWith('/') || candidate.includes('..')) return undefined;
  const absolute = path.resolve(root, ...candidate.split('/'));
  const relative = path.relative(root, absolute);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? absolute : undefined;
}

function sha256(file) {
  // Mirror payloads are UTF-8 JSON. Git for Windows may materialize text files
  // with CRLF even though COS and the Git blob retain LF. Compare the canonical
  // JSON byte stream so checkout line-ending policy cannot create a false alert.
  const canonical = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex');
}

function readJson(file, errors, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${label}: invalid JSON (${error.message})`);
    return undefined;
  }
}

function allowedMirrorPath(releaseId, file) {
  const escaped = releaseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^releases/${escaped}/(?:data-merge|media-index-merge|manifests)/.+`).test(file)
    || /^current\/worlds\/(?:_release-set|[A-Za-z0-9][A-Za-z0-9._-]*)\.json$/.test(file);
}

function collectFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(path.relative(root, file).split(path.sep).join('/'));
    }
  };
  visit(root);
  return files.sort();
}

function validateMode(root, errors) {
  const modePath = path.join(root, '.cairn', 'data-mirror-mode.json');
  if (!fs.existsSync(modePath)) {
    errors.push('cutover contract missing: .cairn/data-mirror-mode.json');
    return undefined;
  }
  const mode = readJson(modePath, errors, 'cutover contract');
  if (!mode) return undefined;
  if (mode.schemaVersion !== 'openriamap.data-mirror-mode.v1') errors.push('cutover contract: unsupported schemaVersion');
  if (mode.mode !== 'cos-authoritative-github-mirror') errors.push('cutover contract: mode must be cos-authoritative-github-mirror');
  if (typeof mode.cosDataAuthority !== 'string' || !mode.cosDataAuthority.startsWith('cos://')) errors.push('cutover contract: missing COS data authority');
  if (mode.mirrorRepository !== 'OpenRIAMap/OpenRIAMap-Cairn-Data' || mode.mirrorBranch !== 'main') errors.push('cutover contract: mirror repository binding is invalid');
  const first = mode.firstFormalRelease;
  if (!first || !RELEASE_ID.test(first.releaseId ?? '') || !COMMIT.test(first.controlCommit ?? '') || !COMMIT.test(first.mirrorCommit ?? '') || !SHA256.test(first.outboxSha256 ?? '')) {
    errors.push('cutover contract: first formal release provenance is incomplete');
  }
  return mode;
}

function validateCurrentPointers(root, errors) {
  const currentRoot = path.join(root, 'current', 'worlds');
  const releaseSetPath = path.join(currentRoot, '_release-set.json');
  if (!fs.existsSync(releaseSetPath)) {
    errors.push('current worlds: missing _release-set.json');
    return undefined;
  }
  const releaseSet = readJson(releaseSetPath, errors, 'current worlds release set');
  if (!releaseSet) return undefined;
  if (releaseSet.schemaVersion !== 'openriamap.current-release-set.v2') errors.push('current worlds release set: unsupported schemaVersion');
  if (!RELEASE_ID.test(releaseSet.releaseId ?? '')) errors.push('current worlds release set: invalid releaseId');
  if (!COMMIT.test(releaseSet.controlCommit ?? '')) errors.push('current worlds release set: missing immutable Control commit');
  if (!Array.isArray(releaseSet.worlds) || releaseSet.worlds.length === 0 || new Set(releaseSet.worlds).size !== releaseSet.worlds.length) errors.push('current worlds release set: worlds must be a non-empty unique array');

  for (const worldId of releaseSet.worlds ?? []) {
    if (!RELEASE_ID.test(worldId)) {
      errors.push(`current worlds release set: invalid worldId ${worldId}`);
      continue;
    }
    const pointerPath = path.join(currentRoot, `${worldId}.json`);
    if (!fs.existsSync(pointerPath)) {
      errors.push(`current world ${worldId}: missing pointer`);
      continue;
    }
    const pointer = readJson(pointerPath, errors, `current world ${worldId}`);
    if (!pointer) continue;
    if (pointer.schemaVersion !== 'openriamap.current-world.v2') errors.push(`current world ${worldId}: unsupported schemaVersion`);
    if (pointer.worldId !== worldId || pointer.releaseId !== releaseSet.releaseId) errors.push(`current world ${worldId}: release/world binding mismatch`);
    if (pointer.controlCommit !== releaseSet.controlCommit) errors.push(`current world ${worldId}: Control commit mismatch`);
    const releasePrefix = `releases/${releaseSet.releaseId}/`;
    if (typeof pointer.worldManifestKey !== 'string' || !pointer.worldManifestKey.startsWith(`${releasePrefix}manifests/worlds/`)) errors.push(`current world ${worldId}: invalid world manifest key`);
    if (typeof pointer.dataRoot !== 'string' || !pointer.dataRoot.startsWith(`${releasePrefix}data-merge/${worldId}/`)) errors.push(`current world ${worldId}: invalid data root`);
    if (typeof pointer.mediaIndexRoot !== 'string' || !pointer.mediaIndexRoot.startsWith(`${releasePrefix}media-index-merge/${worldId}/`)) errors.push(`current world ${worldId}: invalid media index root`);
    const worldManifestPath = relativePath(root, pointer.worldManifestKey);
    if (!worldManifestPath || !fs.existsSync(worldManifestPath)) errors.push(`current world ${worldId}: missing world manifest`);
    else if (!SHA256.test(pointer.worldManifestSha256 ?? '') || sha256(worldManifestPath) !== pointer.worldManifestSha256) errors.push(`current world ${worldId}: world manifest hash mismatch`);
  }
  return releaseSet;
}

export function validateMirrorRepository(root = process.cwd()) {
  const errors = [];
  const mode = validateMode(root, errors);
  const releaseSet = validateCurrentPointers(root, errors);
  const releasesPath = path.join(root, 'releases');
  if (!fs.existsSync(releasesPath)) {
    errors.push('release mirror: releases directory is missing');
    return { errors, verifiedFiles: 0, releases: [] };
  }
  const releaseNames = fs.readdirSync(releasesPath, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (releaseNames.length === 0) errors.push('release mirror: no formal release has been mirrored');

  let verifiedFiles = 0;
  for (const releaseId of releaseNames) {
    const releaseRoot = path.join(releasesPath, releaseId);
    const manifestPath = path.join(releaseRoot, 'mirror-manifest.json');
    if (!RELEASE_ID.test(releaseId)) {
      errors.push(`${releaseId}: invalid release directory name`);
      continue;
    }
    if (!fs.existsSync(manifestPath)) {
      errors.push(`${releaseId}: missing mirror manifest`);
      continue;
    }
    const manifest = readJson(manifestPath, errors, `${releaseId} mirror manifest`);
    if (!manifest) continue;
    if (manifest.schemaVersion !== 'openriamap.data-release-mirror-manifest.v1') errors.push(`${releaseId}: unsupported mirror manifest schema`);
    if (manifest.releaseId !== releaseId) errors.push(`${releaseId}: manifest releaseId mismatch`);
    if (manifest.cosSource !== mode?.cosDataAuthority) errors.push(`${releaseId}: COS provenance differs from cutover contract`);
    if (!COMMIT.test(manifest.controlCommit ?? '')) errors.push(`${releaseId}: missing immutable Control commit`);
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      errors.push(`${releaseId}: mirror manifest has no files`);
      continue;
    }

    const declared = new Map();
    for (const entry of manifest.files) {
      if (!entry || typeof entry.path !== 'string' || !SHA256.test(entry.sha256 ?? '') || Object.keys(entry).some((key) => key !== 'path' && key !== 'sha256')) {
        errors.push(`${releaseId}: malformed mirror manifest entry`);
        continue;
      }
      if (declared.has(entry.path)) {
        errors.push(`${releaseId}: duplicate manifest path ${entry.path}`);
        continue;
      }
      declared.set(entry.path, entry.sha256);
      if (!allowedMirrorPath(releaseId, entry.path)) errors.push(`${releaseId}: prohibited mirrored path ${entry.path}`);
      const filePath = relativePath(root, entry.path);
      if (!filePath || !fs.existsSync(filePath)) {
        errors.push(`${releaseId}: missing mirrored object ${entry.path}`);
        continue;
      }
      const isCurrentPointer = entry.path.startsWith('current/worlds/');
      if (!isCurrentPointer || releaseId === releaseSet?.releaseId) {
        if (sha256(filePath) !== entry.sha256) errors.push(`${releaseId}: checksum mismatch ${entry.path}`);
        else verifiedFiles += 1;
      }
    }

    const releaseFiles = collectFiles(releaseRoot).filter((file) => file !== 'mirror-manifest.json').map((file) => `releases/${releaseId}/${file}`);
    for (const file of releaseFiles) {
      if (!declared.has(file)) errors.push(`${releaseId}: release object is absent from mirror manifest ${file}`);
    }
  }

  if (releaseSet) {
    const currentManifestPath = path.join(releasesPath, releaseSet.releaseId, 'mirror-manifest.json');
    if (!fs.existsSync(currentManifestPath)) errors.push(`current worlds: release ${releaseSet.releaseId} has no mirror manifest`);
    else {
      const manifest = readJson(currentManifestPath, errors, 'current release mirror manifest');
      if (manifest?.controlCommit !== releaseSet.controlCommit) errors.push('current worlds: Control commit does not match current release manifest');
      const declared = new Map((manifest?.files ?? []).map((entry) => [entry.path, entry.sha256]));
      for (const worldId of releaseSet.worlds ?? []) {
        const pointerPath = `current/worlds/${worldId}.json`;
        const filePath = relativePath(root, pointerPath);
        if (!declared.has(pointerPath) || !filePath || sha256(filePath) !== declared.get(pointerPath)) errors.push(`current worlds: current release manifest does not attest ${pointerPath}`);
      }
      const releaseSetFile = relativePath(root, 'current/worlds/_release-set.json');
      if (!declared.has('current/worlds/_release-set.json') || !releaseSetFile || sha256(releaseSetFile) !== declared.get('current/worlds/_release-set.json')) errors.push('current worlds: current release manifest does not attest _release-set.json');
    }
  }

  const first = mode?.firstFormalRelease;
  if (first && !releaseNames.includes(first.releaseId)) errors.push(`cutover contract: first formal release ${first.releaseId} is missing`);
  return { errors, verifiedFiles, releases: releaseNames, currentReleaseId: releaseSet?.releaseId };
}

function main() {
  const result = validateMirrorRepository(process.cwd());
  if (result.errors.length) {
    console.error('Release mirror: FAIL');
    result.errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Release mirror: PASS (${result.releases.length} release(s); ${result.verifiedFiles} object checksum(s); current -> ${result.currentReleaseId})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
