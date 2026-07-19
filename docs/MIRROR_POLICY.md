# Mirror policy

Only the COS mirror worker may add `releases/<release-id>/` and its `mirror-manifest.json`. The manifest must name the immutable COS source and the merged Control commit that authorized the release. GitHub is never read as a source for COS Data, and this repository cannot carry a current-pointer write request.
