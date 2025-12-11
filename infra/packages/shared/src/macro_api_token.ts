import * as aws from '@pulumi/aws';
import type * as pulumi from '@pulumi/pulumi';
import { AUTHENTICATION_SERVICE_URL, getMacroUrl, stack } from '@shared';

const MACRO_API_TOKEN_PUBLIC_KEY = `macro-api-token-public-key-${stack}`;

export function getMacroApiToken(): {
  macroApiTokenIssuer: string;
  macroApiTokenPublicKey: string;
  macroApiTokenPublicKeyArn: pulumi.Output<string>;
} {
  return {
    macroApiTokenIssuer: getMacroUrl(AUTHENTICATION_SERVICE_URL).hostname,
    macroApiTokenPublicKey: MACRO_API_TOKEN_PUBLIC_KEY,
    macroApiTokenPublicKeyArn: aws.secretsmanager
      .getSecretVersionOutput({
        secretId: MACRO_API_TOKEN_PUBLIC_KEY,
      })
      .apply((secret) => secret.arn),
  };
}
