/**
 * Docker service for container management
 */

import Docker from 'dockerode';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { Result, ok, err, trapAsync, extractErrorMessage } from '../errors/index.js';
import { ApplicationConfig } from '../config/index.js';

// Define types directly since we no longer have docker-manager
export interface Container {
  id: string;
  groupId: string;
  status: 'creating' | 'running' | 'exited' | 'dead';
  createdAt: Date;
  lastUsed: Date;
}

export interface CreateContainerOptions {
  groupId: string;
  image?: string;
}

export interface ExecuteScriptOptions {
  containerId: string;
  script: string;
  timeout?: number;
}

export interface IngestDirectoryOptions {
  containerId: string;
  path: string;
}

export interface DockerError {
  type: DockerErrorType;
  message: string;
  originalError?: Error;
}

export type DockerErrorType =
  | 'ContainerLimitReached'
  | 'ContainerNotFound'
  | 'ContainerCreationFailed'
  | 'ContainerExecutionFailed'
  | 'ContainerDestructionFailed'
  | 'InternalError';

// NOTE: Not a part of the public API, only used internally
interface FileSystemNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  content?: string;
  children: FileSystemNode[];
}

// In-memory state for tracking containers
let containerState: { [key: string]: Container } = {};

/**
 * Docker service interface
 */
export interface DockerService {
  createContainer(options: CreateContainerOptions): Promise<Result<Container, DockerError>>;
  listContainers(groupId?: string): Promise<Result<Container[], DockerError>>;
  destroyContainer(containerId: string): Promise<Result<void, DockerError>>;
  executeScript(options: ExecuteScriptOptions): Promise<Result<string, DockerError>>;
  cleanupIdleContainers(): Promise<Result<number, DockerError>>;
  ingestDirectory(options: IngestDirectoryOptions): Promise<Result<string, DockerError>>;
}

/**
 * Auto-detect Docker socket path
 */
function autoDetectDockerSocket(): string {
  const orbstackSocketPath = path.join(os.homedir(), '.orbstack', 'run', 'docker.sock');
  return fs.existsSync(orbstackSocketPath) ? orbstackSocketPath : '/var/run/docker.sock';
}

/**
 * Creates a Docker service
 * @param config - Application configuration
 * @returns A DockerService instance
 */
