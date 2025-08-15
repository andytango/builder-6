import { ConfigSchema } from './schema.js';
import type { ApplicationConfig } from './types.js';
import { EnvVar } from './env-vars.js';

export type { ApplicationConfig };
export { EnvVar };
export type { ApplicationConfig as Config } from './types.js';

/**
 * Creates an ApplicationConfig from environment variables
 * Validates configuration using Zod schema
 */
export function createConfig(): ApplicationConfig {
  try {
    const nodeEnv = (process.env[EnvVar.NODE_ENV] || 'development') as 'development' | 'test' | 'production';

    const rawConfig = {
      appName: 'builder-6',
      appVersion: '1.0.0',
      nodeEnv,
      databaseUrl: process.env[EnvVar.DATABASE_URL] || 'postgresql://user:password@localhost:5432/mydb',
      llmProvider: process.env[EnvVar.LLM_PROVIDER] || 'gemini',
      geminiApiKey: process.env[EnvVar.GEMINI_API_KEY],
      openaiApiKey: process.env[EnvVar.OPENAI_API_KEY],
      anthropicApiKey: process.env[EnvVar.ANTHROPIC_API_KEY],
      githubToken: process.env[EnvVar.GITHUB_TOKEN],
      githubTestOwner: process.env[EnvVar.GITHUB_TEST_OWNER],
      githubTestRepo: process.env[EnvVar.GITHUB_TEST_REPO],
      dockerHost: process.env[EnvVar.DOCKER_HOST],
      dockerContainerPrefix: process.env[EnvVar.DOCKER_CONTAINER_PREFIX] || 'builder-6',
      testApiKey: process.env[EnvVar.TEST_API_KEY],
      logLevel:
        process.env[EnvVar.LOG_LEVEL] || (nodeEnv === 'production' ? 'warn' : nodeEnv === 'test' ? 'error' : 'info'),
      debugMode: process.env[EnvVar.DEBUG_MODE] === 'true',
      dockerContainerLimit: 5,
      dockerIdleTimeout: 600000,
      dockerDefaultImage: 'busybox:latest',
      llmMaxRetries: process.env[EnvVar.LLM_MAX_RETRIES] ? parseInt(process.env[EnvVar.LLM_MAX_RETRIES], 10) : 10,
      llmInitialRetryDelay: process.env[EnvVar.LLM_INITIAL_RETRY_DELAY]
        ? parseInt(process.env[EnvVar.LLM_INITIAL_RETRY_DELAY], 10)
        : 1000,
      llmMaxRetryDelay: process.env[EnvVar.LLM_MAX_RETRY_DELAY]
        ? parseInt(process.env[EnvVar.LLM_MAX_RETRY_DELAY], 10)
        : 10000,
      llmRetryBackoffFactor: process.env[EnvVar.LLM_RETRY_BACKOFF_FACTOR]
        ? parseFloat(process.env[EnvVar.LLM_RETRY_BACKOFF_FACTOR])
        : 2,
      debugEnabled: process.env[EnvVar.DEBUG_MODE] === 'true',
      prismaWarningsDisabled: true,
    };

    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof Error) {
      console.error('Configuration validation failed:', error.message);
      if ('errors' in error) {
        console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
      }
    }
    throw new Error('Invalid configuration. Please check your environment variables.');
  }
}

/**
 * Create a test configuration with overrides
 */
export function createTestConfig(overrides?: Partial<ApplicationConfig>): ApplicationConfig {
  const baseConfig: ApplicationConfig = {
    appName: 'builder-6-test',
    appVersion: '1.0.0',
    nodeEnv: 'test',
    databaseUrl: 'postgresql://localhost:5432/builder6_test',
    llmProvider: 'gemini',
    geminiApiKey: 'test-api-key',
    githubToken: 'test-github-token',
    dockerContainerPrefix: 'test-container-',
    dockerContainerLimit: 2,
    dockerIdleTimeout: 30000,
    dockerDefaultImage: 'alpine:latest',
    llmMaxRetries: 10,
    llmInitialRetryDelay: 1000,
    llmMaxRetryDelay: 10000,
    llmRetryBackoffFactor: 2,
    debugEnabled: false,
    prismaWarningsDisabled: true,
    ...overrides,
  };

  return ConfigSchema.parse(baseConfig);
}
