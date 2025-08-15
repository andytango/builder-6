/**
 * Database service for session and task management
 */

import { PrismaClient, Prisma } from './prisma/generated/index.js';
import { ApplicationConfig } from '../config/index.js';

// Define types directly since we no longer have agent-sessions
export type SessionStatus =
  | 'OPEN'
  | 'PLANNING'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'AWAITING_CONFIRMATION'
  | 'DEADLINE_EXCEEDED';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface Session {
  id: string;
  status: SessionStatus;
  createdAt: Date;
  deadline?: Date | null;
  rawPlan?: string | null;
}

export interface Task {
  id: string;
  sessionId: string;
  order: number;
  description: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  rawReactHistory?: string | null;
}

/**
 * Database service interface
 */
export interface DatabaseService {
  createSession(initialData?: Partial<Session>): Promise<Session>;
  retrieveSession(sessionId: string): Promise<Session | null>;
  updateSession(sessionId: string, data: Partial<Session>): Promise<Session>;
  listTasks(sessionId: string): Promise<Task[]>;
  insertTask(sessionId: string, description: string, order?: number): Promise<Task>;
  updateTask(taskId: string, data: Partial<Task>): Promise<Task>;
  updateTaskStatus(taskId: string, newStatus: TaskStatus): Promise<Task | null>;
}

/**
 * Creates a Database service using Prisma
 * @param config - Application configuration
 * @returns A DatabaseService instance
 */
export function createDatabaseService(config: ApplicationConfig): DatabaseService {
  const prisma = new PrismaClient({
    datasources: {
      db: { url: config.databaseUrl },
    },
    log: config.debugEnabled ? ['query', 'info', 'warn', 'error'] : ['error'],
  });

  return {
    /**
     *
     */
    async createSession(initialData?: Partial<Session>): Promise<Session> {
      const data: Prisma.SessionCreateInput = {
        status: 'OPEN',
        ...initialData,
      };
      const session = await prisma.session.create({ data });
      return session as Session;
    },

    /**
     *
     */
    async retrieveSession(sessionId: string): Promise<Session | null> {
      const session = await prisma.session.findUnique({
        where: {
          id: sessionId,
        },
      });
      return session as Session | null;
    },

    /**
     *
     */
    async updateSession(sessionId: string, data: Partial<Session>): Promise<Session> {
      const session = await prisma.session.update({
        where: {
          id: sessionId,
        },
        data,
      });
      return session as Session;
    },

    /**
     *
     */
    async listTasks(sessionId: string): Promise<Task[]> {
      const tasks = await prisma.task.findMany({
        where: {
          sessionId: sessionId,
        },
        orderBy: {
          order: 'asc',
        },
      });
      return tasks as Task[];
    },

    /**
     *
     */
    async insertTask(sessionId: string, description: string, order?: number): Promise<Task> {
      // Get the current max order for tasks in this session
      const existingTasks = await prisma.task.findMany({
        where: {
          sessionId: sessionId,
        },
        orderBy: {
          order: 'desc',
        },
        take: 1,
      });

      const maxOrder = existingTasks.length > 0 ? existingTasks[0].order : -1;
      const taskOrder = order !== undefined ? order : maxOrder + 1;

      // Create the task
      const data: Prisma.TaskCreateInput = {
        session: {
          connect: {
            id: sessionId,
          },
        },
        description: description,
        order: taskOrder,
        status: 'PENDING',
      };

      const task = await prisma.task.create({ data });

      // Update session's rawPlan with the new task
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (session && session.rawPlan) {
        const currentPlan = JSON.parse(session.rawPlan);
        currentPlan.push(task);
        await prisma.session.update({
          where: { id: sessionId },
          data: { rawPlan: JSON.stringify(currentPlan) },
        });
      }

      return task as Task;
    },

    /**
     *
     */
    async updateTask(taskId: string, data: Partial<Task>): Promise<Task> {
      const task = await prisma.task.update({
        where: {
          id: taskId,
        },
        data,
      });
      return task as Task;
    },

    /**
     *
     */
    async updateTaskStatus(taskId: string, newStatus: TaskStatus): Promise<Task | null> {
      try {
        const task = await prisma.task.update({
          where: {
            id: taskId,
          },
          data: {
            status: newStatus,
          },
        });
        return task as Task;
      } catch (error) {
        // Task not found
        return null;
      }
    },
  };
}

/**
 * Configuration for test Database service
 */
export interface TestDatabaseConfig {
  sessions?: Session[];
  tasks?: Task[];
  autoGenerateIds?: boolean;
  simulateConstraints?: boolean;
}

/**
 * Test helpers for Database service
 */
export interface TestDatabaseHelpers {
  addSession(session: Session): void;
  addTask(task: Task): void;
  getAllSessions(): Session[];
  getAllTasks(): Task[];
  reset(): void;
}

