# Functional Requirements, Technical Specification, and Prompt Templates: Core AI Agent Service

Document Version: 1.5

Date: 11 August 2025

### **0. Introduction**

The purpose of this project is to build a new, autonomous AI coding agent. This document outlines the functional requirements and technical specifications for the core module of this agent. The agent will be capable of understanding user requests, creating plans to address them, and executing those plans by interacting with various tools and services, including the local file system, version control, and external APIs.

### **1. Functional Requirements**

#### **1.1. General**

-   **FR-101:** The Agent module must support two primary modes of operation: Planning and Execution.

-   **FR-102:** The module must manage a state machine for each session, transitioning between states such as PLANNING, AWAITING_CONFIRMATION, EXECUTING, COMPLETED, FAILED, and DEADLINE_EXCEEDED.

-   **FR-103:** All operations must be associated with a `sessionId` to retrieve and persist state via the `agent-sessions` service.

#### **1.2. Planning Mode**

-   **FR-201:** Upon initiation of a new Session with a user's prompt, the module must enter PLANNING mode.

-   **FR-202:** In PLANNING mode, the module must analyze the user's prompt, the repository's current state (via the `github-service`), and the AGENT.md Context File to generate a proposed Plan (a list of `agent-sessions.Task` objects).

-   **FR-203:** The module must return this Plan to the calling context (CLI or another function). The session state shall be updated to AWAITING_CONFIRMATION. The Plan itself will be stored as a JSON string within the `agent-sessions.Session` object.

-   **FR-204:** While awaiting confirmation, the module must support an interactive chat loop where the user can provide natural language feedback to refine the Plan. Each refinement returns a revised Plan.

-   **FR-205:** The module must have a function that accepts a final confirmation signal to lock in the Plan and prepare for Execution Mode.

#### **1.3. Execution Mode**

-   **FR-301:** Upon confirmation of the Plan, the module must be ready to enter EXECUTING mode.

-   **FR-302:** The execution process must work through the Tasks from the Plan in a sequential order.

-   **FR-303:** For each Task, the module must iteratively apply the ReAct loop until the Task's goal is achieved.

-   **FR-304:** The module must have the ability to dynamically modify the Plan during execution. Based on the outcome of a ReAct loop, it may add new tasks, modify existing ones, or mark a task as obsolete. These modifications will be persisted by updating the Plan JSON string in the `agent-sessions.Session` object.

-   **FR-305:** The module must persist its state (current task, ReAct history) via the `agent-sessions` service after each "Act" step to ensure resilience. The `reactHistory` will be stored as a JSON string within the `agent-sessions.Task` object.

-   **FR-306:** Execution must terminate under one of two conditions:

    1.  All tasks in the Plan are marked as COMPLETED.
    2.  The current time exceeds the user-defined deadline.

-   **FR-307:** Upon termination, the module must update the final session status and return a result object, including a log of all actions taken.

### **2. Technical Specification**

#### **2.1. System Architecture**

The Core Agent Module is a component within a NodeJS monolith, located at `src/lib/agent/`. It exposes its functionality via exported TypeScript functions, which are in turn consumed by other parts of the application, such as the CLI entry point. Communication between services will primarily occur through direct TypeScript function calls (imports).

```
+------------------------------------------+
|          NodeJS Monolith App             |
|                                          |
|  +------------------+                    |
|  |      CLI         |                    |
|  |   (index.ts)     |-----+              |
|  +------------------+     |              |
|                           |              |
|  +------------------+     v              |
|  | Programmatic API |-->+--------------------------+<----->+-----------------+
|  | (other modules)  |   | src/lib/agent/           |       |   Gemini API    |
|  +------------------+   |   Core Agent Module      |       +-----------------+
|                         +--------------------------+
|                                  |   ^
|                                  v   |
|            +---------------------+---------------------+
|            |                     |                     |
|  +---------------------+ +---------------------+ +---------------------+
|  | src/lib/github-service/ | | src/lib/docker-manager/ | | src/lib/agent-sessions/ |
|  |   GitHubService     | |   DockerManagerService  | |   AgentSessionsService  |
|  +---------------------+ +---------------------+ +---------------------+
|                                          |
+------------------------------------------+
```

#### **2.2. Data Models (TypeScript Interfaces)**

The Core AI Agent Service will leverage the existing `Session` and `Task` data models defined in `src/lib/agent-sessions/types.ts`.

To accommodate the `plan` and `reactHistory` requirements, the `agent-sessions` service's `Session` and `Task` models will need to be extended or modified in a future step. This will likely involve:

*   **Prisma Migrations:** Adding new fields (`rawPlan: String`, `rawReactHistory: String`) to the `Session` and `Task` models in `src/lib/agent-sessions/prisma/schema.prisma`.
*   **Type Updates:** Updating the `Session` and `Task` interfaces in `src/lib/agent-sessions/types.ts` to reflect these new fields.

