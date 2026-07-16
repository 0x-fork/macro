# documentation-sites

Static hosting for published team documentation sites: a private S3 bucket
served publicly through CloudFront at `https://docs-sites{-stack}.macro.com`,
with optional per-site custom domains.

The document storage service renders each site (see `crates/documentation`)
and uploads it under `s3://documentation-sites-{stack}/{site-slug}/`.

## Deploying

```
cd infra/stacks/documentation-sites
pulumi up -s <dev|prod>
```

## Follow-ups after the first deploy

The document storage service needs two things this stack cannot grant from
here:

1. **IAM**: give the document storage service task role `s3:PutObject`,
   `s3:GetObject`, `s3:DeleteObject`, and `s3:ListBucket` on
   `documentationSitesBucketArn` (and `/*`). Attach it where the service's
   role is defined (the `cloud-storage-service` stack), referencing this
   stack's output.
2. **Env vars (doppler, cloud-storage-service project)**:
   - `DOCUMENTATION_SITES_BUCKET` = the `documentationSitesBucketName` output
   - `DOCUMENTATION_SITES_BASE_URL` = the `documentationSitesBaseUrl` output

Both env vars are optional: without them the service boots normally, site
management works, and only publishing fails with a clear error.

## Custom domains

Set `documentation-sites:customDomainMappings` in the stack config to serve
a site at its own domain, e.g. for the docs.macro.com migration:

```yaml
documentation-sites:customDomainMappings:
  docs.macro.com: macro
```

Then point the domain at this distribution (Route53 A-alias). Domains under
`macro.com` are covered by the existing wildcard cert; external customer
domains additionally need a cert that covers them attached to the
distribution. Published pages use only relative URLs, so the same files
serve correctly from both the shared path and the custom domain root.
