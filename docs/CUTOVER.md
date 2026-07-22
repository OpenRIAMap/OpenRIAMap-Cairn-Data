# COS-authoritative Data cutover

## Effective state

The cutover took effect with the first mirrored formal release:

- Release: `baseline-a13ffc97e517-r1`
- COS authority: `cos://openriamap-cairn-data-1433163128/`
- Authorizing Control commit: `6ca05d3d8ab2a12cc8c6251ba1fe8ca017d9bf6d`
- First GitHub mirror commit: `923b9c23671b95f8323de15917cd095d2b8d006d`
- First mirrored object count: `229`

The exact binding is machine-readable in [`.cairn/data-mirror-mode.json`](../.cairn/data-mirror-mode.json).

## Consequences

1. A formal review or baseline release writes COS first.
2. The mirror worker validates the approved COS release and commits the release surface plus current world pointers to this repository.
3. GitHub commits never drive COS writes, and a GitHub Data edit must not be treated as a release request.
4. `OpenRIAMap/OpenRIAMap-Data` remains preserved as the historical baseline source. It is not modified by this pipeline and is no longer the runtime authority.
5. No frontend data-source selection is introduced by this cutover. The future COS/GitHub read selection belongs to the separately approved frontend binding phase.

## Operator check

After each mirror worker deployment or formal mirror commit, run:

```powershell
npm test
npm run validate
```

Both commands are read-only against release data and fail if the current pointer, an attested release object, or the cutover contract is inconsistent. Payloads are UTF-8 JSON; validation canonicalizes Windows CRLF back to COS/Git LF before calculating SHA-256, so a checkout policy does not create a false integrity failure.
