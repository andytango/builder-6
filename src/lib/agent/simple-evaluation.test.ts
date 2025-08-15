import { describe, it, expect, vi } from 'vitest';
import { createAgentService } from './index.js';
import { createTestLLMRunner } from '../llm-runner/index.js';
import { createTestGitHubService } from '../github/index.js';
import { createTestDockerService } from '../docker/index.js';
import { createTestDatabaseService } from '../database/index.js';
import { createLLMToolsService } from '../llm-tools/index.js';
import { createTestConfig } from '../config/index.js';
import type { ToolCall } from '../llm-runner/index.js';

/**
 * Simple evaluation test that demonstrates the agent workflow
 */
describe('Agent Simple Evaluation', () => {
  it('should demonstrate complete agent workflow with mocked services', async () => {
    console.log('\n🚀 Starting Agent Evaluation Demo\n');

    // Step 1: Create all test services
    const githubService = createTestGitHubService();
    const dockerService = createTestDockerService();
    const databaseService = createTestDatabaseService({ autoGenerateIds: true });

    // Mock external commands
    const shellCommand = vi.fn().mockImplementation((args: { command: string }) => {
      console.log(`  🔧 Shell: ${args.command}`);
      if (args.command.includes('npm init')) {
        return Promise.resolve({ stdout: 'package.json created', stderr: '' });
      }
      if (args.command.includes('npm install')) {
        return Promise.resolve({ stdout: 'added 50 packages', stderr: '' });
      }
      if (args.command.includes('npm test')) {
        return Promise.resolve({ stdout: '✓ 10 tests passed', stderr: '' });
      }
      return Promise.resolve({ stdout: 'done', stderr: '' });
    });

    const webFetch = vi.fn().mockResolvedValue({ body: 'content', status: 200 });
    const googleSearch = vi.fn().mockResolvedValue({ results: ['result1', 'result2'] });

    // Create tools service
    const toolsService = createLLMToolsService({
      githubService,
      dockerService,
      databaseService,
      shellCommand,
      webFetch,
      googleSearch,
    });

    // Create test LLM runner
    const llmRunner = createTestLLMRunner({
      tools: toolsService,
    });

    // Create test config
    const config = createTestConfig();

    // Create agent
    const agentService = createAgentService({
      config,
      llmRunner,
      githubService,
      dockerService,
      databaseService,
      shellCommand,
      webFetch,
      googleSearch,
    });

    // Step 2: Planning Phase
    console.log('📋 PLANNING PHASE\n');

    const mockPlan = [
      { description: 'Initialize npm project' },
      { description: 'Install Express framework' },
      { description: 'Create server.js file' },
      { description: 'Add API endpoints' },
      { description: 'Write tests' },
    ];

    llmRunner.setResponses([JSON.stringify(mockPlan)]);

    const plan = await agentService.startPlanning({
      prompt: 'Create a simple REST API server',
      repoUrl: 'https://github.com/test/demo',
    });

    expect(plan).toHaveLength(5);
    console.log('✅ Created plan with', plan.length, 'tasks:');
    plan.forEach((task, i) => {
      console.log(`   ${i + 1}. ${task.description}`);
    });

    // Step 3: Execution Phase
    console.log('\n⚡ EXECUTION PHASE\n');

    // Set up tool calls for execution
    const toolCalls: ToolCall[] = [
      { id: '1', name: 'run_shell_command', arguments: { command: 'npm init -y' } },
      { id: '2', name: 'run_shell_command', arguments: { command: 'npm install express' } },
      { id: '3', name: 'run_shell_command', arguments: { command: 'echo "server created" > server.js' } },
      { id: '4', name: 'run_shell_command', arguments: { command: 'echo "endpoints added"' } },
      { id: '5', name: 'run_shell_command', arguments: { command: 'npm test' } },
    ];

    // Queue responses for each task
    llmRunner.setToolCallResponses(toolCalls);
    llmRunner.setResponses(['TASK_COMPLETE', 'TASK_COMPLETE', 'TASK_COMPLETE', 'TASK_COMPLETE', 'TASK_COMPLETE']);

    const result = await agentService.executePlan({
      sessionId: plan[0].sessionId,
    });

    expect(result.status).toBe('COMPLETED');
    console.log('✅ Execution completed successfully');

    // Step 4: Analyze Results
    console.log('\n📊 ANALYSIS\n');

    // Count tool usage
    const toolUsage: Record<string, number> = {};
    result.log.forEach((item) => {
      if (item.toolCalls) {
        item.toolCalls.forEach((toolCall) => {
          const tool = toolCall.name;
          toolUsage[tool] = (toolUsage[tool] || 0) + 1;
        });
      }
    });

    console.log('Tool Usage Statistics:');
    Object.entries(toolUsage).forEach(([tool, count]) => {
      console.log(`  - ${tool}: ${count} calls`);
    });

    // Verify all shell commands were called
    expect(shellCommand).toHaveBeenCalledTimes(5);
    expect(shellCommand).toHaveBeenCalledWith({ command: 'npm init -y' });
    expect(shellCommand).toHaveBeenCalledWith({ command: 'npm install express' });
    expect(shellCommand).toHaveBeenCalledWith({ command: 'npm test' });

    console.log('\n✅ All assertions passed!');

    // Step 5: Summary
    console.log('\n' + '='.repeat(50));
    console.log('EVALUATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Tasks Planned: ${plan.length}`);
    console.log(`Tasks Executed: ${result.log.length}`);
    console.log(`Tool Calls: ${Object.values(toolUsage).reduce((a, b) => a + b, 0)}`);
    console.log(`Final Status: ${result.status}`);
    console.log('='.repeat(50));
  });

  it('should handle errors gracefully', async () => {
    console.log('\n🔥 Testing Error Handling\n');

    const githubService = createTestGitHubService();
    const dockerService = createTestDockerService();
    const databaseService = createTestDatabaseService({ autoGenerateIds: true });

    const shellCommand = vi.fn().mockRejectedValue(new Error('Command failed'));
    const webFetch = vi.fn();
    const googleSearch = vi.fn();

    const toolsService = createLLMToolsService({
      githubService,
      dockerService,
      databaseService,
      shellCommand,
      webFetch,
      googleSearch,
    });

    const llmRunner = createTestLLMRunner({ tools: toolsService });
    const config = createTestConfig();

    const agentService = createAgentService({
      config,
      llmRunner,
      githubService,
      dockerService,
      databaseService,
      shellCommand,
      webFetch,
      googleSearch,
    });

    // Create a simple plan
    llmRunner.setResponses([JSON.stringify([{ description: 'Run failing command' }])]);

    const plan = await agentService.startPlanning({
      prompt: 'Test error handling',
      repoUrl: 'https://github.com/test/error',
    });

    // Try to execute with failing tool
    const toolCall: ToolCall = {
      id: 'fail',
      name: 'run_shell_command',
      arguments: { command: 'this-will-fail' },
    };

    llmRunner.setToolCallResponses([toolCall]);
    llmRunner.setResponses(['TASK_COMPLETE']);

    // Execute plan with failing tool
    const result = await agentService.executePlan({ sessionId: plan[0].sessionId });

    // Check that error was handled gracefully
    expect(result.status).toBe('COMPLETED');
    expect(result.log).toBeDefined();
    expect(result.log.length).toBeGreaterThan(0);

    // Verify error was captured in the log
    const hasError = result.log.some(
      (item) =>
        item.observation &&
        typeof item.observation === 'object' &&
        Array.isArray(item.observation) &&
        item.observation.some((obs: unknown) => {
          const o = obs as { error?: unknown };
          return o.error !== undefined;
        }),
    );
    expect(hasError).toBe(true);

    console.log('✅ Error handling verified');
  });

  it('should work with different LLM providers', () => {
    console.log('\n🤖 Testing LLM Provider Compatibility\n');

    const providers: Array<'gemini' | 'openai' | 'claude'> = ['gemini', 'openai', 'claude'];

    providers.forEach((provider) => {
      const llmRunner = createTestLLMRunner({
        provider,
        defaultResponse: `Response from ${provider}`,
      });

      const config = llmRunner.getConfig();
      expect(config.provider).toBe(provider);
      console.log(`✅ ${provider} provider configured`);
    });

    console.log('\nAll providers tested successfully!');
  });
});
