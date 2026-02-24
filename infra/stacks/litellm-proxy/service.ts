import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import {
  DATADOG_API_KEY,
  datadogAgentContainer,
  fargateLogRouterSidecarContainer,
  serviceLoadBalancer,
} from '../../packages/resources';
import { EcrImage } from '../../packages/service';
import {
  BASE_DOMAIN,
  CLOUD_TRAIL_SNS_TOPIC_ARN,
  stack,
} from '../../packages/shared';

const BASE_NAME = 'litellm-proxy';

export const SERVICE_DOMAIN_NAME = `litellm-proxy${
  stack === 'prod' ? '' : `-${stack}`
}.${BASE_DOMAIN}`;

type Args = {
  cloudStorageClusterName: pulumi.Output<string> | string;
  ecsClusterArn: pulumi.Output<string> | string;
  vpc: {
    vpcId: pulumi.Output<string> | string;
    publicSubnetIds: pulumi.Output<string[]> | string[];
    privateSubnetIds: pulumi.Output<string[]> | string[];
  };
  serviceContainerPort: number;
  healthCheckPath: string;
  containerEnvVars: { name: string; value: pulumi.Output<string> | string }[];
  tags: { [key: string]: string };
  secretKeyArns: (pulumi.Output<string> | string)[];
  consumerServiceSgIds: (pulumi.Output<string> | string)[];
};

export class LiteLlmService extends pulumi.ComponentResource {
  public role: aws.iam.Role;
  public ecr: awsx.ecr.Repository;
  public serviceAlbSg: aws.ec2.SecurityGroup;
  public serviceSg: aws.ec2.SecurityGroup;
  public targetGroup: aws.lb.TargetGroup;
  public lb: aws.lb.LoadBalancer;
  public listener: aws.lb.Listener;
  public service: awsx.ecs.FargateService;
  public domain: string;
  public cloudStorageClusterName: pulumi.Output<string> | string;
  public tags: { [key: string]: string };

