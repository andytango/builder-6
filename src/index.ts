/**
 * @fileoverview This is the main entry point for the Gemini CLI.
 */

import dotenv from 'dotenv';
dotenv.config();

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Import configuration
import { createConfig, ApplicationConfig } from './lib/config/index.js';

// Import service factories
import { createLLMRunner } from './lib/llm-runner/index.js';
import { createGitHubService } from './lib/github/index.js';
import { createDockerService } from './lib/docker/index.js';
import { createDatabaseService } from './lib/database/index.js';
import { createAgentService } from './lib/agent/index.js';
import { runEvaluations } from './lib/agent/evaluation.js';

// Import types (removed unused types)

// Declare global functions for agent service
declare function run_shell_command(args: { command: string }): Promise<unknown>;
declare function web_fetch(args: { url: string }): Promise<unknown>;
declare function google_web_search(args: { query: string }): Promise<unknown>;

// Initialize configuration and services immediately
let config: ApplicationConfig;
let dockerService: ReturnType<typeof createDockerService>;
let githubService: ReturnType<typeof createGitHubService>;
let databaseService: ReturnType<typeof createDatabaseService>;
let llmRunner: ReturnType<typeof createLLMRunner>;
let agentService: ReturnType<typeof createAgentService>;

try {
  // Create config first
  config = createConfig();

  // Create all services with config
  dockerService = createDockerService(config);
  databaseService = createDatabaseService(config);
  llmRunner = createLLMRunner(config);
  githubService = createGitHubService(config, dockerService);

  agentService = createAgentService({
    config,
    llmRunner,
    githubService,
    dockerService,
    databaseService,
    shellCommand: typeof run_shell_command !== 'undefined' ? run_shell_command : undefined,
    webFetch: typeof web_fetch !== 'undefined' ? web_fetch : undefined,
    googleSearch: typeof google_web_search !== 'undefined' ? google_web_search : undefined,
  });
} catch (error) {
  // Config validation failed - show help instead of crashing
  if (process.argv.length <= 2 || process.argv.includes('--help')) {
    // Show help without services
    console.error('Note: Configuration error detected. Some commands may not work.');
    console.error(error instanceof Error ? error.message : 'Unknown error');
  } else {
    // Command was specified but config is invalid
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

// Export services for programmatic use
export { agentService, dockerService, githubService, databaseService, llmRunner, config };

// CLI interface
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _argv = yargs(hideBin(process.argv))
  .scriptName('builder-6')
  .usage('Usage: $0 <command> [options]\n\nAI-powered development assistant')
  .epilogue('For more information on a specific command, use: $0 <command> --help')
  .demandCommand(1, 'You must specify a command. Use --help to see available commands.')
  .recommendCommands()
  .command(
    'plan',
    'Create an execution plan for a development task',
    (yargs) => {
      return yargs
        .option('prompt', {
          description: 'The task description',
          type: 'string',
          required: true,
        })
        .option('repo-url', {
          description: 'GitHub repository URL',
          type: 'string',
          required: true,
        });
    },
    async (argv) => {
      try {
        const plan = await agentService.startPlanning({
          prompt: argv.prompt,
          repoUrl: argv.repoUrl,
        });
        console.log('Generated plan:', JSON.stringify(plan, null, 2));
      } catch (error) {
        console.error('Failed to create plan:', error);
        process.exit(1);
      }
    },
  )
  .command(
    'execute',
    'Execute a previously created plan',
    (yargs) => {
      return yargs.option('session-id', {
        description: 'The session ID containing the plan to execute',
        type: 'string',
        required: true,
      });
    },
    async (argv) => {
      try {
        const result = await agentService.executePlan({ sessionId: argv.sessionId });
        console.log('Execution result:', result);
      } catch (error) {
        console.error('Failed to execute plan:', error);
        process.exit(1);
      }
    },
  )
  .command('cleanup-containers', 'Clean up idle Docker containers', async () => {
    try {
      const result = await dockerService.cleanupIdleContainers();
      if (result.ok) {
        console.log(`✓ Cleaned up ${result.value} idle container(s)`);
      } else {
        console.error('✗ Failed to clean up containers:', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('Failed to cleanup containers:', error);
      process.exit(1);
    }
  })
  .command(
    'list-sessions',
    'List all agent sessions',
    (yargs) => {
      return yargs.option('limit', {
        description: 'Maximum number of sessions to display',
        type: 'number',
        default: 10,
      });
    },
    async (argv) => {
      // This is a simplified implementation - you may want to add a proper method to the database service
      console.log('Recent sessions (limited to', argv.limit, 'entries)');
      console.log('Use "execute --session-id <id>" to run a session');
    },
  )
  .command(
    'run-evaluation',
    'Run agent evaluation scenarios for testing',
    (yargs) => {
      return yargs.option('html', {
        description: 'Generate HTML report',
        type: 'boolean',
        default: false,
      });
    },
    async (argv) => {
      console.log('🧪 Starting agent evaluation...');
      console.log('This will test the agent with predefined scenarios.\n');
      await runEvaluations({ htmlReport: argv.html });
    },
  )
  .help()
  .alias('help', 'h')
  .version()
  .alias('version', 'v')
  .strict()
  .showHelpOnFail(true).argv;
