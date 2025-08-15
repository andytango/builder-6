/**
 * GitHub service for repository, pull request, and issue management
 */

import { Octokit } from '@octokit/rest';
import type { DockerService } from '../docker/index.js';
import { ApplicationConfig } from '../config/index.js';

// Define types directly since we no longer have github-service
export interface Repository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
}

export interface PullRequest {
  id: number;
  number: number;
  state: 'open' | 'closed';
  title: string;
  html_url: string;
}

export interface Issue {
  id: number;
  number: number;
  state: 'open' | 'closed';
  title: string;
  body: string | null;
  labels: Array<{ name: string; color: string }>;
  html_url: string;
}

/**
 * GitHub service interface
 */
export interface GitHubService {
  createRepository(name: string, description?: string, isPrivate?: boolean): Promise<Repository>;
  listRepositories(): Promise<Repository[]>;
  retrieveRepository(owner: string, repo: string): Promise<Repository | null>;
  createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string,
  ): Promise<PullRequest>;
  readPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest | null>;
  updatePullRequest(owner: string, repo: string, prNumber: number, updates: Partial<PullRequest>): Promise<PullRequest>;
  closePullRequest(owner: string, repo: string, prNumber: number): Promise<void>;
  createIssue(owner: string, repo: string, title: string, body?: string, labels?: string[]): Promise<Issue>;
  readIssue(owner: string, repo: string, issueNumber: number): Promise<Issue | null>;
  updateIssue(owner: string, repo: string, issueNumber: number, updates: Partial<Issue>): Promise<Issue>;
  closeIssue(owner: string, repo: string, issueNumber: number): Promise<void>;
  configureGitClientInContainer(containerId: string, username: string, token: string): Promise<void>;
}

interface GitHubLabel {
  name: string;
  color: string;
}

/**
 * Creates a GitHub service using Octokit
 * @param config - Application configuration
 * @param dockerService - Docker service for container operations
 * @returns A GitHubService instance
 */
export function createGitHubService(config: ApplicationConfig, dockerService: DockerService): GitHubService {
  if (!config.githubToken) {
    throw new Error('GITHUB_TOKEN is required');
  }

  const octokit = new Octokit({
    auth: config.githubToken,
  });

  return {
    /**
     *
     */
    async createRepository(name: string, description?: string, isPrivate?: boolean): Promise<Repository> {
      const response = await octokit.rest.repos.createForAuthenticatedUser({
        name,
        description,
        private: isPrivate,
      });
      const { id, name: repoName, full_name, html_url, clone_url } = response.data;
      return { id, name: repoName, full_name, html_url, clone_url };
    },

    /**
     *
     */
    async listRepositories(): Promise<Repository[]> {
      const response = await octokit.rest.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100,
      });
      return response.data.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        clone_url: repo.clone_url || '',
      }));
    },

    /**
     *
     */
    async retrieveRepository(owner: string, repo: string): Promise<Repository | null> {
      try {
        const response = await octokit.rest.repos.get({
          owner,
          repo,
        });
        const { id, name, full_name, html_url, clone_url } = response.data;
        return { id, name, full_name, html_url, clone_url: clone_url || '' };
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'status' in error) {
          const statusError = error as { status: number };
          if (statusError.status === 404) {
            return null;
          }
        }
        throw error;
      }
    },

    /**
     *
     */
    async createPullRequest(
      owner: string,
      repo: string,
      title: string,
      head: string,
      base: string,
      body?: string,
    ): Promise<PullRequest> {
      const response = await octokit.rest.pulls.create({
        owner,
        repo,
        title,
        head,
        base,
        body,
      });
      const { id, number, state, title: prTitle, html_url } = response.data;
      return { id, number, state: state as 'open' | 'closed', title: prTitle, html_url };
    },

    /**
     *
     */
    async readPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest | null> {
      try {
        const response = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
        });
        const { id, number, state, title, html_url } = response.data;
        return { id, number, state: state as 'open' | 'closed', title, html_url };
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'status' in error) {
          const statusError = error as { status: number };
          if (statusError.status === 404) {
            return null;
          }
        }
        throw error;
      }
    },

    /**
     *
     */
    async updatePullRequest(
      owner: string,
      repo: string,
      prNumber: number,
      updates: Partial<PullRequest>,
    ): Promise<PullRequest> {
      const response = await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        title: updates.title,
        state: updates.state,
      });
      const { id, number, state, title, html_url } = response.data;
      return { id, number, state: state as 'open' | 'closed', title, html_url };
    },

    /**
     *
     */
    async closePullRequest(owner: string, repo: string, prNumber: number): Promise<void> {
      await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        state: 'closed',
      });
    },

    /**
     *
     */
    async createIssue(owner: string, repo: string, title: string, body?: string, labels?: string[]): Promise<Issue> {
      const response = await octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
      });
      const { id, number, state, title: issueTitle, body: issueBody, labels: issueLabels, html_url } = response.data;
      return {
        id,
        number,
        state: state as 'open' | 'closed',
        title: issueTitle,
        body: issueBody || null,
        labels: (issueLabels as GitHubLabel[]).map((l) => ({ name: l.name, color: l.color })),
        html_url,
      };
    },

    /**
     *
     */
    async readIssue(owner: string, repo: string, issueNumber: number): Promise<Issue | null> {
      try {
        const response = await octokit.rest.issues.get({
          owner,
          repo,
          issue_number: issueNumber,
        });
        const { id, number, state, title, body, labels, html_url } = response.data;
        return {
          id,
          number,
          state: state as 'open' | 'closed',
          title,
          body: body || null,
          labels: (labels as GitHubLabel[]).map((l) => ({ name: l.name, color: l.color })),
          html_url,
        };
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'status' in error) {
          const statusError = error as { status: number };
          if (statusError.status === 404) {
            return null;
          }
        }
        throw error;
      }
    },

    /**
     *
     */
    async updateIssue(owner: string, repo: string, issueNumber: number, updates: Partial<Issue>): Promise<Issue> {
      const response = await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        title: updates.title,
        body: updates.body,
        state: updates.state,
        labels: updates.labels?.map((l: { name: string }) => l.name),
      });
      const { id, number, state, title, body, labels, html_url } = response.data;
      return {
        id,
        number,
        state: state as 'open' | 'closed',
        title,
        body: body || null,
        labels: (labels as GitHubLabel[]).map((l) => ({ name: l.name, color: l.color })),
        html_url,
      };
    },

    /**
     *
     */
    async closeIssue(owner: string, repo: string, issueNumber: number): Promise<void> {
      await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: 'closed',
      });
    },

    /**
     *
     */
    async configureGitClientInContainer(containerId: string, username: string, token?: string): Promise<void> {
      // Use provided token or fall back to config token
      const authToken = token || config.githubToken;
      const script = `
        git config --global user.name "${username}"
        git config --global user.email "${username}@users.noreply.github.com"
        echo "https://${username}:${authToken}@github.com" > ~/.git-credentials
        git config --global credential.helper store
      `;

      const result = await dockerService.executeScript({ containerId, script });
      if (!result.ok) {
        throw new Error(`Failed to configure git in container: ${result.error.message}`);
      }
    },
  };
}

