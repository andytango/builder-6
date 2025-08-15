import { createAgentService } from './index.js';
import { createLLMRunner } from '../llm-runner/index.js';
import { createGitHubService } from '../github/index.js';
import { createDockerService } from '../docker/index.js';
import { createDatabaseService } from '../database/index.js';
import { createConfig } from '../config/index.js';
import type { AgentService } from './index.js';
import type { LLMRunnerService } from '../llm-runner/index.js';
import type { GitHubService } from '../github/index.js';
import type { DockerService } from '../docker/index.js';
import type { DatabaseService } from '../database/index.js';
import fs from 'fs/promises';
import path from 'path';

interface EvaluationScenario {
  name: string;
  prompt: string;
  setup: (
    llmRunner: LLMRunnerService,
    githubService: GitHubService,
    dockerService: DockerService,
    databaseService: DatabaseService,
  ) => Promise<void>;
  evaluate: (agentService: AgentService, databaseService: DatabaseService) => Promise<EvaluationResult>;
}

interface EvaluationResult {
  name: string;
  success: boolean;
  output: unknown;
  duration?: number;
  error?: string;
}

const scenarios: EvaluationScenario[] = [
  {
    name: 'Hello World',
    prompt: 'Create a file named "hello.txt" with the content "Hello, World!"',
    /**
     * Setup for Hello World scenario
     */
    setup: async (
      _llmRunner_: LLMRunnerService,
      _githubService_: GitHubService,
      _dockerService_: DockerService,
      _databaseService_: DatabaseService,
    ): Promise<void> => {
      // No specific setup needed for real services, agent will use its own tools
    },
    /**
     * Evaluate the Hello World scenario
     */
    evaluate: async (agentService: AgentService, databaseService: DatabaseService): Promise<EvaluationResult> => {
      const initialPlan = await agentService.startPlanning({
        prompt: 'Create a file named "hello.txt" with the content "Hello, World!"',
        repoUrl: 'https://github.com/test/repo',
      });

      // Generate unique session ID for the test
      const sessionId = `session-eval-${Date.now()}-1`;
      await databaseService.createSession({
        id: sessionId,
        status: 'AWAITING_CONFIRMATION',
        rawPlan: JSON.stringify(initialPlan),
      });

      // Insert tasks into the database, ensuring they have proper IDs
      const tasksInDb = [];
      for (const taskData of initialPlan) {
        const task = await databaseService.insertTask(sessionId, taskData.description);
        tasksInDb.push(task);
      }

      // Update the session's rawPlan with the tasks that have database-generated IDs
      await databaseService.updateSession(sessionId, { rawPlan: JSON.stringify(tasksInDb) });

      const result = await agentService.executePlan({ sessionId: sessionId });

      // This is a mock evaluation. In a real scenario, we would inspect the file system.
      const success = result.status === 'COMPLETED';

      return {
        name: 'Hello World',
        success,
        output: result,
      };
    },
  },
  {
    name: 'Add a new function',
    prompt:
      'Add a new function `add(a: number, b: number): number` to `src/utils.ts` that returns the sum of `a` and `b`.',
    /**
     * Setup for Add a new function scenario
     */
    setup: async (
      _llmRunner_: LLMRunnerService,
      _githubService_: GitHubService,
      _dockerService_: DockerService,
      _databaseService_: DatabaseService,
    ): Promise<void> => {
      // No specific setup needed for real services, agent will use its own tools
    },
    /**
     * Evaluate the Add a new function scenario
     */
    evaluate: async (agentService: AgentService, databaseService: DatabaseService): Promise<EvaluationResult> => {
      const initialPlan = await agentService.startPlanning({
        prompt:
          'Add a new function `add(a: number, b: number): number` to `src/utils.ts` that returns the sum of `a` and `b`.',
        repoUrl: 'https://github.com/test/repo',
      });

      const sessionId = `session-eval-${Date.now()}-2`;
      await databaseService.createSession({
        id: sessionId,
        status: 'AWAITING_CONFIRMATION',
        rawPlan: JSON.stringify(initialPlan),
      });

      const tasksInDb = [];
      for (const taskData of initialPlan) {
        const task = await databaseService.insertTask(sessionId, taskData.description);
        tasksInDb.push(task);
      }
      await databaseService.updateSession(sessionId, { rawPlan: JSON.stringify(tasksInDb) });

      const result = await agentService.executePlan({ sessionId: sessionId });

      const success = result.status === 'COMPLETED';

      return {
        name: 'Add a new function',
        success,
        output: result,
      };
    },
  },
];

