import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import type * as tls from '@pulumi/tls';
import {
  createFrecencyTablePolicy,
  DATADOG_API_KEY,
  datadogAgentContainer,
  fargateLogRouterSidecarContainer,
  serviceLoadBalancer,
} from '@resources';
import { EcrImage } from '@service';
import { BASE_DOMAIN, CLOUD_TRAIL_SNS_TOPIC_ARN, stack } from '@shared';
import { EmailAttachmentsBucket } from '@stacks/email-service/attachments-bucket';
import { getCloudfrontDistribution } from '@stacks/email-service/s3-cloudfront-distribution';

const BASE_NAME = 'email-service';
const PUBSUB_WORKER_NAME = 'email-service-pubsub-worker';
const BASE_PATH = '../../../rust/cloud-storage';

export const SERVICE_DOMAIN_NAME = `email-service${
  stack === 'prod' ? '' : `-${stack}`
}.${BASE_DOMAIN}`;

type Args = {
  secretKeyArns: (pulumi.Output<string> | string)[];
  clusterName: pulumi.Output<string> | string;
  ecsClusterArn: pulumi.Output<string> | string;
  vpc: {
    vpcId: pulumi.Output<string> | string;
    publicSubnetIds: pulumi.Output<string[]> | string[];
    privateSubnetIds: pulumi.Output<string[]> | string[];
  };
  platform: { family: string; architecture: 'amd64' | 'arm64' };
  serviceContainerPort: number;
  isPrivate?: boolean;
  containerEnvVars: { name: string; value: pulumi.Output<string> | string }[];
  healthCheckPath: string;
  tags: { [key: string]: string };
  queueArns: pulumi.Output<string>[];
  cfKeyPair: tls.PrivateKey;
};

export class EmailService extends pulumi.ComponentResource {
  public role: aws.iam.Role;
  public ecr: awsx.ecr.Repository;
  public serviceAlbSg: aws.ec2.SecurityGroup;
  public serviceSg: aws.ec2.SecurityGroup;
  public targetGroup: aws.lb.TargetGroup;
  public lb: aws.lb.LoadBalancer;
  public listener: aws.lb.Listener;
  public api_service: awsx.ecs.FargateService;
  public worker_service: awsx.ecs.FargateService;
  public domain: string;
  public clusterName: pulumi.Output<string> | string;
  public tags: { [key: string]: string };