For the purpose of this specification, we assume:

*   The `Plan` (a list of `agent-sessions.Task` objects) will be stored as a JSON string within a new field in the `agent-sessions.Session` model (e.g., `rawPlan: string`).
*   The `reactHistory` (an array of `{ reason, action, observation }` triplets) will be stored as a JSON string within a new field in the `agent-sessions.Task` model (e.g., `rawReactHistory: string`).

The `SessionStatus` and `TaskStatus` enums from `src/lib/agent-sessions/types.ts` will be used. Additional statuses like `DEADLINE_EXCEEDED` will need to be added to `SessionStatus` in `agent-sessions`.

#### **2.3. Module Interface & Exports (src/lib/agent/index.ts)**

The functions exposed by the Core Agent Module will adhere to the project's existing error handling conventions, returning `Promise<Result<T, Error>>` or throwing `Error` where appropriate.

```typescript
/**
 * Initiates the planning process for a new AI agent session.
 * The agent will analyze the prompt and repository state to propose an initial plan.
 * The session status will transition to AWAITING_CONFIRMATION.
 * @param options - Configuration options for planning.
 * @param options.prompt - The user's initial prompt for the agent.
 * @param options.repoUrl - The URL of the GitHub repository the agent will work on.
 * @param options.deadline - The user-defined deadline for the session.
 * @returns A Promise that resolves with the proposed Plan (list of agent-sessions.Task objects).
 */
export async function startPlanning(options: {
  prompt: string;
  repoUrl: string;
  deadline: Date;
}): Promise<Task[]>; // Returns a list of agent-sessions.Task objects

/**
 * Refines an existing plan based on user feedback.
 * This function is used during the AWAITING_CONFIRMATION phase.
 * @param options - Options for refining the plan.
 * @param options.sessionId - The ID of the session to refine the plan for.
 * @param options.refinementPrompt - The user's natural language feedback for refining the plan.
 * @returns A Promise that resolves with the revised Plan (list of agent-sessions.Task objects).
 */
export async function refinePlan(options: {
  sessionId: string;
  refinementPrompt: string;
}): Promise<Task[]>; // Returns a list of agent-sessions.Task objects

/**
 * Confirms a plan and begins the execution loop asynchronously.
 * The session status will transition to EXECUTING.
 * This function returns a Promise that resolves when execution is complete (COMPLETED, FAILED, or DEADLINE_EXCEEDED).
 * @param options - Options for executing the plan.
 * @param options.sessionId - The ID of the session to execute the plan for.
 * @returns A Promise that resolves with an object containing the final session status and a log of actions.
 */
export async function executePlan(options: {
  sessionId: string;
}): Promise<{ status: Session['status'], log: any[] }>; // Session['status'] refers to agent-sessions.Session['status']
```

#### **2.4. Core Logic - Execution Mode Loop**

This is the main control loop within the `executePlan` function. It will interact with the `agent-sessions` service to manage session and task states. The `agent` module will also contain a private helper function, `callGeminiApi(prompt: string): Promise<string>`, for interacting with the Gemini API.

```typescript
async function executePlan(options: { sessionId: string }): Promise<Result> {
  // Retrieve session using agent-sessions service
  const session = await agentSessionsService.retrieveSession(options.sessionId);
  const plan = JSON.parse(session.rawPlan); // Assuming plan is stored as JSON string

  while (session.status === 'EXECUTING') {
    const currentTask = getNextPendingTask(plan);
    if (!currentTask) {
      session.status = 'COMPLETED';
      // Update session status using agent-sessions service
      await agentSessionsService.updateSession(session);
      break;
    }

    if (new Date() > session.deadline) {
      session.status = 'DEADLINE_EXCEEDED';
      // Update session status using agent-sessions service
      await agentSessionsService.updateSession(session);
      break;
    }

    // Execute the ReAct loop for the current task
    const taskResult = await executeTaskWithReact(session, currentTask);

    currentTask.status = taskResult.status;
    currentTask.rawReactHistory = JSON.stringify(taskResult.reactHistory); // Assuming reactHistory is stored as JSON string
    // Update task using agent-sessions service
    await agentSessionsService.updateTask(currentTask);

    // Agent can modify its own plan
    if (taskResult.newPlanModifications) {
      applyModifications(plan, taskResult.newPlanModifications);
      session.rawPlan = JSON.stringify(plan); // Update rawPlan in session
      // Update session using agent-sessions service
      await agentSessionsService.updateSession(session);
    }
  }
  return { status: session.status, log: getExecutionLog(session) };
}
```

#### **2.5. ReAct Loop Implementation (for a single task)**

This is the low-level logic for `executeTaskWithReact()`. It will interact with various services and tools.

1.  **Initialize:** Get the current task and session context.

