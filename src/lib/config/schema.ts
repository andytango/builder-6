import { z } from 'zod';
import type { ApplicationConfig } from './types.js';

export const ConfigSchema = z
  .object({
    // App metadata
    appName: z.string().default('builder-6'),
    appVersion: z.string().default('1.0.0'),
    nodeEnv: z.enum(['development', 'test', 'production']).default('development'),

    // Database
    databaseUrl: z.string().url().or(z.string().startsWith('postgresql://')),

    // LLM Configuration
    llmProvider: z.enum(['gemini', 'openai', 'anthropic']).default('gemini'),
    geminiApiKey: z.string().optional(),
    openaiApiKey: z.string().optional(),
    anthropicApiKey: z.string().optional(),

    // GitHub Configuration
    githubToken: z.string().min(1),
    githubTestOwner: z.string().optional(),
    githubTestRepo: z.string().optional(),

    // Docker Configuration
    dockerSocketPath: z.string().optional(),
    dockerContainerPrefix: z.string().default('builder6-container-'),
    dockerContainerLimit: z.number().int().positive().default(5),
    dockerIdleTimeout: z.number().int().positive().default(600000),
    dockerDefaultImage: z.string().default('debian:stable-slim'),

    // Retry Configuration
    llmMaxRetries: z.number().int().min(0).max(20).default(10),
    llmInitialRetryDelay: z.number().int().min(100).max(10000).default(1000),
    llmMaxRetryDelay: z.number().int().min(1000).max(60000).default(10000),
    llmRetryBackoffFactor: z.number().min(1).max(5).default(2),

    // Debug/Monitoring
    debugEnabled: z.boolean().default(false),
    prismaWarningsDisabled: z.boolean().default(false),
  })
  .refine(
    (data) => {
      // Validate that the selected LLM provider has an API key
      switch (data.llmProvider) {
        case 'gemini':
          return !!data.geminiApiKey;
        case 'openai':
          return !!data.openaiApiKey;
        case 'anthropic':
          return !!data.anthropicApiKey;
        default:
          return false;
      }
    },
    {
      message: 'Selected LLM provider must have a corresponding API key',
      path: ['llmProvider'],
    },
  ) satisfies z.ZodType<ApplicationConfig>;
