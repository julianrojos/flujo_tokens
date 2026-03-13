/**
 * Components Handlers Tests
 */

import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../protocol';
import {
  handleGetLocalComponents,
  handleGetComponent,
  handleInstantiateComponent,
  handleSetNodeDescription,
  handleAddComponentProperty,
  handleEditComponentProperty,
  handleDeleteComponentProperty,
  handleSetInstanceProperties,
} from '../handlers/components';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

afterEach(() => {
  clearMockFigma();
});

describe('components handlers', () => {
  it('handleGetLocalComponents returns standalone components and component sets', async () => {
    const standaloneComponent = {
      id: '10:1',
      key: 'standalone-key',
      name: 'Button',
      type: 'COMPONENT',
      description: 'Standalone button',
      width: 120,
      height: 40,
      componentPropertyDefinitions: {
        Label: { type: 'TEXT', defaultValue: 'Button' },
      },
      parent: null,
    };

    const variantA = {
      id: '20:1',
      key: 'variant-a',
      name: 'Size=md, State=default',
      type: 'COMPONENT',
      description: 'Default variant',
      width: 120,
      height: 40,
      parent: null as unknown,
    };

    const variantB = {
      id: '20:2',
      key: 'variant-b',
      name: 'Size=md, State=hover',
      type: 'COMPONENT',
      description: 'Hover variant',
      width: 120,
      height: 40,
      parent: null as unknown,
    };

    const componentSet = {
      id: '20:0',
      key: 'component-set-key',
      name: 'Button / Variants',
      type: 'COMPONENT_SET',
      description: 'Button variants',
      componentPropertyDefinitions: {
        Size: { type: 'VARIANT', defaultValue: 'md' },
      },
      children: [variantA, variantB],
    };

    variantA.parent = componentSet;
    variantB.parent = componentSet;
    standaloneComponent.parent = {
      id: '1:1',
      type: 'PAGE',
      name: 'Page 1',
      children: [standaloneComponent, componentSet],
    };

    setMockFigma({
      root: {
        name: 'Test File',
        children: [standaloneComponent.parent],
      },
      fileKey: 'file-key',
      loadAllPagesAsync: async () => undefined,
    });

    const result = await handleGetLocalComponents({});
    const typed = result as {
      success: boolean;
      data: {
        totalComponents: number;
        totalComponentSets: number;
        components: Array<{ name: string }>;
        componentSets: Array<{ name: string; variants: unknown[] }>;
      };
    };

    expect(typed.success).toBe(true);
    expect(typed.data.totalComponents).toBe(1);
    expect(typed.data.totalComponentSets).toBe(1);
    expect(typed.data.components[0]?.name).toBe('Button');
    expect(typed.data.componentSets[0]?.name).toBe('Button / Variants');
    expect(typed.data.componentSets[0]?.variants).toHaveLength(2);
  });

  it('handleGetComponent returns component metadata', async () => {
    setMockFigma({
      getNodeByIdAsync: async (id: string) =>
        id === '10:1'
          ? {
              id: '10:1',
              name: 'Button',
              type: 'COMPONENT',
              description: 'Component',
              descriptionMarkdown: null,
              visible: true,
              locked: false,
              annotations: [],
              componentPropertyDefinitions: {},
              children: [],
              parent: { type: 'PAGE' },
            }
          : null,
    });

    const result = await handleGetComponent({ nodeId: '10:1' });
    const typed = result as {
      success: boolean;
      component: { id: string; type: string; isVariant: boolean };
    };

    expect(typed.success).toBe(true);
    expect(typed.component.id).toBe('10:1');
    expect(typed.component.type).toBe('COMPONENT');
    expect(typed.component.isVariant).toBe(false);
  });

  it('handleGetComponent returns FIGMA_API_ERROR when node is missing', async () => {
    setMockFigma({
      getNodeByIdAsync: async () => null,
    });

    await expect(handleGetComponent({ nodeId: 'missing' })).rejects.toMatchObject({
      code: ERROR_CODES.FIGMA_API_ERROR,
    });
  });

  it('handleInstantiateComponent creates and positions an instance from local component', async () => {
    const appendedIds: string[] = [];

    const instance = {
      id: 'instance-1',
      name: 'Button Instance',
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      setProperties: (_props: Record<string, unknown>) => undefined,
      resize: function resize(width: number, height: number) {
        this.width = width;
        this.height = height;
      },
    };

    const componentNode = {
      id: 'component-1',
      type: 'COMPONENT',
      createInstance: () => instance,
    };

    const parentFrame = {
      id: 'frame-1',
      type: 'FRAME',
      appendChild: (node: { id: string }) => {
        appendedIds.push(node.id);
      },
    };

    setMockFigma({
      importComponentByKeyAsync: async () => {
        throw new Error('not published');
      },
      getNodeByIdAsync: async (id: string) => {
        if (id === 'component-1') return componentNode;
        if (id === 'frame-1') return parentFrame;
        return null;
      },
    });

    const result = await handleInstantiateComponent({
      nodeId: 'component-1',
      parentId: 'frame-1',
      position: { x: 24, y: 32 },
      size: { width: 140, height: 48 },
      overrides: { Label: 'Save' },
    });

    const typed = result as {
      success: boolean;
      instance: { id: string; x: number; y: number; width: number; height: number };
    };

    expect(typed.success).toBe(true);
    expect(typed.instance.id).toBe('instance-1');
    expect(typed.instance.x).toBe(24);
    expect(typed.instance.y).toBe(32);
    expect(typed.instance.width).toBe(140);
    expect(typed.instance.height).toBe(48);
    expect(appendedIds).toEqual(['instance-1']);
  });

  it('handleSetNodeDescription sets description on supported nodes', async () => {
    const node = {
      id: 'node-1',
      type: 'COMPONENT',
      name: 'Button',
      description: '',
      descriptionMarkdown: '',
    };

    setMockFigma({
      getNodeByIdAsync: async () => node,
    });

    const result = await handleSetNodeDescription({
      nodeId: 'node-1',
      description: 'Primary action button',
      descriptionMarkdown: '**Primary** action button',
    });

    const typed = result as {
      success: boolean;
      node: { description: string };
    };

    expect(typed.success).toBe(true);
    expect(typed.node.description).toBe('Primary action button');
  });

  it('handleAddComponentProperty adds a property on a component', async () => {
    const node = {
      id: 'component-1',
      type: 'COMPONENT',
      parent: { type: 'PAGE' },
      addComponentProperty: () => 'Show Icon#12:4',
    };

    setMockFigma({
      getNodeByIdAsync: async () => node,
    });

    const result = await handleAddComponentProperty({
      nodeId: 'component-1',
      propertyName: 'Show Icon',
      propertyType: 'BOOLEAN',
      defaultValue: false,
    });

    expect(result).toMatchObject({
      success: true,
      propertyName: 'Show Icon#12:4',
    });
  });

  it('handleEditComponentProperty edits default value', async () => {
    const node = {
      id: 'component-1',
      type: 'COMPONENT',
      editComponentProperty: () => 'Label#12:6',
    };

    setMockFigma({
      getNodeByIdAsync: async () => node,
    });

    const result = await handleEditComponentProperty({
      nodeId: 'component-1',
      propertyName: 'Label#12:6',
      newValue: 'Save',
    });

    expect(result).toMatchObject({
      success: true,
      propertyName: 'Label#12:6',
    });
  });

  it('handleDeleteComponentProperty deletes a property', async () => {
    let deletedProp: string | null = null;
    const node = {
      id: 'component-1',
      type: 'COMPONENT',
      deleteComponentProperty: (name: string) => {
        deletedProp = name;
      },
    };

    setMockFigma({
      getNodeByIdAsync: async () => node,
    });

    const result = await handleDeleteComponentProperty({
      nodeId: 'component-1',
      propertyName: 'Show Icon#12:4',
    });

    expect(result).toMatchObject({ success: true });
    expect(deletedProp).toBe('Show Icon#12:4');
  });

  it('handleSetInstanceProperties maps shorthand property names to suffixed names', async () => {
    let setProps: Record<string, unknown> = {};

    const instanceNode = {
      id: 'instance-1',
      name: 'Button Instance',
      type: 'INSTANCE',
      getMainComponentAsync: async () => ({ id: 'component-main' }),
      componentProperties: {
        'Label#12:6': { type: 'TEXT', value: 'Old label' },
        Enabled: { type: 'BOOLEAN', value: true },
      },
      setProperties: (props: Record<string, unknown>) => {
        setProps = props;
      },
    };

    setMockFigma({
      getNodeByIdAsync: async () => instanceNode,
    });

    const result = await handleSetInstanceProperties({
      nodeId: 'instance-1',
      properties: {
        Label: 'New label',
        Enabled: false,
      },
    });

    const typed = result as {
      success: boolean;
      instance: { propertiesSet: string[] };
    };

    expect(typed.success).toBe(true);
    expect(setProps).toEqual({
      'Label#12:6': 'New label',
      Enabled: false,
    });
    expect(typed.instance.propertiesSet).toContain('Label#12:6');
    expect(typed.instance.propertiesSet).toContain('Enabled');
  });

  it('handleSetInstanceProperties returns FIGMA_API_ERROR when node is not an instance', async () => {
    setMockFigma({
      getNodeByIdAsync: async () => ({ id: 'node-1', type: 'FRAME' }),
    });

    await expect(
      handleSetInstanceProperties({ nodeId: 'node-1', properties: {} })
    ).rejects.toMatchObject({
      code: ERROR_CODES.FIGMA_API_ERROR,
    });
  });

  it('handleGetLocalComponents processes pages in batches without blocking UI', async () => {
    // Create 10 pages with components
    const pages = Array.from({ length: 10 }, (_, i) => ({
      id: `page-${i}`,
      name: `Page ${i}`,
      type: 'PAGE' as const,
      children: [
        {
          id: `comp-${i}`,
          key: `key-${i}`,
          name: `Component ${i}`,
          type: 'COMPONENT' as const,
          description: `Component ${i} description`,
          width: 100,
          height: 100,
          componentPropertyDefinitions: {},
          parent: null as unknown,
        },
      ],
    }));

    setMockFigma({
      root: {
        name: 'Test File',
        children: pages,
      },
      fileKey: 'file-key',
      loadAllPagesAsync: async () => undefined,
    });

    const result = await handleGetLocalComponents({});
    const typed = result as {
      success: boolean;
      data: {
        totalComponents: number;
        totalComponentSets: number;
        components: Array<{ name: string }>;
        componentSets: Array<{ name: string }>;
      };
    };

    expect(typed.success).toBe(true);
    expect(typed.data.totalComponents).toBe(10);
    expect(typed.data.totalComponentSets).toBe(0);
    expect(typed.data.components).toHaveLength(10);
  });
});
