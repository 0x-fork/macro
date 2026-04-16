import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as docker_build from '@pulumi/docker-build';
import * as pulumi from '@pulumi/pulumi';

export class EcrImage extends pulumi.ComponentResource {
  public ecr: awsx.ecr.Repository;
  public image: { imageUri: pulumi.Output<string> };
  public tags: { [key: string]: string };

  constructor(
    name: string,
    {
      repositoryId,
      repositoryName,
      imageId,
      imagePath,
      platform,
      dockerfile,
      buildArgs,
      tags,
    }: {
      repositoryId: string;
      repositoryName: string;
      imageId: string;
      imagePath: string;
      platform: { family: string; architecture: string };
      dockerfile?: string;
      buildArgs?: { [key: string]: string };
      tags: { [key: string]: string };
    },

    opts?: pulumi.ComponentResourceOptions
  ) {
    super('my:components:EcrImage', name, {}, opts);
    this.tags = tags;
    this.ecr = new awsx.ecr.Repository(
      repositoryId,
      {
        name: repositoryName,
        imageTagMutability: 'MUTABLE',
        forceDelete: true,
        tags: this.tags,
        lifecyclePolicy: {
          // We do not want the default lifecycle policy for the repositories
          skip: true,
        },
      },
      { parent: this }
    );

    new aws.ecr.LifecyclePolicy(
      `${repositoryId}-lifecycle-policy`,
      {
        repository: this.ecr.repository.id,
        policy: {
          rules: [
            {
              rulePriority: 1,
              description: 'remove untagged images older than 1 day',
              selection: {
                tagStatus: 'untagged',
                countType: 'sinceImagePushed',
                countUnit: 'days',
                countNumber: 1,
              },
              action: {
                type: 'expire',
              },
            },
          ],
        },
      },
      { parent: this }
    );

    const authToken = aws.ecr.getAuthorizationTokenOutput({
      registryId: this.ecr.repository.registryId,
    });

    const cacheRef = pulumi.interpolate`${this.ecr.url}:cache`;

    const dockerImage = new docker_build.Image(
      imageId,
      {
        tags: [pulumi.interpolate`${this.ecr.url}:latest`],
        context: { location: imagePath },
        dockerfile: dockerfile
          ? { location: `${imagePath}/${dockerfile}` }
          : undefined,
        platforms: [
          `${platform.family}/${platform.architecture}` as docker_build.Platform,
        ],
        push: true,
        buildArgs,
        registries: [
          {
            address: this.ecr.url,
            password: authToken.apply((t) => t.password),
            username: authToken.apply((t) => t.userName),
          },
        ],
        cacheFrom: [{ registry: { ref: cacheRef } }],
        cacheTo: [
          {
            registry: {
              ref: cacheRef,
              imageManifest: true,
              ociMediaTypes: true,
              mode: docker_build.CacheMode.Max,
            },
          },
        ],
      },
      { parent: this }
    );

    this.image = { imageUri: dockerImage.ref };
  }
}
