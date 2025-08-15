/**
 * Tests for LLM Tools service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLLMToolsService,
  createTestLLMToolsService,
  type LLMToolsService,
  type LLMToolsDependencies,
  type ToolDefinition,
} from './index.js';
import type { GitHubService } from '../github/index.js';
import type { DockerService } from '../docker/index.js';
import type { DatabaseService } from '../database/index.js';

describe('LLM Tools Service', () => {
  let toolsService: LLMToolsService;
  let mockGitHubService: GitHubService;
  let mockDockerService: DockerService;
  let mockDatabaseService: DatabaseService;
  let mockShellCommand: (args: { command: string }) => Promise<unknown>;
  let mockWebFetch: (args: { url: string }) => Promise<unknown>;
  let mockGoogleSearch: (args: { query: string }) => Promise<unknown>;

  beforeEach(() => {
    mockGitHubService = {
      /**
       *
       */
      createRepository: async (name: string, _description_?: string, _isPrivate_?: boolean) => ({
        id: 1,
        name,
        full_name: `user/${name}`,
        html_url: `https://github.com/user/${name}`,
        clone_url: `https://github.com/user/${name}.git`,
      }),
      /**
       *
       */
      listRepositories: async () => [
        {
          id: 1,
          name: 'repo1',
          full_name: 'user/repo1',
          html_url: 'https://github.com/user/repo1',
          clone_url: 'https://github.com/user/repo1.git',
        },
      ],
      /**
       *
       */
      retrieveRepository: async (owner: string, repo: string) => ({
        id: 1,
        name: repo,
        full_name: `${owner}/${repo}`,
        html_url: `https://github.com/${owner}/${repo}`,
        clone_url: `https://github.com/${owner}/${repo}.git`,
      }),
      /**
       *
       */
      createPullRequest: async () => ({
        id: 1,
        number: 1,
        state: 'open' as const,
        title: 'Test PR',
        html_url: 'https://github.com/user/repo/pull/1',
      }),
      /**
       *
       */
      readPullRequest: async () => ({
        id: 1,
        number: 1,
        state: 'open' as const,
        title: 'Test PR',
        html_url: 'https://github.com/user/repo/pull/1',
      }),
      /**
       *
       */
      updatePullRequest: async () => ({
        id: 1,
        number: 1,
        state: 'open' as const,
        title: 'Updated PR',
        html_url: 'https://github.com/user/repo/pull/1',
      }),
      /**
       *
       */
      closePullRequest: async () => ({
        id: 1,
        number: 1,
        state: 'closed' as const,
        title: 'Test PR',
        html_url: 'https://github.com/user/repo/pull/1',
      }),
      /**
       *
       */
      createIssue: async (owner: string, repo: string, title: string, body?: string, labels?: string[]) => ({
        id: 1,
        number: 1,
        state: 'open' as const,
        title,
        body: body || null,
        labels: (labels || []).map((name) => ({ name, color: '#000000' })),
        html_url: `https://github.com/${owner}/${repo}/issues/1`,
      }),
      /**
       *
       */
      readIssue: async () => ({
        id: 1,
        number: 1,
        state: 'open' as const,
        title: 'Test Issue',
        body: 'Test body',
        labels: [],
        html_url: 'https://github.com/user/repo/issues/1',
      }),
      /**
       *
       */
      updateIssue: async () => ({
        id: 1,
        number: 1,
        state: 'open' as const,
        title: 'Updated Issue',
        body: 'Updated body',
        labels: [],
        html_url: 'https://github.com/user/repo/issues/1',
      }),
      /**
       *
       */
      closeIssue: async () => ({
        id: 1,
        number: 1,
        state: 'closed' as const,
        title: 'Test Issue',
        body: 'Test body',
        labels: [],
        html_url: 'https://github.com/user/repo/issues/1',
      }),
      /**
       *
       */
      configureGitClientInContainer: async () => ({ success: true }),
    } as unknown as GitHubService;

    mockDockerService = {
      /**
       *
       */
      createContainer: async () => ({
        ok: true,
        value: {
          id: 'container-123',
          groupId: 'group-1',
          status: 'running' as const,
          createdAt: new Date(),
          lastUsed: new Date(),
        },
      }),
      /**
       *
       */
      destroyContainer: async () => ({ ok: true, value: { success: true } }),
      /**
       *
       */
      executeScript: async () => ({
        ok: true,
        value: { stdout: 'test output', stderr: '', exitCode: 0 },
      }),
      /**
       *
       */
      listContainers: async () => ({ ok: true, value: [] }),
      /**
       *
       */
      cleanupIdleContainers: async () => ({ ok: true, value: { cleaned: 0 } }),
    } as unknown as DockerService;

    mockDatabaseService = {} as DatabaseService;

    /**
     *
     */
    mockShellCommand = async ({ command }: { command: string }): Promise<unknown> => ({
      stdout: `Executed: ${command}`,
      stderr: '',
      exitCode: 0,
    });

    /**
     *
     */
    mockWebFetch = async ({ url }: { url: string }): Promise<unknown> => ({
      content: `Content from ${url}`,
    });

    /**
     *
     */
    mockGoogleSearch = async ({ query }: { query: string }): Promise<unknown> => ({
      results: [`Result for: ${query}`],
    });

    const deps: LLMToolsDependencies = {
      githubService: mockGitHubService,
      dockerService: mockDockerService,
      databaseService: mockDatabaseService,
      shellCommand: mockShellCommand,
      webFetch: mockWebFetch,
      googleSearch: mockGoogleSearch,
    };

    toolsService = createLLMToolsService(deps);
  });

  describe('Tool Definitions', () => {
    it('should return all expected tool definitions', () => {
      const definitions = toolsService.getToolDefinitions();

      expect(definitions).toHaveLength(20); // 1 shell + 2 web + 12 GitHub + 5 Docker tools

      const toolNames = definitions.map((def) => def.name);

      // Shell tools
      expect(toolNames).toContain('run_shell_command');

      // Web tools
      expect(toolNames).toContain('web_fetch');
      expect(toolNames).toContain('google_web_search');

      // GitHub tools
      expect(toolNames).toContain('githubService.createRepository');
      expect(toolNames).toContain('githubService.listRepositories');
      expect(toolNames).toContain('githubService.retrieveRepository');
      expect(toolNames).toContain('githubService.createPullRequest');
      expect(toolNames).toContain('githubService.readPullRequest');
      expect(toolNames).toContain('githubService.updatePullRequest');
      expect(toolNames).toContain('githubService.closePullRequest');
      expect(toolNames).toContain('githubService.createIssue');
      expect(toolNames).toContain('githubService.readIssue');
      expect(toolNames).toContain('githubService.updateIssue');
      expect(toolNames).toContain('githubService.closeIssue');
      expect(toolNames).toContain('githubService.configureGitClientInContainer');

      // Docker tools
      expect(toolNames).toContain('dockerManager.createContainer');
      expect(toolNames).toContain('dockerManager.destroyContainer');
      expect(toolNames).toContain('dockerManager.executeScript');
      expect(toolNames).toContain('dockerManager.listContainers');
      expect(toolNames).toContain('dockerManager.cleanupIdleContainers');
    });

    it('should have proper tool definition structure', () => {
      const definitions = toolsService.getToolDefinitions();

      definitions.forEach((def: ToolDefinition) => {
        expect(def).toHaveProperty('name');
        expect(def).toHaveProperty('description');
        expect(def).toHaveProperty('parameters');
        expect(def.parameters).toHaveProperty('type');
        expect(def.parameters.type).toBe('object');
        expect(def.parameters).toHaveProperty('properties');
      });
    });

    it('should return immutable tool definitions', () => {
      const definitions1 = toolsService.getToolDefinitions();
      const definitions2 = toolsService.getToolDefinitions();

      expect(definitions1).not.toBe(definitions2); // Different arrays
      expect(definitions1).toEqual(definitions2); // Same content
    });
  });

  describe('Shell Tool Execution', () => {
    it('should execute shell commands', async () => {
      const result = await toolsService.executeTool('run_shell_command', {
        command: 'ls -l',
      });

      expect(result).toEqual({
        stdout: 'Executed: ls -l',
        stderr: '',
        exitCode: 0,
      });
    });
  });

  describe('Web Tool Execution', () => {
    it('should fetch web content', async () => {
      const result = await toolsService.executeTool('web_fetch', {
        url: 'https://example.com',
      });

      expect(result).toEqual({
        content: 'Content from https://example.com',
      });
    });

    it('should search Google', async () => {
      const result = await toolsService.executeTool('google_web_search', {
        query: 'test query',
      });

      expect(result).toEqual({
        results: ['Result for: test query'],
      });
    });
  });

  describe('GitHub Tool Execution', () => {
    it('should create repository', async () => {
      const result = await toolsService.executeTool('githubService.createRepository', {
        name: 'test-repo',
        description: 'Test repository',
        isPrivate: false,
      });

      expect(result).toEqual({
        id: 1,
        name: 'test-repo',
        full_name: 'user/test-repo',
        html_url: 'https://github.com/user/test-repo',
        clone_url: 'https://github.com/user/test-repo.git',
      });
    });

    it('should list repositories', async () => {
      const result = await toolsService.executeTool('githubService.listRepositories', {});

      expect(result).toEqual([
        {
          id: 1,
          name: 'repo1',
          full_name: 'user/repo1',
          html_url: 'https://github.com/user/repo1',
          clone_url: 'https://github.com/user/repo1.git',
        },
      ]);
    });

    it('should retrieve repository', async () => {
      const result = await toolsService.executeTool('githubService.retrieveRepository', {
        owner: 'testuser',
        repo: 'test-repo',
      });

      expect(result).toEqual({
        id: 1,
        name: 'test-repo',
        full_name: 'testuser/test-repo',
        html_url: 'https://github.com/testuser/test-repo',
        clone_url: 'https://github.com/testuser/test-repo.git',
      });
    });

    it('should create pull request', async () => {
      const result = await toolsService.executeTool('githubService.createPullRequest', {
        owner: 'testuser',
        repo: 'test-repo',
        title: 'Test PR',
        head: 'feature-branch',
        base: 'main',
        body: 'Test description',
      });

      expect(result).toEqual({
        id: 1,
        number: 1,
        state: 'open',
        title: 'Test PR',
        html_url: 'https://github.com/user/repo/pull/1',
      });
    });

    it('should create issue', async () => {
      const result = await toolsService.executeTool('githubService.createIssue', {
        owner: 'testuser',
        repo: 'test-repo',
        title: 'Test Issue',
        body: 'Test body',
        labels: ['bug', 'high-priority'],
      });

      expect(result).toEqual({
        id: 1,
        number: 1,
        state: 'open',
        title: 'Test Issue',
        body: 'Test body',
        labels: [
          { name: 'bug', color: '#000000' },
          { name: 'high-priority', color: '#000000' },
        ],
        html_url: 'https://github.com/testuser/test-repo/issues/1',
      });
    });
  });

  describe('Docker Tool Execution', () => {
    it('should create container', async () => {
      const result = await toolsService.executeTool('dockerManager.createContainer', {
        options: {
          groupId: 'test-group',
          image: 'ubuntu:latest',
        },
      });

      expect(result).toEqual({
        id: 'container-123',
        groupId: 'group-1',
        status: 'running',
        createdAt: expect.any(Date),
        lastUsed: expect.any(Date),
      });
    });

    it('should destroy container', async () => {
      const result = await toolsService.executeTool('dockerManager.destroyContainer', {
        containerId: 'container-123',
      });

      expect(result).toEqual({ success: true });
    });

    it('should execute script', async () => {
      const result = await toolsService.executeTool('dockerManager.executeScript', {
        containerId: 'container-123',
        script: 'echo "hello world"',
      });

      expect(result).toEqual({
        stdout: 'test output',
        stderr: '',
        exitCode: 0,
      });
    });

    it('should list containers', async () => {
      const result = await toolsService.executeTool('dockerManager.listContainers', {
        groupId: 'test-group',
      });

      expect(result).toEqual([]);
    });

    it('should cleanup idle containers', async () => {
      const result = await toolsService.executeTool('dockerManager.cleanupIdleContainers', {});

      expect(result).toEqual({ cleaned: 0 });
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown tools', async () => {
      await expect(toolsService.executeTool('unknown_tool', {})).rejects.toThrow('Unknown tool: unknown_tool');
    });

    it('should handle Docker service errors', async () => {
      const errorDockerService = {
        /**
         *
         */
        createContainer: async () => ({
          error: { type: 'ContainerCreationFailed', message: 'Failed to create container' },
        }),
      } as unknown as DockerService;

      const errorToolsService = createLLMToolsService({
        githubService: mockGitHubService,
        dockerService: errorDockerService,
        databaseService: mockDatabaseService,
      });

      await expect(
        errorToolsService.executeTool('dockerManager.createContainer', {
          options: { groupId: 'test' },
        }),
      ).rejects.toThrow('Failed to create container');
    });

    it('should handle missing optional dependencies', async () => {
      const minimalDeps: LLMToolsDependencies = {
        githubService: mockGitHubService,
        dockerService: mockDockerService,
        databaseService: mockDatabaseService,
      };

      const minimalToolsService = createLLMToolsService(minimalDeps);

      await expect(minimalToolsService.executeTool('run_shell_command', { command: 'ls' })).rejects.toThrow(
        'shellCommand not provided',
      );

      await expect(minimalToolsService.executeTool('web_fetch', { url: 'https://example.com' })).rejects.toThrow(
        'webFetch not provided',
      );

      await expect(minimalToolsService.executeTool('google_web_search', { query: 'test' })).rejects.toThrow(
        'googleSearch not provided',
      );
    });
  });

  describe('Test Factory', () => {
    it('should create test tools service with mocked dependencies', () => {
      const testToolsService = createTestLLMToolsService();

      expect(testToolsService).toHaveProperty('getToolDefinitions');
      expect(testToolsService).toHaveProperty('executeTool');

      const definitions = testToolsService.getToolDefinitions();
      expect(definitions).toHaveLength(20);
    });

    it('should execute tools with mock data', async () => {
      const testToolsService = createTestLLMToolsService();

      const shellResult = await testToolsService.executeTool('run_shell_command', {
        command: 'ls',
      });
      expect(shellResult).toEqual({ stdout: 'test output', stderr: '', exitCode: 0 });

      const repoResult = await testToolsService.executeTool('githubService.createRepository', {
        name: 'test-repo',
      });
      expect(repoResult).toHaveProperty('name', 'test-repo');

      const containerResult = await testToolsService.executeTool('dockerManager.createContainer', {
        options: { groupId: 'test' },
      });
      expect(containerResult).toHaveProperty('id', 'container-123');
    });
  });
});
