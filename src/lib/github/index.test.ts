import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simpleGit, SimpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import { createGitHubService } from './index.js';
import { createTestDockerService } from '../docker/index.js';
import { createTestConfig } from '../config/index.js';
import type { GitHubService } from './index.js';

// IMPORTANT: These tests require a live GitHub environment and a GITHUB_TOKEN
// with appropriate permissions (repo, workflow).
// It is highly recommended to use a dedicated test GitHub account and repository
// to avoid polluting your main account.

// You will need to set the following environment variables in .env.test:
// GITHUB_TOKEN=your_github_personal_access_token
// GITHUB_TEST_OWNER=your_github_username_or_org
// GITHUB_TEST_REPO=your_test_repository_name (This repo will be created/used by tests)

describe('GitHub Service E2E Tests', () => {
  let testOwner: string;
  let testRepo: string;
  let githubToken: string;
  let githubService: GitHubService;
  let dockerService: ReturnType<typeof createTestDockerService>;
  let git: SimpleGit;
  const localRepoPath = `./temp-test-repo-${Date.now()}`; // Local path for cloning

  beforeAll(async () => {
    // Environment variables are loaded in vitest.config.ts

    testOwner = process.env.GITHUB_TEST_OWNER || '';
    testRepo = process.env.GITHUB_TEST_REPO || '';
    githubToken = process.env.GITHUB_TOKEN || '';

    if (!testOwner || !testRepo || !githubToken) {
      console.warn(
        'Skipping GitHub E2E tests: GITHUB_TOKEN, GITHUB_TEST_OWNER, or GITHUB_TEST_REPO environment variables are not set.',
      );
      // Mark all tests in this suite as skipped if environment variables are not set
      describe.skip('GitHub Service E2E Tests (skipped due to missing env vars)', () => {});
      return;
    }

    // Create test Docker service
    dockerService = createTestDockerService();

    // Create test config with GitHub credentials
    const config = createTestConfig({
      githubToken,
      githubTestOwner: testOwner,
      githubTestRepo: testRepo,
    });

    // Create GitHub service with config and test Docker service
    githubService = createGitHubService(config, dockerService);

    // Initialize simple-git
    git = simpleGit();
  });

  afterAll(async () => {
    // Clean up: Delete the local repo if it exists
    try {
      await fs.rm(localRepoPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if the directory doesn't exist
    }
  });

  it('should create, retrieve, and list repositories', async () => {
    // Note: This test creates a real repository on GitHub.
    // It's skipped by default to avoid polluting your GitHub account.
    // To run it, ensure you have set up a test account and uncomment the test.

    // Create a unique repo name to avoid conflicts
    const uniqueRepoName = `${testRepo}-${Date.now()}`;

    // Create a repository
    const createdRepo = await githubService.createRepository(uniqueRepoName, 'Test repository for E2E tests', false);
    expect(createdRepo).toBeDefined();
    expect(createdRepo.name).toBe(uniqueRepoName);

    // Retrieve the repository
    const retrievedRepo = await githubService.retrieveRepository(testOwner, uniqueRepoName);
    expect(retrievedRepo).toBeDefined();
    expect(retrievedRepo?.name).toBe(uniqueRepoName);

    // List repositories
    const repos = await githubService.listRepositories();
    expect(repos).toBeDefined();
    expect(repos.length).toBeGreaterThan(0);
    const foundRepo = repos.find((r) => r.name === uniqueRepoName);
    expect(foundRepo).toBeDefined();

    // Clean up: Delete the repository
    // Note: GitHub API doesn't provide a direct delete method in Octokit's default scope
    // You would need to use the DELETE /repos/{owner}/{repo} endpoint manually
    // For now, we'll leave it for manual cleanup
  });

  it('should create, read, update, and close a pull request', async () => {
    console.log('DEBUG: PR Test - Owner:', testOwner, 'Repo:', testRepo);

    // First, ensure the test repository exists
    let repo = await githubService.retrieveRepository(testOwner, testRepo);
    if (!repo) {
      repo = await githubService.createRepository(testRepo, 'Test repository for E2E tests', false);
    }

    // Clone the repository locally
    await fs.rm(localRepoPath, { recursive: true, force: true }).catch(() => {});
    await git.clone(repo.clone_url.replace('https://github.com', `https://${githubToken}@github.com`), localRepoPath);

    // Create a new branch
    const branchName = `test-branch-${Date.now()}`;
    await git.cwd(localRepoPath);
    await git.checkoutLocalBranch(branchName);

    // Make a change
    const testFile = path.join(localRepoPath, 'test-pr.txt');
    await fs.writeFile(testFile, `Test PR content ${Date.now()}`);
    await git.add('.');
    await git.commit(`Test commit for PR ${Date.now()}`);
    await git.push('origin', branchName);

    // Create a pull request
    const pr = await githubService.createPullRequest(
      testOwner,
      testRepo,
      `Test PR ${Date.now()}`,
      branchName,
      'main',
      'This is a test pull request',
    );
    expect(pr).toBeDefined();
    expect(pr.state).toBe('open');

    // Read the pull request
    const readPr = await githubService.readPullRequest(testOwner, testRepo, pr.number);
    expect(readPr).toBeDefined();
    expect(readPr?.number).toBe(pr.number);

    // Update the pull request
    const updatedPr = await githubService.updatePullRequest(testOwner, testRepo, pr.number, {
      title: `Updated Test PR ${Date.now()}`,
    });
    expect(updatedPr).toBeDefined();
    expect(updatedPr.title).toContain('Updated Test PR');

    // Close the pull request
    await githubService.closePullRequest(testOwner, testRepo, pr.number);
    const closedPr = await githubService.readPullRequest(testOwner, testRepo, pr.number);
    expect(closedPr?.state).toBe('closed');
  });

  it('should create, read, update, and close an issue', async () => {
    console.log('DEBUG: Issue Test - Owner:', testOwner, 'Repo:', testRepo);

    // First, ensure the test repository exists
    let repo = await githubService.retrieveRepository(testOwner, testRepo);
    if (!repo) {
      repo = await githubService.createRepository(testRepo, 'Test repository for E2E tests', false);
    }

    // Create an issue
    const issue = await githubService.createIssue(
      testOwner,
      testRepo,
      `Test Issue ${Date.now()}`,
      'This is a test issue body',
      ['bug', 'test'],
    );
    expect(issue).toBeDefined();
    expect(issue.state).toBe('open');

    // Read the issue
    const readIssue = await githubService.readIssue(testOwner, testRepo, issue.number);
    expect(readIssue).toBeDefined();
    expect(readIssue?.number).toBe(issue.number);

    // Update the issue
    const updatedIssue = await githubService.updateIssue(testOwner, testRepo, issue.number, {
      title: `Updated Test Issue ${Date.now()}`,
      body: 'Updated issue body',
    });
    expect(updatedIssue).toBeDefined();
    expect(updatedIssue.title).toContain('Updated Test Issue');

    // Close the issue
    await githubService.closeIssue(testOwner, testRepo, issue.number);
    const closedIssue = await githubService.readIssue(testOwner, testRepo, issue.number);
    expect(closedIssue?.state).toBe('closed');
  });

  it('should configure git client in a container', async () => {
    // This test uses the test Docker service
    const result = await dockerService.createContainer({ groupId: 'test-group' });
    expect(result.ok).toBe(true);

    if (result.ok) {
      const containerId = result.value.id;

      // Configure git client - with test Docker service this is a no-op
      await expect(
        githubService.configureGitClientInContainer(containerId, 'testuser', 'testtoken'),
      ).resolves.not.toThrow();

      // Clean up
      await dockerService.destroyContainer(containerId);
    }
  });

  it('should support test helper methods and call stats', async () => {
    // Import test factory to access helper methods
    const { createTestGitHubService } = await import('./index.js');
    const testService = createTestGitHubService();

    // Test addRepository helper
    const mockRepo = {
      id: 999,
      name: 'test-helper-repo',
      full_name: 'user/test-helper-repo',
      html_url: 'https://github.com/user/test-helper-repo',
      clone_url: 'https://github.com/user/test-helper-repo.git',
    };

    testService.addRepository(mockRepo);
    const repos = await testService.listRepositories();
    expect(repos).toContain(mockRepo);

    // Test addPullRequest helper
    const mockPr = {
      id: 888,
      number: 88,
      state: 'open' as const,
      title: 'Test PR',
      html_url: 'https://github.com/user/repo/pull/88',
    };

    testService.addPullRequest(mockPr);
    // Read the PR to verify it was added
    const readPr = await testService.readPullRequest('user', 'repo', 88);
    expect(readPr).toEqual(mockPr);

    // Test addIssue helper
    const mockIssue = {
      id: 777,
      number: 77,
      state: 'open' as const,
      title: 'Test Issue',
      body: 'Test issue body',
      labels: [],
      html_url: 'https://github.com/user/repo/issues/77',
    };

    testService.addIssue(mockIssue);
    // Read the issue to verify it was added
    const readIssue = await testService.readIssue('user', 'repo', 77);
    expect(readIssue).toEqual(mockIssue);

    // Test getCallStats
    const stats = testService.getCallStats();
    expect(stats).toBeDefined();
    expect(typeof stats).toBe('object');
  });
});