/**
 * Creates a test Database service for use in tests
 * @param config - Configuration for the test service
 * @returns A DatabaseService with test helpers
 */
export function createTestDatabaseService(config: TestDatabaseConfig = {}): DatabaseService & TestDatabaseHelpers {
  const { sessions = [], tasks = [], autoGenerateIds = true, simulateConstraints = false } = config;

  const sessionStore = new Map(sessions.map((s) => [s.id, s]));
  const taskStore = new Map(tasks.map((t) => [t.id, t]));
  let idCounter = 1000;

  /**
   *
   */
  function generateId(prefix: string): string {
    return autoGenerateIds ? `${prefix}-${idCounter++}` : `${prefix}-${Date.now()}`;
  }

  return {
    /**
     *
     */
    async createSession(initialData?: Partial<Session>): Promise<Session> {
      const session: Session = {
        id: initialData?.id || generateId('session'),
        status: initialData?.status || 'OPEN',
        createdAt: new Date(),
        deadline: initialData?.deadline || null,
        rawPlan: initialData?.rawPlan || null,
      };

      if (simulateConstraints && sessionStore.has(session.id)) {
        throw new Error(`Session with id ${session.id} already exists`);
      }

      sessionStore.set(session.id, session);
      return session;
    },

    /**
     *
     */
    async retrieveSession(sessionId: string): Promise<Session | null> {
      return sessionStore.get(sessionId) || null;
    },

    /**
     *
     */
    async updateSession(sessionId: string, data: Partial<Session>): Promise<Session> {
      const session = sessionStore.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const updated = { ...session, ...data };
      sessionStore.set(sessionId, updated);
      return updated;
    },

    /**
     *
     */
    async listTasks(sessionId: string): Promise<Task[]> {
      const sessionTasks = Array.from(taskStore.values())
        .filter((t) => t.sessionId === sessionId)
        .sort((a, b) => a.order - b.order);
      return sessionTasks;
    },

    /**
     *
     */
    async insertTask(sessionId: string, description: string, order?: number): Promise<Task> {
      const sessionTasks = Array.from(taskStore.values()).filter((t) => t.sessionId === sessionId);

      const maxOrder = sessionTasks.length > 0 ? Math.max(...sessionTasks.map((t) => t.order)) : -1;

      const task: Task = {
        id: generateId('task'),
        sessionId,
        description,
        order: order !== undefined ? order : maxOrder + 1,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
        rawReactHistory: null,
      };

      taskStore.set(task.id, task);

      // Update session's rawPlan
      const session = sessionStore.get(sessionId);
      if (session) {
        const plan = session.rawPlan ? JSON.parse(session.rawPlan) : [];
        plan.push(task);
        session.rawPlan = JSON.stringify(plan);
      }

      return task;
    },

    /**
     *
     */
    async updateTask(taskId: string, data: Partial<Task>): Promise<Task> {
      const task = taskStore.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      const updated = { ...task, ...data, updatedAt: new Date() };
      taskStore.set(taskId, updated);

      // Update in session's rawPlan if it exists
      const session = sessionStore.get(task.sessionId);
      if (session && session.rawPlan) {
        const plan = JSON.parse(session.rawPlan);
        const taskIndex = plan.findIndex((t: Task) => t.id === taskId);
        if (taskIndex !== -1) {
          plan[taskIndex] = updated;
          session.rawPlan = JSON.stringify(plan);
        }
      }

      return updated;
    },

    /**
     *
     */
    async updateTaskStatus(taskId: string, newStatus: TaskStatus): Promise<Task | null> {
      const task = taskStore.get(taskId);
      if (!task) {
        return null;
      }

      const updated = { ...task, status: newStatus, updatedAt: new Date() };
      taskStore.set(taskId, updated);

      // Update in session's rawPlan if it exists
      const session = sessionStore.get(task.sessionId);
      if (session && session.rawPlan) {
        const plan = JSON.parse(session.rawPlan);
        const taskIndex = plan.findIndex((t: Task) => t.id === taskId);
        if (taskIndex !== -1) {
          plan[taskIndex] = updated;
          session.rawPlan = JSON.stringify(plan);
        }
      }

      return updated;
    },

    // Test helpers
    /**
     *
     */
    addSession(session: Session): void {
      sessionStore.set(session.id, session);
    },

    /**
     *
     */
    addTask(task: Task): void {
      taskStore.set(task.id, task);
    },

    /**
     *
     */
    getAllSessions(): Session[] {
      return Array.from(sessionStore.values());
    },

    /**
     *
     */
    getAllTasks(): Task[] {
      return Array.from(taskStore.values());
    },

    /**
     *
     */
    reset(): void {
      sessionStore.clear();
      taskStore.clear();
      sessions.forEach((s) => sessionStore.set(s.id, s));
      tasks.forEach((t) => taskStore.set(t.id, t));
      idCounter = 1000;
    },
  };
}
