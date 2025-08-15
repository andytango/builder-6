# Builder-6

A TypeScript-based AI agent system for automated software development tasks, featuring integration with GitHub, Docker, and Google's Gemini AI.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Installation](#installation)
- [Usage](#usage)
- [Development](#development)
- [Testing](#testing)
- [API Documentation](#api-documentation)

## Overview

Builder-6 is an AI-powered development assistant that can:
- Generate development plans from natural language prompts
- Execute tasks in isolated Docker containers
- Interact with GitHub repositories (create PRs, issues, etc.)
- Leverage Google's Gemini AI for intelligent decision-making

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/builder-6.git
cd builder-6

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run tests to verify setup
npm run test

# Start using the CLI
npm run cli plan --prompt "Build a REST API" --repo-url https://github.com/user/repo
```

### Key Technologies

- **TypeScript** - Type-safe JavaScript development
- **Node.js** - Runtime environment
- **Vitest** - Fast unit testing framework
- **Prisma** - Type-safe database ORM
- **Docker** - Container management via Dockerode
- **pnpm** - Fast, disk space efficient package manager
- **ESLint & Prettier** - Code quality and formatting

## Architecture

The system follows a **service-oriented architecture** with dependency injection:

```
┌─────────────────┐
│   CLI Entry     │
│  (src/index.ts) │
└────────┬────────┘
         │
    ┌────▼─────┐
    │  Agent   │ ◄── Orchestrates all services
    │ Service  │
    └────┬─────┘
         │
    ┌────▼──────────────────────────┐
    │        Core Services          │
    ├────────────┬──────────────────┤
    │   Gemini   │     GitHub       │
    │  (AI/LLM)  │   (Repository)   │
    ├────────────┼──────────────────┤
    │   Docker   │    Database      │
    │(Containers)│    (Prisma)      │
    └────────────┴──────────────────┘
```

### Design Principles

1. **Factory Functions Only** - **NEVER use classes**. All services are plain JavaScript objects created by factory functions
2. **Plain Objects** - Services return simple objects with methods, not class instances
3. **Dependency Injection** - Services receive dependencies through factory parameters
4. **Result Type Pattern** - Docker service uses Result<T, E> for explicit error handling
5. **Test Factories** - Services with external dependencies provide test factories for mocking

**⚠️ CRITICAL: No Classes Allowed**
- Classes are prohibited in this codebase
- Always use factory functions returning plain objects
- See [Service Pattern](#service-pattern) for correct implementation

## Repository Structure

```
builder-6/
├── src/
│   ├── index.ts                 # Main CLI entry point
│   ├── index.test.ts            # E2E Docker tests
│   └── lib/
│       ├── agent/               # AI agent orchestration service
│       │   ├── index.ts         # Agent service implementation
│       │   └── index.test.ts    # Agent unit tests
│       ├── database/            # Database service (Prisma)
│       │   ├── index.ts         # Database service & test factory
│       │   ├── index.test.ts    # Database tests
│       │   └── prisma/          # Prisma schema and generated client
│       ├── docker/              # Docker container management
│       │   ├── index.ts         # Docker service & test factory
│       │   └── index.error.test.ts # Error scenario tests
│       ├── gemini/              # Google AI integration
│       │   ├── index.ts         # Gemini service & test factory
│       │   └── index.error.test.ts # Error scenario tests
│       ├── github/              # GitHub API integration
│       │   ├── index.ts         # GitHub service & test factory
│       │   └── index.test.ts    # GitHub E2E tests
│       └── utils/               # Shared utilities
│           └── result.ts        # Result type for error handling
├── package.json                 # Project dependencies
├── tsconfig.json               # TypeScript configuration
├── vitest.config.ts            # Test configuration
├── eslint.config.js            # Linting rules
├── CLAUDE.md                   # AI assistant instructions
└── README.md                   # This file
```

## Installation

### Prerequisites

- Node.js 18+ 
- pnpm package manager
- Docker (for container operations)
- PostgreSQL (for database)

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials:
# - GEMINI_API_KEY
# - GITHUB_TOKEN  
# - DATABASE_URL

# Generate Prisma client
npx prisma generate --schema=src/lib/database/prisma/schema.prisma

# Run database migrations
npx prisma migrate dev
```

## Usage

### CLI Commands

```bash
# Start planning a development task
npm run cli plan --prompt "Build a REST API" --repo-url https://github.com/user/repo

# Refine an existing plan
npm run cli refine --session-id <session-id> --prompt "Add authentication"

# Execute a plan
npm run cli execute --session-id <session-id>
```

### Programmatic Usage

```typescript
import { 
  createAgentService,
  createGeminiService,
  createGitHubService,
  createDockerService,
  createDatabaseService 
} from 'builder-6';

// Initialize services
const dockerService = createDockerService();
const geminiService = createGeminiService(process.env.GEMINI_API_KEY!);
const githubService = createGitHubService(process.env.GITHUB_TOKEN!, dockerService);
const databaseService = createDatabaseService();

// Create agent
const agentService = createAgentService({
  geminiService,
  githubService,
  dockerService,
  databaseService
});

// Start planning
const result = await agentService.startPlanning({
  prompt: 'Build a TypeScript REST API',
  repoUrl: 'https://github.com/user/repo'
});
```

## Development

### Coding Conventions

#### TypeScript Style

- **Explicit return types** for all functions (enforced by ESLint)
- **JSDoc comments** for all public functions and types
- **Interface-first design** - Define interfaces inline with implementations
- **NEVER use classes** - ONLY factory functions returning plain objects

#### Service Pattern

**✅ CORRECT: Factory Function + Plain Object**

```typescript
// Service interface defined inline
export interface MyService {
  doSomething(input: string): Promise<string>;
}

// Factory function for production use
export function createMyService(dependency: Dependency): MyService {
  return {
    async doSomething(input: string): Promise<string> {
      // Implementation using dependency
      return result;
    }
  };
}

// Test factory for services with external dependencies
export function createTestMyService(config: TestConfig = {}): MyService & TestHelpers {
  return {
    async doSomething(input: string): Promise<string> {
      // Mock implementation
      return config.mockResponse || 'test';
    },
    // Test helpers
    reset() { /* ... */ }
  };
}
```

**❌ WRONG: Never Use Classes**

```typescript
// DON'T DO THIS - Classes are prohibited
abstract class BaseService {
  protected config: Config;
  constructor(config: Config) { this.config = config; }
}

class MyService extends BaseService {
  doSomething() { /* ... */ }
}
```

#### Error Handling

- Use `Result<T, E>` type for operations that can fail (see Docker service)
- Throw exceptions only for unexpected errors
- Return explicit error objects for expected failures

### Building

```bash
# Build TypeScript
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format
```

## Testing

### Testing Strategy

The project emphasizes **end-to-end (E2E) tests** that verify complete feature flows, with unit tests for critical components.

- **Coverage Goal**: 95% for new code (primarily through E2E tests)
- **Current Coverage**: ~75% for service code, 100% for utilities
- **Test Execution**: `npm run test`
- **Coverage Report**: `npm run test -- --coverage`

### Test Categories

#### 1. E2E Tests
- `src/index.test.ts` - Docker container lifecycle
- `src/lib/github/index.test.ts` - GitHub API operations
- `src/lib/database/index.test.ts` - Database operations

#### 2. Unit Tests  
- `src/lib/agent/index.test.ts` - Agent orchestration logic
- `src/lib/test-factories.test.ts` - Test utility validation

#### 3. Error Scenario Tests
- `src/lib/gemini/index.error.test.ts` - AI service error handling
- `src/lib/docker/index.error.test.ts` - Container failure scenarios

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestMyService } from './my-service';

describe('MyService', () => {
  let service: ReturnType<typeof createTestMyService>;

  beforeEach(() => {
    service = createTestMyService({
      mockResponse: 'test response'
    });
  });

  it('should handle the happy path', async () => {
    const result = await service.doSomething('input');
    expect(result).toBe('test response');
  });

  it('should handle errors gracefully', async () => {
    service = createTestMyService({
      shouldFail: true
    });
    
    await expect(service.doSomething('input')).rejects.toThrow();
  });
});
```

### Test Utilities

All services with external dependencies provide test factories:

- `createTestGeminiService()` - Mock AI responses
- `createTestDockerService()` - Simulate container operations
- `createTestGitHubService()` - Mock GitHub API
- `createTestDatabaseService()` - In-memory database

## API Documentation

### Agent Service

The main orchestration service that coordinates all operations.

```typescript
interface AgentService {
  startPlanning(options: PlanningOptions): Promise<PlanningResult>;
  refinePlan(options: RefinementOptions): Promise<RefinementResult>;
  executePlan(options: ExecutionOptions): Promise<ExecutionResult>;
}
```

### Service Factories

#### Gemini Service
```typescript
createGeminiService(apiKey: string): GeminiService
createTestGeminiService(config?: TestGeminiConfig): GeminiService & TestHelpers
```

#### Docker Service  
```typescript
createDockerService(socketPath?: string): DockerService
createTestDockerService(config?: TestDockerConfig): DockerService & TestHelpers
```

#### GitHub Service
```typescript
createGitHubService(token: string, dockerService: DockerService): GitHubService
createTestGitHubService(config?: TestGitHubConfig): GitHubService & TestHelpers
```

#### Database Service
```typescript
createDatabaseService(connectionUrl?: string): DatabaseService
createTestDatabaseService(config?: TestDatabaseConfig): DatabaseService & TestHelpers
```

## Environment Variables

Required environment variables:

- `GEMINI_API_KEY` - Google AI API key
- `GITHUB_TOKEN` - GitHub personal access token
- `DATABASE_URL` - PostgreSQL connection string

Optional:
- `GITHUB_TEST_OWNER` - GitHub username for tests
- `GITHUB_TEST_REPO` - Repository name for tests

## Contributing

1. Follow the coding conventions outlined above
2. Write tests for new functionality (aim for 95% coverage)
3. Ensure all tests pass: `npm run test`
4. Run linting: `npm run lint`
5. Update documentation as needed

## License

[License information here]

---

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>