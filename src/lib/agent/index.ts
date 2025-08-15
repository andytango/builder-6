/**
 * Agent service for AI-driven task orchestration
 */

import type { LLMRunnerService, ToolCall } from '../llm-runner/index.js';
import type { GitHubService } from '../github/index.js';
import type { DockerService } from '../docker/index.js';
import type { DatabaseService, Task, Session } from '../database/index.js';
import { createLLMToolsService } from '../llm-tools/index.js';
import { createLLMRunnerWithConfig } from '../llm-runner/index.js';
import { ApplicationConfig } from '../config/index.js';

/**
 * Options for starting planning
 */
export interface PlanningOptions {
  prompt: string;
  repoUrl: string;
  deadline?: Date;
}

/**
 * Options for refining a plan
 */
export interface RefinementOptions {
  sessionId: string;
  refinementPrompt: string;
}

/**
 * Options for executing a plan
 */
export interface ExecutionOptions {
  sessionId: string;
}

/**
 * Result of plan execution
 */
export interface ExecutionResult {
  status: Session['status'];
  log: ReactHistoryItem[];
}

/**
 * React history item for tracking execution
 */
export interface ReactHistoryItem {
  toolCalls?: ToolCall[];
  toolResults?: Array<{ toolCallId: string; result: unknown }>;
  content?: string;
  observation: unknown;
}

/**
 * Agent service interface
 */
export interface AgentService {
  startPlanning(options: PlanningOptions): Promise<Task[]>;
  refinePlan(options: RefinementOptions): Promise<Task[]>;
  executePlan(options: ExecutionOptions): Promise<ExecutionResult>;
}

/**
 * Dependencies for the agent service
 */
export interface AgentDependencies {
  config?: ApplicationConfig;
  llmRunner: LLMRunnerService;
  githubService: GitHubService;
  dockerService: DockerService;
  databaseService: DatabaseService;
  shellCommand?: (args: { command: string }) => Promise<unknown>;
  webFetch?: (args: { url: string }) => Promise<unknown>;
  googleSearch?: (args: { query: string }) => Promise<unknown>;
}

/**
 * Creates an Agent service
 * @param deps - Dependencies for the agent service
 * @returns An AgentService instance
 */
