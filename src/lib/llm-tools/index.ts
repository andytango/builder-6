/**
 * LLM Tools service for centralized tool definition and execution
 */

import type { GitHubService } from '../github/index.js';
import type { DockerService } from '../docker/index.js';
import type { DatabaseService } from '../database/index.js';

/**
 * Tool definition interface matching LLM provider expectations
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * LLM Tools service interface
 */
export interface LLMToolsService {
  /**
   * Get all available tool definitions
   */
  getToolDefinitions(): ToolDefinition[];

  /**
   * Execute a tool by name with provided arguments
   */
  executeTool(name: string, args: unknown): Promise<unknown>;
}

/**
 * Dependencies for the LLM tools service
 */
export interface LLMToolsDependencies {
  githubService: GitHubService;
  dockerService: DockerService;
  databaseService: DatabaseService;
  shellCommand?: (args: { command: string }) => Promise<unknown>;
  webFetch?: (args: { url: string }) => Promise<unknown>;
  googleSearch?: (args: { query: string }) => Promise<unknown>;
}

/**
 * Creates an LLM Tools service
 */
export function createLLMToolsService(deps: LLMToolsDependencies): LLMToolsService {
  const {
    githubService,
    dockerService,
    databaseService: _databaseService_,
    shellCommand = async (): Promise<unknown> => {
      throw new Error('shellCommand not provided');
    },
    webFetch = async (): Promise<unknown> => {
      throw new Error('webFetch not provided');
    },
    googleSearch = async (): Promise<unknown> => {
      throw new Error('googleSearch not provided');
    },
  } = deps;

  // Tool definitions
  const toolDefinitions: ToolDefinition[] = [
    // Shell Tools
    {
      name: 'run_shell_command',
      description: 'Execute shell commands',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute',
          },
        },
        required: ['command'],
      },
    },

    // Web Tools
    {
      name: 'web_fetch',
      description: 'Fetch content from URLs',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch content from',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'google_web_search',
      description: 'Search Google',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
    },

    // GitHub Tools
    {
      name: 'githubService.createRepository',
      description: 'Create a new GitHub repository',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Repository name',
          },
          description: {
            type: 'string',
            description: 'Repository description',
          },
          isPrivate: {
            type: 'boolean',
            description: 'Whether the repository should be private',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'githubService.listRepositories',
      description: 'List user repositories',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'githubService.retrieveRepository',
      description: 'Retrieve a specific repository',
      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
        },
        required: ['owner', 'repo'],
      },
    },
    {
      name: 'githubService.createPullRequest',
      description: 'Create a new pull request',
      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
          title: {
            type: 'string',
            description: 'Pull request title',
          },
          head: {
            type: 'string',
            description: 'The branch containing the changes',
          },
          base: {
            type: 'string',
            description: 'The branch to merge into',
          },
          body: {
            type: 'string',
            description: 'Pull request description',
          },
        },
        required: ['owner', 'repo', 'title', 'head', 'base'],
      },
    },
    {
      name: 'githubService.readPullRequest',
      description: 'Read a pull request',
      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
          prNumber: {
            type: 'number',
            description: 'Pull request number',
          },
        },
        required: ['owner', 'repo', 'prNumber'],
      },
    },
    {
      name: 'githubService.updatePullRequest',
      description: 'Update a pull request',
      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
          prNumber: {
            type: 'number',
            description: 'Pull request number',
          },
          updates: {
            type: 'object',
            description: 'Updates to apply',
          },
        },
        required: ['owner', 'repo', 'prNumber', 'updates'],
      },
    },
    {
      name: 'githubService.closePullRequest',
      description: 'Close a pull request',
      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
          prNumber: {
            type: 'number',
            description: 'Pull request number',
          },
        },
        required: ['owner', 'repo', 'prNumber'],
      },
    },
    {
      name: 'githubService.createIssue',
      description: 'Create a new issue',
      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
          title: {
            type: 'string',
            description: 'Issue title',
          },
          body: {
            type: 'string',
            description: 'Issue description',
          },
          labels: {
            type: 'array',
            description: 'Issue labels',
            items: {
              type: 'string',
            },
          },
        },
        required: ['owner', 'repo', 'title'],
      },
    },
    {
      name: 'githubService.readIssue',
      description: 'Read an issue',
      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
          issueNumber: {
            type: 'number',
            description: 'Issue number',
          },
        },
        required: ['owner', 'repo', 'issueNumber'],
      },
    },
    {
      name: 'githubService.updateIssue',
      description: 'Update an issue',
      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
          issueNumber: {
            type: 'number',
            description: 'Issue number',
          },
          updates: {
            type: 'object',
            description: 'Updates to apply',
          },
        },
        required: ['owner', 'repo', 'issueNumber', 'updates'],
      },
    },
    {
      name: 'githubService.closeIssue',
      description: 'Close an issue',
      parameters: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
          issueNumber: {
            type: 'number',
            description: 'Issue number',
          },
        },
        required: ['owner', 'repo', 'issueNumber'],
      },
    },
    {
      name: 'githubService.configureGitClientInContainer',
      description: 'Configure Git client in a container',
      parameters: {
        type: 'object',
        properties: {
          containerId: {
            type: 'string',
            description: 'Container ID',
          },
          username: {
            type: 'string',
            description: 'Git username',
          },
          token: {
            type: 'string',
            description: 'Git token',
          },
        },
        required: ['containerId', 'username', 'token'],
      },
    },

    // Docker Tools
    {
      name: 'dockerManager.createContainer',
      description: 'Create a new Docker container',
      parameters: {
        type: 'object',
        properties: {
          options: {
            type: 'object',
            description: 'Container creation options',
            properties: {
              groupId: {
                type: 'string',
                description: 'Container group ID',
              },
              image: {
                type: 'string',
                description: 'Docker image to use',
              },
            },
            required: ['groupId'],
          },
        },
        required: ['options'],
      },
    },
    {
      name: 'dockerManager.destroyContainer',
      description: 'Destroy a Docker container',
      parameters: {
        type: 'object',
        properties: {
          containerId: {
            type: 'string',
            description: 'Container ID to destroy',
          },
        },
        required: ['containerId'],
      },
    },
    {
      name: 'dockerManager.executeScript',
      description: 'Execute a script in a Docker container',
      parameters: {
        type: 'object',
        properties: {
          containerId: {
            type: 'string',
            description: 'Container ID',
          },
          script: {
            type: 'string',
            description: 'Script to execute',
          },
        },
        required: ['containerId', 'script'],
      },
    },
    {
      name: 'dockerManager.listContainers',
      description: 'List Docker containers for a group',
      parameters: {
        type: 'object',
        properties: {
          groupId: {
            type: 'string',
            description: 'Container group ID',
          },
        },
        required: ['groupId'],
      },
    },
    {
      name: 'dockerManager.cleanupIdleContainers',
      description: 'Clean up idle containers',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  ];

  // Tool executors map
  const toolExecutors: Record<string, (args: unknown) => Promise<unknown>> = {
    // Shell Tools
    /**
     *
     */
    run_shell_command: async (args: unknown): Promise<unknown> => {
      return shellCommand(args as { command: string });
    },

    // Web Tools
    /**
     *
     */
    web_fetch: async (args: unknown): Promise<unknown> => {
      return webFetch(args as { url: string });
    },
    /**
     *
     */
    google_web_search: async (args: unknown): Promise<unknown> => {
      return googleSearch(args as { query: string });
    },

    // GitHub Tools
    /**
     *
     */
    'githubService.createRepository': async (args: unknown): Promise<unknown> => {
      const { name, description, isPrivate } = args as {
        name: string;
        description?: string;
        isPrivate?: boolean;
      };
      return githubService.createRepository(name, description, isPrivate);
    },
    /**
     *
     */
    'githubService.listRepositories': async (): Promise<unknown> => {
      return githubService.listRepositories();
    },
    /**
     *
     */
    'githubService.retrieveRepository': async (args: unknown): Promise<unknown> => {
      const { owner, repo } = args as { owner: string; repo: string };
      return githubService.retrieveRepository(owner, repo);
    },
    /**
     *
     */
    'githubService.createPullRequest': async (args: unknown): Promise<unknown> => {
      const { owner, repo, title, head, base, body } = args as {
        owner: string;
        repo: string;
        title: string;
        head: string;
        base: string;
        body?: string;
      };
      return githubService.createPullRequest(owner, repo, title, head, base, body);
    },
    /**
     *
     */
    'githubService.readPullRequest': async (args: unknown): Promise<unknown> => {
      const { owner, repo, prNumber } = args as {
        owner: string;
        repo: string;
        prNumber: number;
      };
      return githubService.readPullRequest(owner, repo, prNumber);
    },
    /**
     *
     */
    'githubService.updatePullRequest': async (args: unknown): Promise<unknown> => {
      const { owner, repo, prNumber, updates } = args as {
        owner: string;
        repo: string;
        prNumber: number;
        updates: unknown;
      };
      return githubService.updatePullRequest(
        owner,
        repo,
        prNumber,
        updates as Parameters<typeof githubService.updatePullRequest>[3],
      );
    },
    /**
     *
     */
    'githubService.closePullRequest': async (args: unknown): Promise<unknown> => {
      const { owner, repo, prNumber } = args as {
        owner: string;
        repo: string;
        prNumber: number;
      };
      return githubService.closePullRequest(owner, repo, prNumber);
    },
    /**
     *
     */
    'githubService.createIssue': async (args: unknown): Promise<unknown> => {
      const { owner, repo, title, body, labels } = args as {
        owner: string;
        repo: string;
        title: string;
        body?: string;
        labels?: string[];
      };
      return githubService.createIssue(owner, repo, title, body, labels);
    },
    /**
     *
     */
    'githubService.readIssue': async (args: unknown): Promise<unknown> => {
      const { owner, repo, issueNumber } = args as {
        owner: string;
        repo: string;
        issueNumber: number;
      };
      return githubService.readIssue(owner, repo, issueNumber);
    },
    /**
     *
     */
    'githubService.updateIssue': async (args: unknown): Promise<unknown> => {
      const { owner, repo, issueNumber, updates } = args as {
        owner: string;
        repo: string;
        issueNumber: number;
        updates: unknown;
      };
      return githubService.updateIssue(
        owner,
        repo,
        issueNumber,
        updates as Parameters<typeof githubService.updateIssue>[3],
      );
    },
    /**
     *
     */
    'githubService.closeIssue': async (args: unknown): Promise<unknown> => {
      const { owner, repo, issueNumber } = args as {
        owner: string;
        repo: string;
        issueNumber: number;
      };
      return githubService.closeIssue(owner, repo, issueNumber);
    },
    /**
     *
     */
    'githubService.configureGitClientInContainer': async (args: unknown): Promise<unknown> => {
      const { containerId, username, token } = args as {
        containerId: string;
        username: string;
        token: string;
      };
      return githubService.configureGitClientInContainer(containerId, username, token);
    },

    // Docker Tools - Handle Result<T,E> types by unwrapping and throwing on error
    /**
     *
     */
    'dockerManager.createContainer': async (args: unknown): Promise<unknown> => {
      const { options } = args as { options: unknown };
      const result = await dockerService.createContainer(
        options as Parameters<typeof dockerService.createContainer>[0],
      );
      if ('error' in result) {
        throw new Error(result.error.message);
      }
      return result.ok ? result.value : result;
    },
    /**
     *
     */
    'dockerManager.destroyContainer': async (args: unknown): Promise<unknown> => {
      const { containerId } = args as { containerId: string };
      const result = await dockerService.destroyContainer(containerId);
      if ('error' in result) {
        throw new Error(result.error.message);
      }
      return result.ok ? result.value : result;
    },
    /**
     *
     */
    'dockerManager.executeScript': async (args: unknown): Promise<unknown> => {
      const { containerId, script } = args as { containerId: string; script: string };
      const result = await dockerService.executeScript({ containerId, script });
      if ('error' in result) {
        throw new Error(result.error.message);
      }
      return result.ok ? result.value : result;
    },
    /**
     *
     */
    'dockerManager.listContainers': async (args: unknown): Promise<unknown> => {
      const { groupId } = args as { groupId: string };
      const result = await dockerService.listContainers(groupId);
      if ('error' in result) {
        throw new Error(result.error.message);
      }
      return result.ok ? result.value : result;
    },
    /**
     *
     */
    'dockerManager.cleanupIdleContainers': async (): Promise<unknown> => {
      const result = await dockerService.cleanupIdleContainers();
      if ('error' in result) {
        throw new Error(result.error.message);
      }
      return result.ok ? result.value : result;
    },
  };

  return {
    /**
     * Get all available tool definitions
     */
    getToolDefinitions(): ToolDefinition[] {
      return [...toolDefinitions];
    },

    /**
     * Execute a tool by name with provided arguments
     */
    async executeTool(name: string, args: unknown): Promise<unknown> {
      const executor = toolExecutors[name];
      if (!executor) {
        throw new Error(`Unknown tool: ${name}`);
      }
      return executor(args);
    },
  };
}

