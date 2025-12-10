import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';

export function createEcrRepository(
  repositoryId: string,
  {
    repositoryName,
    tags,
    alias,
  }: {
    repositoryName: string;
    tags: { [key: string]: string };
    alias?: pulumi.Alias;
  },
  parent: pulumi.ComponentResource
): awsx.ecr.Repository {
  const ecr = new awsx.ecr.Repository(
    repositoryId,
    {
      name: repositoryName,
      imageTagMutability: 'MUTABLE',
      forceDelete: true,
      tags: tags,
      lifecyclePolicy: {
        // We do not want the default lifecycle policy for the repositories
        skip: true,
      },
    },
    { parent, aliases: alias ? [alias] : undefined }
  );

  new aws.ecr.LifecyclePolicy(
    `${repositoryId}-lifecycle-policy`,
    {
      repository: ecr.repository.id,
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
    { parent }
  );

  return ecr;
}

export class EcrImage extends pulumi.ComponentResource {
  public ecr: awsx.ecr.Repository;
  public image: awsx.ecr.Image;
  public tags: { [key: string]: string };

  constructor(
    name: string,
    {
      repository,
      repositoryId,
      repositoryName,
      imageId,
      imagePath,
      platform,
      dockerfile,
      buildArgs,
      tags,
    }: {
      repository?: awsx.ecr.Repository;
      repositoryId?: string;
      repositoryName?: string;
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

    if (repository) {
      this.ecr = repository;
    } else {
      if (!repositoryId || !repositoryName) {
        throw new Error(
          'repositoryId and repositoryName are required when repository is not provided'
        );
      }
      this.ecr = createEcrRepository(
        repositoryId,
        {
          repositoryName,
          tags: this.tags,
        },
        this
      );
    }

    this.image = new awsx.ecr.Image(
      imageId,
      {
        imageTag: 'latest',
        context: imagePath,
        platform: `${platform.family}/${platform.architecture}`,
        dockerfile: dockerfile ? `${imagePath}/${dockerfile}` : undefined,
        repositoryUrl: this.ecr.url,
        args: buildArgs,
      },
      { parent: this }
    );
  }
}