  constructor(
    name: string,
    {
      ecsClusterArn,
      vpc,
      serviceContainerPort,
      healthCheckPath,
      containerEnvVars,
      cloudStorageClusterName,
      tags,
      secretKeyArns,
      consumerServiceSgIds,
    }: Args,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('my:components:LiteLlmService', name, {}, opts);
    this.tags = tags;
    this.cloudStorageClusterName = cloudStorageClusterName;

    // IAM role - only needs secrets manager access
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
        managedPolicyArns: [secretsPolicy.arn],
        tags: this.tags,
      },
      { parent: this }
    );

    // Docker image - thin wrapper over litellm base image with config baked in
    const image = new EcrImage(
      `${BASE_NAME}-ecr-image-${stack}`,
      {
        repositoryId: `${BASE_NAME}-ecr-${stack}`,
        repositoryName: `${BASE_NAME}-${stack}`,
        imageId: `${BASE_NAME}-image-${stack}`,
        imagePath: __dirname,
        dockerfile: 'Dockerfile',
        platform: { family: 'linux', architecture: 'amd64' },
        tags: this.tags,
      },
      { parent: this }
    );
    this.ecr = image.ecr;

    // Security groups - restricted to consuming services only
    const sg = this.initializeSecurityGroups({
      vpcId: vpc.vpcId,
      serviceContainerPort,
      consumerServiceSgIds,
    });
    this.serviceAlbSg = sg.serviceAlbSg;
    this.serviceSg = sg.serviceSg;

    // Private internal load balancer
    const { targetGroup, lb, listener } = serviceLoadBalancer(this, {
      serviceName: BASE_NAME,
      serviceContainerPort,
      healthCheckPath,
      vpc,
      albSecurityGroupId: this.serviceAlbSg.id,
      isPrivate: true,
      tags,
    });
    this.targetGroup = targetGroup;
    this.lb = lb;
    this.listener = listener;

    // ECS Fargate service
    const service = new awsx.ecs.FargateService(
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
              image: image.image.imageUri,
              cpu: 512,
              memory: 1024,
              environment: containerEnvVars,
              logConfiguration: {
                logDriver: 'awsfirelens',
                options: {
                  Name: 'datadog',
                  Host: 'http-intake.logs.us5.datadoghq.com',
                  apikey: DATADOG_API_KEY,
                  dd_service: BASE_NAME,
                  dd_source: 'fargate',
                  dd_tags: 'project:litellm-proxy',
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
            operatingSystemFamily: 'LINUX',
            cpuArchitecture: 'X86_64',
          },
        },
        desiredCount: 1,
      },
      { parent: this }
    );

    this.service = service;
    this.setupAutoScaling();
    this.setupServiceAlarms();

    // DNS record
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

  initializeSecurityGroups({
    vpcId,
    serviceContainerPort,
    consumerServiceSgIds,
  }: {
    vpcId: pulumi.Output<string> | string;
    serviceContainerPort: number;
    consumerServiceSgIds: (pulumi.Output<string> | string)[];
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
        description: `${BASE_NAME} security group attached to the service`,
        tags: this.tags,
      },
      { parent: this }
    );

    // Service SG: allow inbound from ALB only
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

    // Service SG: allow all outbound (needed to reach OpenAI/Anthropic APIs)
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

    // ALB SG: allow inbound ONLY from consuming service security groups
    consumerServiceSgIds.forEach((sgId, i) => {
      new aws.vpc.SecurityGroupIngressRule(
        `${BASE_NAME}-consumer-${i}`,
        {
          securityGroupId: serviceAlbSg.id,
          description: `Allow inbound from consuming service ${i}`,
          referencedSecurityGroupId: sgId,
          fromPort: 443,
          toPort: 443,
          ipProtocol: 'tcp',
          tags: this.tags,
        },
        { parent: this }
      );
    });

    // ALB SG: allow egress to service
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
    if (!this.service) return;

    const serviceScalableTarget = new aws.appautoscaling.Target(
      `${BASE_NAME}-service-scalable-target-${stack}`,
      {
        maxCapacity: stack === 'prod' ? 5 : 2,
        minCapacity: 1,
        resourceId: pulumi.interpolate`service/${this.cloudStorageClusterName}/${this.service.service.name}`,
        scalableDimension: 'ecs:service:DesiredCount',
        serviceNamespace: 'ecs',
        tags: this.tags,
      },
      { parent: this }
    );

    new aws.appautoscaling.Policy(
      `${BASE_NAME}-scaling-policy-cpu-${stack}`,
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

    new aws.appautoscaling.Policy(
      `${BASE_NAME}-scaling-policy-memory-${stack}`,
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
    new aws.cloudwatch.MetricAlarm(
      `${BASE_NAME}-high-cpu-alarm`,
      {
        name: `${BASE_NAME}-high-cpu-alarm-${stack}`,
        metricName: 'CPUUtilization',
        namespace: 'AWS/ECS',
        statistic: 'Average',
        period: 180,
        evaluationPeriods: 1,
        threshold: 80,
        comparisonOperator: 'GreaterThanThreshold',
        dimensions: {
          ClusterName: this.cloudStorageClusterName,
          ServiceName: this.service.service.name,
        },
        alarmDescription: `High CPU usage alarm for ${BASE_NAME} service.`,
        actionsEnabled: true,
        alarmActions: [CLOUD_TRAIL_SNS_TOPIC_ARN],
        tags: this.tags,
      },
      { parent: this }
    );

    new aws.cloudwatch.MetricAlarm(
      `${BASE_NAME}-high-mem-alarm`,
      {
        name: `${BASE_NAME}-high-mem-alarm-${stack}`,
        metricName: 'MemoryUtilization',
        namespace: 'AWS/ECS',
        statistic: 'Average',
        period: 180,
        evaluationPeriods: 1,
        threshold: 80,
        comparisonOperator: 'GreaterThanThreshold',
        dimensions: {
          ClusterName: this.cloudStorageClusterName,
          ServiceName: this.service.service.name,
        },
        alarmDescription: `High Memory usage alarm for ${BASE_NAME} service.`,
        actionsEnabled: true,
        alarmActions: [CLOUD_TRAIL_SNS_TOPIC_ARN],
        tags: this.tags,
      },
      { parent: this }
    );
  }
}
