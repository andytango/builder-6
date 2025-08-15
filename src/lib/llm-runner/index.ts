/**
 * LLM Runner service for unified LLM provider access
 */

import type { LLMToolsService } from '../llm-tools/index.js';
import { ApplicationConfig } from '../config/index.js';

/**
 * Supported LLM providers
 */
export type LLMProvider = 'gemini' | 'openai' | 'claude';

/**
 * Configuration for LLM providers
 */
export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LLMToolsService;
  retryConfig?: RetryConfig;
}

/**
 * Standard LLM response format
 */
export interface LLMResponse {
  content: string;
  provider: LLMProvider;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Tool call interface
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

/**
 * Tool call response interface
 */
export interface ToolCallResponse {
  content?: string;
  toolCalls?: ToolCall[];
  provider: LLMProvider;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * LLM Runner service interface
 */
export interface LLMRunnerService {
  /**
   * Generate content using the configured LLM provider
   */
  generateContent(prompt: string): Promise<string>;

  /**
   * Generate structured content with full response metadata
   */
  generateResponse(prompt: string): Promise<LLMResponse>;

  /**
   * Generate JSON content with optional schema
   */
  generateJSON?(prompt: string, schema?: unknown): Promise<unknown>;

  /**
   * Generate content with tool calling support
   */
  generateWithTools?(prompt: string): Promise<ToolCallResponse>;

  /**
   * Execute tool calls and return results
   */
  executeToolCalls?(toolCalls: ToolCall[]): Promise<Array<{ toolCallId: string; result: unknown }>>;

  /**
   * Get the current provider configuration
   */
  getConfig(): LLMConfig;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
}

/**
 * Default retry configuration for 503 errors
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 10,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffFactor: 2,
};

/**
 * Token limits for different models (fallback when API counting unavailable)
 */
const MODEL_TOKEN_LIMITS: Record<string, number> = {
  // Gemini models (2024 versions)
  'gemini-2.0-flash-exp': 1048576, // 1M tokens
  'gemini-1.5-flash': 1048576, // 1M tokens
  'gemini-1.5-flash-8b': 1048576, // 1M tokens
  'gemini-1.5-pro': 2097152, // 2M tokens
  'gemini-pro': 32760, // 32K tokens
  
  // OpenAI models (2024 versions)
  'gpt-4o': 128000, // 128K tokens
  'gpt-4o-mini': 128000, // 128K tokens
  'gpt-4-turbo': 128000, // 128K tokens
  'gpt-4': 8192, // 8K tokens
  'gpt-3.5-turbo': 16385, // 16K tokens
  
  // Claude models (2024 versions)
  'claude-3-5-sonnet-20241022': 200000, // 200K tokens
  'claude-3-opus-20240229': 200000, // 200K tokens
  'claude-3-sonnet-20240229': 200000, // 200K tokens
  'claude-3-haiku-20240307': 200000, // 200K tokens
  'claude-2.1': 200000, // 200K tokens
};

/**
 * Count tokens using Gemini API
 */
async function countTokensGemini(prompt: string, model: string, apiKey: string): Promise<number> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({ model });
    
    // Check if countTokens method exists (might not in mocked versions)
    if (typeof genModel.countTokens !== 'function') {
      return estimateTokenCount(prompt);
    }
    
    // Use the countTokens API method
    const result = await genModel.countTokens(prompt);
    return result.totalTokens;
  } catch (error) {
    // Silently fall back to estimation for tests or API errors
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Failed to count tokens with Gemini API, using estimation:', error);
    }
    return estimateTokenCount(prompt);
  }
}

/**
 * Count tokens using tiktoken for OpenAI
 */
async function countTokensOpenAI(prompt: string, model: string): Promise<number> {
  try {
    const { encoding_for_model } = await import('tiktoken');
    const encoding = encoding_for_model(model as Parameters<typeof encoding_for_model>[0]);
    const tokens = encoding.encode(prompt);
    encoding.free(); // Free memory
    return tokens.length;
  } catch (error) {
    // Silently fall back to estimation for tests or API errors
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Failed to count tokens with tiktoken, using estimation:', error);
    }
    return estimateTokenCount(prompt);
  }
}