export function createAgentService(deps: AgentDependencies): AgentService {
  const {
    llmRunner,
    githubService,
    dockerService,
    databaseService,
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

  // Create tools service with dependencies
  const toolsService = createLLMToolsService({
    githubService,
    dockerService,
    databaseService,
    shellCommand,
    webFetch,
    googleSearch,
  });

  // Check if injected llmRunner already has tool support (for tests)
  let llmRunnerWithTools: LLMRunnerService;
  if ('generateWithTools' in llmRunner && 'executeToolCalls' in llmRunner) {
    llmRunnerWithTools = llmRunner as LLMRunnerService;
  } else if ('getConfig' in llmRunner) {
    const llmConfig = (llmRunner as LLMRunnerService).getConfig();
    llmRunnerWithTools = createLLMRunnerWithConfig({
      ...llmConfig,
      tools: toolsService,
    });
  } else {
    throw new Error('Invalid LLM runner');
  }

  /**
   * Executes a task with native tool calling
   */
  async function executeTaskWithReact(
    session: Session,
    task: Task,
  ): Promise<{ status: Task['status']; reactHistory: ReactHistoryItem[] }> {
    let reactHistory: ReactHistoryItem[] = task.rawReactHistory ? JSON.parse(task.rawReactHistory) : [];

    // Limit history to prevent prompt size explosion and 503 errors
    const MAX_HISTORY_ITEMS = 5;
    
    while (true) {
      // Truncate history for prompt to avoid token limits
      const recentHistory = reactHistory.slice(-MAX_HISTORY_ITEMS);
      
      // Create a summary of older history if needed
      const historySummary = reactHistory.length > MAX_HISTORY_ITEMS 
        ? `[Previous ${reactHistory.length - MAX_HISTORY_ITEMS} actions completed]\n`
        : '';
      
      // Create concise prompt to reduce token usage
      const prompt = `Task: ${task.description}
${historySummary}Recent Actions: ${recentHistory.length > 0 ? recentHistory.map(h => h.content || 'Tool call').join('; ') : 'None'}
Use tools to complete task. Say "TASK_COMPLETE" when done.`;

      // Single LLM call with tool support
      const response = await llmRunnerWithTools.generateWithTools!(prompt);

      let observation: unknown = null;
      let toolResults: Array<{ toolCallId: string; result: unknown }> = [];

      // If tool calls were made, execute them
      if (response.toolCalls && response.toolCalls.length > 0) {
        toolResults = await llmRunnerWithTools.executeToolCalls!(response.toolCalls);
        observation = toolResults.map((r) => r.result);
      }

      // Update history
      const historyItem: ReactHistoryItem = {
        toolCalls: response.toolCalls,
        toolResults,
        content: response.content,
        observation,
      };
      reactHistory.push(historyItem);
      await databaseService.updateTask(task.id, { rawReactHistory: JSON.stringify(reactHistory) });

      // Check for completion signal in response content
      if (response.content?.includes('TASK_COMPLETE')) {
        return { status: 'COMPLETED', reactHistory };
      }

      // Safety check - prevent infinite loops
      if (reactHistory.length > 50) {
        return { status: 'FAILED', reactHistory };
      }
    }
  }

  return {
    /**
     *
     */
    async startPlanning(options: PlanningOptions): Promise<Task[]> {
      const session = await databaseService.createSession({
        status: 'PLANNING',
        deadline: options.deadline || null,
      });

      // TODO: Create a container and get the source files from it.
      const _allSourceFiles_ = 'No container created yet';

      // Keep prompt concise to avoid token limits and reduce 503 errors
      const planningPrompt = `Generate a plan for: ${options.prompt}

Repository: ${options.repoUrl}

Output JSON array of tasks:
[{"description": "specific actionable task"}]

Keep it concise.`;

      // Use generateJSON if available, otherwise fall back to generateContent with parsing
      let planTasks: { description: string }[];

      if (llmRunner.generateJSON) {
        planTasks = (await llmRunner.generateJSON(planningPrompt)) as { description: string }[];
      } else {
        const response = await llmRunner.generateContent(planningPrompt);
        // Try to parse response, handling markdown-wrapped JSON
        try {
          planTasks = JSON.parse(response);
        } catch {
          // Fallback: try to extract JSON from markdown code blocks
          const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            planTasks = JSON.parse(jsonMatch[1]);
          } else {
            throw new Error('Failed to parse planning response as JSON');
          }
        }
      }

      const plan: Task[] = [];
      for (const taskData of planTasks) {
        const task = await databaseService.insertTask(session.id, taskData.description);
        plan.push(task);
      }

      await databaseService.updateSession(session.id, {
        rawPlan: JSON.stringify(plan),
        status: 'AWAITING_CONFIRMATION',
      });

      return plan;
    },

    /**
     *
     */
    async refinePlan(options: RefinementOptions): Promise<Task[]> {
      const session = await databaseService.retrieveSession(options.sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const oldPlan = session.rawPlan ? JSON.parse(session.rawPlan) : [];

      // Keep refinement prompt concise to avoid token limits
      const taskDescriptions = oldPlan.map((t: Task) => t.description).join(', ');
      const refinementPrompt = `Current tasks: ${taskDescriptions}
Feedback: ${options.refinementPrompt}

Output revised JSON array:
[{"description": "task"}]`;

      // Use generateJSON if available, otherwise fall back to generateContent with parsing
      let newPlanTasks: { description: string }[];

      if (llmRunner.generateJSON) {
        newPlanTasks = (await llmRunner.generateJSON(refinementPrompt)) as { description: string }[];
      } else {
        const response = await llmRunner.generateContent(refinementPrompt);
        // Try to parse response, handling markdown-wrapped JSON
        try {
          newPlanTasks = JSON.parse(response);
        } catch {
          // Fallback: try to extract JSON from markdown code blocks
          const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            newPlanTasks = JSON.parse(jsonMatch[1]);
          } else {
            throw new Error('Failed to parse refinement response as JSON');
          }
        }
      }

      // TODO: This should be a more sophisticated update, not just a replacement.
      const newPlan: Task[] = [];
      for (const taskData of newPlanTasks) {
        const task = await databaseService.insertTask(session.id, taskData.description);
        newPlan.push(task);
      }

      await databaseService.updateSession(session.id, {
        rawPlan: JSON.stringify(newPlan),
      });

      return newPlan;
    },

    /**
     *
     */
    async executePlan(options: ExecutionOptions): Promise<ExecutionResult> {
      let session = await databaseService.retrieveSession(options.sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      if (session.status !== 'AWAITING_CONFIRMATION') {
        throw new Error('Session is not awaiting confirmation');
      }

      session = await databaseService.updateSession(session.id, { status: 'EXECUTING' });

      const plan: Task[] = session.rawPlan ? JSON.parse(session.rawPlan) : [];
      const log: ReactHistoryItem[] = [];

      while (session.status === 'EXECUTING') {
        if (session.deadline && new Date() > new Date(session.deadline)) {
          session = await databaseService.updateSession(session.id, { status: 'DEADLINE_EXCEEDED' });
          break;
        }

        const pendingTasks = plan.filter((task) => task.status === 'PENDING');

        if (pendingTasks.length === 0) {
          session = await databaseService.updateSession(session.id, { status: 'COMPLETED' });
          break;
        }

        const currentTask = pendingTasks[0];
        await databaseService.updateTask(currentTask.id, { status: 'IN_PROGRESS' });
        currentTask.status = 'IN_PROGRESS'; // Update local copy

        const taskResult = await executeTaskWithReact(session, currentTask);
        log.push(...taskResult.reactHistory);

        await databaseService.updateTask(currentTask.id, { status: taskResult.status });
        currentTask.status = taskResult.status; // Update local copy
      }

      return { status: session.status, log };
    },
  };
}
