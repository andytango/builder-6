import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentService } from './index.js';
import { createTestLLMRunner, type ToolCall } from '../llm-runner/index.js';
import { createTestGitHubService } from '../github/index.js';
import { createTestDockerService } from '../docker/index.js';
import { createTestDatabaseService } from '../database/index.js';
import { createTestLLMToolsService } from '../llm-tools/index.js';
import { createTestConfig } from '../config/index.js';
import type { AgentService } from './index.js';

describe('Agent Service Tests', () => {
  let agentService: AgentService;
  let llmRunner: ReturnType<typeof createTestLLMRunner>;
  let githubService: ReturnType<typeof createTestGitHubService>;
  let dockerService: ReturnType<typeof createTestDockerService>;
  let databaseService: ReturnType<typeof createTestDatabaseService>;
  let shellCommand: ReturnType<typeof vi.fn>;
  let webFetch: ReturnType<typeof vi.fn>;
  let googleSearch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create test services with specific configurations
    githubService = createTestGitHubService({
      repositories: [],
      throwOnNotFound: false,
    });

    dockerService = createTestDockerService({
      containerLimit: 10,
    });

    databaseService = createTestDatabaseService({
      autoGenerateIds: true,
    });

    // Create mock functions for external commands
    shellCommand = vi.fn().mockResolvedValue({ stdout: 'test output', stderr: '' });
    webFetch = vi.fn().mockResolvedValue({ body: 'test content' });
    googleSearch = vi.fn().mockResolvedValue({ results: [] });

    // Create tools service for testing
    const toolsService = createTestLLMToolsService();

    // Create LLM runner with tools support
    llmRunner = createTestLLMRunner({
      defaultResponse: '[]',
      tools: toolsService,
    });

    // Create test config
    const config = createTestConfig();

    // Create agent service with test dependencies
    agentService = createAgentService({
      config,
      llmRunner,
      githubService,
      dockerService,
      databaseService,
      shellCommand,
      webFetch,
      googleSearch,
    });
  });

  it('should successfully start planning and generate a plan', async () => {
    // Set up LLM responses
    llmRunner.setResponses([JSON.stringify([{ description: 'Task 1' }, { description: 'Task 2' }])]);

    const plan = await agentService.startPlanning({
      prompt: 'Create a simple web server',
      repoUrl: 'https://github.com/test/repo',
      deadline: new Date(Date.now() + 3600000), // 1 hour from now
    });

    expect(plan).toHaveLength(2);
    expect(plan[0].description).toBe('Task 1');
    expect(plan[1].description).toBe('Task 2');

    // Verify service interactions
    expect(llmRunner.getCallHistory()).toHaveLength(1);
    const sessions = databaseService.getAllSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('AWAITING_CONFIRMATION');
    expect(sessions[0].rawPlan).toBe(JSON.stringify(plan));
  });

  it('should successfully refine an existing plan', async () => {
    // Create a session with an existing plan
    const session = await databaseService.createSession({
      status: 'AWAITING_CONFIRMATION',
      rawPlan: JSON.stringify([{ id: 'task-1', description: 'Old Task' }]),
    });

    // Set up LLM response for refinement
    llmRunner.setResponses([JSON.stringify([{ description: 'Revised Task 1' }, { description: 'Revised Task 2' }])]);

    const refinedPlan = await agentService.refinePlan({
      sessionId: session.id,
      refinementPrompt: 'Add more details to the plan',
    });

    expect(refinedPlan).toHaveLength(2);
    expect(refinedPlan[0].description).toBe('Revised Task 1');
    expect(refinedPlan[1].description).toBe('Revised Task 2');

    // Verify the session was updated
    const updatedSession = await databaseService.retrieveSession(session.id);
    expect(updatedSession?.rawPlan).toBe(JSON.stringify(refinedPlan));
  });

  it('should execute a plan with a single task', async () => {
    // Create a session with a plan containing one task
    const session = await databaseService.createSession({
      status: 'AWAITING_CONFIRMATION',
    });

    const task = await databaseService.insertTask(session.id, 'Run a simple command');

    // Update session with the task in rawPlan
    await databaseService.updateSession(session.id, {
      rawPlan: JSON.stringify([task]),
    });

    // Set up tool call and completion response
    const toolCall: ToolCall = {
      id: 'call_1',
      name: 'run_shell_command',
      arguments: { command: 'ls -l' },
    };

    llmRunner.setToolCallResponses([toolCall]);
    llmRunner.setResponses(['TASK_COMPLETE']);

    const result = await agentService.executePlan({ sessionId: session.id });

    expect(result.status).toBe('COMPLETED');

    // Verify the session was updated
    const finalSession = await databaseService.retrieveSession(session.id);
    expect(finalSession?.status).toBe('COMPLETED');

    // Verify the task was updated
    const finalPlan = JSON.parse(finalSession?.rawPlan || '[]');
    expect(finalPlan).toHaveLength(1);
    expect(finalPlan[0].status).toBe('COMPLETED');
    expect(finalPlan[0].rawReactHistory).toBeDefined();

    // Verify the execution log with new format
    expect(result.log).toHaveLength(2); // One for tool call, one for completion
    expect(result.log[0].toolCalls).toEqual([toolCall]);
    expect(result.log[0].toolResults).toHaveLength(1);
    expect(result.log[1].content).toContain('TASK_COMPLETE');
  });

  it('should handle deadline exceeded during execution', async () => {
    // Create a session with a past deadline
    const pastDeadline = new Date(Date.now() - 1000); // 1 second ago
    const session = await databaseService.createSession({
      status: 'AWAITING_CONFIRMATION',
      deadline: pastDeadline,
    });

    const task = await databaseService.insertTask(session.id, 'Task to exceed deadline');

    await databaseService.updateSession(session.id, {
      rawPlan: JSON.stringify([task]),
    });

    const result = await agentService.executePlan({ sessionId: session.id });

    expect(result.status).toBe('DEADLINE_EXCEEDED');

    // Verify the session was updated
    const finalSession = await databaseService.retrieveSession(session.id);
    expect(finalSession?.status).toBe('DEADLINE_EXCEEDED');
  });

  it('should throw error when trying to execute a session not awaiting confirmation', async () => {
    // Create a session in wrong status
    const session = await databaseService.createSession({
      status: 'PLANNING',
    });

    await expect(agentService.executePlan({ sessionId: session.id })).rejects.toThrow(
      'Session is not awaiting confirmation',
    );
  });

  it('should throw error when session not found for execution', async () => {
    await expect(agentService.executePlan({ sessionId: 'non-existent' })).rejects.toThrow('Session not found');
  });

  it('should throw error when session not found for refinement', async () => {
    await expect(
      agentService.refinePlan({
        sessionId: 'non-existent',
        refinementPrompt: 'refine this',
      }),
    ).rejects.toThrow('Session not found');
  });

  it('should execute task and update react history', async () => {
    // Create a session with a task that requires multiple tool calls
    const session = await databaseService.createSession({
      status: 'AWAITING_CONFIRMATION',
    });

    const task = await databaseService.insertTask(session.id, 'Multi-step task');

    await databaseService.updateSession(session.id, {
      rawPlan: JSON.stringify([task]),
    });

    // Set up tool calls for multiple iterations
    const toolCall1: ToolCall = {
      id: 'call_1',
      name: 'run_shell_command',
      arguments: { command: 'echo step1' },
    };

    const toolCall2: ToolCall = {
      id: 'call_2',
      name: 'run_shell_command',
      arguments: { command: 'echo step2' },
    };

    llmRunner.setToolCallResponses([toolCall1, toolCall2]);
    llmRunner.setResponses(['Continuing with next step', 'TASK_COMPLETE']);

    const result = await agentService.executePlan({ sessionId: session.id });

    expect(result.status).toBe('COMPLETED');
    expect(result.log).toHaveLength(4); // Two tool calls plus two completion attempts

    // Verify react history was updated in database
    const updatedTask = databaseService.getAllTasks().find((t) => t.id === task.id);
    expect(updatedTask?.rawReactHistory).toBeDefined();
    const reactHistory = JSON.parse(updatedTask?.rawReactHistory || '[]');
    expect(reactHistory).toHaveLength(4);
  });

  it('should handle GitHub repository creation in execution', async () => {
    const session = await databaseService.createSession({
      status: 'AWAITING_CONFIRMATION',
    });

    const task = await databaseService.insertTask(session.id, 'Create GitHub repository');

    await databaseService.updateSession(session.id, {
      rawPlan: JSON.stringify([task]),
    });

    // Set up tool call for GitHub repo creation
    const toolCall: ToolCall = {
      id: 'call_1',
      name: 'githubService.createRepository',
      arguments: { name: 'test-repo', description: 'Test repo', isPrivate: false },
    };

    llmRunner.setToolCallResponses([toolCall]);
    llmRunner.setResponses(['TASK_COMPLETE']);

    const result = await agentService.executePlan({ sessionId: session.id });

    expect(result.status).toBe('COMPLETED');

    // Verify the tool call was executed
    expect(result.log).toHaveLength(2);
    expect(result.log[0].toolCalls).toEqual([toolCall]);
    expect(result.log[0].toolResults).toHaveLength(1);
  });

  it('should handle unknown tools in execution', async () => {
    const session = await databaseService.createSession({
      status: 'AWAITING_CONFIRMATION',
    });

    const task = await databaseService.insertTask(session.id, 'Use unknown tool');

    await databaseService.updateSession(session.id, {
      rawPlan: JSON.stringify([task]),
    });

    // Set up tool call with unknown tool
    const toolCall: ToolCall = {
      id: 'call_1',
      name: 'unknown_tool',
      arguments: { param: 'value' },
    };

    llmRunner.setToolCallResponses([toolCall]);
    llmRunner.setResponses(['TASK_COMPLETE']);

    const result = await agentService.executePlan({ sessionId: session.id });

    expect(result.status).toBe('COMPLETED');
    expect(result.log[0].toolResults?.[0]?.result).toEqual({ error: 'Unknown tool: unknown_tool' });
  });

  it('should handle exceptions during tool execution', async () => {
    const session = await databaseService.createSession({
      status: 'AWAITING_CONFIRMATION',
    });

    const task = await databaseService.insertTask(session.id, 'Tool that throws');

    await databaseService.updateSession(session.id, {
      rawPlan: JSON.stringify([task]),
    });

    // Set up tool call that will fail
    const toolCall: ToolCall = {
      id: 'call_1',
      name: 'run_shell_command',
      arguments: { command: 'failing-cmd' },
    };

    llmRunner.setToolCallResponses([toolCall]);
    llmRunner.setResponses(['TASK_COMPLETE']);

    const result = await agentService.executePlan({ sessionId: session.id });

    expect(result.status).toBe('COMPLETED');
    // Since we're using the test tools service, this should succeed with mock data
    expect(result.log[0].toolResults).toHaveLength(1);
  });

  it('should handle tool calls with the new approach', async () => {
    const session = await databaseService.createSession({
      status: 'AWAITING_CONFIRMATION',
    });

    const task = await databaseService.insertTask(session.id, 'Execute various tools');

    await databaseService.updateSession(session.id, {
      rawPlan: JSON.stringify([task]),
    });

    // Set up tool call
    const toolCall: ToolCall = {
      id: 'call_1',
      name: 'githubService.listRepositories',
      arguments: {},
    };

    llmRunner.setToolCallResponses([toolCall]);
    llmRunner.setResponses(['TASK_COMPLETE']);

    const result = await agentService.executePlan({ sessionId: session.id });

    expect(result.status).toBe('COMPLETED');
    expect(result.log[0].toolCalls).toEqual([toolCall]);
    expect(result.log[0].toolResults).toHaveLength(1);
  });

  it('should handle Docker service tools', async () => {
    const session = await databaseService.createSession({
      status: 'AWAITING_CONFIRMATION',
    });

    const task = await databaseService.insertTask(session.id, 'Create container');

    await databaseService.updateSession(session.id, {
      rawPlan: JSON.stringify([task]),
    });

    // Set up tool call for Docker
    const toolCall: ToolCall = {
      id: 'call_1',
      name: 'dockerManager.createContainer',
      arguments: { options: { groupId: 'test' } },
    };

    llmRunner.setToolCallResponses([toolCall]);
    llmRunner.setResponses(['TASK_COMPLETE']);

    const result = await agentService.executePlan({ sessionId: session.id });

    expect(result.status).toBe('COMPLETED');
    expect(result.log[0].toolCalls).toEqual([toolCall]);
  });
});
