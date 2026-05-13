# Vendored convert-service assets

`core-co-25.04-assets.tar.gz.part-*` are split chunks of Collabora Online's `core-co-25.04-assets.tar.gz` asset.

Original source URL:
https://github.com/CollaboraOnline/online/releases/download/for-code-assets/core-co-25.04-assets.tar.gz

Reassembled SHA-256:
`7331fbfcc6999c5cf279d50011a9b0614d0dc6f32823b5716c5daef639651822`

The archive is split into 40 MiB parts to keep individual git blob sizes below GitHub's warning and hard limits. Reassemble with:

```sh
cat core-co-25.04-assets.tar.gz.part-* > core-co-25.04-assets.tar.gz
sha256sum core-co-25.04-assets.tar.gz
```
