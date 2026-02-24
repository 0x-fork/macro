import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { config, stack } from '../../packages/shared';
import { get_coparse_api_vpc } from '../../packages/vpc';
import { LiteLlmService } from './service';

const tags = {
  environment: stack,
  tech_lead: 'hutch',
  project: 'litellm-proxy',
};

const coparse_api_vpc = get_coparse_api_vpc();

// ------------------------------------------- Secrets -------------------------------------------

const OPENAI_API_KEY = aws.secretsmanager
  .getSecretVersionOutput({
    secretId: config.require('openai_api_key'),
  })
  .apply((secret) => secret.secretString);

const openaiApiKeyArn = aws.secretsmanager
  .getSecretVersionOutput({
    secretId: config.require('openai_api_key'),
  })
  .apply((secret) => secret.arn);

const ANTHROPIC_API_KEY = aws.secretsmanager
  .getSecretVersionOutput({
    secretId: config.require('anthropic_api_key'),
  })
  .apply((secret) => secret.secretString);

const anthropicApiKeyArn = aws.secretsmanager
  .getSecretVersionOutput({
    secretId: config.require('anthropic_api_key'),
  })
  .apply((secret) => secret.arn);

// ------------------------------------------- Cloud Storage -------------------------------------------

const cloudStorageStack = new pulumi.StackReference('cloud-storage-stack', {
  name: `macro-inc/document-storage/${stack}`,
});

const cloudStorageClusterArn: pulumi.Output<string> = cloudStorageStack
  .getOutput('cloudStorageClusterArn')
  .apply((arn) => arn as string);

const cloudStorageClusterName: pulumi.Output<string> = cloudStorageStack
  .getOutput('cloudStorageClusterName')
  .apply((name) => name as string);

// ------------------------------------------- Consumer Services -------------------------------------------

const documentCognitionStack = new pulumi.StackReference(
  'document-cognition-stack',
  {
    name: `macro-inc/document-cognition/${stack}`,
  }
);

const documentCognitionServiceSgId: pulumi.Output<string> =
  documentCognitionStack
    .getOutput('documentCognitionServiceSgId')
    .apply((id) => id as string);

// ------------------------------------------- LiteLLM Proxy -------------------------------------------

const litellmProxy = new LiteLlmService(`litellm-proxy-${stack}`, {
  ecsClusterArn: cloudStorageClusterArn,
  cloudStorageClusterName,
  vpc: coparse_api_vpc,
  serviceContainerPort: 4000,
  healthCheckPath: '/health/liveliness',
  containerEnvVars: [
    {
      name: 'OPENAI_API_KEY',
      value: pulumi.interpolate`${OPENAI_API_KEY}`,
    },
    {
      name: 'ANTHROPIC_API_KEY',
      value: pulumi.interpolate`${ANTHROPIC_API_KEY}`,
    },
    {
      name: 'DD_SERVICE',
      value: 'litellm-proxy',
    },
    {
      name: 'DD_ENV',
      value: stack,
    },
  ],
  tags,
  secretKeyArns: [openaiApiKeyArn, anthropicApiKeyArn],
  consumerServiceSgIds: [documentCognitionServiceSgId],
});

// ------------------------------------------- Exports -------------------------------------------

export const litellmProxyUrl = pulumi.interpolate`${litellmProxy.domain}`;
export const litellmProxySgId = litellmProxy.serviceSg.id;
export const litellmProxyAlbSgId = litellmProxy.serviceAlbSg.id;
