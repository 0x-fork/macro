import * as aws from '@pulumi/aws';
import type * as pulumi from '@pulumi/pulumi';
import type { Output } from '@pulumi/pulumi';
import { MACRO_SUBDOMAIN_CERT, stack } from '../../../shared';

export function serviceLoadBalancer(
  parent: pulumi.ComponentResource | undefined,
  {
    serviceName,
    serviceContainerPort,
    healthCheckPath,
    vpc,
    albSecurityGroupId,
    isPrivate,
    tags,
    idleTimeout,
    // Health-check tuning. Defaults are tuned for fast deploys: a new task is
    // marked healthy after ~2 checks x 10s (~20s) instead of the AWS ALB
    // defaults (~5 checks x 30s = 120-150s), which dominated ECS rollout time.
    // Services with an expensive /health endpoint can override these.
    healthCheckInterval = 10,
    healthyThreshold = 2,
    unhealthyThreshold = 2,
    healthCheckTimeout = 5,
    healthCheckMatcher = '200',
  }: {
    serviceName: string;
    serviceContainerPort: number;
    healthCheckPath: string;
    vpc: {
      vpcId: Output<any> | string;
      publicSubnetIds: Output<any> | string[];
      privateSubnetIds: Output<any> | string[];
    };
    albSecurityGroupId: Output<string> | string;
    isPrivate?: boolean;
    tags: { [key: string]: string };
    idleTimeout?: number;
    healthCheckInterval?: number;
    healthyThreshold?: number;
    unhealthyThreshold?: number;
    healthCheckTimeout?: number;
    healthCheckMatcher?: string;
  }
) {
  const targetGroup = new aws.alb.TargetGroup(
    `${serviceName}-tg-${stack}`,
    {
      name: `${serviceName}-tg-${stack}`,
      deregistrationDelay: 30, // let any active calls finish within 30 seconds
      port: serviceContainerPort,
      protocol: 'HTTP',
      targetType: 'ip',
      vpcId: vpc.vpcId,
      healthCheck: {
        path: healthCheckPath,
        protocol: 'HTTP',
        interval: healthCheckInterval,
        healthyThreshold,
        unhealthyThreshold,
        timeout: healthCheckTimeout,
        matcher: healthCheckMatcher,
      },
      tags,
    },
    { parent }
  );

  const lb = new aws.lb.LoadBalancer(
    `${serviceName}-alb-${stack}`,
    {
      name: `${serviceName}-alb-${stack}`,
      internal: isPrivate ? true : false,
      loadBalancerType: 'application',
      securityGroups: [albSecurityGroupId],
      subnets: isPrivate ? vpc.privateSubnetIds : vpc.publicSubnetIds,
      enableDeletionProtection: false,
      // default is 60 seconds, can be up to 4000 seconds
      idleTimeout,
      tags,
      accessLogs: {
        bucket: 'macro-alb-logging',
        enabled: stack === 'prod',
        prefix: `${serviceName}-${stack}`,
      },
    },
    { parent }
  );

  const listener = new aws.lb.Listener(
    `${serviceName}-lsn-${stack}`,
    {
      loadBalancerArn: lb.arn,
      port: 443,
      protocol: 'HTTPS',
      sslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
      certificateArn: MACRO_SUBDOMAIN_CERT,
      tags,
      defaultActions: [
        {
          type: 'forward',
          targetGroupArn: targetGroup.arn,
        },
      ],
    },
    { parent }
  );

  new aws.lb.Listener(
    `${serviceName}-httplsn-${stack}`,
    {
      loadBalancerArn: lb.arn,
      port: 80,
      protocol: 'HTTP',
      tags,
      defaultActions: [
        {
          redirect: {
            port: '443',
            statusCode: 'HTTP_301',
            protocol: 'HTTPS',
          },
          type: 'redirect',
        },
      ],
    },
    { parent }
  );

  return { targetGroup, lb, listener };
}