  constructor(
    name: string,
    {
      ecsClusterArn,
      vpc,
      platform,
      serviceContainerPort,
      healthCheckPath,
      isPrivate,
      containerEnvVars,
      clusterName,
      tags,
      secretKeyArns,
      queueArns,
      cfKeyPair,
    }: Args,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('my:components:Service', name, {}, opts);
    this.tags = tags;

    this.clusterName = clusterName;

    // role
    const secretsPolicy = new aws.iam.Policy(
      `${BASE_NAME}-secrets-policy`,
      {
        policy: {
          Version: '2012-10-17',
          Statement: [
            {
              Action: ['secretsmanager:GetSecretValue'],
              Resource: [...secretKeyArns],
              Effect: 'Allow',
            },
          ],
        },
        tags: this.tags,
      },
      { parent: this }
    );

    const gmailSqsPolicy = new aws.iam.Policy(
      `${BASE_NAME}-gmail-sqs-policy`,
      {
        policy: pulumi.output({
          Version: '2012-10-17',
          Statement: [
            {
              Action: ['sqs:*'],
              Resource: queueArns,
              Effect: 'Allow',
            },
          ],
        }),
        tags: tags,
      },
      { parent: this }
    );

    // Create frecency table policy
    const frecencyPolicy = createFrecencyTablePolicy(
      `${BASE_NAME}-frecency-policy`,
      { parent: this }
    );

    this.role = new aws.iam.Role(
      `${BASE_NAME}-role`,
      {
        name: `${BASE_NAME}-role-${stack}`,
        assumeRolePolicy: {
          Version: '2012-10-17',
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Principal: {
                Service: 'ecs-tasks.amazonaws.com',
              },
              Effect: 'Allow',
              Sid: '',
            },
          ],
        },
        tags: this.tags,
        managedPolicyArns: [
          secretsPolicy.arn,
          gmailSqsPolicy.arn,
          frecencyPolicy.arn,
        ],
      },
      { parent: this }
    );

    // ecr image
    const serviceImage = new EcrImage(
      `${BASE_NAME}-ecr-image-${stack}`,
      {
        repositoryId: `${BASE_NAME}-ecr-${stack}`,
        repositoryName: `${BASE_NAME}-${stack}`,
        imageId: `${BASE_NAME}-image-${stack}`,
        imagePath: BASE_PATH,
        dockerfile: 'Dockerfile',
        platform,
        tags: this.tags,
        buildArgs: {
          SERVICE_NAME: 'email_service',
        },
      },
      { parent: this }
    );

    const workerImage = new EcrImage(
      `${PUBSUB_WORKER_NAME}-ecr-image-${stack}`,
      {
        repositoryId: `${BASE_NAME}-ecr-${stack}`,
        repositoryName: `${BASE_NAME}-${stack}`,
        imageId: `${BASE_NAME}-image-${stack}`,
        imagePath: BASE_PATH,
        dockerfile: 'Dockerfile',
        platform,
        tags: this.tags,
        buildArgs: {
          SERVICE_NAME: 'email_service',
          CARGO_BUILD_ARGS: '--no-default-features --features worker',
        },
      },
      { parent: this }
    );

    this.ecr = serviceImage.ecr;

    // sg
    const sg = this.initializeSecurityGroups({
      vpcId: vpc.vpcId,
      serviceContainerPort,
    });
    this.serviceAlbSg = sg.serviceAlbSg;
    this.serviceSg = sg.serviceSg;

    let emailAttachmentBucket: EmailAttachmentsBucket;
    if (stack !== 'local') {
      emailAttachmentBucket = new EmailAttachmentsBucket(
        `email-attachments-bucket-${stack}`,
        {
          emailServiceRoleArn: this.role.arn,
        }
      );
    } else {
      emailAttachmentBucket = new EmailAttachmentsBucket(
        `email-attachments-bucket-${stack}`,
        {}
      );
    }

    const cloudfrontDistribution = getCloudfrontDistribution({
      bucket: emailAttachmentBucket.bucket,
      keyPair: cfKeyPair,
    });

    emailAttachmentBucket.attachCloudfrontPolicy({
      cloudfrontDistributionArn: cloudfrontDistribution.distribution.arn,
      emailServiceRoleArn: this.role.arn,
    });

    containerEnvVars.push(
      {
        name: 'ATTACHMENT_BUCKET',
        value: emailAttachmentBucket.bucket.id,
      },
      {
        name: 'CLOUDFRONT_DISTRIBUTION_URL',
        value: pulumi.interpolate`${cloudfrontDistribution.domain}`,
      },
      {
        name: 'CLOUDFRONT_SIGNER_PUBLIC_KEY_ID',
        value: pulumi.interpolate`${cloudfrontDistribution.publicKey.id}`,
      }
    );

    // lb
    const { targetGroup, lb, listener } = serviceLoadBalancer(this, {
      serviceName: BASE_NAME, // service name
      serviceContainerPort,
      healthCheckPath,
      vpc,
      albSecurityGroupId: this.serviceAlbSg.id,
      isPrivate,
      tags,
    });
    this.targetGroup = targetGroup;
    this.lb = lb;
    this.listener = listener;

    // api service
    const api_service = new awsx.ecs.FargateService(
      `${BASE_NAME}`,
      {
        tags,
        cluster: ecsClusterArn,
        networkConfiguration: {
          subnets: vpc.privateSubnetIds,
          securityGroups: [this.serviceSg.id],
        },
        taskDefinitionArgs: {
          taskRole: {
            roleArn: this.role.arn,
          },
          containers: {
            log_router: fargateLogRouterSidecarContainer,
            datadog_agent: datadogAgentContainer,
            service: {
              name: BASE_NAME,
              image: serviceImage.image.imageUri,
              stopTimeout: 10, // 10 seconds to force kill the task
              cpu: stack === 'prod' ? 1024 : 512,
              memory: stack === 'prod' ? 1742 : 718, // 2048 (256 for datadog - 50 for log_router)
              environment: [...containerEnvVars],
              logConfiguration: {
                logDriver: 'awsfirelens',
                options: {
                  Name: 'datadog',
                  Host: 'http-intake.logs.us5.datadoghq.com',
                  apikey: DATADOG_API_KEY,
                  dd_service: `email-service-${stack}`,
                  dd_source: 'fargate',
                  dd_tags: `project:cloudstorage, env:${stack}`,
                  provider: 'ecs',
                },
              },
              portMappings: [
                {
                  appProtocol: 'http',
                  name: `${BASE_NAME}-tcp-${stack}`,
                  hostPort: serviceContainerPort,
                  containerPort: serviceContainerPort,
                  targetGroup,
                },
              ],
            },
          },
          runtimePlatform: {
            operatingSystemFamily: `${platform.family.toUpperCase()}`,
            cpuArchitecture: `${
              platform.architecture === 'amd64'
                ? 'X86_64'
                : platform.architecture.toUpperCase()
            }`,
          },
        },
        desiredCount: stack === 'prod' ? 3 : 1,
      },
      { parent: this }
    );

    this.api_service = api_service;

    // worker service
    const worker_service = new awsx.ecs.FargateService(
      `${PUBSUB_WORKER_NAME}`,
      {
        tags,
        cluster: ecsClusterArn,
        networkConfiguration: {
          subnets: vpc.privateSubnetIds,
          securityGroups: [this.serviceSg.id],
        },
        taskDefinitionArgs: {
          taskRole: {
            roleArn: this.role.arn,
          },
          containers: {
            log_router: fargateLogRouterSidecarContainer,
            datadog_agent: datadogAgentContainer,
            service: {
              name: `${PUBSUB_WORKER_NAME}`,
              image: workerImage.image.imageUri,
              stopTimeout: 10, // 10 seconds to force kill the task
              cpu: stack === 'prod' ? 2048 : 1024,
              memory: stack === 'prod' ? 3742 : 1742, // 2048 minimum - 256 for datadog - 50 for log_router
              environment: [...containerEnvVars],
              logConfiguration: {
                logDriver: 'awsfirelens',
                options: {
                  Name: 'datadog',
                  Host: 'http-intake.logs.us5.datadoghq.com',
                  apikey: DATADOG_API_KEY,
                  dd_service: `${PUBSUB_WORKER_NAME}-${stack}`,
                  dd_source: 'fargate',
                  dd_tags: `project:cloudstorage, env:${stack}`,
                  provider: 'ecs',
                },
              },
            },
          },
          runtimePlatform: {
            operatingSystemFamily: `${platform.family.toUpperCase()}`,
            cpuArchitecture: `${
              platform.architecture === 'amd64'
                ? 'X86_64'
                : platform.architecture.toUpperCase()
            }`,
          },
        },
        desiredCount: stack === 'prod' ? 5 : 1,
      },
      { parent: this }
    );

    this.worker_service = worker_service;

    this.setupAutoScaling();

    this.setupServiceAlarms();

    // domain record
    const zone = aws.route53.getZoneOutput({ name: BASE_DOMAIN });

    new aws.route53.Record(
      `${BASE_NAME}-domain-record`,
      {
        name: SERVICE_DOMAIN_NAME,
        type: 'A',
        zoneId: zone.zoneId,
        aliases: [
          {
            evaluateTargetHealth: false,
            name: this.lb.dnsName,
            zoneId: this.lb.zoneId,
          },
        ],
      },
      { parent: this }
    );

    this.domain = `https://${SERVICE_DOMAIN_NAME}`;
  }


  /*********************
   * Helper Functions *
   ********************/


  initializeSecurityGroups({
    vpcId,
    serviceContainerPort,
  }: {
    vpcId: pulumi.Output<string> | string;
    serviceContainerPort: number;
  }) {
    const serviceAlbSg = new aws.ec2.SecurityGroup(
      `${BASE_NAME}-alb-sg-${stack}`,
      {
        name: `${BASE_NAME}-alb-sg-${stack}`,
        description: `${BASE_NAME} application load balancer security group`,
        vpcId,
        tags: this.tags,
      },
      { parent: this }
    );

    const serviceSg = new aws.ec2.SecurityGroup(
      `${BASE_NAME}-sg-${stack}`,
      {
        name: `${BASE_NAME}-sg-${stack}`,
        vpcId,
        description: `${BASE_NAME} security group that is attached directly to the service`,
        tags: this.tags,
      },
      { parent: this }
    );

    new aws.vpc.SecurityGroupIngressRule(
      `${BASE_NAME}-alb-in`,
      {
        securityGroupId: serviceSg.id,
        description: 'Allow inbound traffic from the services ALB',
        referencedSecurityGroupId: serviceAlbSg.id,
        fromPort: serviceContainerPort,
        toPort: serviceContainerPort,
        ipProtocol: 'tcp',
        tags: this.tags,
      },
      { parent: this }
    );

    new aws.vpc.SecurityGroupEgressRule(
      `${BASE_NAME}-all-out`,
      {
        securityGroupId: serviceSg.id,
        description: 'Allow all outbound',
        cidrIpv4: '0.0.0.0/0',
        ipProtocol: '-1',
        tags: this.tags,
      },
      { parent: this }
    );

    // ALB SG rules
    new aws.vpc.SecurityGroupIngressRule(
      `${BASE_NAME}-http`,
      {
        securityGroupId: serviceAlbSg.id,
        description: 'Allow inbound HTTP traffic',
        cidrIpv4: '0.0.0.0/0',
        fromPort: 80,
        ipProtocol: 'tcp',
        toPort: 80,
        tags: this.tags,
      },
      { parent: this }
    );

    new aws.vpc.SecurityGroupIngressRule(
      `${BASE_NAME}-https`,
      {
        securityGroupId: serviceAlbSg.id,
        description: 'Allow inbound HTTPS traffic',
        cidrIpv4: '0.0.0.0/0',
        fromPort: 443,
        ipProtocol: 'tcp',
        toPort: 443,
        tags: this.tags,
      },
      { parent: this }
    );

    new aws.vpc.SecurityGroupEgressRule(
      `${BASE_NAME}-out-service`,
      {
        description: 'Allow traffic to the service security group',
        securityGroupId: serviceAlbSg.id,
        referencedSecurityGroupId: serviceSg.id,
        fromPort: serviceContainerPort,
        ipProtocol: 'tcp',
        toPort: serviceContainerPort,
        tags: this.tags,
      },
      { parent: this }
    );

    return { serviceAlbSg, serviceSg };
  }

  setupAutoScaling() {
    if (!this.api_service || !this.worker_service) return;

    // Setup autoscaling for API service
    this.setupServiceAutoScaling({
      serviceName: 'api',
      service: this.api_service,
      maxCapacity: stack === 'prod' ? 10 : 2,
      minCapacity: stack === 'prod' ? 3 : 1,
      includeAlbMetrics: true,
    });

    // Setup autoscaling for Worker service
    this.setupServiceAutoScaling({
      serviceName: 'worker',
      service: this.worker_service,
      maxCapacity: stack === 'prod' ? 10 : 2,
      minCapacity: stack === 'prod' ? 5 : 1,
      includeAlbMetrics: false,
    });
  }

  private setupServiceAutoScaling({
    serviceName,
    service,
    maxCapacity,
    minCapacity,
    includeAlbMetrics,
  }: {
    serviceName: string;
    service: awsx.ecs.FargateService;
    maxCapacity: number;
    minCapacity: number;
    includeAlbMetrics: boolean;
  }) {
    const serviceScalableTarget = new aws.appautoscaling.Target(
      `${BASE_NAME}-${serviceName}-scalable-target-${stack}`,
      {
        maxCapacity,
        minCapacity,
        resourceId: pulumi.interpolate`service/${this.clusterName}/${service.service.name}`,
        scalableDimension: 'ecs:service:DesiredCount',
        serviceNamespace: 'ecs',
        tags: this.tags,
      },
      { parent: this }
    );

    // ALB request count policy (only for API service)
    if (includeAlbMetrics) {
      const lbPortion: pulumi.Output<string> = this.lb.arn.apply((arn) => {
        const parts = arn.split(':loadbalancer/');
        return parts[1];
      });

      const tgPortion: pulumi.Output<string> = this.targetGroup.arn.apply(
        (arn) => {
          const parts = arn.split(':');
          return parts[parts.length - 1];
        }
      );

      const resourceLabel = pulumi.interpolate`${lbPortion}/${tgPortion}`;

      new aws.appautoscaling.Policy(
        `${BASE_NAME}-${serviceName}-scaling-policy-request-count-${stack}`,
        {
          policyType: 'TargetTrackingScaling',
          resourceId: serviceScalableTarget.resourceId,
          scalableDimension: serviceScalableTarget.scalableDimension,
          serviceNamespace: serviceScalableTarget.serviceNamespace,
          targetTrackingScalingPolicyConfiguration: {
            targetValue: 1000, // TODO: play with this
            predefinedMetricSpecification: {
              predefinedMetricType: 'ALBRequestCountPerTarget',
              resourceLabel,
            },
            scaleInCooldown: 60,
            scaleOutCooldown: 120,
          },
        },
        { parent: this }
      );
    }

    // CPU utilization policy (for both services)
    new aws.appautoscaling.Policy(
      `${BASE_NAME}-${serviceName}-scaling-policy-cpu-${stack}`,
      {
        policyType: 'TargetTrackingScaling',
        resourceId: serviceScalableTarget.resourceId,
        scalableDimension: serviceScalableTarget.scalableDimension,
        serviceNamespace: serviceScalableTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          targetValue: 70.0,
          predefinedMetricSpecification: {
            predefinedMetricType: 'ECSServiceAverageCPUUtilization',
          },
          scaleInCooldown: 100,
          scaleOutCooldown: 300,
        },
      },
      { parent: this }
    );

    // Memory utilization policy (for both services)
    new aws.appautoscaling.Policy(
      `${BASE_NAME}-${serviceName}-scaling-policy-memory-${stack}`,
      {
        policyType: 'TargetTrackingScaling',
        resourceId: serviceScalableTarget.resourceId,
        scalableDimension: serviceScalableTarget.scalableDimension,
        serviceNamespace: serviceScalableTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          targetValue: 70.0,
          predefinedMetricSpecification: {
            predefinedMetricType: 'ECSServiceAverageMemoryUtilization',
          },
          scaleInCooldown: 100,
          scaleOutCooldown: 300,
        },
      },
      { parent: this }
    );
  }

  setupServiceAlarms() {
    if (!this.api_service || !this.worker_service) return;

    // Setup alarms for API service
    this.setupServiceAlarm({
      serviceName: BASE_NAME,
      service: this.api_service,
      includeAlbAlarms: true,
    });

    // Setup alarms for Worker service
    this.setupServiceAlarm({
      serviceName: PUBSUB_WORKER_NAME,
      service: this.worker_service,
      includeAlbAlarms: false,
    });
  }

  private setupServiceAlarm({
    serviceName,
    service,
    includeAlbAlarms,
  }: {
    serviceName: string;
    service: awsx.ecs.FargateService;
    includeAlbAlarms: boolean;
  }) {
    new aws.cloudwatch.MetricAlarm(
      `${serviceName}-high-cpu-alarm`,
      {
        name: `${serviceName}-high-cpu-alarm-${stack}`,
        metricName: 'CPUUtilization',
        namespace: 'AWS/ECS',
        statistic: 'Average',
        period: 180,
        evaluationPeriods: 1,
        threshold: 80,
        comparisonOperator: 'GreaterThanThreshold',
        dimensions: {
          ClusterName: this.clusterName,
          ServiceName: service.service.name,
        },
        alarmDescription: `High CPU usage alarm for ${serviceName} service.`,
        actionsEnabled: true,
        alarmActions: [CLOUD_TRAIL_SNS_TOPIC_ARN],
        tags: this.tags,
      },
      { parent: this }
    );

    new aws.cloudwatch.MetricAlarm(
      `${serviceName}-high-mem-alarm`,
      {
        name: `${serviceName}-high-mem-alarm-${stack}`,
        metricName: 'MemoryUtilization',
        namespace: 'AWS/ECS',
        statistic: 'Average',
        period: 180,
        evaluationPeriods: 1,
        threshold: 80,
        comparisonOperator: 'GreaterThanThreshold',
        dimensions: {
          ClusterName: this.clusterName,
          ServiceName: service.service.name,
        },
        alarmDescription: `High Memory usage alarm for ${serviceName} service.`,
        actionsEnabled: true,
        alarmActions: [CLOUD_TRAIL_SNS_TOPIC_ARN],
        tags: this.tags,
      },
      { parent: this }
    );

    // ALB 5XX alarm (only for API service)
    if (includeAlbAlarms) {
      new aws.cloudwatch.MetricAlarm(
        `${serviceName}-http-5xx-alarm`,
        {
          name: `${serviceName}-http-5xx-${stack}`,
          metricName: 'HTTPCode_ELB_5XX_Count',
          namespace: 'AWS/ApplicationELB',
          statistic: 'Sum',
          period: 180,
          evaluationPeriods: 1,
          threshold: 25,
          comparisonOperator: 'GreaterThanOrEqualToThreshold',
          dimensions: {
            LoadBalancer: this.lb.arn,
          },
          alarmDescription: `High HTTP 5XX count alarm for ${serviceName} Load Balancer.`,
          actionsEnabled: true,
          alarmActions: [CLOUD_TRAIL_SNS_TOPIC_ARN],
          tags: this.tags,
        },
        { parent: this }
      );
    }
  }
}