/**
 * Test factory for LLM Tools service
 */
export function createTestLLMToolsService(): LLMToolsService {
  const mockDeps: LLMToolsDependencies = {
    githubService: {
      /**
       *
       */
      createRepository: async () => ({
        id: 1,
        name: 'test-repo',
        full_name: 'user/test-repo',
        html_url: 'https://github.com/user/test-repo',
        clone_url: 'https://github.com/user/test-repo.git',
      }),
      /**
       *
       */
      listRepositories: async () => [],
      /**
       *
       */
      retrieveRepository: async () => null,
      /**
       *
       */
      createPullRequest: async () => ({
        id: 1,
        number: 1,
        state: 'open',
        title: 'Test PR',
        html_url: 'https://github.com/user/repo/pull/1',
      }),
      /**
       *
       */
      readPullRequest: async () => null,
      /**
       *
       */
      updatePullRequest: async () => ({
        id: 1,
        number: 1,
        state: 'open',
        title: 'Updated PR',
        html_url: 'https://github.com/user/repo/pull/1',
      }),
      /**
       *
       */
      closePullRequest: async () => ({
        id: 1,
        number: 1,
        state: 'closed',
        title: 'Test PR',
        html_url: 'https://github.com/user/repo/pull/1',
      }),
      /**
       *
       */
      createIssue: async () => ({
        id: 1,
        number: 1,
        state: 'open',
        title: 'Test Issue',
        body: 'Test body',
        labels: [],
        html_url: 'https://github.com/user/repo/issues/1',
      }),
      /**
       *
       */
      readIssue: async () => null,
      /**
       *
       */
      updateIssue: async () => ({
        id: 1,
        number: 1,
        state: 'open',
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
        state: 'closed',
        title: 'Test Issue',
        body: 'Test body',
        labels: [],
        html_url: 'https://github.com/user/repo/issues/1',
      }),
      /**
       *
       */
      configureGitClientInContainer: async () => ({ success: true }),
    } as unknown as GitHubService,
    dockerService: {
      /**
       *
       */
      createContainer: async () => ({
        ok: true,
        value: {
          id: 'container-123',
          groupId: 'group-1',
          status: 'running',
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
      executeScript: async () => ({ ok: true, value: { stdout: 'test output', stderr: '', exitCode: 0 } }),
      /**
       *
       */
      listContainers: async () => ({ ok: true, value: [] }),
      /**
       *
       */
      cleanupIdleContainers: async () => ({ ok: true, value: { cleaned: 0 } }),
    } as unknown as DockerService,
    databaseService: {} as DatabaseService,
    /**
     *
     */
    shellCommand: async () => ({ stdout: 'test output', stderr: '', exitCode: 0 }),
    /**
     *
     */
    webFetch: async () => ({ content: 'test content' }),
    /**
     *
     */
    googleSearch: async () => ({ results: [] }),
  };

  return createLLMToolsService(mockDeps);
}
