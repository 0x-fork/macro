/**
 * Static hosting for published team documentation sites.
 *
 * The document storage service renders each site to static files and
 * uploads them under `s3://documentation-sites-{stack}/{site-slug}/`.
 * This stack serves that bucket publicly through CloudFront:
 *
 *   https://docs-sites{-stack}.macro.com/{site-slug}/...
 *
 * plus optional per-site custom domains (e.g. docs.macro.com) configured
 * via the `customDomainMappings` stack config — a viewer-request function
 * rewrites requests on those hosts into the mapped site's prefix, so the
 * same published files serve both URLs. Rendered pages use only relative
 * URLs, which is what makes that dual serving work.
 *
 * See README.md for the follow-ups required to let the document storage
 * service publish (IAM + env vars).
 */

import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { BASE_DOMAIN, MACRO_SUBDOMAIN_CERT, stack } from '../../packages/shared';

const tags = {
  environment: stack,
  project: 'documentation-sites',
};

const BASE_NAME = 'documentation-sites';

const config = new pulumi.Config();
/** Custom domain -> site slug served at that domain's root. */
const customDomainMappings =
  config.getObject<Record<string, string>>('customDomainMappings') ?? {};

/* ------------------------------------------------------------------ */
/* Bucket                                                             */
/* ------------------------------------------------------------------ */

const bucket = new aws.s3.Bucket(`${BASE_NAME}-${stack}`, {
  bucket: `${BASE_NAME}-${stack}`,
  tags,
});