/**
 * Count tokens for Claude (estimation since no official JS tokenizer)
 */
function countTokensClaude(prompt: string): number {
  // Claude doesn't provide a JS tokenizer, so we use estimation
  // Claude's tokenization is similar to GPT models (roughly 4 chars per token)
  return estimateTokenCount(prompt);
}

/**
 * Simple token estimation (4 characters per token)
 * This is a rough estimate when proper tokenization is not available
 */
function estimateTokenCount(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters (common approximation)
  return Math.ceil(text.length / 4);
}

/**
 * Validate prompt size against model limits using provider-specific counting
 */
async function validatePromptSize(
  prompt: string, 
  model: string, 
  provider: LLMProvider,
  apiKey?: string
): Promise<void> {
  let actualTokens: number;
  
  // Use provider-specific token counting
  switch (provider) {
    case 'gemini':
      if (apiKey) {
        actualTokens = await countTokensGemini(prompt, model, apiKey);
      } else {
        actualTokens = estimateTokenCount(prompt);
      }
      break;
    case 'openai':
      actualTokens = await countTokensOpenAI(prompt, model);
      break;
    case 'claude':
      actualTokens = countTokensClaude(prompt);
      break;
    default:
      actualTokens = estimateTokenCount(prompt);
  }
  
  const tokenLimit = MODEL_TOKEN_LIMITS[model] || 100000; // Default to 100K if model not found
  
  if (actualTokens > tokenLimit) {
    throw new Error(
      `Prompt too large: ${actualTokens} tokens exceeds ${model} limit of ${tokenLimit} tokens. ` +
      `Consider reducing prompt size or using a model with larger context window.`
    );
  }
  
  // Warn if prompt is close to limit (>80%)
  if (actualTokens > tokenLimit * 0.8) {
    console.warn(
      `⚠️  Large prompt detected: ${actualTokens} tokens (${Math.round((actualTokens / tokenLimit) * 100)}% of ${model} limit)`
    );
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for handling 503 errors
 */
async function retryOn503<T>(fn: () => Promise<T>, config: RetryConfig = {}): Promise<T> {
  const { maxRetries, initialDelay, maxDelay, backoffFactor } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add small delay before each request to avoid burst rate limiting
      if (attempt > 0 || delay > 0) {
        await sleep(Math.min(100, delay)); // Small preventive delay
      }
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if it's a 503 error
      const is503 =
        lastError.message?.includes('503') ||
        lastError.message?.includes('Service Unavailable') ||
        lastError.message?.includes('overloaded');

      if (!is503 || attempt === maxRetries) {
        throw lastError;
      }

      console.log(`⚠️  503 error encountered, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(delay);

      // Exponential backoff with jitter
      delay = Math.min(delay * backoffFactor + Math.random() * 1000, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Provider factory functions that return plain objects
 */

/**
 * Creates a Gemini provider using factory pattern
 */
function createGeminiProvider(config: LLMConfig): LLMRunnerService {
  const retryConfig = config.retryConfig || {};

  return {
    /**
     *
     */
    async generateContent(prompt: string): Promise<string> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'gemini-1.5-flash', 'gemini', config.apiKey);
      
      return retryOn503(async () => {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(config.apiKey);
        const model = genAI.getGenerativeModel({
          model: config.model || 'gemini-1.5-flash',
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
          },
        });

        const result = await model.generateContent(prompt);
        const response = result.response;
        return response.text();
      }, retryConfig);
    },

    /**
     *
     */
    async generateResponse(prompt: string): Promise<LLMResponse> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'gemini-1.5-flash', 'gemini', config.apiKey);
      
      return retryOn503(async () => {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(config.apiKey);
        const model = genAI.getGenerativeModel({
          model: config.model || 'gemini-1.5-flash',
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
          },
        });

        const result = await model.generateContent(prompt);
        const response = result.response;
        const content = response.text();

        return {
          content,
          provider: 'gemini',
          model: config.model || 'gemini-1.5-flash',
          usage: {
            promptTokens: result.response.usageMetadata?.promptTokenCount,
            completionTokens: result.response.usageMetadata?.candidatesTokenCount,
            totalTokens: result.response.usageMetadata?.totalTokenCount,
          },
        };
      }, retryConfig);
    },

    /**
     * Generate JSON content with optional schema
     */
    async generateJSON(prompt: string, _schema_?: unknown): Promise<unknown> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'gemini-1.5-flash', 'gemini', config.apiKey);
      
      return retryOn503(async () => {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(config.apiKey);

        const generationConfig: Record<string, unknown> = {
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens,
          responseMimeType: 'application/json',
        };

        if (_schema_) {
          generationConfig.responseSchema = _schema_;
        }

        const model = genAI.getGenerativeModel({
          model: config.model || 'gemini-1.5-flash',
          generationConfig,
        });

        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonString = response.text();

        try {
          return JSON.parse(jsonString);
        } catch (error) {
          // Fallback: try to extract JSON from markdown code blocks
          const jsonMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[1]);
          }
          throw new Error(`Failed to parse JSON response: ${error}`);
        }
      }, retryConfig);
    },

    /**
     * Generate content with tool calling support
     */
    async generateWithTools(prompt: string): Promise<ToolCallResponse> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'gemini-1.5-flash', 'gemini', config.apiKey);
      
      if (!config.tools) {
        // Fallback to regular generation if no tools available
        const response = await this.generateResponse(prompt);
        return {
          content: response.content,
          provider: response.provider,
          model: response.model,
          usage: response.usage,
        };
      }

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(config.apiKey);

      // Convert tools to Gemini format
      const toolDefinitions = config.tools.getToolDefinitions();
      const functionDeclarations = toolDefinitions.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));

      const model = genAI.getGenerativeModel({
        model: config.model || 'gemini-pro',
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens,
        },
        // Type assertion needed due to Gemini SDK type limitations
        tools:
          functionDeclarations.length > 0
            ? ([{ functionDeclarations }] as unknown as Parameters<typeof genAI.getGenerativeModel>[0]['tools'])
            : undefined,
      });

      const result = await model.generateContent(prompt);
      const response = result.response;

      // Extract tool calls if any
      const toolCalls: ToolCall[] = [];
      const functionCalls = response.functionCalls();
      if (functionCalls) {
        functionCalls.forEach((call, index) => {
          toolCalls.push({
            id: `call_${index}`,
            name: call.name,
            arguments: call.args,
          });
        });
      }

      return {
        content: response.text() || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        provider: 'gemini',
        model: config.model || 'gemini-pro',
        usage: {
          promptTokens: result.response.usageMetadata?.promptTokenCount,
          completionTokens: result.response.usageMetadata?.candidatesTokenCount,
          totalTokens: result.response.usageMetadata?.totalTokenCount,
        },
      };
    },

    /**
     * Execute tool calls and return results
     */
    async executeToolCalls(toolCalls: ToolCall[]): Promise<Array<{ toolCallId: string; result: unknown }>> {
      if (!config.tools) {
        throw new Error('No tools service available');
      }

      const results = [];
      for (const toolCall of toolCalls) {
        try {
          const result = await config.tools.executeTool(toolCall.name, toolCall.arguments);
          results.push({ toolCallId: toolCall.id, result });
        } catch (error) {
          results.push({
            toolCallId: toolCall.id,
            result: { error: (error as Error).message },
          });
        }
      }
      return results;
    },

    /**
     *
     */
    getConfig(): LLMConfig {
      return { ...config };
    },
  };
}

/**
 * Creates an OpenAI provider using factory pattern
 */
function createOpenAIProvider(config: LLMConfig): LLMRunnerService {
  const retryConfig = config.retryConfig || {};

  return {
    /**
     *
     */
    async generateContent(prompt: string): Promise<string> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'gpt-4o-mini', 'openai');
      
      return retryOn503(async () => {
        try {
          const openaiModule = await import('openai' as string);
          const OpenAI = openaiModule.default;
          const openai = new OpenAI({ apiKey: config.apiKey });

          const completion = await openai.chat.completions.create({
            model: config.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: config.temperature,
            max_tokens: config.maxTokens,
          });

          return completion.choices[0]?.message?.content || '';
        } catch (error) {
          throw new Error(`OpenAI provider requires 'openai' package to be installed: ${(error as Error).message}`);
        }
      }, retryConfig);
    },

    /**
     *
     */
    async generateResponse(prompt: string): Promise<LLMResponse> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'gpt-4o-mini', 'openai');
      
      return retryOn503(async () => {
        try {
          const openaiModule = await import('openai' as string);
          const OpenAI = openaiModule.default;
          const openai = new OpenAI({ apiKey: config.apiKey });

          const completion = await openai.chat.completions.create({
            model: config.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: config.temperature,
            max_tokens: config.maxTokens,
          });

          const content = completion.choices[0]?.message?.content || '';

          return {
            content,
            provider: 'openai',
            model: config.model || 'gpt-4o-mini',
            usage: {
              promptTokens: completion.usage?.prompt_tokens,
              completionTokens: completion.usage?.completion_tokens,
              totalTokens: completion.usage?.total_tokens,
            },
          };
        } catch (error) {
          throw new Error(`OpenAI provider requires 'openai' package to be installed: ${(error as Error).message}`);
        }
      }, retryConfig);
    },

    /**
     * Generate JSON content with optional schema
     */
    async generateJSON(prompt: string, _schema_?: unknown): Promise<unknown> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'gpt-4o-mini', 'openai');
      
      return retryOn503(async () => {
        try {
          const openaiModule = await import('openai' as string);
          const OpenAI = openaiModule.default;
          const openai = new OpenAI({ apiKey: config.apiKey });

          // Build the messages with JSON instruction
          const messages = [
            {
              role: 'system' as const,
              content: 'You are a helpful assistant designed to output valid JSON.',
            },
            {
              role: 'user' as const,
              content: prompt,
            },
          ];

          const completion = await openai.chat.completions.create({
            model: config.model || 'gpt-4o-mini',
            messages,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
            response_format: { type: 'json_object' },
          });

          const content = completion.choices[0]?.message?.content || '{}';

          try {
            return JSON.parse(content);
          } catch (error) {
            // Fallback: try to extract JSON from markdown code blocks
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
              return JSON.parse(jsonMatch[1]);
            }
            throw new Error(`Failed to parse JSON response: ${error}`);
          }
        } catch (error) {
          throw new Error(`OpenAI JSON generation failed: ${(error as Error).message}`);
        }
      }, retryConfig);
    },

    /**
     * Generate content with tool calling support
     */
    async generateWithTools(prompt: string): Promise<ToolCallResponse> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'gpt-4o-mini', 'openai');
      
      if (!config.tools) {
        // Fallback to regular generation if no tools available
        const response = await this.generateResponse(prompt);
        return {
          content: response.content,
          provider: response.provider,
          model: response.model,
          usage: response.usage,
        };
      }

      try {
        const openaiModule = await import('openai' as string);
        const OpenAI = openaiModule.default;
        const openai = new OpenAI({ apiKey: config.apiKey });

        // Convert tools to OpenAI format
        const toolDefinitions = config.tools.getToolDefinitions();
        const tools = toolDefinitions.map((tool) => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }));

        const completion = await openai.chat.completions.create({
          model: config.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
        });

        const message = completion.choices[0]?.message;
        const toolCalls: ToolCall[] = [];

        if (message?.tool_calls) {
          interface OpenAIToolCall {
            id: string;
            type: string;
            function: {
              name: string;
              arguments: string;
            };
          }
          message.tool_calls.forEach((toolCall: unknown) => {
            const tc = toolCall as OpenAIToolCall;
            if (tc.type === 'function') {
              toolCalls.push({
                id: tc.id,
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments),
              });
            }
          });
        }

        return {
          content: message?.content || undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          provider: 'openai',
          model: config.model || 'gpt-4o-mini',
          usage: {
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
            totalTokens: completion.usage?.total_tokens,
          },
        };
      } catch (error) {
        throw new Error(`OpenAI provider requires 'openai' package to be installed: ${(error as Error).message}`);
      }
    },

    /**
     * Execute tool calls and return results
     */
    async executeToolCalls(toolCalls: ToolCall[]): Promise<Array<{ toolCallId: string; result: unknown }>> {
      if (!config.tools) {
        throw new Error('No tools service available');
      }

      const results = [];
      for (const toolCall of toolCalls) {
        try {
          const result = await config.tools.executeTool(toolCall.name, toolCall.arguments);
          results.push({ toolCallId: toolCall.id, result });
        } catch (error) {
          results.push({
            toolCallId: toolCall.id,
            result: { error: (error as Error).message },
          });
        }
      }
      return results;
    },

    /**
     *
     */
    getConfig(): LLMConfig {
      return { ...config };
    },
  };
}

/**
 * Creates a Claude provider using factory pattern
 */
function createClaudeProvider(config: LLMConfig): LLMRunnerService {
  const retryConfig = config.retryConfig || {};

  return {
    /**
     *
     */
    async generateContent(prompt: string): Promise<string> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'claude-3-haiku-20240307', 'claude');
      
      return retryOn503(async () => {
        try {
          const anthropicModule = await import('@anthropic-ai/sdk' as string);
          const Anthropic = anthropicModule.default;
          const anthropic = new Anthropic({ apiKey: config.apiKey });

          const response = await anthropic.messages.create({
            model: config.model || 'claude-3-haiku-20240307',
            max_tokens: config.maxTokens || 1000,
            temperature: config.temperature,
            messages: [{ role: 'user', content: prompt }],
          });

          return response.content[0]?.type === 'text' ? response.content[0].text : '';
        } catch (error) {
          throw new Error(
            `Claude provider requires '@anthropic-ai/sdk' package to be installed: ${(error as Error).message}`,
          );
        }
      }, retryConfig);
    },

    /**
     * Generate JSON content using Claude's prefill technique
     */
    async generateJSON(prompt: string, _schema_?: unknown): Promise<unknown> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'claude-3-haiku-20240307', 'claude');
      
      return retryOn503(async () => {
        try {
          const anthropicModule = await import('@anthropic-ai/sdk' as string);
          const Anthropic = anthropicModule.default;
          const anthropic = new Anthropic({ apiKey: config.apiKey });

          // Prepare the prompt with instructions for JSON output
          const jsonPrompt = `${prompt}\n\nPlease respond with valid JSON only, no other text or markdown formatting.`;

          const response = await anthropic.messages.create({
            model: config.model || 'claude-3-haiku-20240307',
            max_tokens: config.maxTokens || 1000,
            temperature: config.temperature,
            messages: [
              {
                role: 'user',
                content: jsonPrompt,
              },
              {
                // Prefill technique to force JSON output
                role: 'assistant',
                content: '{',
              },
            ],
          });

          // Get the response and prepend the opening brace
          const content = '{' + (response.content[0]?.type === 'text' ? response.content[0].text : '');

          try {
            return JSON.parse(content);
          } catch (error) {
            // Fallback: try to extract JSON from the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              return JSON.parse(jsonMatch[0]);
            }
            throw new Error(`Failed to parse JSON response: ${error}`);
          }
        } catch (error) {
          throw new Error(`Claude JSON generation failed: ${(error as Error).message}`);
        }
      }, retryConfig);
    },

    /**
     *
     */
    async generateResponse(prompt: string): Promise<LLMResponse> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'claude-3-haiku-20240307', 'claude');
      
      return retryOn503(async () => {
        try {
          const anthropicModule = await import('@anthropic-ai/sdk' as string);
          const Anthropic = anthropicModule.default;
          const anthropic = new Anthropic({ apiKey: config.apiKey });

          const response = await anthropic.messages.create({
            model: config.model || 'claude-3-haiku-20240307',
            max_tokens: config.maxTokens || 1000,
            temperature: config.temperature,
            messages: [{ role: 'user', content: prompt }],
          });

          const content = response.content[0]?.type === 'text' ? response.content[0].text : '';

          return {
            content,
            provider: 'claude' as LLMProvider,
            model: config.model || 'claude-3-haiku-20240307',
            usage: {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens: response.usage.input_tokens + response.usage.output_tokens,
            },
          };
        } catch (error) {
          throw new Error(
            `Claude provider requires '@anthropic-ai/sdk' package to be installed: ${(error as Error).message}`,
          );
        }
      }, retryConfig);
    },

    /**
     * Generate content with tool calling support
     */
    async generateWithTools(prompt: string): Promise<ToolCallResponse> {
      // Validate prompt size before making API call
      await validatePromptSize(prompt, config.model || 'claude-3-haiku-20240307', 'claude');
      
      if (!config.tools) {
        // Fallback to regular generation if no tools available
        const response = await this.generateResponse(prompt);
        return {
          content: response.content,
          provider: response.provider,
          model: response.model,
          usage: response.usage,
        };
      }

      try {
        const anthropicModule = await import('@anthropic-ai/sdk' as string);
        const Anthropic = anthropicModule.default;
        const anthropic = new Anthropic({ apiKey: config.apiKey });

        // Convert tools to Claude format
        const toolDefinitions = config.tools.getToolDefinitions();
        const tools = toolDefinitions.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        }));

        const response = await anthropic.messages.create({
          model: config.model || 'claude-3-haiku-20240307',
          max_tokens: config.maxTokens || 1000,
          temperature: config.temperature,
          messages: [{ role: 'user', content: prompt }],
          tools: tools.length > 0 ? tools : undefined,
        });

        const toolCalls: ToolCall[] = [];
        let textContent = '';

        interface ClaudeContent {
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        }
        response.content.forEach((content: unknown, index: number) => {
          const c = content as ClaudeContent;
          if (c.type === 'text') {
            textContent += c.text || '';
          } else if (c.type === 'tool_use') {
            toolCalls.push({
              id: c.id || `call_${index}`,
              name: c.name || '',
              arguments: c.input,
            });
          }
        });

        return {
          content: textContent || undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          provider: 'claude' as LLMProvider,
          model: config.model || 'claude-3-haiku-20240307',
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          },
        };
      } catch (error) {
        throw new Error(
          `Claude provider requires '@anthropic-ai/sdk' package to be installed: ${(error as Error).message}`,
        );
      }
    },

    /**
     * Execute tool calls and return results
     */
    async executeToolCalls(toolCalls: ToolCall[]): Promise<Array<{ toolCallId: string; result: unknown }>> {
      if (!config.tools) {
        throw new Error('No tools service available');
      }

      const results = [];
      for (const toolCall of toolCalls) {
        try {
          const result = await config.tools.executeTool(toolCall.name, toolCall.arguments);
          results.push({ toolCallId: toolCall.id, result });
        } catch (error) {
          results.push({
            toolCallId: toolCall.id,
            result: { error: (error as Error).message },
          });
        }
      }
      return results;
    },

    /**
     *
     */
    getConfig(): LLMConfig {
      return { ...config };
    },
  };
}

/**
 * Create LLM Runner service from ApplicationConfig
 */
export function createLLMRunner(appConfig: ApplicationConfig, tools?: LLMToolsService): LLMRunnerService {
  // Build LLMConfig from ApplicationConfig based on provider
  let llmConfig: LLMConfig;

  switch (appConfig.llmProvider) {
    case 'gemini':
      if (!appConfig.geminiApiKey) {
        throw new Error('GEMINI_API_KEY is required for Gemini provider');
      }
      llmConfig = {
        provider: 'gemini',
        apiKey: appConfig.geminiApiKey,
        tools,
        retryConfig: {
          maxRetries: appConfig.llmMaxRetries,
          initialDelay: appConfig.llmInitialRetryDelay,
          maxDelay: appConfig.llmMaxRetryDelay,
          backoffFactor: appConfig.llmRetryBackoffFactor,
        },
      };
      return createGeminiProvider(llmConfig);

    case 'openai':
      if (!appConfig.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is required for OpenAI provider');
      }
      llmConfig = {
        provider: 'openai',
        apiKey: appConfig.openaiApiKey,
        tools,
        retryConfig: {
          maxRetries: appConfig.llmMaxRetries,
          initialDelay: appConfig.llmInitialRetryDelay,
          maxDelay: appConfig.llmMaxRetryDelay,
          backoffFactor: appConfig.llmRetryBackoffFactor,
        },
      };
      return createOpenAIProvider(llmConfig);

    case 'anthropic':
      if (!appConfig.anthropicApiKey) {
        throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
      }
      llmConfig = {
        provider: 'claude' as LLMProvider,
        apiKey: appConfig.anthropicApiKey,
        tools,
        retryConfig: {
          maxRetries: appConfig.llmMaxRetries,
          initialDelay: appConfig.llmInitialRetryDelay,
          maxDelay: appConfig.llmMaxRetryDelay,
          backoffFactor: appConfig.llmRetryBackoffFactor,
        },
      };
      return createClaudeProvider(llmConfig);

    default:
      throw new Error(`Unsupported LLM provider: ${appConfig.llmProvider}`);
  }
}

/**
 * Create LLM Runner service with explicit LLMConfig (for backward compatibility)
 */
export function createLLMRunnerWithConfig(config: LLMConfig): LLMRunnerService {
  if (!config.apiKey) {
    throw new Error(`API key is required for ${config.provider} provider`);
  }

  switch (config.provider) {
    case 'gemini':
      return createGeminiProvider(config);
    case 'openai':
      return createOpenAIProvider(config);
    case 'claude':
      return createClaudeProvider(config);
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

/**
 * Test factory configuration for LLM Runner
 */
export interface TestLLMRunnerConfig {
  provider?: LLMProvider;
  defaultResponse?: string;
  responses?: string[];
  responseMappings?: Record<string, string>;
  simulateLatency?: number;
  tools?: LLMToolsService;
}

/**
 * Test LLM Runner service for testing
 */
export function createTestLLMRunner(config: TestLLMRunnerConfig = {}): LLMRunnerService & {
  setResponses: (responses: string[]) => void;
  addResponse: (response: string) => void;
  setResponseMapping: (pattern: string, response: string) => void;
  getCallHistory: () => string[];
  reset: () => void;
  setToolCallResponses: (responses: ToolCall[]) => void;
} {
  let responseQueue = [...(config.responses || [])];
  let responseMappings = { ...config.responseMappings };
  let callHistory: string[] = [];
  let toolCallResponses: ToolCall[] = [];
  const defaultResponse = config.defaultResponse || 'Test response';
  const simulateLatency = config.simulateLatency || 0;

  /**
   *
   */
  const simulateDelay = async (): Promise<void> => {
    if (simulateLatency > 0) {
      await new Promise((resolve) => setTimeout(resolve, simulateLatency));
    }
  };

  return {
    /**
     *
     */
    async generateContent(prompt: string): Promise<string> {
      await simulateDelay();
      callHistory.push(prompt);

      // Check for mapped responses first
      for (const [pattern, response] of Object.entries(responseMappings)) {
        if (prompt.includes(pattern)) {
          return response;
        }
      }

      // Use queue response if available
      if (responseQueue.length > 0) {
        return responseQueue.shift()!;
      }

      return defaultResponse;
    },

    /**
     *
     */
    async generateResponse(prompt: string): Promise<LLMResponse> {
      const content = await this.generateContent(prompt);
      return {
        content,
        provider: config.provider || 'gemini',
        model: 'test-model',
        usage: {
          promptTokens: prompt.length / 4, // Rough estimate
          completionTokens: content.length / 4,
          totalTokens: (prompt.length + content.length) / 4,
        },
      };
    },

    /**
     * Generate JSON content with optional schema
     */
    async generateJSON(prompt: string, _schema_?: unknown): Promise<unknown> {
      await simulateDelay();
      callHistory.push(prompt);

      // Check for mapped responses first
      for (const [pattern, response] of Object.entries(responseMappings)) {
        if (prompt.includes(pattern)) {
          try {
            return JSON.parse(response);
          } catch {
            return response;
          }
        }
      }

      // Use queue response if available
      const content = responseQueue.length > 0 ? responseQueue.shift()! : defaultResponse;

      try {
        return JSON.parse(content);
      } catch {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]);
        }
        // If not JSON, return as array with single task
        return [{ description: content }];
      }
    },

    /**
     * Generate content with tool calling support
     */
    async generateWithTools(prompt: string): Promise<ToolCallResponse> {
      await simulateDelay();
      callHistory.push(prompt);

      const usage = {
        promptTokens: prompt.length / 4,
        completionTokens: defaultResponse.length / 4,
        totalTokens: (prompt.length + defaultResponse.length) / 4,
      };

      // Return tool calls if available
      if (toolCallResponses.length > 0) {
        const toolCalls = toolCallResponses.shift();
        return {
          content: undefined,
          toolCalls: toolCalls ? [toolCalls] : undefined,
          provider: config.provider || 'gemini',
          model: 'test-model',
          usage,
        };
      }

      // Check for mapped responses first
      for (const [pattern, response] of Object.entries(responseMappings)) {
        if (prompt.includes(pattern)) {
          return {
            content: response,
            provider: config.provider || 'gemini',
            model: 'test-model',
            usage,
          };
        }
      }

      // Use queue response if available
      const content = responseQueue.length > 0 ? responseQueue.shift()! : defaultResponse;
      return {
        content,
        provider: config.provider || 'gemini',
        model: 'test-model',
        usage,
      };
    },

    /**
     * Execute tool calls and return results
     */
    async executeToolCalls(toolCalls: ToolCall[]): Promise<Array<{ toolCallId: string; result: unknown }>> {
      if (config.tools) {
        const results = [];
        for (const toolCall of toolCalls) {
          try {
            const result = await config.tools.executeTool(toolCall.name, toolCall.arguments);
            results.push({ toolCallId: toolCall.id, result });
          } catch (error) {
            results.push({
              toolCallId: toolCall.id,
              result: { error: (error as Error).message },
            });
          }
        }
        return results;
      }

      // Mock tool execution results
      return toolCalls.map((toolCall) => ({
        toolCallId: toolCall.id,
        result: { mockResult: `Executed ${toolCall.name}` },
      }));
    },

    /**
     *
     */
    getConfig(): LLMConfig {
      return {
        provider: config.provider || 'gemini',
        apiKey: 'test-api-key',
        model: 'test-model',
        tools: config.tools,
      };
    },

    /**
     *
     */
    setResponses(responses: string[]): void {
      responseQueue = [...responses];
    },

    /**
     *
     */
    addResponse(response: string): void {
      responseQueue.push(response);
    },

    /**
     *
     */
    setResponseMapping(pattern: string, response: string): void {
      responseMappings[pattern] = response;
    },

    /**
     *
     */
    getCallHistory(): string[] {
      return [...callHistory];
    },

    /**
     *
     */
    reset(): void {
      responseQueue = [...(config.responses || [])];
      responseMappings = { ...config.responseMappings };
      callHistory = [];
      toolCallResponses = [];
    },

    /**
     *
     */
    setToolCallResponses(responses: ToolCall[]): void {
      toolCallResponses = [...responses];
    },
  };
}
