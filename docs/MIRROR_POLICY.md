# Mirror policy

## Authority

COS Data is the sole runtime authority. GitHub is a one-way, commit-backed mirror for distribution and audit. The mirror worker reads only formal COS release/current objects and writes only this repository; no process may read GitHub Data and write back to COS.

## Allowed writes

Only the Data mirror worker may publish the following paths:

- `releases/<releaseId>/data-merge/**`
- `releases/<releaseId>/media-index-merge/**`
- `releases/<releaseId>/manifests/**`
- `releases/<releaseId>/mirror-manifest.json`
- `current/worlds/_release-set.json`
- `current/worlds/<worldId>.json`

Every formal release carries a `mirror-manifest.json` naming its immutable COS origin and the merged Control commit. Release content is immutable after publication. `current/worlds/` is intentionally replaced by a later formal release and must always point at one mirrored release.

## Prohibited content

This repository never accepts review packages, Control records, credentials, pipeline configuration, staging data, split-only artifacts, raw media, or a GitHub-originated current-pointer request. Human edits to mirror-owned paths are outside the contract and must be rejected.

## Validation

`npm run validate` verifies the cutover contract, every release-scoped object hash, the latest current-world pointers, and the allowed path surface. Historical `current/worlds/` snapshots are retained in Git history; only the current formal release's pointer hashes are checked in the working tree.