new aws.s3.BucketPublicAccessBlock(`${BASE_NAME}-public-access-block-${stack}`, {
  bucket: bucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// Default 404 page served for missing paths on every site.
new aws.s3.BucketObject(`${BASE_NAME}-404-${stack}`, {
  bucket: bucket.id,
  key: '404.html',
  contentType: 'text/html; charset=utf-8',
  content: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#101010;color:#e8e6e3;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{text-align:center}h1{font-size:1.5rem}a{color:#ff8f05}</style>
</head>
<body><main><h1>Page not found</h1><p>This page doesn't exist or hasn't been published.</p></main></body>
</html>
`,
  tags,
});

/* ------------------------------------------------------------------ */
/* CloudFront                                                         */
/* ------------------------------------------------------------------ */

const originAccessControl = new aws.cloudfront.OriginAccessControl(
  `${BASE_NAME}-oac-${stack}`,
  {
    originAccessControlOriginType: 's3',
    signingBehavior: 'always',
    signingProtocol: 'sigv4',
  }
);

// Rewrites viewer requests so S3 receives real object keys:
// - requests on a custom domain are prefixed with the mapped site's slug
// - pretty URLs (`/`-terminated or extensionless) get `/index.html`
const viewerRequestFunction = new aws.cloudfront.Function(
  `${BASE_NAME}-viewer-request-${stack}`,
  {
    runtime: 'cloudfront-js-2.0',
    comment: 'Custom-domain prefixing and pretty-URL index rewriting',
    publish: true,
    code: pulumi.output(customDomainMappings).apply(
      (mappings) => `
const CUSTOM_DOMAIN_SLUGS = ${JSON.stringify(mappings)};

function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value.toLowerCase() : '';
  var uri = request.uri;

  var slug = CUSTOM_DOMAIN_SLUGS[host];
  if (slug) {
    uri = '/' + slug + uri;
  }

  if (uri.endsWith('/')) {
    uri += 'index.html';
  } else {
    var lastSegment = uri.split('/').pop();
    if (lastSegment && lastSegment.indexOf('.') === -1) {
      uri += '/index.html';
    }
  }

  request.uri = uri;
  return request;
}
`
    ),
  }
);

const webAclId = aws.wafv2
  .getWebAcl({
    name: 'macro-global-web-acl',
    scope: 'CLOUDFRONT',
  })
  .then((r) => r.arn);

// Managed-CachingOptimized respects the Cache-Control headers the publisher
// sets per object (short for HTML, longer for theme assets).
const cachePolicyId = aws.cloudfront
  .getCachePolicy({ name: 'Managed-CachingOptimized' })
  .then((r) => r.id!);

const bucketRegionalDomainName = pulumi.interpolate`${bucket.bucket}.s3.${bucket.region}.amazonaws.com`;

const alias = `docs-sites${stack === 'prod' ? '' : `-${stack}`}.${BASE_DOMAIN}`;
const firstPartyCustomDomains = Object.keys(customDomainMappings);

const distribution = new aws.cloudfront.Distribution(
  `${BASE_NAME}-distribution-${stack}`,
  {
    comment: `(${stack}) published documentation sites`,
    aliases: [alias, ...firstPartyCustomDomains],
    viewerCertificate: {
      cloudfrontDefaultCertificate: false,
      // Covers *.macro.com; adding a custom domain outside macro.com
      // requires attaching a cert that covers it.
      acmCertificateArn: MACRO_SUBDOMAIN_CERT,
      sslSupportMethod: 'sni-only',
      minimumProtocolVersion: 'TLSv1.2_2021',
    },
    loggingConfig:
      stack === 'prod'
        ? {
            bucket: 'macro-cloudfront-logging.s3.amazonaws.com',
            includeCookies: false,
            prefix: `documentation-sites-${stack}`,
          }
        : undefined,
    webAclId,
    defaultCacheBehavior: {
      allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
      cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
      compress: true,
      targetOriginId: bucket.id,
      viewerProtocolPolicy: 'redirect-to-https',
      cachePolicyId,
      functionAssociations: [
        {
          eventType: 'viewer-request',
          functionArn: viewerRequestFunction.arn,
        },
      ],
    },
    customErrorResponses: [
      // S3 answers 403 for missing keys behind OAC; both map to the
      // shared 404 page.
      { errorCode: 403, responseCode: 404, responsePagePath: '/404.html' },
      { errorCode: 404, responseCode: 404, responsePagePath: '/404.html' },
    ],
    enabled: true,
    origins: [
      {
        domainName: bucketRegionalDomainName,
        originId: bucket.id,
        originAccessControlId: originAccessControl.id,
      },
    ],
    restrictions: {
      geoRestriction: {
        restrictionType: 'none',
      },
    },
    httpVersion: 'http2and3',
    tags,
  }
);

// Only CloudFront (this distribution) may read the bucket.
new aws.s3.BucketPolicy(`${BASE_NAME}-bucket-policy-${stack}`, {
  bucket: bucket.id,
  policy: pulumi
    .all([bucket.arn, distribution.arn])
    .apply(([bucketArn, distributionArn]) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowCloudFrontServicePrincipalReadOnly',
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 's3:GetObject',
            Resource: `${bucketArn}/*`,
            Condition: {
              StringEquals: { 'AWS:SourceArn': distributionArn },
            },
          },
        ],
      })
    ),
});

/* ------------------------------------------------------------------ */
/* DNS                                                                */
/* ------------------------------------------------------------------ */

const zone = aws.route53.getZoneOutput({ name: BASE_DOMAIN });
new aws.route53.Record(`${BASE_NAME}-dns-${stack}`, {
  name: `docs-sites${stack === 'prod' ? '' : `-${stack}`}`,
  zoneId: zone.zoneId,
  type: 'A',
  aliases: [
    {
      name: distribution.domainName,
      zoneId: distribution.hostedZoneId,
      evaluateTargetHealth: true,
    },
  ],
});

/* ------------------------------------------------------------------ */
/* Outputs                                                            */
/* ------------------------------------------------------------------ */

/** Bucket the document storage service publishes rendered sites into. */
export const documentationSitesBucketName = bucket.bucket;
/** Bucket ARN, for granting the document storage service read/write. */
export const documentationSitesBucketArn = bucket.arn;
/** Public base URL sites are served under (`{base}/{slug}/`). */
export const documentationSitesBaseUrl = `https://${alias}`;
export const documentationSitesDistributionId = distribution.id;