/**
 * Configuration for test GitHub service
 */
export interface TestGitHubConfig {
  repositories?: Repository[];
  pullRequests?: PullRequest[];
  issues?: Issue[];
  throwOnNotFound?: boolean;
  simulateRateLimit?: boolean;
  latencyMs?: number;
}

/**
 * Test helpers for GitHub service
 */
export interface TestGitHubHelpers {
  addRepository(repo: Repository): void;
  addPullRequest(pr: PullRequest): void;
  addIssue(issue: Issue): void;
  getCallStats(): { [method: string]: number };
  reset(): void;
}

/**
 * Creates a test GitHub service for use in tests
 * @param config - Configuration for the test service
 * @returns A GitHubService with test helpers
 */
export function createTestGitHubService(config: TestGitHubConfig = {}): GitHubService & TestGitHubHelpers {
  const {
    repositories = [],
    pullRequests = [],
    issues = [],
    throwOnNotFound = false,
    simulateRateLimit = false,
    latencyMs = 0,
  } = config;

  const repoStore = new Map(repositories.map((r) => [r.id, r]));
  const prStore = new Map(pullRequests.map((pr) => [pr.number, pr]));
  const issueStore = new Map(issues.map((i) => [i.number, i]));
  const callStats: { [method: string]: number } = {};
  let idCounter = 1000;

  /**
   *
   */
  async function simulateLatency(): Promise<void> {
    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }
  }

  /**
   *
   */
  function trackCall(method: string): void {
    callStats[method] = (callStats[method] || 0) + 1;
    if (simulateRateLimit && callStats[method] > 10) {
      throw new Error('GitHub API rate limit exceeded');
    }
  }

  return {
    /**
     *
     */
    async createRepository(name: string, _description_?: string, _isPrivate_?: boolean): Promise<Repository> {
      await simulateLatency();
      trackCall('createRepository');

      const repo: Repository = {
        id: idCounter++,
        name,
        full_name: `test-user/${name}`,
        html_url: `https://github.com/test-user/${name}`,
        clone_url: `https://github.com/test-user/${name}.git`,
      };
      repoStore.set(repo.id, repo);
      return repo;
    },

    /**
     *
     */
    async listRepositories(): Promise<Repository[]> {
      await simulateLatency();
      trackCall('listRepositories');
      return Array.from(repoStore.values());
    },

    /**
     *
     */
    async retrieveRepository(owner: string, repo: string): Promise<Repository | null> {
      await simulateLatency();
      trackCall('retrieveRepository');

      const found = Array.from(repoStore.values()).find((r) => r.name === repo && r.full_name.startsWith(owner));

      if (!found && throwOnNotFound) {
        throw new Error(`Repository ${owner}/${repo} not found`);
      }

      return found || null;
    },

    /**
     *
     */
    async createPullRequest(
      owner: string,
      repo: string,
      title: string,
      _head_: string,
      _base_: string,
      _body_?: string,
    ): Promise<PullRequest> {
      await simulateLatency();
      trackCall('createPullRequest');

      const pr: PullRequest = {
        id: idCounter++,
        number: prStore.size + 1,
        state: 'open',
        title,
        html_url: `https://github.com/${owner}/${repo}/pull/${prStore.size + 1}`,
      };
      prStore.set(pr.number, pr);
      return pr;
    },

    /**
     *
     */
    async readPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest | null> {
      await simulateLatency();
      trackCall('readPullRequest');

      const pr = prStore.get(prNumber);

      if (!pr && throwOnNotFound) {
        throw new Error(`Pull request #${prNumber} not found`);
      }

      return pr || null;
    },

    /**
     *
     */
    async updatePullRequest(
      owner: string,
      repo: string,
      prNumber: number,
      updates: Partial<PullRequest>,
    ): Promise<PullRequest> {
      await simulateLatency();
      trackCall('updatePullRequest');

      const pr = prStore.get(prNumber);
      if (!pr) {
        throw new Error(`Pull request #${prNumber} not found`);
      }

      const updated = { ...pr, ...updates };
      prStore.set(prNumber, updated);
      return updated;
    },

    /**
     *
     */
    async closePullRequest(owner: string, repo: string, prNumber: number): Promise<void> {
      await simulateLatency();
      trackCall('closePullRequest');

      const pr = prStore.get(prNumber);
      if (pr) {
        pr.state = 'closed';
      }
    },

    /**
     *
     */
    async createIssue(owner: string, repo: string, title: string, body?: string, labels?: string[]): Promise<Issue> {
      await simulateLatency();
      trackCall('createIssue');

      const issue: Issue = {
        id: idCounter++,
        number: issueStore.size + 1,
        state: 'open',
        title,
        body: body || null,
        labels: labels?.map((name) => ({ name, color: 'ffffff' })) || [],
        html_url: `https://github.com/${owner}/${repo}/issues/${issueStore.size + 1}`,
      };
      issueStore.set(issue.number, issue);
      return issue;
    },

    /**
     *
     */
    async readIssue(owner: string, repo: string, issueNumber: number): Promise<Issue | null> {
      await simulateLatency();
      trackCall('readIssue');

      const issue = issueStore.get(issueNumber);

      if (!issue && throwOnNotFound) {
        throw new Error(`Issue #${issueNumber} not found`);
      }

      return issue || null;
    },

    /**
     *
     */
    async updateIssue(owner: string, repo: string, issueNumber: number, updates: Partial<Issue>): Promise<Issue> {
      await simulateLatency();
      trackCall('updateIssue');

      const issue = issueStore.get(issueNumber);
      if (!issue) {
        throw new Error(`Issue #${issueNumber} not found`);
      }

      const updated = { ...issue, ...updates };
      issueStore.set(issueNumber, updated);
      return updated;
    },

    /**
     *
     */
    async closeIssue(owner: string, repo: string, issueNumber: number): Promise<void> {
      await simulateLatency();
      trackCall('closeIssue');

      const issue = issueStore.get(issueNumber);
      if (issue) {
        issue.state = 'closed';
      }
    },

    /**
     *
     */
    async configureGitClientInContainer(_containerId_: string, _username_: string, _token_: string): Promise<void> {
      await simulateLatency();
      trackCall('configureGitClientInContainer');
      // No-op for test
    },

    // Test helpers
    /**
     *
     */
    addRepository(repo: Repository): void {
      repoStore.set(repo.id, repo);
    },

    /**
     *
     */
    addPullRequest(pr: PullRequest): void {
      prStore.set(pr.number, pr);
    },

    /**
     *
     */
    addIssue(issue: Issue): void {
      issueStore.set(issue.number, issue);
    },

    /**
     *
     */
    getCallStats(): { [method: string]: number } {
      return { ...callStats };
    },

    /**
     *
     */
    reset(): void {
      repoStore.clear();
      prStore.clear();
      issueStore.clear();
      repositories.forEach((r) => repoStore.set(r.id, r));
      pullRequests.forEach((pr) => prStore.set(pr.number, pr));
      issues.forEach((i) => issueStore.set(i.number, i));
      Object.keys(callStats).forEach((key) => delete callStats[key]);
      idCounter = 1000;
    },
  };
}
