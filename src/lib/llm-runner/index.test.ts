import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLLMRunnerWithConfig } from './index.js';
import type { LLMConfig } from './index.js';

describe('LLM Runner - Prompt Size Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset modules to ensure clean state
    vi.resetModules();
  });

  describe('validatePromptSize', () => {
    it('should reject prompts exceeding model token limits', async () => {
      const config: LLMConfig = {
        provider: 'gemini',
        apiKey: 'test-key',
        model: 'gemini-1.5-flash',
      };
      
      const runner = createLLMRunnerWithConfig(config);
      
      // Create a prompt that exceeds the Gemini 1.5 Flash limit (1M tokens)
      // 1 token ≈ 4 chars, so 1M tokens ≈ 4M chars
      const largePrompt = 'x'.repeat(4200000); // Slightly over 1M tokens
      
      await expect(runner.generateContent(largePrompt)).rejects.toThrow(
        /Prompt too large: \d+ tokens exceeds gemini-1.5-flash limit of 1048576 tokens/
      );
    });

    it('should reject prompts for smaller model limits', async () => {
      const config: LLMConfig = {
        provider: 'gemini',
        apiKey: 'test-key',
        model: 'gemini-pro', // 32K token limit
      };
      
      const runner = createLLMRunnerWithConfig(config);
      
      // Gemini Pro has 32K token limit = ~131K chars
      const largePrompt = 'x'.repeat(135000);
      
      await expect(runner.generateContent(largePrompt)).rejects.toThrow(
        /Prompt too large: \d+ tokens exceeds gemini-pro limit of 32760 tokens/
      );
    });

    it('should warn for prompts close to limit (>80%)', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock the Google Generative AI module
      vi.doMock('@google/generative-ai', () => ({
        GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
          getGenerativeModel: vi.fn().mockReturnValue({
            generateContent: vi.fn().mockResolvedValue({
              response: {
                /**
                 * Mock text response
                 * @returns Test response string
                 */
                text: () => 'test response',
              },
            }),
          }),
        })),
      }));
      
      const config: LLMConfig = {
        provider: 'gemini',
        apiKey: 'test-key',
        model: 'gemini-pro', // 32K token limit
      };
      
      const runner = createLLMRunnerWithConfig(config);
      
      // Gemini Pro has 32,760 token limit
      // 85% of that is ~27,846 tokens = ~111,384 chars
      const largeishPrompt = 'x'.repeat(111000);
      
      try {
        await runner.generateContent(largeishPrompt);
      } catch {
        // May fail due to mock issues, but we're checking the warning
      }
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Large prompt detected')
      );
      
      consoleSpy.mockRestore();
    });

    it('should validate prompts for all generate methods', async () => {
      const config: LLMConfig = {
        provider: 'gemini',
        apiKey: 'test-key',
        model: 'gemini-pro', // 32K limit
      };
      
      const runner = createLLMRunnerWithConfig(config);
      const largePrompt = 'x'.repeat(135000); // Exceeds 32K token limit
      
      // Test generateContent
      await expect(runner.generateContent(largePrompt)).rejects.toThrow(/Prompt too large/);
      
      // Test generateResponse
      await expect(runner.generateResponse(largePrompt)).rejects.toThrow(/Prompt too large/);
      
      // Test generateJSON if available
      if (runner.generateJSON) {
        await expect(runner.generateJSON(largePrompt)).rejects.toThrow(/Prompt too large/);
      }
      
      // Test generateWithTools if available
      if (runner.generateWithTools) {
        await expect(runner.generateWithTools(largePrompt)).rejects.toThrow(/Prompt too large/);
      }
    });

    it('should handle different providers correctly', async () => {
      // Test Claude with its 200K token limit
      const claudeConfig: LLMConfig = {
        provider: 'claude',
        apiKey: 'test-key',
        model: 'claude-3-haiku-20240307',
      };
      
      const claudeRunner = createLLMRunnerWithConfig(claudeConfig);
      
      // Claude has 200K token limit = ~800K chars
      const largePrompt = 'x'.repeat(810000);
      
      await expect(claudeRunner.generateContent(largePrompt)).rejects.toThrow(
        /Prompt too large: \d+ tokens exceeds claude-3-haiku-20240307 limit of 200000 tokens/
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle empty prompts', async () => {
      // Mock the module
      vi.doMock('@google/generative-ai', () => ({
        GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
          getGenerativeModel: vi.fn().mockReturnValue({
            generateContent: vi.fn().mockResolvedValue({
              response: {
                /**
                 * Mock empty text response
                 * @returns Empty string
                 */
                text: () => '',
              },
            }),
          }),
        })),
      }));
      
      const config: LLMConfig = {
        provider: 'gemini',
        apiKey: 'test-key',
      };
      
      const runner = createLLMRunnerWithConfig(config);
      
      // Empty prompt should be accepted (0 tokens)
      await expect(runner.generateContent('')).resolves.toBe('');
    });

    it('should use default limit for unknown models', async () => {
      const config: LLMConfig = {
        provider: 'gemini',
        apiKey: 'test-key',
        model: 'unknown-model-xyz', // Unknown model
      };
      
      const runner = createLLMRunnerWithConfig(config);
      
      // Should use default 100K token limit
      const prompt = 'x'.repeat(410000); // >100K tokens
      
      await expect(runner.generateContent(prompt)).rejects.toThrow(
        /Prompt too large: \d+ tokens exceeds unknown-model-xyz limit of 100000 tokens/
      );
    });

    it('should handle special characters in token estimation', async () => {
      const config: LLMConfig = {
        provider: 'gemini', // Use Gemini to avoid OpenAI API key validation
        apiKey: 'test-key',
        model: 'gemini-pro', // 32K limit
      };
      
      const runner = createLLMRunnerWithConfig(config);
      
      // Special characters and emojis
      // Each emoji counts as 2 characters in JavaScript's .length
      // We need > 131K chars to exceed 32K token limit (4 chars = 1 token)
      const specialPrompt = '😀🎉🎊'.repeat(22000); // 132K chars = ~33K tokens
      
      // Should estimate based on character count and reject
      await expect(runner.generateContent(specialPrompt)).rejects.toThrow(/Prompt too large/);
    });
  });
});