export function createDockerService(config: ApplicationConfig): DockerService {
  const socketPath = config.dockerSocketPath || autoDetectDockerSocket();
  const docker = new Docker({ socketPath });

  return {
    /**
     *
     */
    async createContainer(options: CreateContainerOptions): Promise<Result<Container, DockerError>> {
      const groupContainers = Object.values(containerState).filter((c) => c.groupId === options.groupId);
      if (groupContainers.length >= config.dockerContainerLimit) {
        return err({
          type: 'ContainerLimitReached',
          message: `Container limit reached for group '${options.groupId}'. Maximum ${config.dockerContainerLimit} containers allowed.`,
        });
      }

      const containerName = `${config.dockerContainerPrefix}${Math.random().toString(36).substring(2, 8)}`;

      // Trap dockerode createContainer call
      const createResult = await trapAsync(
        () =>
          docker.createContainer({
            Image: options.image || config.dockerDefaultImage,
            name: containerName,
            Cmd: ['tail', '-f', '/dev/null'], // Keep container running
          }),
        (error) => ({
          type: 'ContainerCreationFailed' as DockerErrorType,
          message: extractErrorMessage(error),
          originalError: error instanceof Error ? error : undefined,
        }),
      );

      if (!createResult.ok) {
        return createResult;
      }

      const dockerContainer = createResult.value;

      // Trap dockerode start call
      const startResult = await trapAsync(
        () => dockerContainer.start(),
        (error) => ({
          type: 'ContainerCreationFailed' as DockerErrorType,
          message: `Failed to start container: ${extractErrorMessage(error)}`,
          originalError: error instanceof Error ? error : undefined,
        }),
      );

      if (!startResult.ok) {
        return startResult;
      }

      const newContainer: Container = {
        id: dockerContainer.id,
        groupId: options.groupId,
        status: 'running',
        createdAt: new Date(),
        lastUsed: new Date(),
      };

      containerState[dockerContainer.id] = newContainer;
      return ok(newContainer);
    },

    /**
     *
     */
    async listContainers(groupId?: string): Promise<Result<Container[], DockerError>> {
      return trapAsync(
        async () => {
          const containers = Object.values(containerState);
          const filtered = groupId ? containers.filter((c) => c.groupId === groupId) : containers;
          return filtered;
        },
        (error) => ({
          type: 'InternalError' as DockerErrorType,
          message: extractErrorMessage(error),
          originalError: error instanceof Error ? error : undefined,
        }),
      );
    },

    /**
     *
     */
    async destroyContainer(containerId: string): Promise<Result<void, DockerError>> {
      const container = containerState[containerId];
      if (!container) {
        return err({
          type: 'ContainerNotFound',
          message: `Container with ID '${containerId}' not found`,
        });
      }

      const dockerContainer = docker.getContainer(containerId);

      // Try to stop the container first (ignore errors as it might already be stopped)
      await trapAsync(
        () => dockerContainer.stop(),
        () => null, // Ignore stop errors
      );

      // Remove the container
      const removeResult = await trapAsync(
        () => dockerContainer.remove(),
        (error) => ({
          type: 'ContainerDestructionFailed' as DockerErrorType,
          message: extractErrorMessage(error),
          originalError: error instanceof Error ? error : undefined,
        }),
      );

      if (!removeResult.ok) {
        return removeResult;
      }

      delete containerState[containerId];
      return ok(undefined);
    },

    /**
     *
     */
    async executeScript(options: ExecuteScriptOptions): Promise<Result<string, DockerError>> {
      const container = containerState[options.containerId];
      if (!container) {
        return err({
          type: 'ContainerNotFound',
          message: `Container with ID '${options.containerId}' not found`,
        });
      }

      const dockerContainer = docker.getContainer(options.containerId);

      // Ensure container is running
      const inspectResult = await trapAsync(
        () => dockerContainer.inspect(),
        (error) => ({
          type: 'ContainerExecutionFailed' as DockerErrorType,
          message: `Failed to inspect container: ${extractErrorMessage(error)}`,
          originalError: error instanceof Error ? error : undefined,
        }),
      );

      if (!inspectResult.ok) {
        return inspectResult;
      }

      if (inspectResult.value.State.Status !== 'running') {
        const startResult = await trapAsync(
          () => dockerContainer.start(),
          (error) => ({
            type: 'ContainerExecutionFailed' as DockerErrorType,
            message: `Failed to start container: ${extractErrorMessage(error)}`,
            originalError: error instanceof Error ? error : undefined,
          }),
        );

        if (!startResult.ok) {
          return startResult;
        }
      }

      const execResult = await trapAsync(
        () =>
          dockerContainer.exec({
            Cmd: ['bash', '-c', options.script],
            AttachStdout: true,
            AttachStderr: true,
          }),
        (error) => ({
          type: 'ContainerExecutionFailed' as DockerErrorType,
          message: `Failed to create exec: ${extractErrorMessage(error)}`,
          originalError: error instanceof Error ? error : undefined,
        }),
      );

      if (!execResult.ok) {
        return execResult;
      }

      const streamResult = await trapAsync(
        () => execResult.value.start({ hijack: true, stdin: true }),
        (error) => ({
          type: 'ContainerExecutionFailed' as DockerErrorType,
          message: `Failed to start exec: ${extractErrorMessage(error)}`,
          originalError: error instanceof Error ? error : undefined,
        }),
      );

      if (!streamResult.ok) {
        return streamResult;
      }

      const stream = streamResult.value;

      return new Promise((resolve) => {
        let output = '';
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString('utf8');
        });
        stream.on('end', () => {
          container.lastUsed = new Date();
          resolve(ok(output));
        });
        stream.on('error', (error: Error) => {
          resolve(
            err({
              type: 'ContainerExecutionFailed',
              message: error.message,
              originalError: error,
            }),
          );
        });
      });
    },

    /**
     *
     */
    async cleanupIdleContainers(): Promise<Result<number, DockerError>> {
      return trapAsync(
        async () => {
          const now = new Date();
          const idleContainers = Object.values(containerState).filter(
            (c) => now.getTime() - c.lastUsed.getTime() > config.dockerIdleTimeout,
          );

          let cleaned = 0;
          for (const container of idleContainers) {
            const result = await this.destroyContainer(container.id);
            if (result.ok) {
              cleaned++;
            }
          }

          return cleaned;
        },
        (error) => ({
          type: 'InternalError' as DockerErrorType,
          message: extractErrorMessage(error),
          originalError: error instanceof Error ? error : undefined,
        }),
      );
    },

    async ingestDirectory(options: IngestDirectoryOptions): Promise<Result<string, DockerError>> {
      const { containerId, path: rootPath } = options;

      // Simple implementation that just lists files
      const listResult = await this.executeScript({
        containerId,
        script: `find ${rootPath} -type f -print`,
      });
      
      if (!listResult.ok) return listResult;

      // Return the list of files as a simple string
      return ok(listResult.value);
    },
  };
}

