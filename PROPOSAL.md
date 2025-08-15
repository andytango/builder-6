### **Proposal: Advanced File Ingestion Method for Docker Service**

The goal is to create a method on the `DockerService`, `ingestDirectory`, that analyzes a directory *within an existing container*. This method will replicate the sophisticated, in-memory tree-building logic of the `gitingest` tool using TypeScript. It will not handle container creation or repository cloning.

#### 1. Core Logic (Inspired by `gitingest`)

The function will perform the following steps, orchestrated in TypeScript:

1.  **List Files:** Execute a command in the container to get a recursive list of all files and directories at the specified path.
2.  **Build In-Memory Tree:** Parse the file list and construct a `FileSystemNode` tree in memory, representing the directory structure.
3.  **Fetch File Content:** For each file in the tree, execute a command to read its content from the container.
4.  **Format Output:** Use the completed in-memory tree to generate a final, formatted string containing the file contents and any other desired information (like a directory map).

#### 2. Proposed Implementation

The new method will be added to the `DockerService`. The complex logic will be encapsulated in private helper functions within the same module.

**A. New Method in `DockerService` (`src/lib/docker/index.ts`)**

1.  **`FileSystemNode` Interface**: A private interface will be defined to represent nodes in our file tree.
    ```typescript
    interface FileSystemNode { /* ... */ }
    ```
2.  **`ingestDirectory` Method**: A new public method will be added to the `DockerService` interface.
    ```typescript
    export interface IngestDirectoryOptions {
      containerId: string;
      path: string;
    }

    // In DockerService interface
    ingestDirectory(options: IngestDirectoryOptions): Promise<Result<string, DockerError>>;
    ```
3.  **Orchestration Logic**: The `ingestDirectory` method will:
    a. **Get File List**: Use `this.executeScript()` to run `find . -print` within the container at the specified path.
    b. **Build Tree**: Pass the raw file list to a private helper function (`_buildFileSystemTree`) to construct the `FileSystemNode` tree in memory.
    c. **Fetch Content**: Pass the tree to another helper (`_fetchFileContents`). This function will iterate through the file nodes and uses `this.executeScript()` to `cat` the content for each file.
    d. **Format Output**: Pass the completed tree to a final helper (`_formatIngestionOutput`) to generate the final output string.

**B. Dockerfile and Configuration**

*   No new Dockerfile is required. The implementation will rely on standard tools (`find`, `cat`) expected to be in the default container image.
*   No configuration changes are needed.

**C. Testing (`src/lib/docker/index.test.ts`)**

*   The `createTestDockerService` will be updated with a mock implementation of `ingestDirectory`.
*   Tests will focus on the TypeScript logic for tree-building and formatting, using mock responses for the `executeScript` calls to simulate getting a file list and file contents.

This plan provides the powerful, `gitingest`-style logic you want, but as a focused utility that operates on existing containers, making it a clean addition to the `DockerService`.
