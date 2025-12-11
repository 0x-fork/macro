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

// TODO rename these to not have "_URL", because it seems like they are actually URL's
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
export const LEXICAL_SERVICE_URL = 'LEXICAL_SERVICE_URL';
export const SEARCH_SERVICE_URL = 'SEARCH_SERVICE_URL';

type MacroUrlName =
  | SYNC_SERVICE_URL
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
  | DOCUMENT_COGNITION_SERVICE_URL
  | LEXICAL_SERVICE_URL
  | SEARCH_SERVICE_URL;


type MacroUrl =
  | 'https://sync-service-prod.macroverse.workers.dev'
  | 'https://comms-service.macro.com'
  | 'https://email-service.macro.com'
  | 'https://properties-service.macro.com'
  | 'https://metering.macro.com'
  | 'https://static-file-service.macro.com'
  | 'https://organization-service.macro.com'
  | 'https://notifications.macro.com'
  | 'https://auth-service.macro.com'
  | 'https://cloud-storage.macro.com'
  | 'https://connection-gateway.macro.com'
  | 'https://document-cognition.macro.com'
  | 'https://lexical-service-prod.macroverse.workers.dev'
  | 'https://search-service.macro.com'
  | 'https://sync-service-dev3.macroverse.workers.dev'
  | 'https://comms-service-dev.macro.com'
  | 'https://email-service-dev.macro.com'
  | 'https://properties-service-dev.macro.com'
  | 'https://metering-dev.macro.com'
  | 'https://static-file-service-dev.macro.com'
  | 'https://organization-service-dev.macro.com'
  | 'https://notifications-dev.macro.com'
  | 'https://auth-service-dev.macro.com'
  | 'https://cloud-storage-dev.macro.com'
  | 'https://connection-gateway-dev.macro.com'
  | 'https://document-cognition-dev.macro.com'
  | 'https://lexical-service-dev.macroverse.workers.dev'
  | 'https://search-service-dev.macro.com';

const PROD_URLS: { [key in MacroUrlName]: MacroUrl } = {
  [SYNC_SERVICE_URL]: 'https://sync-service-prod.macroverse.workers.dev',
  [COMMS_SERVICE_URL]: 'https://comms-service.macro.com',
  [EMAIL_SERVICE_URL]: 'https://email-service.macro.com',
  [PROPERTIES_SERVICE_URL]: 'https://properties-service.macro.com',
  [METERING_SERVICE_URL]: 'https://metering.macro.com',
  [STATIC_FILE_SERVICE_URL]: 'https://static-file-service.macro.com',
  [ORGANIZATION_SERVICE_URL]: 'https://organization-service.macro.com',
  [NOTIFICATION_SERVICE_URL]: 'https://notifications.macro.com',
  [AUTHENTICATION_SERVICE_URL]: 'https://auth-service.macro.com',
  [DOCUMENT_STORAGE_SERVICE_URL]: 'https://cloud-storage.macro.com',
  [CONNECTION_GATEWAY_URL]: 'https://connection-gateway.macro.com',
  [DOCUMENT_COGNITION_SERVICE_URL]: 'https://document-cognition.macro.com',
  [LEXICAL_SERVICE_URL]: 'https://lexical-service-prod.macroverse.workers.dev',
  [SEARCH_SERVICE_URL]: 'https://search-service.macro.com',
};

const DEV_URLS: { [key in MacroUrlName]: MacroUrl } = {
  [SYNC_SERVICE_URL]: 'https://sync-service-dev3.macroverse.workers.dev',
  [COMMS_SERVICE_URL]: 'https://comms-service-dev.macro.com',
  [EMAIL_SERVICE_URL]: 'https://email-service-dev.macro.com',
  [PROPERTIES_SERVICE_URL]: 'https://properties-service-dev.macro.com',
  [METERING_SERVICE_URL]: 'https://metering-dev.macro.com',
  [STATIC_FILE_SERVICE_URL]: 'https://static-file-service-dev.macro.com',
  [ORGANIZATION_SERVICE_URL]: 'https://organization-service-dev.macro.com',
  [NOTIFICATION_SERVICE_URL]: 'https://notifications-dev.macro.com',
  [AUTHENTICATION_SERVICE_URL]: 'https://auth-service-dev.macro.com',
  [DOCUMENT_STORAGE_SERVICE_URL]: 'https://cloud-storage-dev.macro.com',
  [CONNECTION_GATEWAY_URL]: 'https://connection-gateway-dev.macro.com',
  [DOCUMENT_COGNITION_SERVICE_URL]: 'https://document-cognition-dev.macro.com',
  [LEXICAL_SERVICE_URL]: 'https://lexical-service-dev.macroverse.workers.dev',
  [SEARCH_SERVICE_URL]: 'https://search-service-dev.macro.com',
};

const URLS = (()=> {
  switch (stack) {
    case STACK_PROD:
      return PROD_URLS;
    case STACK_DEV:
      return DEV_URLS;
    default:
      throw new Error(`Invalid stack. Expected [${STACK_DEV}] or [${STACK_PROD}]. Got [${stack}]`);
  }
})();

export function getMacroUrl(name: MacroUrlName): MacroUrl {
  return URLS[name];
}
/** Returns urls with names in `names`, in the form [{ name: 'FOO_URL', value: 'http://foo.macro.com' }, ...] */
export function getNameValueMacroUrls(names: MacroUrlName[], urls = URLS) {
  const namesSet = new Set([...names]);
  return Object.entries(urls)
    .filter(([k, _]) => namesSet.has(k))
    .map(([name, value]) => {
      return { name, value };
    });
}
export function filterObjectKeys(keys, obj) {
  const keySet = new Set([...keys]);
  return Object.fromEntries(
    Object.entries(obj).filter(([k, _]) => keySet.has(k))
  );
}

export function filterMacroUrls(names: MacroUrlName[], urls = URLS) {
  return filterObjectKeys(names, urls);
}
