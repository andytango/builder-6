import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAgentService } from './index.js';
import { createLLMRunnerWithConfig } from '../llm-runner/index.js';
import { createTestConfig } from '../config/index.js';
import { createTestGitHubService } from '../github/index.js';
import { createTestDockerService } from '../docker/index.js';
import { createTestDatabaseService } from '../database/index.js';
import { createLLMToolsService } from '../llm-tools/index.js';
import { createTestLLMRunner } from '../llm-runner/index.js';
import type { AgentService, ReactHistoryItem } from './index.js';
import type { Task } from '../database/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
// Environment variables are loaded in vitest.config.ts

/**
 * Evaluation metrics for agent performance
 */
interface EvaluationMetrics {
  planningTime: number;
  executionTime: number;
  totalLLMCalls: number;
  toolCallsCount: number;
  successRate: number;
  tasksCompleted: number;
  totalTasks: number;
  errors: string[];
  reactHistory: ReactHistoryItem[];
}

/**
 * Realistic coding scenarios for testing
 */
const CODING_SCENARIOS = [
  {
    name: 'Create REST API with validation',
    prompt: `Create a simple REST API server with the following requirements:
      1. Create an Express.js server on port 3000
      2. Add a POST /api/users endpoint that accepts JSON with name and email
      3. Validate that email is valid format and name is at least 2 characters
      4. Return 400 for invalid input with error details
      5. Return 201 with the created user (add an id field)
      6. Add a GET /api/users/:id endpoint to retrieve a user
      7. Store users in memory (no database needed)
      8. Add proper error handling and logging`,
    expectedTasks: [
      'Initialize npm project',
      'Install Express and validation dependencies',
      'Create server file with Express setup',
      'Implement POST /api/users endpoint',
      'Add input validation',
      'Implement GET /api/users/:id endpoint',
      'Add error handling middleware',
      'Test the endpoints',
    ],
  },
  {
    name: 'React Component with Tests',
    prompt: `Create a React Todo List component with the following features:
      1. TodoList component that displays a list of todos
      2. Each todo has id, text, and completed status
      3. Add todo functionality with input field and button
      4. Toggle completion status when clicking a todo
      5. Delete todo functionality with a delete button
      6. Filter todos by all/active/completed
      7. Use TypeScript for type safety
      8. Write unit tests using Jest and React Testing Library
      9. Ensure at least 90% code coverage`,
    expectedTasks: [
      'Set up React project with TypeScript',
      'Install testing dependencies',
      'Create TodoList component',
      'Implement add todo functionality',
      'Implement toggle completion',
      'Implement delete functionality',
      'Add filtering feature',
      'Write comprehensive unit tests',
      'Check code coverage',
    ],
  },
];

