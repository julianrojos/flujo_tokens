export interface MockFigmaNode {
  id: string;
  type: string;
  name: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  opacity?: number;
  cornerRadius?: number;
  fills?: unknown[];
  strokes?: unknown[];
  strokeWeight?: number;
  characters?: string;
  fontName?: { family: string; style: string };
  fontSize?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  description?: string;
  descriptionMarkdown?: string;
  visible?: boolean;
  locked?: boolean;
  parent?: MockFigmaNode | null;
  children?: MockFigmaNode[];
  remove: () => void;
  clone: () => MockFigmaNode;
  createInstance?: () => MockFigmaNode;
  resize: (w: number, h: number) => void;
  resizeWithoutConstraints: (w: number, h: number) => void;
  exportAsync: (_settings: unknown) => Promise<Uint8Array>;
  appendChild: (child: MockFigmaNode) => void;
  addComponentProperty?: (
    propertyName: string,
    propertyType: string,
    defaultValue: unknown,
    _options?: unknown,
  ) => string;
  editComponentProperty?: (propertyName: string, newValue: { defaultValue?: unknown; name?: string }) => string;
  deleteComponentProperty?: (propertyName: string) => void;
  componentPropertyDefinitions?: Record<string, { type: string; defaultValue?: unknown }>;
  componentProperties?: Record<string, { type: string; value: unknown }>;
  setProperties?: (values: Record<string, unknown>) => void;
  getMainComponentAsync?: () => Promise<MockFigmaNode | null>;
}

interface MockVariable {
  id: string;
  name: string;
  key: string;
  resolvedType: string;
  valuesByMode: Record<string, unknown>;
  variableCollectionId: string;
  scopes: string[];
  description: string;
  hiddenFromPublishing: boolean;
  setValueForMode: (modeId: string, value: unknown) => void;
  remove: () => void;
}

interface MockCollection {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
  remove: () => void;
  addMode: (name: string) => string;
  renameMode: (modeId: string, newName: string) => void;
}

export interface MockFigma {
  root: { name: string; children: MockFigmaNode[] };
  fileKey: string;
  currentPage: MockFigmaNode & { selection: MockFigmaNode[] };
  ui: {
    onmessage: ((msg: Record<string, unknown>) => Promise<void> | void) | null;
    postMessage: (msg: Record<string, unknown>) => void;
    resize?: (width: number, height: number) => void;
  };
  variables: {
    getLocalVariablesAsync: () => Promise<MockVariable[]>;
    getLocalVariableCollectionsAsync: () => Promise<MockCollection[]>;
    getVariableByIdAsync: (id: string) => Promise<MockVariable | null>;
    getVariableCollectionByIdAsync: (id: string) => Promise<MockCollection | null>;
    createVariable: (name: string, collection: MockCollection | string, resolvedType: string) => MockVariable;
    createVariableCollection: (name: string) => MockCollection;
  };
  showUI: (_html: string, _opts: Record<string, unknown>) => void;
  notify: (_message: string, _opts?: Record<string, unknown>) => void;
  base64Encode: (bytes: Uint8Array) => string;
  getNodeByIdAsync: (id: string) => Promise<MockFigmaNode | null>;
  loadAllPagesAsync: () => Promise<void>;
  on: (_event: string, _handler: (...args: unknown[]) => void) => void;
  importComponentByKeyAsync: (_key: string) => Promise<MockFigmaNode>;
  createRectangle: () => MockFigmaNode;
  createEllipse: () => MockFigmaNode;
  createFrame: () => MockFigmaNode;
  createText: () => MockFigmaNode;
  createLine: () => MockFigmaNode;
  createPolygon: () => MockFigmaNode;
  createStar: () => MockFigmaNode;
  createVector: () => MockFigmaNode;
  loadFontAsync: (_font: { family: string; style: string }) => Promise<void>;
}

