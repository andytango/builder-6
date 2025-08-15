import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDockerService, DockerService } from './index.js';
import { TestDockerHelpers } from './index.js';

describe('Docker Service', () => {
  let service: DockerService & TestDockerHelpers;

  beforeEach(() => {
    service = createTestDockerService();
  });

  it('should create a container successfully', async () => {
    const result = await service.createContainer({ groupId: 'test-group' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBeDefined();
      expect(result.value.status).toBe('running');
    }
  });

  it('should list containers', async () => {
    await service.createContainer({ groupId: 'group1' });
    await service.createContainer({ groupId: 'group2' });

    const result = await service.listContainers();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  it('should list containers by group ID', async () => {
    await service.createContainer({ groupId: 'group1' });
    await service.createContainer({ groupId: 'group1' });
    await service.createContainer({ groupId: 'group2' });

    const result = await service.listContainers('group1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  it('should destroy a container', async () => {
    const createResult = await service.createContainer({ groupId: 'test-group' });
    expect(createResult.ok).toBe(true);

    if (createResult.ok) {
      const destroyResult = await service.destroyContainer(createResult.value.id);
      expect(destroyResult.ok).toBe(true);

      const listResult = await service.listContainers();
      expect(listResult.ok).toBe(true);
      if (listResult.ok) {
        expect(listResult.value).toHaveLength(0);
      }
    }
  });

  it('should execute a script in a container', async () => {
    const createResult = await service.createContainer({ groupId: 'test-group' });
    expect(createResult.ok).toBe(true);

    if (createResult.ok) {
      const execResult = await service.executeScript({
        containerId: createResult.value.id,
        script: 'echo "hello world"',
      });
      expect(execResult.ok).toBe(true);
      if (execResult.ok) {
        expect(execResult.value).toBe('hello world\n');
      }
    }
  });


  it('should handle container limit', async () => {
    const limitedService = createTestDockerService({ containerLimit: 2 });

    // Create 2 containers, should succeed
    const result1 = await limitedService.createContainer({ groupId: 'limited-group' });
    expect(result1.ok).toBe(true);
    const result2 = await limitedService.createContainer({ groupId: 'limited-group' });
    expect(result2.ok).toBe(true);

    // Create a 3rd, should fail
    const result3 = await limitedService.createContainer({ groupId: 'limited-group' });
    expect(result3.ok).toBe(false);
    if (!result3.ok) {
      expect(result3.error.type).toBe('ContainerLimitReached');
    }
  });

  it('should reset the service state', async () => {
    await service.createContainer({ groupId: 'test-group' });
    expect(service.getContainerCount()).toBe(1);

    service.reset();
    expect(service.getContainerCount()).toBe(0);
  });

  it('should simulate container failure', async () => {
    const createResult = await service.createContainer({ groupId: 'test-group' });
    expect(createResult.ok).toBe(true);

    if (createResult.ok) {
      service.simulateContainerFailure(createResult.value.id);
      const containers = service.getContainers();
      const container = containers.find((c) => c.id === createResult.value.id);
      expect(container?.status).toBe('exited');
    }
  });
});