2.  **Loop:** While the task is not COMPLETED or FAILED:
    a.  **Reason:** Construct a Gemini API prompt using the "Reason" template (see 3.2.1). Await the reasoning string by calling the private `callGeminiApi` function.
    b.  **Act:** Construct a Gemini API prompt using the "Act" template (see 3.2.2), inserting the reasoning. Await the action JSON object by calling the private `callGeminiApi` function. The action JSON object will define which tool to call.
    c.  **Execute Action:** Parse the action JSON and call the appropriate tool with the provided arguments. The available tools are:
        *   **Direct Agent Tools:**
            *   `google_web_search(query: string): Promise<string>` - For performing web searches.
            *   `run_shell_command(command: string): Promise<{stdout: string, stderr: string}>` - For executing shell commands in the host environment.
            *   `web_fetch(url: string): Promise<string>` - For fetching content from a URL.

        *   **GitHub Service (`github-service`):** Imported from `src/lib/github-service/index.ts`.
            *   `createRepository(name: string, description?: string, isPrivate?: boolean): Promise<Repository>`
            *   `listRepositories(): Promise<Repository[]>`
            *   `retrieveRepository(owner: string, repo: string): Promise<Repository | null>`
            *   `createPullRequest(owner: string, repo: string, title: string, head: string, base: string, body?: string): Promise<PullRequest>`
            *   `readPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest | null>`
            *   `updatePullRequest(owner: string, repo: string, prNumber: number, updates: Partial<PullRequest>): Promise<PullRequest>`
            *   `closePullRequest(owner: string, repo: string, prNumber: number): Promise<void>`
            *   `createIssue(owner: string, repo: string, title: string, body?: string, labels?: string[]): Promise<Issue>`
            *   `readIssue(owner: string, repo: string, issueNumber: number): Promise<Issue | null>`
            *   `updateIssue(owner: string, repo: string, issueNumber: number, updates: Partial<Issue>): Promise<Issue>`
            *   `closeIssue(owner: string, repo: string, issueNumber: number): Promise<void>`
            *   `configureGitClientInContainer(containerId: string, username: string, token: string): Promise<void>`

        *   **Docker Manager Service (`docker-manager`):** Imported from `src/lib/docker-manager/index.ts`.
            *   `createContainer(options: any): Promise<{id: string}>`
            *   `destroyContainer(containerId: string): Promise<void>`
            *   `executeScript(containerId: string, script: string): Promise<{stdout: string, stderr: string}>`
            *   `getAllSourceFiles(containerId: string): Promise<string>`
            *   `readFileInContainer(containerId: string, path: string): Promise<string>`
            *   `listContainers(all?: boolean): Promise<any[]>`
            *   `cleanupGroupContainers(group: string): Promise<void>`

    d.  **Observe:** Capture the return value or thrown exception from the tool call. This is the `observation_result`.
    e.  **Reflect:** Construct a Gemini API prompt using the "Observe/Reflect" template (see 3.2.3). Await the reflection JSON by calling the private `callGeminiApi` function.
    f.  **Update History:** Append the complete `{reason, action, observation}` triplet to the task's `reactHistory` (stored as JSON string in `agent-sessions.Task`) and persist it via `agent-sessions.updateTask`.
    g.  **Check for Completion:** If the reflection step returned `is_task_complete: true`, break the loop and return a COMPLETED status for the task. If a persistent error occurs, break and return FAILED.

#### **2.6. External Dependencies**

The Core AI Agent Module will utilize the following external libraries:

*   **Gemini SDK:** For interacting with the Gemini API.
*   **`@octokit/rest`:** Used by `github-service` for GitHub API interactions.
*   **`dockerode`:** Used by `docker-manager` for Docker daemon interactions.
*   **`yargs`:** For CLI command parsing.
*   **`dotenv`:** For environment variable loading.
*   **`simple-git`:** Used in tests for Git operations.

#### **2.7. Environment Variables**

The following environment variables will be used for configuring the Core AI Agent Service:

*   `GEMINI_API_KEY`: Your API key for accessing the Gemini API. (Used if Vertex AI variables are not set)
*   `GEMINI_MODEL`: The specific Gemini model to use (e.g., `gemini-pro`, `gemini-1.5-pro`).

**For Vertex AI Integration (alternative to GEMINI_API_KEY):**

*   `VERTEX_AI_PROJECT_ID`: Your Google Cloud Project ID where Vertex AI is enabled.
*   `VERTEX_AI_LOCATION`: The Google Cloud region where your Vertex AI model is deployed (e.g., `us-central1`).
*   `VERTEX_AI_ENDPOINT`: Optional. A custom endpoint for Vertex AI. If not provided, the default endpoint for the specified location will be used.

Additionally, the following environment variables are used by integrated services:

*   `GITHUB_TOKEN`: Your GitHub Personal Access Token (PAT) with appropriate scopes (e.g., `repo`, `workflow`, `admin:org`).
*   `DATABASE_URL`: Connection string for the PostgreSQL database (used by `agent-sessions`).