import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabaseService } from './index.js';
import type { DatabaseService } from './index.js';

describe('Database Service E2E', () => {
  let databaseService: DatabaseService;

  beforeAll(async () => {
    // Use test database service instead of real database
    databaseService = createTestDatabaseService({ autoGenerateIds: true });
  });

  afterAll(async () => {
    // No cleanup needed for test database
  });

  it('should create and retrieve a session', async () => {
    const session = await databaseService.createSession();
    expect(session).toBeDefined();
    expect(session.status).toBe('OPEN');

    const retrievedSession = await databaseService.retrieveSession(session.id);
    expect(retrievedSession).toEqual(session);
  });

  it('should return null for a non-existent session', async () => {
    const session = await databaseService.retrieveSession('non-existent-id');
    expect(session).toBeNull();
  });

  it('should insert tasks and maintain order', async () => {
    const session = await databaseService.createSession();

    // Insert first task (order 0)
    const task1 = await databaseService.insertTask(session.id, 'Task A', 0);
    expect(task1.order).toBe(0);
    expect(task1.description).toBe('Task A');

    // Insert second task (order 1)
    const task2 = await databaseService.insertTask(session.id, 'Task B', 1);
    expect(task2.order).toBe(1);
    expect(task2.description).toBe('Task B');

    // Insert task with auto-order (should be order 2)
    const task3 = await databaseService.insertTask(session.id, 'Task C');
    expect(task3.order).toBe(2);
    expect(task3.description).toBe('Task C');

    // List tasks should return them in order
    const tasks = await databaseService.listTasks(session.id);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].description).toBe('Task A');
    expect(tasks[1].description).toBe('Task B');
    expect(tasks[2].description).toBe('Task C');
  });

  it('should update task status', async () => {
    const session = await databaseService.createSession();
    const task = await databaseService.insertTask(session.id, 'Status test task');

    // Update status to IN_PROGRESS
    const updatedTask = await databaseService.updateTaskStatus(task.id, 'IN_PROGRESS');
    expect(updatedTask).toBeDefined();
    expect(updatedTask?.status).toBe('IN_PROGRESS');

    // Update status to COMPLETED
    const completedTask = await databaseService.updateTaskStatus(task.id, 'COMPLETED');
    expect(completedTask).toBeDefined();
    expect(completedTask?.status).toBe('COMPLETED');
  });

  it('should return null when updating status of non-existent task', async () => {
    const result = await databaseService.updateTaskStatus('non-existent-id', 'COMPLETED');
    expect(result).toBeNull();
  });

  it('should handle session status updates', async () => {
    const session = await databaseService.createSession();
    expect(session.status).toBe('OPEN');

    // Update session status
    const updatedSession = await databaseService.updateSession(session.id, {
      status: 'PLANNING',
    });
    expect(updatedSession.status).toBe('PLANNING');

    // Verify the update persisted
    const retrieved = await databaseService.retrieveSession(session.id);
    expect(retrieved?.status).toBe('PLANNING');
  });

  it('should support test helper methods', async () => {
    // Create test database service to access helper methods
    const testDatabaseService = createTestDatabaseService();

    // Test addSession helper
    const mockSession = {
      id: 'test-session',
      status: 'OPEN' as const,
      createdAt: new Date(),
      deadline: null,
      rawPlan: null,
    };

    testDatabaseService.addSession(mockSession);
    const retrievedSession = await testDatabaseService.retrieveSession('test-session');
    expect(retrievedSession).toEqual(mockSession);

    // Test addTask helper
    const mockTask = {
      id: 'test-task',
      sessionId: 'test-session',
      order: 1,
      description: 'Test task',
      status: 'PENDING' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      rawReactHistory: null,
    };

    testDatabaseService.addTask(mockTask);
    const tasks = await testDatabaseService.listTasks('test-session');
    expect(tasks).toContain(mockTask);
  });

  it('should handle errors in test database service methods', async () => {
    const testDatabaseService = createTestDatabaseService();

    // Test updateTask with non-existent task - this is a test database service method that throws
    await expect(testDatabaseService.updateTask('non-existent', { status: 'COMPLETED' })).rejects.toThrow(
      'Task non-existent not found',
    );

    // Test updateTaskStatus with non-existent task
    const result = await testDatabaseService.updateTaskStatus('non-existent', 'COMPLETED');
    expect(result).toBeNull();
  });

  it('should update task status with session plan updates', async () => {
    const testDatabaseService = createTestDatabaseService();

    // Create a session with a plan
    const session = {
      id: 'session-with-plan',
      status: 'PLANNING' as const,
      createdAt: new Date(),
      deadline: null,
      rawPlan: JSON.stringify([
        {
          id: 'task-in-plan',
          sessionId: 'session-with-plan',
          order: 0,
          description: 'Task in plan',
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
          rawReactHistory: null,
        },
      ]),
    };

    testDatabaseService.addSession(session);

    // Add the task
    const task = {
      id: 'task-in-plan',
      sessionId: 'session-with-plan',
      order: 0,
      description: 'Task in plan',
      status: 'PENDING' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      rawReactHistory: null,
    };

    testDatabaseService.addTask(task);

    // Update task status - this should update both the task and the session's rawPlan
    const updatedTask = await testDatabaseService.updateTaskStatus('task-in-plan', 'COMPLETED');
    expect(updatedTask?.status).toBe('COMPLETED');

    // Verify the session's rawPlan was also updated
    const updatedSession = await testDatabaseService.retrieveSession('session-with-plan');
    const plan = JSON.parse(updatedSession?.rawPlan || '[]');
    expect(plan[0].status).toBe('COMPLETED');
  });
});