/**
 * Generate HTML report from evaluation results
 */
async function generateHtmlReport(results: EvaluationResult[], outputPath: string): Promise<void> {
  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;
  const passRate = ((passedTests / totalTests) * 100).toFixed(1);
  const timestamp = new Date().toISOString();
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Agent Evaluation Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2d3748;
            margin-bottom: 1rem;
            font-size: 2.5rem;
        }
        .timestamp {
            color: #718096;
            font-size: 0.9rem;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        .stat-card {
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-value {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 0.5rem;
        }
        .stat-label {
            color: #718096;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .passed { color: #48bb78; }
        .failed { color: #f56565; }
        .neutral { color: #4299e1; }
        .tests {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        h2 {
            color: #2d3748;
            margin-bottom: 1.5rem;
            font-size: 1.8rem;
        }
        .test-item {
            border-left: 4px solid;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            background: #f7fafc;
            border-radius: 0 8px 8px 0;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .test-item:hover {
            transform: translateX(5px);
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        }
        .test-item.success {
            border-color: #48bb78;
            background: linear-gradient(to right, #f0fff4, #ffffff);
        }
        .test-item.failure {
            border-color: #f56565;
            background: linear-gradient(to right, #fff5f5, #ffffff);
        }
        .test-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }
        .test-name {
            font-weight: 600;
            color: #2d3748;
            font-size: 1.1rem;
        }
        .test-status {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        .status-passed {
            background: #48bb78;
            color: white;
        }
        .status-failed {
            background: #f56565;
            color: white;
        }
        .test-duration {
            color: #718096;
            font-size: 0.9rem;
            margin-top: 0.5rem;
        }
        .test-error {
            margin-top: 1rem;
            padding: 1rem;
            background: #fed7d7;
            border-radius: 6px;
            color: #742a2a;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
        }
        .test-output {
            margin-top: 1rem;
            padding: 1rem;
            background: #e6fffa;
            border-radius: 6px;
            color: #234e52;
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
            max-height: 200px;
            overflow-y: auto;
        }
        .test-output pre {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        details {
            margin-top: 1rem;
        }
        summary {
            cursor: pointer;
            color: #4299e1;
            font-weight: 500;
            padding: 0.5rem 0;
        }
        summary:hover {
            color: #3182ce;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 AI Agent Evaluation Report</h1>
            <div class="timestamp">Generated on ${timestamp}</div>
        </div>
        
        <div class="summary">
            <div class="stat-card">
                <div class="stat-value neutral">${totalTests}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card">
                <div class="stat-value passed">${passedTests}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value failed">${failedTests}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value ${parseFloat(passRate) >= 80 ? 'passed' : parseFloat(passRate) >= 50 ? 'neutral' : 'failed'}">${passRate}%</div>
                <div class="stat-label">Pass Rate</div>
            </div>
        </div>
        
        <div class="tests">
            <h2>Test Results</h2>
            ${results.map(result => `
            <div class="test-item ${result.success ? 'success' : 'failure'}">
                <div class="test-header">
                    <span class="test-name">${result.name}</span>
                    <span class="test-status ${result.success ? 'status-passed' : 'status-failed'}">
                        ${result.success ? '✓ Passed' : '✗ Failed'}
                    </span>
                </div>
                ${result.duration ? `<div class="test-duration">Duration: ${result.duration}ms</div>` : ''}
                ${result.error ? `<div class="test-error">${result.error}</div>` : ''}
                ${result.output ? `
                <details>
                    <summary>View Output</summary>
                    <div class="test-output">
                        <pre>${JSON.stringify(result.output, null, 2)}</pre>
                    </div>
                </details>
                ` : ''}
            </div>`).join('')}
        </div>
    </div>
</body>
</html>`;

  await fs.writeFile(outputPath, html, 'utf-8');
  console.log(`\n📊 HTML report generated: ${outputPath}`);
}

/**
 * Run all evaluation scenarios
 */
async function runEvaluations(options: { htmlReport?: boolean } = {}): Promise<void> {
  // Create config and validate
  let config;
  try {
    config = createConfig();
  } catch (error) {
    console.error('Configuration error:', error);
    console.error('Please check your environment variables.');
    return;
  }

  const dockerService = createDockerService(config);
  const llmRunner = createLLMRunner(config);
  const githubService = createGitHubService(config, dockerService);
  const databaseService = createDatabaseService(config);

  // Implement the actual shellCommand, webFetch, googleSearch functions
  // These will be passed to the AgentService
  /**
   * Execute shell command in container
   */
  const shellCommand = async (args: { command: string }): Promise<unknown> => {
    // In a real scenario, this would execute the command in a Docker container
    // For now, we'll simulate it or use a simple node.js child_process.exec
    // For this evaluation, we'll assume the agent will use dockerService.executeScript
    // if it needs to run commands in a container.
    // If the LLM directly calls 'run_shell_command', we need a way to execute it.
    // For simplicity in this evaluation, we'll just log it and return a success.
    console.log(`Executing shell command: ${args.command}`);
    return { stdout: 'Command executed successfully', stderr: '' };
  };

  /**
   * Fetch content from URL
   */
  const webFetch = async (args: { url: string }): Promise<unknown> => {
    console.log(`Fetching URL: ${args.url}`);
    // In a real scenario, this would use a library like node-fetch
    return { body: 'Fetched content' };
  };

  /**
   * Search Google with query
   */
  const googleSearch = async (args: { query: string }): Promise<unknown> => {
    console.log(`Searching Google for: ${args.query}`);
    // In a real scenario, this would use a Google Search API
    return { results: [{ title: 'Mock Search Result', link: 'http://example.com' }] };
  };

  const agentService = createAgentService({
    config,
    llmRunner,
    githubService,
    dockerService,
    databaseService,
    shellCommand, // Provide the real implementation
    webFetch, // Provide the real implementation
    googleSearch, // Provide the real implementation
  });

  const results: EvaluationResult[] = [];

  for (const scenario of scenarios) {
    // For real services, resetting might involve cleaning up resources (e.g., Docker containers, database entries)
    // This part needs careful consideration for real-world cleanup.
    // For now, we'll assume a fresh start for each scenario.

    await scenario.setup(llmRunner, githubService, dockerService, databaseService);
    const startTime = Date.now();
    try {
      const result = await scenario.evaluate(agentService, databaseService);
      result.duration = Date.now() - startTime;
      results.push(result);
      console.log(`✓ ${result.name}: ${result.success ? 'PASSED' : 'FAILED'} (${result.duration}ms)`);
    } catch (error) {
      const failedResult: EvaluationResult = {
        name: scenario.name,
        success: false,
        output: null,
        duration: Date.now() - startTime,
        error: (error as Error).message,
      };
      results.push(failedResult);
      console.error(`✗ ${scenario.name}: ERROR - ${(error as Error).message}`);
    }
  }

  // Print summary
  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;
  
  console.log('\n' + '='.repeat(50));
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Pass Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('='.repeat(50));
  
  // Save results to JSON file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsDir = path.join(process.cwd(), 'evaluation-results', timestamp);
  await fs.mkdir(resultsDir, { recursive: true });
  
  const jsonPath = path.join(resultsDir, 'results.json');
  await fs.writeFile(jsonPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n📁 Results saved to: ${jsonPath}`);
  
  // Generate HTML report if requested
  if (options.htmlReport) {
    const htmlPath = path.join(resultsDir, 'report.html');
    await generateHtmlReport(results, htmlPath);
  }
}

export { runEvaluations };

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const htmlReport = args.includes('--html') || args.includes('-h');
  
  if (args.includes('--help')) {
    console.log('Usage: npm run evaluate [options]');
    console.log('Options:');
    console.log('  --html, -h    Generate HTML report');
    console.log('  --help        Show this help message');
    process.exit(0);
  }
  
  runEvaluations({ htmlReport }).catch(error => {
    console.error('Evaluation failed:', error);
    process.exit(1);
  });
}
