/** Client types for the coding-agent endpoints (`/coding/*`). */

export interface CodingRepository {
  full_name: string;
  owner: string;
  name: string;
  default_branch: string | null;
}

export interface CodingRepositoriesResponse {
  repositories: CodingRepository[];
}

export interface CodingSandboxStatus {
  repository: string | null;
  /** `none` | `provisioning` | `ready` | `sleeping` | `stopped` | `error` */
  status: string;
  work_branch: string | null;
}
