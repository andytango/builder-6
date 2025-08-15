/**
 * Application configuration interface
 * Used for dependency injection into services
 */
export interface ApplicationConfig {
  // App metadata
  appName: string;
  appVersion: string;
  nodeEnv: 'development' | 'test' | 'production';

  // Database
  databaseUrl: string;

  // LLM Configuration
  llmProvider: 'gemini' | 'openai' | 'anthropic';
  geminiApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;

  // GitHub Configuration
  githubToken: string;
  githubTestOwner?: string;
  githubTestRepo?: string;

  // Docker Configuration
  dockerSocketPath?: string;
  dockerContainerPrefix: string;
  dockerContainerLimit: number;
  dockerIdleTimeout: number;
  dockerDefaultImage: string;

  // Retry Configuration
  llmMaxRetries: number;
  llmInitialRetryDelay: number;
  llmMaxRetryDelay: number;
  llmRetryBackoffFactor: number;

  // Debug/Monitoring
  debugEnabled: boolean;
  prismaWarningsDisabled: boolean;
}