/**
 * Configuration for test Docker service
 */
export interface TestDockerConfig {
  containerCreationDelay?: number;
  scriptExecutionDelay?: number;
  simulateFailures?: boolean;
  containerLimit?: number;
}

/**
 * Test helpers for Docker service
 */
export interface TestDockerHelpers {
  getContainerCount(): number;
  getContainers(): Container[];
  reset(): void;
  simulateContainerFailure(containerId: string): void;
}

/**
 * Creates a test Docker service for use in tests
 * @param config - Configuration for the test service
 * @returns A DockerService with test helpers
 */
export function createTestDockerService(config: TestDockerConfig = {}): DockerService & TestDockerHelpers {
  const { containerCreationDelay = 0, scriptExecutionDelay = 0, simulateFailures = false, containerLimit = 5 } = config;

  let testContainers = new Map<string, Container>();
  let idCounter = 1;

  /**
   *
   */
  function generateId(): string {
    return `test-container-${idCounter++}`;
  }

  return {
    /**
     *
     */
    async createContainer(options: CreateContainerOptions): Promise<Result<Container, DockerError>> {
      if (containerCreationDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, containerCreationDelay));
      }

      if (simulateFailures && Math.random() < 0.1) {
        return err({
          type: 'ContainerCreationFailed',
          message: 'Simulated container creation failure',
        });
      }

      const groupContainers = Array.from(testContainers.values()).filter((c) => c.groupId === options.groupId);
      if (groupContainers.length >= containerLimit) {
        return err({
          type: 'ContainerLimitReached',
          message: `Container limit reached for group '${options.groupId}'`,
        });
      }

      const container: Container = {
        id: generateId(),
        groupId: options.groupId,
        status: 'running',
        createdAt: new Date(),
        lastUsed: new Date(),
      };

      testContainers.set(container.id, container);
      return ok(container);
    },

    /**
     *
     */
    async listContainers(groupId?: string): Promise<Result<Container[], DockerError>> {
      const containers = Array.from(testContainers.values());
      const filtered = groupId ? containers.filter((c) => c.groupId === groupId) : containers;
      return ok(filtered);
    },

    /**
     *
     */
    async destroyContainer(containerId: string): Promise<Result<void, DockerError>> {
      if (simulateFailures && Math.random() < 0.1) {
        return err({
          type: 'ContainerDestructionFailed',
          message: 'Simulated container destruction failure',
        });
      }

      if (!testContainers.has(containerId)) {
        return err({
          type: 'ContainerNotFound',
          message: `Container with ID '${containerId}' not found`,
        });
      }

      testContainers.delete(containerId);
      return ok(undefined);
    },

    /**
     *
     */
    async executeScript(options: ExecuteScriptOptions): Promise<Result<string, DockerError>> {
      if (scriptExecutionDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, scriptExecutionDelay));
      }

      if (simulateFailures && Math.random() < 0.1) {
        return err({
          type: 'ContainerExecutionFailed',
          message: 'Simulated script execution failure',
        });
      }

      const container = testContainers.get(options.containerId);
      if (!container) {
        return err({
          type: 'ContainerNotFound',
          message: `Container with ID '${options.containerId}' not found`,
        });
      }

      container.lastUsed = new Date();

      // Simulate script execution based on common patterns
      if (options.script.includes('echo')) {
        const match = options.script.match(/echo\s+"([^"]*)"/);
        return ok(match ? match[1] + '\n' : 'echo output\n');
      }

      return ok('Simulated script output\n');
    },

    /**
     *
     */
    async cleanupIdleContainers(): Promise<Result<number, DockerError>> {
      // For tests, just return success with 0 cleaned
      return ok(0);
    },

    /**
     *
     */
    async ingestDirectory(options: IngestDirectoryOptions): Promise<Result<string, DockerError>> {
      const container = testContainers.get(options.containerId);
      if (!container) {
        return err({
          type: 'ContainerNotFound',
          message: `Container with ID '${options.containerId}' not found`,
        });
      }

      // Mock implementation for tests
      return ok(`Ingested directory: ${options.path}\nFile1.js\nFile2.ts\nREADME.md`);
    },


    // Test helpers
    /**
     *
     */
    getContainerCount(): number {
      return testContainers.size;
    },

    /**
     *
     */
    getContainers(): Container[] {
      return Array.from(testContainers.values());
    },

    /**
     *
     */
    reset(): void {
      testContainers.clear();
      idCounter = 1;
    },

    /**
     *
     */
    simulateContainerFailure(containerId: string): void {
      const container = testContainers.get(containerId);
      if (container) {
        container.status = 'exited';
      }
    },
  };
}
