# AI Assistant Instructions for builder-6

## Project Context

This is an AI-powered development assistant system. For detailed project information, architecture, and development guidelines, please refer to [README.md](./README.md).

## AI-Specific Instructions

When working on this codebase, follow these guidelines:

### Code Generation Rules

1. **Service Pattern Compliance (CRITICAL)**
   - **NEVER use classes under any circumstances**
   - **ALWAYS use factory functions that return plain objects**
   - Define interfaces inline with service implementations
   - Provide test factories for services with external dependencies
   - **REJECT any code that uses classes, inheritance, or OOP patterns**

2. **Type Safety**
   - All functions MUST have explicit return types (enforced by ESLint)
   - All public functions MUST have JSDoc comments
   - Use the `Result<T, E>` type for operations that can fail

3. **Testing Requirements**
   - New code should aim for 95% test coverage
   - Prioritize E2E tests over unit tests
   - Avoid mocks where possible - use test factories instead
   - Test error scenarios and edge cases explicitly

### Important Reminders

- **NEVER USE CLASSES** - This is absolutely prohibited in this codebase
- **DO NOT** create documentation files (*.md) unless explicitly requested
- **DO NOT** proactively create README files
- **ALWAYS** prefer editing existing files over creating new ones
- **NEVER** use git commands unless explicitly asked
- **NEVER** create files unless absolutely necessary for the task

### When Modifying Services

1. Check if a test factory exists - if the service has external dependencies, it should have one
2. Update both the service and its test factory when adding new methods
3. Ensure error handling follows the established patterns (Result type for Docker, exceptions for others)
4. Add corresponding tests for any new functionality

### Testing Checklist

When adding or modifying tests:
- [ ] Use `createTest*Service()` factories for mocking
- [ ] Test both success and failure paths
- [ ] Include edge cases (empty inputs, large inputs, special characters)
- [ ] Verify error messages are meaningful
- [ ] Ensure tests are deterministic (no random failures)

### Architecture Notes

The system uses a service-oriented architecture with these key services:
- **Agent Service**: Orchestrates all operations (no test factory needed - pure logic)
- **LLMRunner Service**: Multi-provider AI/LLM integration (has test factory)
- **Docker Service**: Container management using Result type (has test factory)
- **GitHub Service**: Repository operations (has test factory)
- **Database Service**: Prisma-based persistence (has test factory)
- **Errors Service**: Centralized error handling utilities (100% test coverage)

**All services MUST follow the factory pattern - NO CLASSES ALLOWED**

See [README.md](./README.md) for complete architecture documentation.

## Quick Reference

**Run tests**: `npm run test`  
**Check coverage**: `npm run test:coverage`  
**Lint code**: `npm run lint`  
**Build project**: `npm run build`
**Type check**: `npm run typecheck`
**Format code**: `npm run format`

---

*This file contains AI-specific instructions. For general project documentation, see [README.md](./README.md)*