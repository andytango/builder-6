import { describe, it, expect } from 'vitest';
import { createTestLLMRunner } from './llm-runner/index.js';
import { createTestDockerService } from './docker/index.js';
import { createTestGitHubService } from './github/index.js';
import { createTestDatabaseService } from './database/index.js';

describe('Test Factory Functions', () => {
  describe('createTestLLMRunner', () => {
    it('should create a service with default configuration', () => {
      const service = createTestLLMRunner();
      expect(service).toBeDefined();
      expect(service.generateContent).toBeDefined();
      expect(service.generateResponse).toBeDefined();
      expect(service.getConfig).toBeDefined();
      expect(service.reset).toBeDefined();
      expect(service.getCallHistory).toBeDefined();
      expect(service.setResponses).toBeDefined();
    });

    it('should respect custom responses', async () => {
      const customResponse = 'Custom AI response';
      const service = createTestLLMRunner({
        responses: [customResponse],
      });

      const result = await service.generateContent('test prompt');

      expect(result).toBe(customResponse);
    });

    it('should track call history', async () => {
      const service = createTestLLMRunner();

      expect(service.getCallHistory()).toHaveLength(0);

      await service.generateContent('first call');

      expect(service.getCallHistory()).toHaveLength(1);
      expect(service.getCallHistory()[0]).toBe('first call');

      await service.generateContent('second call');

      expect(service.getCallHistory()).toHaveLength(2);
      expect(service.getCallHistory()[1]).toBe('second call');
    });

    it('should reset state properly', async () => {
      const service = createTestLLMRunner();

      await service.generateContent('test');

      expect(service.getCallHistory()).toHaveLength(1);

      service.reset();

      expect(service.getCallHistory()).toHaveLength(0);
    });

    it('should handle response queue', async () => {
      const service = createTestLLMRunner({
        responses: ['first', 'second', 'third'],
      });

      expect(await service.generateContent('prompt1')).toBe('first');
      expect(await service.generateContent('prompt2')).toBe('second');
      expect(await service.generateContent('prompt3')).toBe('third');
    });

    it('should support generateResponse with metadata', async () => {
      const service = createTestLLMRunner({
        defaultResponse: 'test response',
        provider: 'gemini',
      });

      const response = await service.generateResponse('test prompt');

      expect(response.content).toBe('test response');
      expect(response.provider).toBe('gemini');
      expect(response.model).toBe('test-model');
      expect(response.usage).toBeDefined();
      expect(response.usage?.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('createTestDockerService', () => {
    it('should create a service with default configuration', () => {
      const service = createTestDockerService();
      expect(service).toBeDefined();
      expect(service.createContainer).toBeDefined();
      expect(service.destroyContainer).toBeDefined();
      expect(service.executeScript).toBeDefined();
      expect(service.getContainerCount).toBeDefined();
      expect(service.reset).toBeDefined();
    });

    it('should manage container lifecycle', async () => {
      const service = createTestDockerService();

      const createResult = await service.createContainer({ groupId: 'test' });
      expect(createResult.ok).toBe(true);

      if (createResult.ok) {
        expect(service.getContainerCount()).toBe(1);

        const destroyResult = await service.destroyContainer(createResult.value.id);
        expect(destroyResult.ok).toBe(true);
        expect(service.getContainerCount()).toBe(0);
      }
    });

    it('should respect container limits', async () => {
      const service = createTestDockerService({
        containerLimit: 1,
      });

      const result1 = await service.createContainer({ groupId: 'test' });
      expect(result1.ok).toBe(true);

      const result2 = await service.createContainer({ groupId: 'test' });
      expect(result2.ok).toBe(false);
    });

    it('should reset properly', async () => {
      const service = createTestDockerService();

      await service.createContainer({ groupId: 'test' });
      expect(service.getContainerCount()).toBe(1);

      service.reset();
      expect(service.getContainerCount()).toBe(0);
    });
  });

  describe('createTestGitHubService', () => {
    it('should create a service with default configuration', () => {
      const service = createTestGitHubService();
      expect(service).toBeDefined();
      expect(service.createRepository).toBeDefined();
      expect(service.createPullRequest).toBeDefined();
      expect(service.createIssue).toBeDefined();
      expect(service.getCallStats).toBeDefined();
      expect(service.reset).toBeDefined();
    });

    it('should manage repositories', async () => {
      const service = createTestGitHubService();

      const repo = await service.createRepository('test-repo', 'Test description', false);
      expect(repo).toBeDefined();
      expect(repo.name).toBe('test-repo');

      // Test service tracks calls
      const stats = service.getCallStats();
      expect(stats.createRepository).toBe(1);
    });

    it('should manage pull requests', async () => {
      const service = createTestGitHubService();

      // Create a repo first
      await service.createRepository('test-repo', 'Test', false);

      const pr = await service.createPullRequest('owner', 'test-repo', 'Test PR', 'feature', 'main', 'Description');

      expect(pr).toBeDefined();
      expect(pr.title).toBe('Test PR');
      expect(pr.state).toBe('open');

      const stats = service.getCallStats();
      expect(stats.createPullRequest).toBe(1);
    });

    it('should manage issues', async () => {
      const service = createTestGitHubService();

      await service.createRepository('test-repo', 'Test', false);

      const issue = await service.createIssue('owner', 'test-repo', 'Test Issue', 'Issue body', ['bug']);

      expect(issue).toBeDefined();
      expect(issue.title).toBe('Test Issue');
      expect(issue.state).toBe('open');

      const stats = service.getCallStats();
      expect(stats.createIssue).toBe(1);
    });

    it('should track API calls', async () => {
      const service = createTestGitHubService();

      await service.createRepository('repo1', 'Test', false);
      await service.createRepository('repo2', 'Test', false);
      await service.listRepositories();

      const stats = service.getCallStats();
      expect(stats.createRepository).toBe(2);
      expect(stats.listRepositories).toBe(1);
    });

    it('should reset properly', async () => {
      const service = createTestGitHubService();

      await service.createRepository('test-repo', 'Test', false);
      const statsBefore = service.getCallStats();
      expect(statsBefore.createRepository).toBe(1);

      service.reset();
      const statsAfter = service.getCallStats();
      expect(statsAfter.createRepository).toBeUndefined();
    });
  });

  describe('createTestDatabaseService', () => {
    it('should create a service with default configuration', () => {
      const service = createTestDatabaseService();
      expect(service).toBeDefined();
      expect(service.createSession).toBeDefined();
      expect(service.insertTask).toBeDefined();
      expect(service.getAllSessions).toBeDefined();
      expect(service.getAllTasks).toBeDefined();
      expect(service.reset).toBeDefined();
    });

    it('should manage sessions', async () => {
      const service = createTestDatabaseService();

      const session = await service.createSession();
      expect(session).toBeDefined();
      expect(session.status).toBe('OPEN');

      const sessions = service.getAllSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(session.id);
    });

    it('should manage tasks', async () => {
      const service = createTestDatabaseService();

      const session = await service.createSession();
      const task = await service.insertTask(session.id, 'Test task');

      expect(task).toBeDefined();
      expect(task.description).toBe('Test task');
      expect(task.status).toBe('PENDING');

      const tasks = service.getAllTasks();
      expect(tasks).toHaveLength(1);
    });

    it('should auto-generate IDs', async () => {
      const service = createTestDatabaseService({
        autoGenerateIds: true,
      });

      const session1 = await service.createSession();
      const session2 = await service.createSession();

      expect(session1.id).toBeDefined();
      expect(session2.id).toBeDefined();
      expect(session1.id).not.toBe(session2.id);
    });

    it('should simulate constraints', async () => {
      const service = createTestDatabaseService({
        simulateConstraints: true,
      });

      const session = await service.createSession({ id: 'duplicate-id' });
      expect(session.id).toBe('duplicate-id');

      // Try to create another session with same ID
      await expect(service.createSession({ id: 'duplicate-id' })).rejects.toThrow('already exists');
    });

    it('should reset properly', async () => {
      const service = createTestDatabaseService();

      await service.createSession();
      expect(service.getAllSessions()).toHaveLength(1);

      service.reset();
      expect(service.getAllSessions()).toHaveLength(0);
    });

    it('should maintain initial data after reset', async () => {
      const initialSession = {
        id: 'initial-session',
        status: 'OPEN' as const,
        createdAt: new Date(),
        deadline: null,
        rawPlan: null,
      };

      const service = createTestDatabaseService({
        sessions: [initialSession],
      });

      expect(service.getAllSessions()).toHaveLength(1);

      await service.createSession();
      expect(service.getAllSessions()).toHaveLength(2);

      service.reset();
      expect(service.getAllSessions()).toHaveLength(1);
      expect(service.getAllSessions()[0].id).toBe('initial-session');
    });
  });
});
