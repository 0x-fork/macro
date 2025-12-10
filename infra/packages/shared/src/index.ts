import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const awsRegion = aws.config.region!;
if (!awsRegion) {
  throw new Error('AWS region not specified');
}

export const project = pulumi.getProject();

export const stack = pulumi.getStack();

export const config = new pulumi.Config();

export const MACRO_ORG_NAME = 'macro-inc';

export const RDS_PORT = 5432;

export const PULUMI_AUTHORIZER_STACK = 'macro-authorizer-lambda';

export const SERVICE_NAME = 'doc-storage';

export const BASE_DOMAIN = 'macro.com';

export const SERVICE_DOMAIN_NAME = `cloud-storage${
  stack === 'dev' ? '-dev' : ''
}.${BASE_DOMAIN}`;

export const MACRO_SUBDOMAIN_CERT =
  'arn:aws:acm:us-east-1:569036502058:certificate/a75b1b07-534c-44e1-b59b-fa5f74fd8069';

export const CLOUD_TRAIL_SNS_TOPIC_ARN =
  'arn:aws:sns:us-east-1:569036502058:CloudTrailSNS';

export const DATADOG_KINESIS_FIREHOSE_STREAM_ARN =
  'arn:aws:firehose:us-east-1:569036502058:deliverystream/datadog-kinesis-stream';

export const CLOUDWATCH_KINESIS_STREAM_ROLE_ARN =
  'arn:aws:iam::569036502058:role/cloudwatch-kinesis-stream-role';

export { getMacroApiToken } from './macro_api_token';
export { getMacroNotify } from './macro_notify';
export { getSearchEventQueue } from './search_event_queue';


const STACK_DEV = 'dev';
const STACK_PROD = 'prod';


export const SYNC_SERVICE_URL = 'SYNC_SERVICE_URL';
export const COMMS_SERVICE_URL = 'COMMS_SERVICE_URL';
export const EMAIL_SERVICE_URL = 'EMAIL_SERVICE_URL';
export const PROPERTIES_SERVICE_URL = 'PROPERTIES_SERVICE_URL';
export const METERING_SERVICE_URL = 'METERING_SERVICE_URL';
export const STATIC_FILE_SERVICE_URL = 'STATIC_FILE_SERVICE_URL';
export const ORGANIZATION_SERVICE_URL = 'ORGANIZATION_SERVICE_URL';
export const NOTIFICATION_SERVICE_URL = 'NOTIFICATION_SERVICE_URL';
export const AUTHENTICATION_SERVICE_URL = 'AUTHENTICATION_SERVICE_URL';
export const DOCUMENT_STORAGE_SERVICE_URL = 'DOCUMENT_STORAGE_SERVICE_URL';
export const CONNECTION_GATEWAY_URL = 'CONNECTION_GATEWAY_URL';
export const DOCUMENT_COGNITION_SERVICE_URL = 'DOCUMENT_COGNITION_SERVICE_URL';

type MacroUrlName = SYNC_SERVICE_URL
| COMMS_SERVICE_URL
| EMAIL_SERVICE_URL
| PROPERTIES_SERVICE_URL
| METERING_SERVICE_URL
| STATIC_FILE_SERVICE_URL
| ORGANIZATION_SERVICE_URL
| NOTIFICATION_SERVICE_URL
| AUTHENTICATION_SERVICE_URL
| DOCUMENT_STORAGE_SERVICE_URL
| CONNECTION_GATEWAY_URL
| DOCUMENT_COGNITION_SERVICE_URL;

/*
 * for service named "foo" it can look like
 * foo.macro.com
 * foo-service.macro.com
 * foo-service-prod.macro.com
 * some-other-thing.macro.com
 */

const PROD_URLS = {
  [SYNC_SERVICE_URL]: 'sync-service-prod.macroverse.workers.dev',
  [COMMS_SERVICE_URL]: 'comms-service.macro.com',
  [EMAIL_SERVICE_URL]: 'email-service.macro.com',
  [PROPERTIES_SERVICE_URL]: 'properties-service.macro.com',
  [METERING_SERVICE_URL]: 'metering.macro.com',
  [STATIC_FILE_SERVICE_URL]: 'static-file-service.macro.com',
  [ORGANIZATION_SERVICE_URL]: 'organization-service.macro.com',
  [NOTIFICATION_SERVICE_URL]: 'notifications.macro.com',
  [AUTHENTICATION_SERVICE_URL]: 'auth-service.macro.com',
  [DOCUMENT_STORAGE_SERVICE_URL]: 'cloud-storage.macro.com',
  [CONNECTION_GATEWAY_URL]: 'connection-gateway.macro.com',
  [DOCUMENT_COGNITION_SERVICE_URL]: 'document-cognition.macro.com',
}

const DEV_URLS = {
  [SYNC_SERVICE_URL]: 'sync-service-dev3.macroverse.workers.dev',
  [COMMS_SERVICE_URL]: 'comms-service-dev.macro.com',
  [EMAIL_SERVICE_URL]: 'email-service-dev.macro.com',
  [PROPERTIES_SERVICE_URL]: 'properties-service-dev.macro.com',
  [METERING_SERVICE_URL]: 'metering-dev.macro.com',
  [STATIC_FILE_SERVICE_URL]: 'static-file-service-dev.macro.com',
  [ORGANIZATION_SERVICE_URL]: 'organization-service-dev.macro.com',
  [NOTIFICATION_SERVICE_URL]: 'notifications-dev.macro.com',
  [AUTHENTICATION_SERVICE_URL]: 'auth-service-dev.macro.com',
  [DOCUMENT_STORAGE_SERVICE_URL]: 'cloud-storage-dev.macro.com',
  [CONNECTION_GATEWAY_URL]: 'connection-gateway-dev.macro.com',
  [DOCUMENT_COGNITION_SERVICE_URL]: 'document-cognition-dev.macro.com',
}

const URLS = stack === STACK_PROD ? PROD_URLS : DEV_URLS;

export function getMacroUrls(names: MacroUrlName[], urls = URLS) {
  const namesSet = new Set([...names]);
  return Object
    .entries(urls)
    .filter(([k,_]) => namesSet.has(k))
    .map(([name, value]) => {
      return {name, value};
    });
}