describe('Agent Evaluation - Realistic Coding Scenarios', () => {
  let agentService: AgentService;
  let evaluationResults: Record<string, EvaluationMetrics> = {};
  let outputDir: string;

  beforeAll(async () => {
    // Create output directory for evaluation results
    outputDir = path.join(process.cwd(), 'evaluation-results', new Date().toISOString().split('T')[0]);
    await fs.mkdir(outputDir, { recursive: true });

    // Check which LLM provider to use based on available API keys
    let provider: 'gemini' | 'openai' | 'claude' | undefined;
    let apiKey: string | undefined;

    // Try to determine provider from available API keys
    if (process.env.GEMINI_API_KEY) {
      provider = 'gemini';
      apiKey = process.env.GEMINI_API_KEY;
    } else if (process.env.OPENAI_API_KEY) {
      provider = 'openai';
      apiKey = process.env.OPENAI_API_KEY;
    } else if (process.env.ANTHROPIC_API_KEY) {
      provider = 'claude';
      apiKey = process.env.ANTHROPIC_API_KEY;
    }

    // Allow override with TEST_LLM_PROVIDER
    if (process.env.TEST_LLM_PROVIDER) {
      provider = process.env.TEST_LLM_PROVIDER as 'gemini' | 'openai' | 'claude';
      // Get the appropriate API key for the specified provider
      if (provider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
      else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY;
      else if (provider === 'claude') apiKey = process.env.ANTHROPIC_API_KEY;
    }

    if (!apiKey || !provider) {
      console.warn('⚠️  No API keys found in environment, using mock services');
      console.warn('   Add to .env.test or .env:');
      console.warn('     GEMINI_API_KEY=your-key');
      console.warn('     OPENAI_API_KEY=sk-...');
      console.warn('     ANTHROPIC_API_KEY=sk-ant-...');
      console.warn('   Optionally set TEST_LLM_PROVIDER=gemini|openai|claude to choose provider');
      return;
    }

    console.log(`🤖 Using ${provider.toUpperCase()} provider for evaluation`);

    // Initialize services
    const githubService = createTestGitHubService();
    const dockerService = createTestDockerService();
    const databaseService = createTestDatabaseService({ autoGenerateIds: true });

    // Mock external commands for safety in tests
    /**
     *
     */
    const shellCommand = async (args: { command: string }): Promise<{ stdout: string; stderr: string }> => {
      console.log(`  🔧 Shell: ${args.command}`);
      // Mock responses for common commands
      if (args.command.includes('npm init')) {
        return { stdout: 'package.json created', stderr: '' };
      }
      if (args.command.includes('npm install')) {
        return { stdout: 'packages installed', stderr: '' };
      }
      if (args.command.includes('npm test')) {
        return { stdout: 'tests passed', stderr: '' };
      }
      return { stdout: 'done', stderr: '' };
    };

    /**
     *
     */
    const webFetch = async (args: { url: string }): Promise<{ body: string; status: number }> => {
      return { body: `Mock content from ${args.url}`, status: 200 };
    };

    /**
     *
     */
    const googleSearch = async (args: { query: string }): Promise<{ results: string[] }> => {
      return { results: [`Result 1 for: ${args.query}`, `Result 2 for: ${args.query}`] };
    };

    // Create tools service
    const toolsService = createLLMToolsService({
      githubService,
      dockerService,
      databaseService,
      shellCommand,
      webFetch,
      googleSearch,
    });

    // Create real LLM runner with tools using the old config interface
    const llmRunner = createLLMRunnerWithConfig({
      provider,
      apiKey,
      model:
        provider === 'gemini' ? 'gemini-1.5-flash' : provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-haiku-20240307',
      temperature: 0.3, // Lower temperature for more consistent results
      maxTokens: 2000,
      tools: toolsService,
    });

    // Create test config
    const config = createTestConfig();

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

  afterAll(async () => {
    // Save evaluation results to file
    const summaryPath = path.join(outputDir, 'evaluation-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(evaluationResults, null, 2), 'utf-8');

    // Generate markdown report
    const reportPath = path.join(outputDir, 'evaluation-report.md');
    const report = generateMarkdownReport(evaluationResults);
    await fs.writeFile(reportPath, report, 'utf-8');

    console.log(`\n📊 Evaluation results saved to: ${outputDir}`);
  });

  // Skip these tests in CI or when no API key is available
  const testCondition = process.env.TEST_API_KEY ? it : it.skip;

  // Mock test that always runs
  it('should work with mock services', async () => {
    const githubService = createTestGitHubService();
    const dockerService = createTestDockerService();
    const databaseService = createTestDatabaseService({ autoGenerateIds: true });

    const shellCommand = vi.fn().mockResolvedValue({ stdout: 'test', stderr: '' });
    const webFetch = vi.fn().mockResolvedValue({ body: 'test', status: 200 });
    const googleSearch = vi.fn().mockResolvedValue({ results: ['test'] });

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

    const mockAgent = createAgentService({
      config,
      llmRunner,
      githubService,
      dockerService,
      databaseService,
      shellCommand,
      webFetch,
      googleSearch,
    });

    // Test planning
    llmRunner.setResponses([JSON.stringify([{ description: 'Test task' }])]);
    const plan = await mockAgent.startPlanning({
      prompt: 'Test prompt',
      repoUrl: 'https://github.com/test/repo',
    });

    expect(plan).toHaveLength(1);
    console.log('✅ Mock evaluation test passed');
  });

  CODING_SCENARIOS.forEach((scenario) => {
    testCondition(
      `should handle scenario: ${scenario.name}`,
      async () => {
        console.log(`\n🚀 Testing scenario: ${scenario.name}`);

        const metrics: EvaluationMetrics = {
          planningTime: 0,
          executionTime: 0,
          totalLLMCalls: 0,
          toolCallsCount: 0,
          successRate: 0,
          tasksCompleted: 0,
          totalTasks: 0,
          errors: [],
          reactHistory: [],
        };

        try {
          // Phase 1: Planning
          const planStartTime = Date.now();
          const plan = await agentService.startPlanning({
            prompt: scenario.prompt,
            repoUrl: 'https://github.com/test/evaluation-repo',
            deadline: new Date(Date.now() + 600000), // 10 minutes
          });
          metrics.planningTime = Date.now() - planStartTime;
          metrics.totalTasks = plan.length;

          console.log(`📋 Generated ${plan.length} tasks in ${metrics.planningTime}ms`);

          // Save plan to file
          const planPath = path.join(outputDir, `${scenario.name.replace(/\s+/g, '-')}-plan.json`);
          await fs.writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');

          // Analyze plan quality
          const planQuality = analyzePlanQuality(plan, scenario.expectedTasks);
          console.log(`📈 Plan quality score: ${planQuality.score.toFixed(2)}%`);

          // Phase 2: Execution
          const execStartTime = Date.now();
          const result = await agentService.executePlan({
            sessionId: plan[0].sessionId,
          });
          metrics.executionTime = Date.now() - execStartTime;
          metrics.reactHistory = result.log;

          // Analyze execution results
          metrics.tasksCompleted = plan.filter((t) => t.status === 'COMPLETED').length;
          metrics.successRate = (metrics.tasksCompleted / metrics.totalTasks) * 100;
          metrics.toolCallsCount = result.log.filter((item) => item.toolCalls && item.toolCalls.length > 0).length;

          // Count LLM calls (approximation based on react history)
          metrics.totalLLMCalls = result.log.length;

          // Collect any errors
          result.log.forEach((item) => {
            if (item.observation && typeof item.observation === 'object' && 'error' in item.observation) {
              metrics.errors.push(String(item.observation.error));
            }
          });

          console.log(`✅ Execution completed in ${metrics.executionTime}ms`);
          console.log(`📊 Success rate: ${metrics.successRate.toFixed(2)}%`);
          console.log(`🔧 Tool calls made: ${metrics.toolCallsCount}`);
          console.log(`🤖 Total LLM calls: ${metrics.totalLLMCalls}`);

          // Save execution log
          const execPath = path.join(outputDir, `${scenario.name.replace(/\s+/g, '-')}-execution.json`);
          await fs.writeFile(execPath, JSON.stringify(result, null, 2), 'utf-8');

          // Store results
          evaluationResults[scenario.name] = metrics;

          // Basic assertions
          expect(metrics.successRate).toBeGreaterThan(0);
          expect(metrics.errors.length).toBeLessThan(metrics.totalTasks);
          expect(result.status).toBeOneOf(['COMPLETED', 'DEADLINE_EXCEEDED']);
        } catch (error) {
          console.error(`❌ Scenario failed: ${(error as Error).message}`);
          metrics.errors.push((error as Error).message);
          evaluationResults[scenario.name] = metrics;
          throw error;
        }
      },
      300000,
    ); // 5 minute timeout per scenario
  });

  it('should generate evaluation summary', () => {
    const hasResults = Object.keys(evaluationResults).length > 0;

    if (hasResults) {
      const summary = generateEvaluationSummary(evaluationResults);
      console.log('\n' + '='.repeat(80));
      console.log('📊 EVALUATION SUMMARY');
      console.log('='.repeat(80));
      console.log(summary);
    } else {
      console.log('\n⚠️  No evaluation results (tests were skipped - set TEST_API_KEY to run)');
    }

    expect(true).toBe(true);
  });
});

/**
 * Analyze plan quality by comparing with expected tasks
 */
function analyzePlanQuality(
  generatedPlan: Task[],
  expectedTasks: string[],
): { score: number; missing: string[]; extra: string[] } {
  const generatedDescriptions = generatedPlan.map((t) => t.description.toLowerCase());
  const expectedLower = expectedTasks.map((t) => t.toLowerCase());

  const missing: string[] = [];
  const found: string[] = [];

  expectedLower.forEach((expected, index) => {
    const keywords = expected.split(/\s+/).filter((w) => w.length > 3);
    const foundMatch = generatedDescriptions.some(
      (desc) => keywords.filter((kw) => desc.includes(kw)).length >= keywords.length * 0.5,
    );

    if (foundMatch) {
      found.push(expectedTasks[index]);
    } else {
      missing.push(expectedTasks[index]);
    }
  });

  const coverage = (found.length / expectedTasks.length) * 100;
  const extraTasks = generatedPlan.length - expectedTasks.length;
  const score = Math.max(0, coverage - Math.abs(extraTasks) * 5);

  return { score, missing, extra: generatedDescriptions.slice(expectedTasks.length) };
}

/**
 * Generate evaluation summary statistics
 */
function generateEvaluationSummary(results: Record<string, EvaluationMetrics>): string {
  const scenarios = Object.entries(results);

  if (scenarios.length === 0) {
    return 'No scenarios evaluated';
  }

  const avgPlanningTime = scenarios.reduce((sum, [_name_, m]) => sum + m.planningTime, 0) / scenarios.length;
  const avgExecutionTime = scenarios.reduce((sum, [_name_, m]) => sum + m.executionTime, 0) / scenarios.length;
  const avgSuccessRate = scenarios.reduce((sum, [_name_, m]) => sum + m.successRate, 0) / scenarios.length;
  const avgToolCalls = scenarios.reduce((sum, [_name_, m]) => sum + m.toolCallsCount, 0) / scenarios.length;
  const avgLLMCalls = scenarios.reduce((sum, [_name_, m]) => sum + m.totalLLMCalls, 0) / scenarios.length;
  const totalErrors = scenarios.reduce((sum, [_name_, m]) => sum + m.errors.length, 0);

  return `
📈 Average Planning Time: ${(avgPlanningTime / 1000).toFixed(2)}s
⚡ Average Execution Time: ${(avgExecutionTime / 1000).toFixed(2)}s
✅ Average Success Rate: ${avgSuccessRate.toFixed(2)}%
🔧 Average Tool Calls: ${avgToolCalls.toFixed(0)}
🤖 Average LLM Calls: ${avgLLMCalls.toFixed(0)}
❌ Total Errors: ${totalErrors}

Scenario Breakdown:
${scenarios
  .map(
    ([name, metrics]) => `
  📦 ${name}
     - Tasks: ${metrics.tasksCompleted}/${metrics.totalTasks} completed
     - Success Rate: ${metrics.successRate.toFixed(2)}%
     - Tool Calls: ${metrics.toolCallsCount}
     - Errors: ${metrics.errors.length}
`,
  )
  .join('')}`;
}

/**
 * Generate markdown report for evaluation results
 */
function generateMarkdownReport(results: Record<string, EvaluationMetrics>): string {
  const timestamp = new Date().toISOString();
  const scenarios = Object.entries(results);

  return `# Agent Evaluation Report

**Generated:** ${timestamp}  
**LLM Provider:** ${process.env.TEST_LLM_PROVIDER || 'Mock'}  
**Scenarios Tested:** ${scenarios.length}

## Executive Summary

${generateEvaluationSummary(results)}

## Performance Analysis

### Native Tool Calling Benefits
- **Efficiency**: Single LLM call per action instead of 3 (reason/act/reflect)
- **Cost Reduction**: ~66% fewer API calls
- **Speed**: Faster execution due to fewer round trips
- **Accuracy**: Direct tool selection by LLM

## Detailed Results

${scenarios
  .map(
    ([name, metrics]) => `
### ${name}

| Metric | Value |
|--------|-------|
| Planning Time | ${(metrics.planningTime / 1000).toFixed(2)}s |
| Execution Time | ${(metrics.executionTime / 1000).toFixed(2)}s |
| Tasks Completed | ${metrics.tasksCompleted}/${metrics.totalTasks} |
| Success Rate | ${metrics.successRate.toFixed(2)}% |
| Tool Calls | ${metrics.toolCallsCount} |
| LLM Calls | ${metrics.totalLLMCalls} |
| Errors | ${metrics.errors.length} |

${
  metrics.errors.length > 0
    ? `
#### Errors Encountered
${metrics.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}
`
    : ''
}
`,
  )
  .join('\n---\n')}

## Recommendations

Based on the evaluation results:

1. **Performance**: ${
    scenarios.length > 0
      ? scenarios.reduce((sum, [_name_, m]) => sum + m.executionTime, 0) / scenarios.length > 60000
        ? 'Consider optimizing execution time'
        : 'Execution time is acceptable'
      : 'No data available'
  }

2. **Success Rate**: ${
    scenarios.length > 0
      ? scenarios.reduce((sum, [_name_, m]) => sum + m.successRate, 0) / scenarios.length < 80
        ? 'Investigate failure patterns'
        : 'Good success rate'
      : 'No data available'
  }

3. **Tool Usage**: ${
    scenarios.length > 0
      ? scenarios.reduce((sum, [_name_, m]) => sum + m.toolCallsCount, 0) / scenarios.length > 50
        ? 'Consider batching operations'
        : 'Tool usage is efficient'
      : 'No data available'
  }
`;
}

// Add custom matcher for Vitest
import { vi } from 'vitest';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Vi {
    interface Assertion {
      toBeOneOf(expected: unknown[]): void;
    }
  }
}

expect.extend({
  /**
   *
   */
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    return {
      pass,
      /**
       *
       */
      message: (): string =>
        pass
          ? `Expected ${received} not to be one of ${expected.join(', ')}`
          : `Expected ${received} to be one of ${expected.join(', ')}`,
    };
  },
});