function createNode(type: string, id: string, name: string): MockFigmaNode {
  const node: MockFigmaNode = {
    id,
    type,
    name,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 1,
    cornerRadius: 0,
    fills: [],
    strokes: [],
    strokeWeight: 1,
    characters: '',
    fontName: { family: 'Inter', style: 'Regular' },
    fontSize: 14,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    description: '',
    descriptionMarkdown: '',
    visible: true,
    locked: false,
    parent: null,
    children: [],
    remove() {
      if (!node.parent || !node.parent.children) return;
      node.parent.children = node.parent.children.filter((child) => child.id !== node.id);
    },
    clone() {
      const cloned = createNode(type, `${id}-clone`, `${name} Copy`);
      cloned.x = (node.x ?? 0) + 16;
      cloned.y = (node.y ?? 0) + 16;
      cloned.width = node.width;
      cloned.height = node.height;
      cloned.parent = node.parent;
      if (node.parent?.children) {
        node.parent.children.push(cloned);
      }
      return cloned;
    },
    createInstance() {
      if (node.type !== 'COMPONENT') {
        throw new Error(`Node type ${node.type} cannot create instances`);
      }
      const instance = createNode('INSTANCE', `${id}-instance`, `${name} Instance`);
      const definitions = node.componentPropertyDefinitions ?? {};
      instance.componentProperties = Object.keys(definitions).reduce(
        (acc, key) => {
          const definition = definitions[key];
          acc[key] = {
            type: definition.type,
            value: definition.defaultValue ?? '',
          };
          return acc;
        },
        {} as Record<string, { type: string; value: unknown }>,
      );
      return instance;
    },
    resize(w: number, h: number) {
      node.width = w;
      node.height = h;
      node.absoluteBoundingBox = { x: node.x ?? 0, y: node.y ?? 0, width: w, height: h };
    },
    resizeWithoutConstraints(w: number, h: number) {
      node.resize(w, h);
    },
    async exportAsync() {
      return new Uint8Array([1, 2, 3, 4]);
    },
    appendChild(child: MockFigmaNode) {
      if (!node.children) {
        node.children = [];
      }
      child.parent = node;
      node.children.push(child);
    },
    addComponentProperty(propertyName, propertyType, defaultValue) {
      const key = `${propertyName}#prop`;
      node.componentPropertyDefinitions = node.componentPropertyDefinitions ?? {};
      node.componentPropertyDefinitions[key] = { type: propertyType, defaultValue };
      return key;
    },
    editComponentProperty(propertyName, newValue) {
      const defs = node.componentPropertyDefinitions ?? {};
      if (!defs[propertyName]) {
        throw new Error(`Property not found: ${propertyName}`);
      }
      const renamed = newValue.name ?? propertyName;
      defs[renamed] = {
        type: defs[propertyName].type,
        defaultValue: newValue.defaultValue ?? defs[propertyName].defaultValue,
      };
      if (renamed !== propertyName) {
        delete defs[propertyName];
      }
      node.componentPropertyDefinitions = defs;
      return renamed;
    },
    deleteComponentProperty(propertyName) {
      const defs = node.componentPropertyDefinitions ?? {};
      delete defs[propertyName];
      node.componentPropertyDefinitions = defs;
    },
    setProperties(values: Record<string, unknown>) {
      node.componentProperties = node.componentProperties ?? {};
      for (const [propName, propValue] of Object.entries(values)) {
        const existing = node.componentProperties[propName];
        node.componentProperties[propName] = {
          type: existing?.type ?? 'TEXT',
          value: propValue,
        };
      }
    },
    async getMainComponentAsync() {
      return node.type === 'INSTANCE' ? createNode('COMPONENT', 'component-1', 'Button') : null;
    },
  };

  return node;
}

