import type { CompatResponse } from '../candidate-client';
import { expect } from 'vitest';
import {
  asObject,
  expectBothFailure,
  expectBothSuccess,
  expectErrorIncludes,
  expectSameNumberField,
  expectSameStringField,
} from '../assertions';

export interface CompatCase {
  id: string;
  description: string;
  method: string;
  params: Record<string, unknown>;
  assert: (oracle: CompatResponse, candidate: CompatResponse) => void;
}

/**
 * Methods intentionally deferred from oracle parity checks.
 * Keep this list explicit and preferably empty.
 */
export const DEFERRED_ORACLE_METHODS: string[] = [];

export const COMPAT_CASES: CompatCase[] = [
  {
    id: 'CMP-01',
    description: 'GET_FILE_INFO parity',
    method: 'GET_FILE_INFO',
    params: {},
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oraclePayload = asObject(oracle.payload?.fileInfo);
      const candidatePayload = asObject(candidate.payload);

      expectSameStringField(oraclePayload, candidatePayload, 'fileName');
      expectSameStringField(oraclePayload, candidatePayload, 'currentPage');
      expectSameStringField(oraclePayload, candidatePayload, 'currentPageId');
      expectSameNumberField(oraclePayload, candidatePayload, 'selectionCount');
    },
  },
  {
    id: 'CMP-02',
    description: 'EXECUTE_CODE parity for simple return value',
    method: 'EXECUTE_CODE',
    params: {
      code: 'return { total: 2, ok: true };',
      timeout: 2000,
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oraclePayload = asObject(oracle.payload);
      const candidatePayload = asObject(candidate.payload);

      const oracleResult = asObject(oraclePayload.result);
      const candidateResult = asObject(candidatePayload.result);

      expect(candidatePayload.success).toBe(true);
      expect(candidateResult.total).toBe(oracleResult.total);
      expect(candidateResult.ok).toBe(oracleResult.ok);
    },
  },
  {
    id: 'CMP-03',
    description: 'REFRESH_VARIABLES parity by collection/variable counts',
    method: 'REFRESH_VARIABLES',
    params: {},
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleData = asObject(oracle.payload?.data);
      const candidateData = asObject(candidate.payload);

      const oracleVariables = Array.isArray(oracleData.variables) ? oracleData.variables : [];
      const candidateVariables = Array.isArray(candidateData.variables) ? candidateData.variables : [];
      const oracleCollections = Array.isArray(oracleData.variableCollections)
        ? oracleData.variableCollections
        : [];
      const candidateCollections = Array.isArray(candidateData.variableCollections)
        ? candidateData.variableCollections
        : [];

      expect(oracleVariables.length).toBe(candidateVariables.length);
      expect(oracleCollections.length).toBe(candidateCollections.length);
    },
  },
  {
    id: 'CMP-04',
    description: 'UPDATE_VARIABLE parity on successful update',
    method: 'UPDATE_VARIABLE',
    params: {
      variableId: 'var-1',
      modeId: 'mode-1',
      value: '#00FF00',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleVariable = asObject(oracle.payload?.variable);
      const candidatePayload = asObject(candidate.payload);
      const candidateVariable = asObject(candidatePayload.variable);

      expect(candidatePayload.success).toBe(true);
      expect(candidateVariable.id).toBe(oracleVariable.id);
      expect(candidateVariable.name).toBe(oracleVariable.name);
    },
  },
  {
    id: 'CMP-05',
    description: 'CREATE_VARIABLE parity',
    method: 'CREATE_VARIABLE',
    params: {
      name: 'color/surface',
      collectionId: 'collection-1',
      resolvedType: 'COLOR',
      valuesByMode: { 'mode-1': '#112233' },
      description: 'Surface',
      scopes: ['ALL_SCOPES'],
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleVariable = asObject(oracle.payload?.variable);
      const candidatePayload = asObject(candidate.payload);
      const candidateVariable = asObject(candidatePayload.variable);

      expect(candidatePayload.success).toBe(true);
      expect(candidateVariable.name).toBe(oracleVariable.name);
      expect(candidateVariable.resolvedType).toBe(oracleVariable.resolvedType);
      expect(candidateVariable.variableCollectionId).toBe(oracleVariable.variableCollectionId);
    },
  },
  {
    id: 'CMP-06',
    description: 'DELETE_VARIABLE parity',
    method: 'DELETE_VARIABLE',
    params: {
      variableId: 'var-1',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleDeleted = asObject(oracle.payload?.deleted);
      const candidateDeleted = asObject(asObject(candidate.payload).deleted);
      expect(candidateDeleted.id).toBe(oracleDeleted.id);
      expect(candidateDeleted.name).toBe(oracleDeleted.name);
    },
  },
  {
    id: 'CMP-07',
    description: 'RENAME_VARIABLE parity',
    method: 'RENAME_VARIABLE',
    params: {
      variableId: 'var-1',
      newName: 'color/primary/updated',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oraclePayload = asObject(oracle.payload);
      const candidatePayload = asObject(candidate.payload);
      expect(candidatePayload.success).toBe(true);
      expect(candidatePayload.oldName).toBe(oraclePayload.oldName);
      const oracleVariable = asObject(oraclePayload.variable);
      const candidateVariable = asObject(candidatePayload.variable);
      expect(candidateVariable.name).toBe(oracleVariable.name);
    },
  },
  {
    id: 'CMP-08',
    description: 'SET_VARIABLE_DESCRIPTION parity',
    method: 'SET_VARIABLE_DESCRIPTION',
    params: {
      variableId: 'var-1',
      description: 'Updated variable description',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleVariable = asObject(oracle.payload?.variable);
      const candidateVariable = asObject(asObject(candidate.payload).variable);
      expect(candidateVariable.description).toBe(oracleVariable.description);
    },
  },
  {
    id: 'CMP-09',
    description: 'ADD_MODE parity',
    method: 'ADD_MODE',
    params: {
      collectionId: 'collection-1',
      modeName: 'Dark',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNewMode = asObject(oracle.payload?.newMode);
      const candidateNewMode = asObject(asObject(candidate.payload).newMode);
      expect(candidateNewMode.name).toBe(oracleNewMode.name);
    },
  },
  {
    id: 'CMP-10',
    description: 'RENAME_MODE parity',
    method: 'RENAME_MODE',
    params: {
      collectionId: 'collection-1',
      modeId: 'mode-1',
      newName: 'Light',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oraclePayload = asObject(oracle.payload);
      const candidatePayload = asObject(candidate.payload);
      expect(candidatePayload.oldName).toBe(oraclePayload.oldName);
      const oracleCollection = asObject(oraclePayload.collection);
      const candidateCollection = asObject(candidatePayload.collection);
      expect(candidateCollection.id).toBe(oracleCollection.id);
    },
  },
  {
    id: 'CMP-11',
    description: 'CREATE_VARIABLE_COLLECTION parity',
    method: 'CREATE_VARIABLE_COLLECTION',
    params: {
      name: 'Semantic',
      initialModeName: 'Light',
      additionalModes: ['Dark'],
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleCollection = asObject(oracle.payload?.collection);
      const candidateCollection = asObject(asObject(candidate.payload).collection);
      expect(candidateCollection.name).toBe(oracleCollection.name);
      const oracleModes = Array.isArray(oracleCollection.modes) ? oracleCollection.modes : [];
      const candidateModes = Array.isArray(candidateCollection.modes) ? candidateCollection.modes : [];
      expect(candidateModes.length).toBe(oracleModes.length);
    },
  },
  {
    id: 'CMP-12',
    description: 'DELETE_VARIABLE_COLLECTION parity',
    method: 'DELETE_VARIABLE_COLLECTION',
    params: {
      collectionId: 'collection-1',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleDeleted = asObject(oracle.payload?.deleted);
      const candidateDeleted = asObject(asObject(candidate.payload).deleted);
      expect(candidateDeleted.id).toBe(oracleDeleted.id);
      expect(candidateDeleted.name).toBe(oracleDeleted.name);
    },
  },
  {
    id: 'CMP-13',
    description: 'GET_COMPONENT parity',
    method: 'GET_COMPONENT',
    params: {
      nodeId: 'comp-1',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oraclePayload = asObject(oracle.payload);
      const oracleComponent = asObject(oraclePayload.component);
      const candidatePayload = asObject(candidate.payload);
      const candidateComponent = asObject(candidatePayload.component);

      expect(candidatePayload.success).toBe(true);
      expect(candidateComponent.id).toBe(oracleComponent.id);
      expect(candidateComponent.type).toBe(oracleComponent.type);
      expect(candidateComponent.name).toBe(oracleComponent.name);
    },
  },
  {
    id: 'CMP-14',
    description: 'GET_LOCAL_COMPONENTS parity',
    method: 'GET_LOCAL_COMPONENTS',
    params: {},
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleData = asObject(oracle.payload?.data);
      const candidateData = asObject(asObject(candidate.payload).data);
      expect(candidateData.totalComponents).toBe(oracleData.totalComponents);
      expect(candidateData.totalComponentSets).toBe(oracleData.totalComponentSets);
      expect(candidateData.fileName).toBe(oracleData.fileName);
    },
  },
  {
    id: 'CMP-15',
    description: 'INSTANTIATE_COMPONENT parity',
    method: 'INSTANTIATE_COMPONENT',
    params: {
      nodeId: 'comp-1',
      position: { x: 48, y: 96 },
      parentId: 'frame-1',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleInstance = asObject(oracle.payload?.instance);
      const candidateInstance = asObject(asObject(candidate.payload).instance);
      expect(candidateInstance.name).toBe(oracleInstance.name);
      expect(candidateInstance.x).toBe(oracleInstance.x);
      expect(candidateInstance.y).toBe(oracleInstance.y);
    },
  },
  {
    id: 'CMP-16',
    description: 'SET_NODE_DESCRIPTION parity',
    method: 'SET_NODE_DESCRIPTION',
    params: {
      nodeId: 'comp-1',
      description: 'Updated description',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidatePayload = asObject(candidate.payload);
      const candidateNode = asObject(candidatePayload.node);

      expect(candidatePayload.success).toBe(true);
      expect(candidateNode.id).toBe(oracleNode.id);
      expect(candidateNode.description).toBe(oracleNode.description);
    },
  },
  {
    id: 'CMP-17',
    description: 'ADD_COMPONENT_PROPERTY parity',
    method: 'ADD_COMPONENT_PROPERTY',
    params: {
      nodeId: 'comp-1',
      propertyName: 'Show Icon',
      propertyType: 'BOOLEAN',
      defaultValue: false,
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oraclePayload = asObject(oracle.payload);
      const candidatePayload = asObject(candidate.payload);
      expect(candidatePayload.propertyName).toBe(oraclePayload.propertyName);
    },
  },
  {
    id: 'CMP-18',
    description: 'EDIT_COMPONENT_PROPERTY parity',
    method: 'EDIT_COMPONENT_PROPERTY',
    params: {
      nodeId: 'comp-1',
      propertyName: 'Label#123',
      newValue: 'Updated Label',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oraclePayload = asObject(oracle.payload);
      const candidatePayload = asObject(candidate.payload);
      expect(candidatePayload.propertyName).toBe(oraclePayload.propertyName);
    },
  },
  {
    id: 'CMP-18B',
    description: 'EDIT_COMPONENT_PROPERTY parity with object payload',
    method: 'EDIT_COMPONENT_PROPERTY',
    params: {
      nodeId: 'comp-1',
      propertyName: 'Label#123',
      newValue: {
        name: 'Label Renamed#123',
        defaultValue: 'Renamed Label',
      },
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oraclePayload = asObject(oracle.payload);
      const candidatePayload = asObject(candidate.payload);
      expect(candidatePayload.propertyName).toBe(oraclePayload.propertyName);
    },
  },
  {
    id: 'CMP-19',
    description: 'DELETE_COMPONENT_PROPERTY parity',
    method: 'DELETE_COMPONENT_PROPERTY',
    params: {
      nodeId: 'comp-1',
      propertyName: 'Label#123',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      expect(asObject(candidate.payload).success).toBe(true);
    },
  },
  {
    id: 'CMP-20',
    description: 'SET_INSTANCE_PROPERTIES parity',
    method: 'SET_INSTANCE_PROPERTIES',
    params: {
      nodeId: 'inst-1',
      properties: { Label: 'New Label' },
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleInstance = asObject(oracle.payload?.instance);
      const candidateInstance = asObject(asObject(candidate.payload).instance);
      const oracleProperties = asObject(oracleInstance.currentProperties);
      const candidateProperties = asObject(candidateInstance.currentProperties);
      const oracleLabel = asObject(oracleProperties['Label#123']);
      const candidateLabel = asObject(candidateProperties['Label#123']);
      expect(candidateLabel.value).toBe(oracleLabel.value);
    },
  },
  {
    id: 'CMP-21',
    description: 'RESIZE_NODE parity',
    method: 'RESIZE_NODE',
    params: {
      nodeId: 'rect-1',
      width: 220,
      height: 120,
      withConstraints: true,
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidatePayload = asObject(candidate.payload);
      const candidateNode = asObject(candidatePayload.node);

      expect(candidatePayload.success).toBe(true);
      expect(candidateNode.width).toBe(oracleNode.width);
      expect(candidateNode.height).toBe(oracleNode.height);
    },
  },
  {
    id: 'CMP-22',
    description: 'MOVE_NODE parity',
    method: 'MOVE_NODE',
    params: {
      nodeId: 'rect-1',
      x: 24,
      y: 36,
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidateNode = asObject(asObject(candidate.payload).node);
      expect(candidateNode.x).toBe(oracleNode.x);
      expect(candidateNode.y).toBe(oracleNode.y);
    },
  },
  {
    id: 'CMP-23',
    description: 'SET_NODE_FILLS parity',
    method: 'SET_NODE_FILLS',
    params: {
      nodeId: 'rect-1',
      fills: [{ type: 'SOLID', color: '#00AAFF' }],
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidateNode = asObject(asObject(candidate.payload).node);
      expect(candidateNode.id).toBe(oracleNode.id);
    },
  },
  {
    id: 'CMP-24',
    description: 'SET_NODE_STROKES parity',
    method: 'SET_NODE_STROKES',
    params: {
      nodeId: 'rect-1',
      strokes: [{ type: 'SOLID', color: '#333333' }],
      strokeWeight: 2,
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidateNode = asObject(asObject(candidate.payload).node);
      expect(candidateNode.id).toBe(oracleNode.id);
    },
  },
  {
    id: 'CMP-25',
    description: 'SET_NODE_OPACITY parity',
    method: 'SET_NODE_OPACITY',
    params: {
      nodeId: 'rect-1',
      opacity: 0.42,
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidateNode = asObject(asObject(candidate.payload).node);
      expect(candidateNode.opacity).toBe(oracleNode.opacity);
    },
  },
  {
    id: 'CMP-26',
    description: 'SET_NODE_CORNER_RADIUS parity',
    method: 'SET_NODE_CORNER_RADIUS',
    params: {
      nodeId: 'rect-1',
      radius: 12,
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidateNode = asObject(asObject(candidate.payload).node);
      expect(candidateNode.cornerRadius).toBe(oracleNode.cornerRadius);
    },
  },
  {
    id: 'CMP-27',
    description: 'CLONE_NODE parity',
    method: 'CLONE_NODE',
    params: {
      nodeId: 'rect-1',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidateNode = asObject(asObject(candidate.payload).node);
      expect(candidateNode.name).toBe(oracleNode.name);
      expect(candidateNode.x).toBe(oracleNode.x);
      expect(candidateNode.y).toBe(oracleNode.y);
    },
  },
  {
    id: 'CMP-28',
    description: 'DELETE_NODE success parity',
    method: 'DELETE_NODE',
    params: {
      nodeId: 'rect-1',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleDeleted = asObject(oracle.payload?.deleted);
      const candidateDeleted = asObject(asObject(candidate.payload).deleted);
      expect(candidateDeleted.id).toBe(oracleDeleted.id);
      expect(candidateDeleted.name).toBe(oracleDeleted.name);
    },
  },
  {
    id: 'CMP-29',
    description: 'RENAME_NODE parity',
    method: 'RENAME_NODE',
    params: {
      nodeId: 'rect-1',
      newName: 'Rectangle Renamed',
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidateNode = asObject(asObject(candidate.payload).node);
      expect(candidateNode.name).toBe(oracleNode.name);
      expect(candidateNode.oldName).toBe(oracleNode.oldName);
    },
  },
  {
    id: 'CMP-30',
    description: 'SET_TEXT_CONTENT parity',
    method: 'SET_TEXT_CONTENT',
    params: {
      nodeId: 'text-1',
      text: 'Parity text',
      fontSize: 16,
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidateNode = asObject(asObject(candidate.payload).node);
      expect(candidateNode.characters).toBe(oracleNode.characters);
      expect(candidateNode.id).toBe(oracleNode.id);
    },
  },
  {
    id: 'CMP-31',
    description: 'CREATE_CHILD_NODE parity',
    method: 'CREATE_CHILD_NODE',
    params: {
      parentId: 'frame-1',
      nodeType: 'RECTANGLE',
      properties: {
        name: 'Child Rect',
        x: 8,
        y: 12,
        width: 40,
        height: 24,
      },
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleNode = asObject(oracle.payload?.node);
      const candidateNode = asObject(asObject(candidate.payload).node);
      expect(candidateNode.type).toBe(oracleNode.type);
      expect(candidateNode.name).toBe(oracleNode.name);
      expect(candidateNode.width).toBe(oracleNode.width);
      expect(candidateNode.height).toBe(oracleNode.height);
    },
  },
  {
    id: 'CMP-32',
    description: 'CAPTURE_SCREENSHOT parity (shape and node)',
    method: 'CAPTURE_SCREENSHOT',
    params: {
      nodeId: 'rect-1',
      format: 'PNG',
      scale: 2,
    },
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      const oracleImage = asObject(oracle.payload?.image);
      const candidatePayload = asObject(candidate.payload);
      const candidateImage = asObject(candidatePayload.image);
      const oracleNode = asObject(oracleImage.node);
      const candidateNode = asObject(candidateImage.node);

      expect(candidatePayload.success).toBe(true);
      expect(typeof candidateImage.base64).toBe('string');
      expect(candidateImage.byteLength).toBe(oracleImage.byteLength);
      expect(candidateNode.id).toBe(oracleNode.id);
    },
  },
  {
    id: 'CMP-33',
    description: 'RELOAD_UI parity',
    method: 'RELOAD_UI',
    params: {},
    assert: (oracle, candidate) => {
      expectBothSuccess(oracle, candidate);
      expect(asObject(candidate.payload).success).toBe(true);
    },
  },
  {
    id: 'CMP-34',
    description: 'Node-not-found failure parity',
    method: 'DELETE_NODE',
    params: {
      nodeId: 'missing-node',
    },
    assert: (oracle, candidate) => {
      expectBothFailure(oracle, candidate);
      expectErrorIncludes(oracle, 'Node not found', 'oracle');
      expectErrorIncludes(candidate, 'Node not found', 'candidate');
    },
  },
];
