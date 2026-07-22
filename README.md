# OpenRIAMap Cairn Data

This repository is the commit-backed, one-way mirror of formal Cairn COS Data releases. COS is the runtime authority; GitHub is a distribution and audit mirror only.

The first verified formal release is `baseline-a13ffc97e517-r1`. Its immutable provenance and the allowed mirror surface are recorded in [`.cairn/data-mirror-mode.json`](.cairn/data-mirror-mode.json).

## Repository contract

- The COS Data bucket is authoritative. No GitHub commit may update COS Data.
- Only the Data mirror worker may publish formal release content and `current/worlds/` pointers here.
- `releases/<releaseId>/` is immutable after it is mirrored. `current/worlds/` is the only mutable consumer-facing pointer surface.
- This repository must never store review packages, Control records, credentials, pipeline configuration, staging output, raw media, or split-only artifacts.
- `OpenRIAMap/OpenRIAMap-Data` supplied the initial baseline input; it is not a downstream write target and is no longer a runtime authority after this cutover.

Run `npm run validate` after any mirror-worker change or mirror pull to verify the committed release objects, checksums, current pointers, and boundary rules.