export function createMockFigma(postMessage?: (msg: Record<string, unknown>) => void): MockFigma {
  const nodesById = new Map<string, MockFigmaNode>();

  const page = createNode('PAGE', 'page-1', 'Page 1') as MockFigmaNode & { selection: MockFigmaNode[] };
  page.selection = [];

  const frame = createNode('FRAME', 'frame-1', 'Main Frame');
  const rect = createNode('RECTANGLE', 'rect-1', 'Rectangle 1');
  const component = createNode('COMPONENT', 'comp-1', 'Button');
  component.componentPropertyDefinitions = {
    'Label#123': { type: 'TEXT', defaultValue: 'Label' },
  };
  const instance = createNode('INSTANCE', 'inst-1', 'Button Instance');
  instance.componentProperties = {
    'Label#123': { type: 'TEXT', value: 'Label' },
  };
  const text = createNode('TEXT', 'text-1', 'Label Text');
  text.characters = 'Hello';

  page.appendChild(frame);
  frame.appendChild(rect);
  frame.appendChild(component);
  frame.appendChild(instance);
  frame.appendChild(text);

  [page, frame, rect, component, instance, text].forEach((node) => nodesById.set(node.id, node));

  const collections = new Map<string, MockCollection>();
  const variables = new Map<string, MockVariable>();

  const defaultCollection: MockCollection = {
    id: 'collection-1',
    name: 'Primitives',
    key: 'collection-key-1',
    modes: [{ modeId: 'mode-1', name: 'Default' }],
    defaultModeId: 'mode-1',
    variableIds: ['var-1'],
    remove() {
      collections.delete(defaultCollection.id);
    },
    addMode(name: string) {
      const modeId = `mode-${defaultCollection.modes.length + 1}`;
      defaultCollection.modes.push({ modeId, name });
      return modeId;
    },
    renameMode(modeId: string, newName: string) {
      const mode = defaultCollection.modes.find((item) => item.modeId === modeId);
      if (!mode) {
        throw new Error(`Mode not found: ${modeId}`);
      }
      mode.name = newName;
    },
  };
  collections.set(defaultCollection.id, defaultCollection);

  const baseVariable: MockVariable = {
    id: 'var-1',
    name: 'color/primary',
    key: 'var-key-1',
    resolvedType: 'COLOR',
    valuesByMode: { 'mode-1': { r: 1, g: 0, b: 0, a: 1 } },
    variableCollectionId: defaultCollection.id,
    scopes: ['ALL_SCOPES'],
    description: 'Primary color',
    hiddenFromPublishing: false,
    setValueForMode(modeId: string, value: unknown) {
      baseVariable.valuesByMode[modeId] = value;
    },
    remove() {
      variables.delete(baseVariable.id);
      defaultCollection.variableIds = defaultCollection.variableIds.filter((id) => id !== baseVariable.id);
    },
  };
  variables.set(baseVariable.id, baseVariable);

  const figma: MockFigma = {
    root: { name: 'Test File', children: [page] },
    fileKey: 'test-file-key',
    currentPage: page,
    ui: {
      onmessage: null,
      postMessage: postMessage ?? (() => {}),
      resize: () => {},
    },
    variables: {
      async getLocalVariablesAsync() {
        return Array.from(variables.values());
      },
      async getLocalVariableCollectionsAsync() {
        return Array.from(collections.values());
      },
      async getVariableByIdAsync(id: string) {
        return variables.get(id) ?? null;
      },
      async getVariableCollectionByIdAsync(id: string) {
        return collections.get(id) ?? null;
      },
      createVariable(name: string, collection: MockCollection | string, resolvedType: string) {
        const collectionId = typeof collection === 'string' ? collection : collection.id;
        const parentCollection = collections.get(collectionId);
        if (!parentCollection) {
          throw new Error(`Collection not found: ${collectionId}`);
        }
        const newVariable: MockVariable = {
          id: `var-${variables.size + 1}`,
          name,
          key: `var-key-${variables.size + 1}`,
          resolvedType,
          valuesByMode: {},
          variableCollectionId: collectionId,
          scopes: ['ALL_SCOPES'],
          description: '',
          hiddenFromPublishing: false,
          setValueForMode(modeId: string, value: unknown) {
            newVariable.valuesByMode[modeId] = value;
          },
          remove() {
            variables.delete(newVariable.id);
            parentCollection.variableIds = parentCollection.variableIds.filter((id) => id !== newVariable.id);
          },
        };
        variables.set(newVariable.id, newVariable);
        parentCollection.variableIds.push(newVariable.id);
        return newVariable;
      },
      createVariableCollection(name: string) {
        const newCollection: MockCollection = {
          id: `collection-${collections.size + 1}`,
          name,
          key: `collection-key-${collections.size + 1}`,
          modes: [{ modeId: `mode-${collections.size + 1}-1`, name: 'Mode 1' }],
          defaultModeId: `mode-${collections.size + 1}-1`,
          variableIds: [],
          remove() {
            collections.delete(newCollection.id);
          },
          addMode(modeName: string) {
            const modeId = `${newCollection.id}-mode-${newCollection.modes.length + 1}`;
            newCollection.modes.push({ modeId, name: modeName });
            return modeId;
          },
          renameMode(modeId: string, newName: string) {
            const mode = newCollection.modes.find((item) => item.modeId === modeId);
            if (!mode) {
              throw new Error(`Mode not found: ${modeId}`);
            }
            mode.name = newName;
          },
        };
        collections.set(newCollection.id, newCollection);
        return newCollection;
      },
    },
    showUI: () => {},
    notify: () => {},
    base64Encode(bytes: Uint8Array) {
      return Buffer.from(bytes).toString('base64');
    },
    async getNodeByIdAsync(id: string) {
      return nodesById.get(id) ?? null;
    },
    async loadAllPagesAsync() {
      return;
    },
    on: () => {},
    async importComponentByKeyAsync() {
      return component;
    },
    createRectangle: () => createNode('RECTANGLE', `rect-${Date.now()}`, 'Rectangle'),
    createEllipse: () => createNode('ELLIPSE', `ellipse-${Date.now()}`, 'Ellipse'),
    createFrame: () => createNode('FRAME', `frame-${Date.now()}`, 'Frame'),
    createText: () => createNode('TEXT', `text-${Date.now()}`, 'Text'),
    createLine: () => createNode('LINE', `line-${Date.now()}`, 'Line'),
    createPolygon: () => createNode('POLYGON', `polygon-${Date.now()}`, 'Polygon'),
    createStar: () => createNode('STAR', `star-${Date.now()}`, 'Star'),
    createVector: () => createNode('VECTOR', `vector-${Date.now()}`, 'Vector'),
    async loadFontAsync() {
      return;
    },
  };

  return figma;
}
