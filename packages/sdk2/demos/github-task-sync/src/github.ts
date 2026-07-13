import { Octokit } from '@octokit/rest';

export interface Issue {
  number: number;
  title: string;
  body: string | undefined;
  htmlUrl: string;
}

/** Issue reads and title writes for a single repository. */
export class GithubIssues {
  private readonly octokit: Octokit;

  constructor(
    token: string,
    private readonly owner: string,
    private readonly repo: string,
  ) {
    this.octokit = new Octokit({ auth: token });
  }

  /** All issues in the repo (open and closed), excluding pull requests. */
  async list(): Promise<Issue[]> {
    const issues = await this.octokit.paginate(
      this.octokit.issues.listForRepo,
      { owner: this.owner, repo: this.repo, state: 'all', per_page: 100 },
    );
    return issues
      .filter((issue) => issue.pull_request === undefined)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body ?? undefined,
        htmlUrl: issue.html_url,
      }));
  }

  async setTitle(issueNumber: number, title: string): Promise<void> {
    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      title,
    });
  }
}
