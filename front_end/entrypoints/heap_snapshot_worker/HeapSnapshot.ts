/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* eslint-disable rulesdir/use_private_class_members */

import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as HeapSnapshotModel from '../../models/heap_snapshot_model/heap_snapshot_model.js';

import {AllocationProfile} from './AllocationProfile.js';
import {type HeapSnapshotWorkerDispatcher} from './HeapSnapshotWorkerDispatcher.js';

export interface HeapSnapshotItem {
  itemIndex(): number;

  serialize(): Object;
}

export class HeapSnapshotEdge implements HeapSnapshotItem {
  snapshot: HeapSnapshot;
  protected readonly edges: Platform.TypedArrayUtilities.BigUint32Array;
  edgeIndex: number;
  constructor(snapshot: HeapSnapshot, edgeIndex?: number) {
    this.snapshot = snapshot;
    this.edges = snapshot.containmentEdges;
    this.edgeIndex = edgeIndex || 0;
  }

  clone(): HeapSnapshotEdge {
    return new HeapSnapshotEdge(this.snapshot, this.edgeIndex);
  }

  hasStringName(): boolean {
    throw new Error('Not implemented');
  }

  name(): string {
    throw new Error('Not implemented');
  }

  node(): HeapSnapshotNode {
    return this.snapshot.createNode(this.nodeIndex());
  }

  nodeIndex(): number {
    if (typeof this.snapshot.edgeToNodeOffset === 'undefined') {
      throw new Error('edgeToNodeOffset is undefined');
    }

    return this.edges.getValue(this.edgeIndex + this.snapshot.edgeToNodeOffset);
  }

  toString(): string {
    return 'HeapSnapshotEdge: ' + this.name();
  }

  type(): string {
    return this.snapshot.edgeTypes[this.rawType()];
  }

  itemIndex(): number {
    return this.edgeIndex;
  }

  serialize(): HeapSnapshotModel.HeapSnapshotModel.Edge {
    return new HeapSnapshotModel.HeapSnapshotModel.Edge(
        this.name(), this.node().serialize(), this.type(), this.edgeIndex);
  }

  rawType(): number {
    if (typeof this.snapshot.edgeTypeOffset === 'undefined') {
      throw new Error('edgeTypeOffset is undefined');
    }

    return this.edges.getValue(this.edgeIndex + this.snapshot.edgeTypeOffset);
  }

  isInternal(): boolean {
    throw new Error('Not implemented');
  }

  isInvisible(): boolean {
    throw new Error('Not implemented');
  }

  isWeak(): boolean {
    throw new Error('Not implemented');
  }

  getValueForSorting(_fieldName: string): number {
    throw new Error('Not implemented');
  }

  nameIndex(): number {
    throw new Error('Not implemented');
  }
}

export interface HeapSnapshotItemIterator {
  hasNext(): boolean;

  item(): HeapSnapshotItem;

  next(): void;
}

export interface HeapSnapshotItemIndexProvider {
  itemForIndex(newIndex: number): HeapSnapshotItem;
}

export class HeapSnapshotNodeIndexProvider implements HeapSnapshotItemIndexProvider {
  #node: HeapSnapshotNode;
  constructor(snapshot: HeapSnapshot) {
    this.#node = snapshot.createNode();
  }

  itemForIndex(index: number): HeapSnapshotNode {
    this.#node.nodeIndex = index;
    return this.#node;
  }
}

export class HeapSnapshotEdgeIndexProvider implements HeapSnapshotItemIndexProvider {
  #edge: JSHeapSnapshotEdge;
  constructor(snapshot: HeapSnapshot) {
    this.#edge = snapshot.createEdge(0);
  }

  itemForIndex(index: number): HeapSnapshotEdge {
    this.#edge.edgeIndex = index;
    return this.#edge;
  }
}

export class HeapSnapshotRetainerEdgeIndexProvider implements HeapSnapshotItemIndexProvider {
  readonly #retainerEdge: JSHeapSnapshotRetainerEdge;
  constructor(snapshot: HeapSnapshot) {
    this.#retainerEdge = snapshot.createRetainingEdge(0);
  }

  itemForIndex(index: number): HeapSnapshotRetainerEdge {
    this.#retainerEdge.setRetainerIndex(index);
    return this.#retainerEdge;
  }
}

export class HeapSnapshotEdgeIterator implements HeapSnapshotItemIterator {
  readonly #sourceNode: HeapSnapshotNode;
  edge: JSHeapSnapshotEdge;
  constructor(node: HeapSnapshotNode) {
    this.#sourceNode = node;
    this.edge = node.snapshot.createEdge(node.edgeIndexesStart());
  }

  hasNext(): boolean {
    return this.edge.edgeIndex < this.#sourceNode.edgeIndexesEnd();
  }

  item(): HeapSnapshotEdge {
    return this.edge;
  }

  next(): void {
    if (typeof this.edge.snapshot.edgeFieldsCount === 'undefined') {
      throw new Error('edgeFieldsCount is undefined');
    }
    this.edge.edgeIndex += this.edge.snapshot.edgeFieldsCount;
  }
}

export class HeapSnapshotRetainerEdge implements HeapSnapshotItem {
  protected snapshot: HeapSnapshot;
  #retainerIndexInternal!: number;
  #globalEdgeIndex!: number;
  #retainingNodeIndex?: number;
  #edgeInstance?: JSHeapSnapshotEdge|null;
  #nodeInstance?: HeapSnapshotNode|null;
  constructor(snapshot: HeapSnapshot, retainerIndex: number) {
    this.snapshot = snapshot;
    this.setRetainerIndex(retainerIndex);
  }

  clone(): HeapSnapshotRetainerEdge {
    return new HeapSnapshotRetainerEdge(this.snapshot, this.retainerIndex());
  }

  hasStringName(): boolean {
    return this.edge().hasStringName();
  }

  name(): string {
    return this.edge().name();
  }

  nameIndex(): number {
    return this.edge().nameIndex();
  }

  node(): HeapSnapshotNode {
    return this.nodeInternal();
  }

  nodeIndex(): number {
    if (typeof this.#retainingNodeIndex === 'undefined') {
      throw new Error('retainingNodeIndex is undefined');
    }

    return this.#retainingNodeIndex;
  }

  retainerIndex(): number {
    return this.#retainerIndexInternal;
  }

  setRetainerIndex(retainerIndex: number): void {
    if (retainerIndex === this.#retainerIndexInternal) {
      return;
    }

    if (!this.snapshot.retainingEdges || !this.snapshot.retainingNodes) {
      throw new Error('Snapshot does not contain retaining edges or retaining nodes');
    }

    this.#retainerIndexInternal = retainerIndex;
    this.#globalEdgeIndex = this.snapshot.retainingEdges[retainerIndex];
    this.#retainingNodeIndex = this.snapshot.retainingNodes[retainerIndex];
    this.#edgeInstance = null;
    this.#nodeInstance = null;
  }

  set edgeIndex(edgeIndex: number) {
    this.setRetainerIndex(edgeIndex);
  }

  private nodeInternal(): HeapSnapshotNode {
    if (!this.#nodeInstance) {
      this.#nodeInstance = this.snapshot.createNode(this.#retainingNodeIndex);
    }
    return this.#nodeInstance;
  }

  protected edge(): JSHeapSnapshotEdge {
    if (!this.#edgeInstance) {
      this.#edgeInstance = this.snapshot.createEdge(this.#globalEdgeIndex);
    }
    return this.#edgeInstance;
  }

  toString(): string {
    return this.edge().toString();
  }

  itemIndex(): number {
    return this.#retainerIndexInternal;
  }

  serialize(): HeapSnapshotModel.HeapSnapshotModel.Edge {
    const node = this.node();
    const serializedNode = node.serialize();
    serializedNode.distance = this.#distance();
    serializedNode.ignored = this.snapshot.isNodeIgnoredInRetainersView(node.nodeIndex);

    return new HeapSnapshotModel.HeapSnapshotModel.Edge(
        this.name(), serializedNode, this.type(), this.#globalEdgeIndex);
  }

  type(): string {
    return this.edge().type();
  }

  isInternal(): boolean {
    return this.edge().isInternal();
  }

  getValueForSorting(fieldName: string): number {
    if (fieldName === '!edgeDistance') {
      return this.#distance();
    }
    throw new Error('Invalid field name');
  }

  #distance(): number {
    if (this.snapshot.isEdgeIgnoredInRetainersView(this.#globalEdgeIndex)) {
      return HeapSnapshotModel.HeapSnapshotModel.baseUnreachableDistance;
    }
    return this.node().distanceForRetainersView();
  }
}

export class HeapSnapshotRetainerEdgeIterator implements HeapSnapshotItemIterator {
  readonly #retainersEnd: number;
  retainer: JSHeapSnapshotRetainerEdge;
  constructor(retainedNode: HeapSnapshotNode) {
    const snapshot = retainedNode.snapshot;
    const retainedNodeOrdinal = retainedNode.ordinal();
    if (!snapshot.firstRetainerIndex) {
      throw new Error('Snapshot does not contain firstRetainerIndex');
    }
    const retainerIndex = snapshot.firstRetainerIndex[retainedNodeOrdinal];
    this.#retainersEnd = snapshot.firstRetainerIndex[retainedNodeOrdinal + 1];
    this.retainer = snapshot.createRetainingEdge(retainerIndex);
  }

  hasNext(): boolean {
    return this.retainer.retainerIndex() < this.#retainersEnd;
  }

  item(): HeapSnapshotRetainerEdge {
    return this.retainer;
  }

  next(): void {
    this.retainer.setRetainerIndex(this.retainer.retainerIndex() + 1);
  }
}

export class HeapSnapshotNode implements HeapSnapshotItem {
  snapshot: HeapSnapshot;
  nodeIndex: number;
  constructor(snapshot: HeapSnapshot, nodeIndex?: number) {
    this.snapshot = snapshot;
    this.nodeIndex = nodeIndex || 0;
  }

  distance(): number {
    return this.snapshot.nodeDistances[this.nodeIndex / this.snapshot.nodeFieldCount];
  }

  distanceForRetainersView(): number {
    return this.snapshot.getDistanceForRetainersView(this.nodeIndex);
  }

  className(): string {
    return this.snapshot.strings[this.classIndex()];
  }

  classIndex(): number {
    return this.#detachednessAndClassIndex() >>> SHIFT_FOR_CLASS_INDEX;
  }

  setClassIndex(index: number): void {
    let value = this.#detachednessAndClassIndex();
    value &= BITMASK_FOR_DOM_LINK_STATE;        // Clear previous class index.
    value |= (index << SHIFT_FOR_CLASS_INDEX);  // Set new class index.
    this.#setDetachednessAndClassIndex(value);
    if (this.classIndex() !== index) {
      throw new Error('String index overflow');
    }
  }

  dominatorIndex(): number {
    const nodeFieldCount = this.snapshot.nodeFieldCount;
    return this.snapshot.dominatorsTree[this.nodeIndex / this.snapshot.nodeFieldCount] * nodeFieldCount;
  }

  edges(): HeapSnapshotEdgeIterator {
    return new HeapSnapshotEdgeIterator(this);
  }

  edgesCount(): number {
    return (this.edgeIndexesEnd() - this.edgeIndexesStart()) / this.snapshot.edgeFieldsCount;
  }

  id(): number {
    throw new Error('Not implemented');
  }

  rawName(): string {
    throw new Error('Not implemented');
  }

  isRoot(): boolean {
    return this.nodeIndex === this.snapshot.rootNodeIndex;
  }

  isUserRoot(): boolean {
    throw new Error('Not implemented');
  }

  isHidden(): boolean {
    throw new Error('Not implemented');
  }

  isArray(): boolean {
    throw new Error('Not implemented');
  }

  isSynthetic(): boolean {
    throw new Error('Not implemented');
  }

  isDocumentDOMTreesRoot(): boolean {
    throw new Error('Not implemented');
  }

  name(): string {
    return this.snapshot.strings[this.nameInternal()];
  }

  retainedSize(): number {
    return this.snapshot.retainedSizes[this.ordinal()];
  }

  retainers(): HeapSnapshotRetainerEdgeIterator {
    return new HeapSnapshotRetainerEdgeIterator(this);
  }

  retainersCount(): number {
    const snapshot = this.snapshot;
    const ordinal = this.ordinal();
    return snapshot.firstRetainerIndex[ordinal + 1] - snapshot.firstRetainerIndex[ordinal];
  }

  selfSize(): number {
    const snapshot = this.snapshot;
    return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeSelfSizeOffset);
  }

  type(): string {
    return this.snapshot.nodeTypes[this.rawType()];
  }

  traceNodeId(): number {
    const snapshot = this.snapshot;
    return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeTraceNodeIdOffset);
  }

  itemIndex(): number {
    return this.nodeIndex;
  }

  serialize(): HeapSnapshotModel.HeapSnapshotModel.Node {
    return new HeapSnapshotModel.HeapSnapshotModel.Node(
        this.id(), this.name(), this.distance(), this.nodeIndex, this.retainedSize(), this.selfSize(), this.type());
  }

  private nameInternal(): number {
    const snapshot = this.snapshot;
    return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeNameOffset);
  }

  edgeIndexesStart(): number {
    return this.snapshot.firstEdgeIndexes[this.ordinal()];
  }

  edgeIndexesEnd(): number {
    return this.snapshot.firstEdgeIndexes[this.ordinal() + 1];
  }

  ordinal(): number {
    return this.nodeIndex / this.snapshot.nodeFieldCount;
  }

  nextNodeIndex(): number {
    return this.nodeIndex + this.snapshot.nodeFieldCount;
  }

  rawType(): number {
    const snapshot = this.snapshot;
    return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeTypeOffset);
  }

  isFlatConsString(): boolean {
    if (this.rawType() !== this.snapshot.nodeConsStringType) {
      return false;
    }
    for (let iter = this.edges(); iter.hasNext(); iter.next()) {
      const edge = iter.edge;
      if (!edge.isInternal()) {
        continue;
      }
      const edgeName = edge.name();
      if ((edgeName === 'first' || edgeName === 'second') && edge.node().name() === '') {
        return true;
      }
    }
    return false;
  }

  #detachednessAndClassIndex(): number {
    const {snapshot, nodeIndex} = this;
    const nodeDetachednessAndClassIndexOffset = snapshot.nodeDetachednessAndClassIndexOffset;
    return nodeDetachednessAndClassIndexOffset !== -1 ?
        snapshot.nodes.getValue(nodeIndex + nodeDetachednessAndClassIndexOffset) :
        (snapshot.detachednessAndClassIndexArray as Uint32Array)[nodeIndex / snapshot.nodeFieldCount];
  }

  #setDetachednessAndClassIndex(value: number): void {
    const {snapshot, nodeIndex} = this;
    const nodeDetachednessAndClassIndexOffset = snapshot.nodeDetachednessAndClassIndexOffset;
    if (nodeDetachednessAndClassIndexOffset !== -1) {
      snapshot.nodes.setValue(nodeIndex + nodeDetachednessAndClassIndexOffset, value);
    } else {
      (snapshot.detachednessAndClassIndexArray as Uint32Array)[nodeIndex / snapshot.nodeFieldCount] = value;
    }
  }

  detachedness(): DOMLinkState {
    return this.#detachednessAndClassIndex() & BITMASK_FOR_DOM_LINK_STATE;
  }

  setDetachedness(detachedness: DOMLinkState): void {
    let value = this.#detachednessAndClassIndex();
    value &= ~BITMASK_FOR_DOM_LINK_STATE;  // Clear the old bits.
    value |= detachedness;                 // Set the new bits.
    this.#setDetachednessAndClassIndex(value);
  }
}

export class HeapSnapshotNodeIterator implements HeapSnapshotItemIterator {
  node: HeapSnapshotNode;
  readonly #nodesLength: number;
  constructor(node: HeapSnapshotNode) {
    this.node = node;
    this.#nodesLength = node.snapshot.nodes.length;
  }

  hasNext(): boolean {
    return this.node.nodeIndex < this.#nodesLength;
  }

  item(): HeapSnapshotNode {
    return this.node;
  }

  next(): void {
    this.node.nodeIndex = this.node.nextNodeIndex();
  }
}

export class HeapSnapshotIndexRangeIterator implements HeapSnapshotItemIterator {
  readonly #itemProvider: HeapSnapshotItemIndexProvider;
  readonly #indexes: number[]|Uint32Array;
  #position: number;
  constructor(itemProvider: HeapSnapshotItemIndexProvider, indexes: number[]|Uint32Array) {
    this.#itemProvider = itemProvider;
    this.#indexes = indexes;
    this.#position = 0;
  }

  hasNext(): boolean {
    return this.#position < this.#indexes.length;
  }

  item(): HeapSnapshotItem {
    const index = this.#indexes[this.#position];
    return this.#itemProvider.itemForIndex(index);
  }

  next(): void {
    ++this.#position;
  }
}

export class HeapSnapshotFilteredIterator implements HeapSnapshotItemIterator {
  #iterator: HeapSnapshotItemIterator;
  #filter: ((arg0: HeapSnapshotItem) => boolean)|undefined;
  constructor(iterator: HeapSnapshotItemIterator, filter?: ((arg0: HeapSnapshotItem) => boolean)) {
    this.#iterator = iterator;
    this.#filter = filter;
    this.skipFilteredItems();
  }

  hasNext(): boolean {
    return this.#iterator.hasNext();
  }

  item(): HeapSnapshotItem {
    return this.#iterator.item();
  }

  next(): void {
    this.#iterator.next();
    this.skipFilteredItems();
  }

  private skipFilteredItems(): void {
    while (this.#iterator.hasNext() && this.#filter && !this.#filter(this.#iterator.item())) {
      this.#iterator.next();
    }
  }
}

export class HeapSnapshotProgress {
  readonly #dispatcher: HeapSnapshotWorkerDispatcher|undefined;
  constructor(dispatcher?: HeapSnapshotWorkerDispatcher) {
    this.#dispatcher = dispatcher;
  }

  updateStatus(status: string): void {
    this.sendUpdateEvent(i18n.i18n.serializeUIString(status));
  }

  updateProgress(title: string, value: number, total: number): void {
    const percentValue = ((total ? (value / total) : 0) * 100).toFixed(0);
    this.sendUpdateEvent(i18n.i18n.serializeUIString(title, {PH1: percentValue}));
  }

  reportProblem(error: string): void {
    // May be undefined in tests.
    if (this.#dispatcher) {
      this.#dispatcher.sendEvent(HeapSnapshotModel.HeapSnapshotModel.HeapSnapshotProgressEvent.BrokenSnapshot, error);
    }
  }

  private sendUpdateEvent(serializedText: string): void {
    // May be undefined in tests.
    if (this.#dispatcher) {
      this.#dispatcher.sendEvent(HeapSnapshotModel.HeapSnapshotModel.HeapSnapshotProgressEvent.Update, serializedText);
    }
  }
}

export class HeapSnapshotProblemReport {
  readonly #errors: string[];
  constructor(title: string) {
    this.#errors = [title];
  }

  addError(error: string): void {
    if (this.#errors.length > 100) {
      return;
    }
    this.#errors.push(error);
  }

  toString(): string {
    return this.#errors.join('\n  ');
  }
}
export interface Profile {
  /* eslint-disable @typescript-eslint/naming-convention */
  root_index: number;
  nodes: Platform.TypedArrayUtilities.BigUint32Array;
  edges: Platform.TypedArrayUtilities.BigUint32Array;
  snapshot: HeapSnapshotHeader;
  samples: number[];
  strings: string[];
  locations: number[];
  trace_function_infos: Uint32Array;
  trace_tree: Object;
  /* eslint-enable @typescript-eslint/naming-convention */
}

export interface LiveObjects {
  [x: number]: {count: number, size: number, ids: number[]};
}

/**
 * DOM node link state.
 */
const enum DOMLinkState {
  Unknown = 0,
  Attached = 1,
  Detached = 2,
}
const BITMASK_FOR_DOM_LINK_STATE = 3;

// The class index is stored in the upper 30 bits of the detachedness field.
const SHIFT_FOR_CLASS_INDEX = 2;

export abstract class HeapSnapshot {
  nodes: Platform.TypedArrayUtilities.BigUint32Array;
  containmentEdges: Platform.TypedArrayUtilities.BigUint32Array;
  readonly #metaNode: HeapSnapshotMetainfo;
  readonly #rawSamples: number[];
  #samples: HeapSnapshotModel.HeapSnapshotModel.Samples|null;
  strings: string[];
  readonly #locations: number[];
  readonly #progress: HeapSnapshotProgress;
  readonly #noDistance: number;
  rootNodeIndexInternal: number;
  #snapshotDiffs: {
    [x: string]: {
      [x: string]: HeapSnapshotModel.HeapSnapshotModel.Diff,
    },
  };
  #aggregatesForDiffInternal!: {
    [x: string]: HeapSnapshotModel.HeapSnapshotModel.AggregateForDiff,
  };
  #aggregates: {
    [x: string]: {
      [x: string]: AggregatedInfo,
    },
  };
  #aggregatesSortedFlags: {
    [x: string]: boolean,
  };
  #profile: Profile;
  nodeTypeOffset!: number;
  nodeNameOffset!: number;
  nodeIdOffset!: number;
  nodeSelfSizeOffset!: number;
  #nodeEdgeCountOffset!: number;
  nodeTraceNodeIdOffset!: number;
  nodeFieldCount!: number;
  nodeTypes!: string[];
  nodeArrayType!: number;
  nodeHiddenType!: number;
  nodeObjectType!: number;
  nodeNativeType!: number;
  nodeStringType!: number;
  nodeConsStringType!: number;
  nodeSlicedStringType!: number;
  nodeCodeType!: number;
  nodeSyntheticType!: number;
  nodeClosureType!: number;
  nodeRegExpType!: number;
  edgeFieldsCount!: number;
  edgeTypeOffset!: number;
  edgeNameOffset!: number;
  edgeToNodeOffset!: number;
  edgeTypes!: string[];
  edgeElementType!: number;
  edgeHiddenType!: number;
  edgeInternalType!: number;
  edgeShortcutType!: number;
  edgeWeakType!: number;
  edgeInvisibleType!: number;
  #locationIndexOffset!: number;
  #locationScriptIdOffset!: number;
  #locationLineOffset!: number;
  #locationColumnOffset!: number;
  #locationFieldCount!: number;
  nodeCount!: number;
  #edgeCount!: number;
  retainedSizes!: Float64Array;
  firstEdgeIndexes!: Uint32Array;
  retainingNodes!: Uint32Array;
  retainingEdges!: Uint32Array;
  firstRetainerIndex!: Uint32Array;
  nodeDistances!: Int32Array;
  firstDominatedNodeIndex!: Uint32Array;
  dominatedNodes!: Uint32Array;
  dominatorsTree!: Uint32Array;
  #allocationProfile!: AllocationProfile;
  nodeDetachednessAndClassIndexOffset!: number;
  #locationMap!: Map<number, HeapSnapshotModel.HeapSnapshotModel.Location>;
  lazyStringCache!: {
    [x: string]: string,
  };
  #ignoredNodesInRetainersView: Set<number>;
  #ignoredEdgesInRetainersView: Set<number>;
  #nodeDistancesForRetainersView: Int32Array|undefined;
  #edgeNamesThatAreNotWeakMaps: Platform.TypedArrayUtilities.BitVector;
  detachednessAndClassIndexArray?: Uint32Array;

  constructor(profile: Profile, progress: HeapSnapshotProgress) {
    this.nodes = profile.nodes;
    this.containmentEdges = profile.edges;
    this.#metaNode = profile.snapshot.meta;
    this.#rawSamples = profile.samples;
    this.#samples = null;
    this.strings = profile.strings;
    this.#locations = profile.locations;
    this.#progress = progress;

    this.#noDistance = -5;
    this.rootNodeIndexInternal = 0;
    if (profile.snapshot.root_index) {
      this.rootNodeIndexInternal = profile.snapshot.root_index;
    }

    this.#snapshotDiffs = {};

    this.#aggregates = {};

    this.#aggregatesSortedFlags = {};
    this.#profile = profile;
    this.#ignoredNodesInRetainersView = new Set();
    this.#ignoredEdgesInRetainersView = new Set();
    this.#edgeNamesThatAreNotWeakMaps = Platform.TypedArrayUtilities.createBitVector(this.strings.length);
  }

  initialize(): void {
    const meta = this.#metaNode;

    this.nodeTypeOffset = meta.node_fields.indexOf('type');
    this.nodeNameOffset = meta.node_fields.indexOf('name');
    this.nodeIdOffset = meta.node_fields.indexOf('id');
    this.nodeSelfSizeOffset = meta.node_fields.indexOf('self_size');
    this.#nodeEdgeCountOffset = meta.node_fields.indexOf('edge_count');
    this.nodeTraceNodeIdOffset = meta.node_fields.indexOf('trace_node_id');
    this.nodeDetachednessAndClassIndexOffset = meta.node_fields.indexOf('detachedness');
    this.nodeFieldCount = meta.node_fields.length;

    this.nodeTypes = meta.node_types[this.nodeTypeOffset];
    this.nodeArrayType = this.nodeTypes.indexOf('array');
    this.nodeHiddenType = this.nodeTypes.indexOf('hidden');
    this.nodeObjectType = this.nodeTypes.indexOf('object');
    this.nodeNativeType = this.nodeTypes.indexOf('native');
    this.nodeStringType = this.nodeTypes.indexOf('string');
    this.nodeConsStringType = this.nodeTypes.indexOf('concatenated string');
    this.nodeSlicedStringType = this.nodeTypes.indexOf('sliced string');
    this.nodeCodeType = this.nodeTypes.indexOf('code');
    this.nodeSyntheticType = this.nodeTypes.indexOf('synthetic');
    this.nodeClosureType = this.nodeTypes.indexOf('closure');
    this.nodeRegExpType = this.nodeTypes.indexOf('regexp');

    this.edgeFieldsCount = meta.edge_fields.length;
    this.edgeTypeOffset = meta.edge_fields.indexOf('type');
    this.edgeNameOffset = meta.edge_fields.indexOf('name_or_index');
    this.edgeToNodeOffset = meta.edge_fields.indexOf('to_node');

    this.edgeTypes = meta.edge_types[this.edgeTypeOffset];
    this.edgeTypes.push('invisible');
    this.edgeElementType = this.edgeTypes.indexOf('element');
    this.edgeHiddenType = this.edgeTypes.indexOf('hidden');
    this.edgeInternalType = this.edgeTypes.indexOf('internal');
    this.edgeShortcutType = this.edgeTypes.indexOf('shortcut');
    this.edgeWeakType = this.edgeTypes.indexOf('weak');
    this.edgeInvisibleType = this.edgeTypes.indexOf('invisible');

    const locationFields = meta.location_fields || [];

    this.#locationIndexOffset = locationFields.indexOf('object_index');
    this.#locationScriptIdOffset = locationFields.indexOf('script_id');
    this.#locationLineOffset = locationFields.indexOf('line');
    this.#locationColumnOffset = locationFields.indexOf('column');
    this.#locationFieldCount = locationFields.length;

    this.nodeCount = this.nodes.length / this.nodeFieldCount;
    this.#edgeCount = this.containmentEdges.length / this.edgeFieldsCount;

    this.retainedSizes = new Float64Array(this.nodeCount);
    this.firstEdgeIndexes = new Uint32Array(this.nodeCount + 1);
    this.retainingNodes = new Uint32Array(this.#edgeCount);
    this.retainingEdges = new Uint32Array(this.#edgeCount);
    this.firstRetainerIndex = new Uint32Array(this.nodeCount + 1);
    this.nodeDistances = new Int32Array(this.nodeCount);
    this.firstDominatedNodeIndex = new Uint32Array(this.nodeCount + 1);
    this.dominatedNodes = new Uint32Array(this.nodeCount - 1);

    this.#progress.updateStatus('Building edge indexes…');
    this.buildEdgeIndexes();
    this.#progress.updateStatus('Building retainers…');
    this.buildRetainers();
    this.#progress.updateStatus('Propagating DOM state…');
    this.propagateDOMState();
    this.#progress.updateStatus('Calculating node flags…');
    this.calculateFlags();
    this.#progress.updateStatus('Calculating distances…');
    this.calculateDistances(/* isForRetainersView=*/ false);
    this.#progress.updateStatus('Building postorder index…');
    const result = this.buildPostOrderIndex();
    // Actually it is array that maps node ordinal number to dominator node ordinal number.
    this.#progress.updateStatus('Building dominator tree…');
    this.dominatorsTree = this.buildDominatorTree(result.postOrderIndex2NodeOrdinal, result.nodeOrdinal2PostOrderIndex);
    this.#progress.updateStatus('Calculating shallow sizes…');
    this.calculateShallowSizes();
    this.#progress.updateStatus('Calculating retained sizes…');
    this.calculateRetainedSizes(result.postOrderIndex2NodeOrdinal);
    this.#progress.updateStatus('Building dominated nodes…');
    this.buildDominatedNodes();
    this.#progress.updateStatus('Calculating object names…');
    this.calculateObjectNames();
    this.#progress.updateStatus('Calculating statistics…');
    this.calculateStatistics();
    this.#progress.updateStatus('Calculating samples…');
    this.buildSamples();
    this.#progress.updateStatus('Building locations…');
    this.buildLocationMap();
    this.#progress.updateStatus('Finished processing.');

    if (this.#profile.snapshot.trace_function_count) {
      this.#progress.updateStatus('Building allocation statistics…');
      const nodes = this.nodes;
      const nodesLength = nodes.length;
      const nodeFieldCount = this.nodeFieldCount;
      const node = this.rootNode();
      const liveObjects: LiveObjects = {};
      for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
        node.nodeIndex = nodeIndex;
        const traceNodeId = node.traceNodeId();
        let stats: {
          count: number,
          size: number,
          ids: number[],
        } = liveObjects[traceNodeId];
        if (!stats) {
          liveObjects[traceNodeId] = stats = {count: 0, size: 0, ids: []};
        }
        stats.count++;
        stats.size += node.selfSize();
        stats.ids.push(node.id());
      }
      this.#allocationProfile = new AllocationProfile(this.#profile, liveObjects);
      this.#progress.updateStatus('done');
    }
  }

  private buildEdgeIndexes(): void {
    const nodes = this.nodes;
    const nodeCount = this.nodeCount;
    const firstEdgeIndexes = this.firstEdgeIndexes;
    const nodeFieldCount = this.nodeFieldCount;
    const edgeFieldsCount = this.edgeFieldsCount;
    const nodeEdgeCountOffset = this.#nodeEdgeCountOffset;
    firstEdgeIndexes[nodeCount] = this.containmentEdges.length;
    for (let nodeOrdinal = 0, edgeIndex = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
      firstEdgeIndexes[nodeOrdinal] = edgeIndex;
      edgeIndex += nodes.getValue(nodeOrdinal * nodeFieldCount + nodeEdgeCountOffset) * edgeFieldsCount;
    }
  }

  private buildRetainers(): void {
    const retainingNodes = this.retainingNodes;
    const retainingEdges = this.retainingEdges;
    // Index of the first retainer in the retainingNodes and retainingEdges
    // arrays. Addressed by retained node index.
    const firstRetainerIndex = this.firstRetainerIndex;

    const containmentEdges = this.containmentEdges;
    const edgeFieldsCount = this.edgeFieldsCount;
    const nodeFieldCount = this.nodeFieldCount;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const firstEdgeIndexes = this.firstEdgeIndexes;
    const nodeCount = this.nodeCount;

    for (let toNodeFieldIndex = edgeToNodeOffset, l = containmentEdges.length; toNodeFieldIndex < l;
         toNodeFieldIndex += edgeFieldsCount) {
      const toNodeIndex = containmentEdges.getValue(toNodeFieldIndex);
      if (toNodeIndex % nodeFieldCount) {
        throw new Error('Invalid toNodeIndex ' + toNodeIndex);
      }
      ++firstRetainerIndex[toNodeIndex / nodeFieldCount];
    }
    for (let i = 0, firstUnusedRetainerSlot = 0; i < nodeCount; i++) {
      const retainersCount = firstRetainerIndex[i];
      firstRetainerIndex[i] = firstUnusedRetainerSlot;
      retainingNodes[firstUnusedRetainerSlot] = retainersCount;
      firstUnusedRetainerSlot += retainersCount;
    }
    firstRetainerIndex[nodeCount] = retainingNodes.length;

    let nextNodeFirstEdgeIndex: number = firstEdgeIndexes[0];
    for (let srcNodeOrdinal = 0; srcNodeOrdinal < nodeCount; ++srcNodeOrdinal) {
      const firstEdgeIndex = nextNodeFirstEdgeIndex;
      nextNodeFirstEdgeIndex = firstEdgeIndexes[srcNodeOrdinal + 1];
      const srcNodeIndex = srcNodeOrdinal * nodeFieldCount;
      for (let edgeIndex = firstEdgeIndex; edgeIndex < nextNodeFirstEdgeIndex; edgeIndex += edgeFieldsCount) {
        const toNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
        if (toNodeIndex % nodeFieldCount) {
          throw new Error('Invalid toNodeIndex ' + toNodeIndex);
        }
        const firstRetainerSlotIndex = firstRetainerIndex[toNodeIndex / nodeFieldCount];
        const nextUnusedRetainerSlotIndex = firstRetainerSlotIndex + (--retainingNodes[firstRetainerSlotIndex]);
        retainingNodes[nextUnusedRetainerSlotIndex] = srcNodeIndex;
        retainingEdges[nextUnusedRetainerSlotIndex] = edgeIndex;
      }
    }
  }

  abstract createNode(_nodeIndex?: number): HeapSnapshotNode;
  abstract createEdge(_edgeIndex: number): JSHeapSnapshotEdge;
  abstract createRetainingEdge(_retainerIndex: number): JSHeapSnapshotRetainerEdge;

  private allNodes(): HeapSnapshotNodeIterator {
    return new HeapSnapshotNodeIterator(this.rootNode());
  }

  rootNode(): HeapSnapshotNode {
    return this.createNode(this.rootNodeIndexInternal);
  }

  get rootNodeIndex(): number {
    return this.rootNodeIndexInternal;
  }

  get totalSize(): number {
    return this.rootNode().retainedSize();
  }

  private getDominatedIndex(nodeIndex: number): number {
    if (nodeIndex % this.nodeFieldCount) {
      throw new Error('Invalid nodeIndex: ' + nodeIndex);
    }
    return this.firstDominatedNodeIndex[nodeIndex / this.nodeFieldCount];
  }

  private createFilter(nodeFilter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter):
      ((arg0: HeapSnapshotNode) => boolean)|undefined {
    const {minNodeId, maxNodeId, allocationNodeId, filterName} = nodeFilter;
    let filter;
    if (typeof allocationNodeId === 'number') {
      filter = this.createAllocationStackFilter(allocationNodeId);
      if (!filter) {
        throw new Error('Unable to create filter');
      }
      // @ts-ignore key can be added as a static property
      filter.key = 'AllocationNodeId: ' + allocationNodeId;
    } else if (typeof minNodeId === 'number' && typeof maxNodeId === 'number') {
      filter = this.createNodeIdFilter(minNodeId, maxNodeId);
      // @ts-ignore key can be added as a static property
      filter.key = 'NodeIdRange: ' + minNodeId + '..' + maxNodeId;
    } else if (filterName !== undefined) {
      filter = this.createNamedFilter(filterName);
      // @ts-ignore key can be added as a static property
      filter.key = 'NamedFilter: ' + filterName;
    }
    return filter;
  }

  search(
      searchConfig: HeapSnapshotModel.HeapSnapshotModel.SearchConfig,
      nodeFilter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter): number[] {
    const query = searchConfig.query;

    function filterString(matchedStringIndexes: Set<number>, string: string, index: number): Set<number> {
      if (string.indexOf(query) !== -1) {
        matchedStringIndexes.add(index);
      }
      return matchedStringIndexes;
    }

    const regexp =
        searchConfig.isRegex ? new RegExp(query) : Platform.StringUtilities.createPlainTextSearchRegex(query, 'i');

    function filterRegexp(matchedStringIndexes: Set<number>, string: string, index: number): Set<number> {
      if (regexp.test(string)) {
        matchedStringIndexes.add(index);
      }
      return matchedStringIndexes;
    }

    const stringFilter = (searchConfig.isRegex || !searchConfig.caseSensitive) ? filterRegexp : filterString;
    const stringIndexes = this.strings.reduce(stringFilter, new Set());

    if (!stringIndexes.size) {
      return [];
    }

    const filter = this.createFilter(nodeFilter);
    const nodeIds = [];
    const nodesLength = this.nodes.length;
    const nodes = this.nodes;
    const nodeNameOffset = this.nodeNameOffset;
    const nodeIdOffset = this.nodeIdOffset;
    const nodeFieldCount = this.nodeFieldCount;
    const node = this.rootNode();

    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      node.nodeIndex = nodeIndex;
      if (filter && !filter(node)) {
        continue;
      }
      if (stringIndexes.has(nodes.getValue(nodeIndex + nodeNameOffset))) {
        nodeIds.push(nodes.getValue(nodeIndex + nodeIdOffset));
      }
    }
    return nodeIds;
  }

  aggregatesWithFilter(nodeFilter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter):
      {[x: string]: HeapSnapshotModel.HeapSnapshotModel.Aggregate} {
    const filter = this.createFilter(nodeFilter);
    // @ts-ignore key is added in createFilter
    const key = filter ? filter.key : 'allObjects';
    return this.getAggregatesByClassName(false, key, filter);
  }

  private createNodeIdFilter(minNodeId: number, maxNodeId: number): (arg0: HeapSnapshotNode) => boolean {
    function nodeIdFilter(node: HeapSnapshotNode): boolean {
      const id = node.id();
      return id > minNodeId && id <= maxNodeId;
    }
    return nodeIdFilter;
  }

  private createAllocationStackFilter(bottomUpAllocationNodeId: number):
      ((arg0: HeapSnapshotNode) => boolean)|undefined {
    if (!this.#allocationProfile) {
      throw new Error('No Allocation Profile provided');
    }

    const traceIds = this.#allocationProfile.traceIds(bottomUpAllocationNodeId);
    if (!traceIds.length) {
      return undefined;
    }

    const set: {[x: number]: boolean} = {};
    for (let i = 0; i < traceIds.length; i++) {
      set[traceIds[i]] = true;
    }
    function traceIdFilter(node: HeapSnapshotNode): boolean {
      return Boolean(set[node.traceNodeId()]);
    }
    return traceIdFilter;
  }

  private createNamedFilter(filterName: string): (node: HeapSnapshotNode) => boolean {
    // Allocate an array with a single bit per node, which can be used by each
    // specific filter implemented below.
    const bitmap = Platform.TypedArrayUtilities.createBitVector(this.nodeCount);
    const getBit = (node: HeapSnapshotNode): boolean => {
      const ordinal = node.nodeIndex / this.nodeFieldCount;
      return bitmap.getBit(ordinal);
    };

    // Traverses the graph in breadth-first order with the given filter, and
    // sets the bit in `bitmap` for every visited node.
    const traverse = (filter: (node: HeapSnapshotNode, edge: HeapSnapshotEdge) => boolean): void => {
      const distances = new Int32Array(this.nodeCount);
      for (let i = 0; i < this.nodeCount; ++i) {
        distances[i] = this.#noDistance;
      }
      const nodesToVisit = new Uint32Array(this.nodeCount);
      distances[this.rootNode().ordinal()] = 0;
      nodesToVisit[0] = this.rootNode().nodeIndex;
      const nodesToVisitLength = 1;
      this.bfs(nodesToVisit, nodesToVisitLength, distances, filter);
      for (let i = 0; i < this.nodeCount; ++i) {
        if (distances[i] !== this.#noDistance) {
          bitmap.setBit(i);
        }
      }
    };

    const markUnreachableNodes = (): void => {
      for (let i = 0; i < this.nodeCount; ++i) {
        if (this.nodeDistances[i] === this.#noDistance) {
          bitmap.setBit(i);
        }
      }
    };

    switch (filterName) {
      case 'objectsRetainedByDetachedDomNodes':
        // Traverse the graph, avoiding detached nodes.
        traverse((node: HeapSnapshotNode, edge: HeapSnapshotEdge) => {
          return edge.node().detachedness() !== DOMLinkState.Detached;
        });
        markUnreachableNodes();
        return (node: HeapSnapshotNode) => !getBit(node);
      case 'objectsRetainedByConsole':
        // Traverse the graph, avoiding edges that represent globals owned by
        // the DevTools console.
        traverse((node: HeapSnapshotNode, edge: HeapSnapshotEdge) => {
          return !(node.isSynthetic() && edge.hasStringName() && edge.name().endsWith(' / DevTools console'));
        });
        markUnreachableNodes();
        return (node: HeapSnapshotNode) => !getBit(node);
      case 'duplicatedStrings': {
        const stringToNodeIndexMap = new Map<string, number>();
        const node = this.createNode(0);
        for (let i = 0; i < this.nodeCount; ++i) {
          node.nodeIndex = i * this.nodeFieldCount;
          const rawType = node.rawType();
          if (rawType === this.nodeStringType || rawType === this.nodeConsStringType) {
            // Check whether the cons string is already "flattened", meaning
            // that one of its two parts is the empty string. If so, we should
            // skip it. We don't help anyone by reporting a flattened cons
            // string as a duplicate with its own content, since V8 controls
            // that behavior internally.
            if (node.isFlatConsString()) {
              continue;
            }
            const name = node.name();
            const alreadyVisitedNodeIndex = stringToNodeIndexMap.get(name);
            if (alreadyVisitedNodeIndex === undefined) {
              stringToNodeIndexMap.set(name, node.nodeIndex);
            } else {
              bitmap.setBit(alreadyVisitedNodeIndex / this.nodeFieldCount);
              bitmap.setBit(node.nodeIndex / this.nodeFieldCount);
            }
          }
        }
        return getBit;
      }
    }
    throw new Error('Invalid filter name');
  }

  getAggregatesByClassName(sortedIndexes: boolean, key?: string, filter?: ((arg0: HeapSnapshotNode) => boolean)):
      {[x: string]: HeapSnapshotModel.HeapSnapshotModel.Aggregate} {
    const aggregates = this.buildAggregates(filter);

    let aggregatesByClassName;
    if (key && this.#aggregates[key]) {
      aggregatesByClassName = this.#aggregates[key];
    } else {
      this.calculateClassesRetainedSize(aggregates.aggregatesByClassIndex, filter);
      aggregatesByClassName = aggregates.aggregatesByClassName;
      if (key) {
        this.#aggregates[key] = aggregatesByClassName;
      }
    }

    if (sortedIndexes && (!key || !this.#aggregatesSortedFlags[key])) {
      this.sortAggregateIndexes(aggregatesByClassName);
      if (key) {
        this.#aggregatesSortedFlags[key] = sortedIndexes;
      }
    }

    return aggregatesByClassName as {
      [x: string]: HeapSnapshotModel.HeapSnapshotModel.Aggregate,
    };
  }

  allocationTracesTops(): HeapSnapshotModel.HeapSnapshotModel.SerializedAllocationNode[] {
    return this.#allocationProfile.serializeTraceTops();
  }

  allocationNodeCallers(nodeId: number): HeapSnapshotModel.HeapSnapshotModel.AllocationNodeCallers {
    return this.#allocationProfile.serializeCallers(nodeId);
  }

  allocationStack(nodeIndex: number): HeapSnapshotModel.HeapSnapshotModel.AllocationStackFrame[]|null {
    const node = this.createNode(nodeIndex);
    const allocationNodeId = node.traceNodeId();
    if (!allocationNodeId) {
      return null;
    }
    return this.#allocationProfile.serializeAllocationStack(allocationNodeId);
  }

  aggregatesForDiff(): {[x: string]: HeapSnapshotModel.HeapSnapshotModel.AggregateForDiff} {
    if (this.#aggregatesForDiffInternal) {
      return this.#aggregatesForDiffInternal;
    }

    const aggregatesByClassName = this.getAggregatesByClassName(true, 'allObjects');
    this.#aggregatesForDiffInternal = {};

    const node = this.createNode();
    for (const className in aggregatesByClassName) {
      const aggregate = aggregatesByClassName[className];
      const indexes = aggregate.idxs;
      const ids = new Array(indexes.length);
      const selfSizes = new Array(indexes.length);
      for (let i = 0; i < indexes.length; i++) {
        node.nodeIndex = indexes[i];
        ids[i] = node.id();
        selfSizes[i] = node.selfSize();
      }

      this.#aggregatesForDiffInternal[className] = {indexes: indexes, ids: ids, selfSizes: selfSizes};
    }
    return this.#aggregatesForDiffInternal;
  }

  isUserRoot(_node: HeapSnapshotNode): boolean {
    return true;
  }

  calculateShallowSizes(): void {
  }

  calculateDistances(
      isForRetainersView: boolean, filter?: ((arg0: HeapSnapshotNode, arg1: HeapSnapshotEdge) => boolean)): void {
    const nodeCount = this.nodeCount;

    if (isForRetainersView) {
      const originalFilter = filter;
      filter = (node: HeapSnapshotNode, edge: HeapSnapshotEdge) => {
        return !this.#ignoredNodesInRetainersView.has(edge.nodeIndex()) &&
            (!originalFilter || originalFilter(node, edge));
      };
      if (this.#nodeDistancesForRetainersView === undefined) {
        this.#nodeDistancesForRetainersView = new Int32Array(nodeCount);
      }
    }

    const distances = isForRetainersView ? (this.#nodeDistancesForRetainersView as Int32Array) : this.nodeDistances;
    const noDistance = this.#noDistance;
    for (let i = 0; i < nodeCount; ++i) {
      distances[i] = noDistance;
    }

    const nodesToVisit = new Uint32Array(this.nodeCount);
    let nodesToVisitLength = 0;

    // BFS for user root objects.
    for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
      const node = iter.edge.node();
      if (this.isUserRoot(node)) {
        distances[node.ordinal()] = 1;
        nodesToVisit[nodesToVisitLength++] = node.nodeIndex;
      }
    }
    this.bfs(nodesToVisit, nodesToVisitLength, distances, filter);

    // BFS for objects not reached from user roots.
    distances[this.rootNode().ordinal()] =
        nodesToVisitLength > 0 ? HeapSnapshotModel.HeapSnapshotModel.baseSystemDistance : 0;
    nodesToVisit[0] = this.rootNode().nodeIndex;
    nodesToVisitLength = 1;
    this.bfs(nodesToVisit, nodesToVisitLength, distances, filter);
  }

  private bfs(
      nodesToVisit: Uint32Array, nodesToVisitLength: number, distances: Int32Array,
      filter?: ((arg0: HeapSnapshotNode, arg1: HeapSnapshotEdge) => boolean)): void {
    // Preload fields into local variables for better performance.
    const edgeFieldsCount = this.edgeFieldsCount;
    const nodeFieldCount = this.nodeFieldCount;
    const containmentEdges = this.containmentEdges;
    const firstEdgeIndexes = this.firstEdgeIndexes;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const edgeTypeOffset = this.edgeTypeOffset;
    const nodeCount = this.nodeCount;
    const edgeWeakType = this.edgeWeakType;
    const noDistance = this.#noDistance;

    let index = 0;
    const edge = this.createEdge(0);
    const node = this.createNode(0);
    while (index < nodesToVisitLength) {
      const nodeIndex = nodesToVisit[index++];  // shift generates too much garbage.
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const distance = distances[nodeOrdinal] + 1;
      const firstEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const edgesEnd = firstEdgeIndexes[nodeOrdinal + 1];
      node.nodeIndex = nodeIndex;
      for (let edgeIndex = firstEdgeIndex; edgeIndex < edgesEnd; edgeIndex += edgeFieldsCount) {
        const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
        if (edgeType === edgeWeakType) {
          continue;
        }
        const childNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
        const childNodeOrdinal = childNodeIndex / nodeFieldCount;
        if (distances[childNodeOrdinal] !== noDistance) {
          continue;
        }
        edge.edgeIndex = edgeIndex;
        if (filter && !filter(node, edge)) {
          continue;
        }
        distances[childNodeOrdinal] = distance;
        nodesToVisit[nodesToVisitLength++] = childNodeIndex;
      }
    }
    if (nodesToVisitLength > nodeCount) {
      throw new Error(
          'BFS failed. Nodes to visit (' + nodesToVisitLength + ') is more than nodes count (' + nodeCount + ')');
    }
  }

  private buildAggregates(filter?: ((arg0: HeapSnapshotNode) => boolean)):
      {aggregatesByClassName: {[x: string]: AggregatedInfo}, aggregatesByClassIndex: {[x: number]: AggregatedInfo}} {
    const aggregates: {[x: number]: AggregatedInfo} = {};

    const aggregatesByClassName: {[x: string]: AggregatedInfo} = {};

    const classIndexes = [];
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeFieldCount = this.nodeFieldCount;
    const selfSizeOffset = this.nodeSelfSizeOffset;
    const node = this.rootNode();
    const nodeDistances = this.nodeDistances;

    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      node.nodeIndex = nodeIndex;
      if (filter && !filter(node)) {
        continue;
      }
      const selfSize = nodes.getValue(nodeIndex + selfSizeOffset);
      if (!selfSize) {
        continue;
      }
      const classIndex = node.classIndex();
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const distance = nodeDistances[nodeOrdinal];
      if (!(classIndex in aggregates)) {
        const nodeType = node.type();
        const nameMatters = nodeType === 'object' || nodeType === 'native';
        const value = {
          count: 1,
          distance: distance,
          self: selfSize,
          maxRet: 0,
          type: nodeType,
          name: nameMatters ? node.className() : null,
          idxs: [nodeIndex],
        };
        aggregates[classIndex] = value;
        classIndexes.push(classIndex);
        aggregatesByClassName[node.className()] = value;
      } else {
        const clss = aggregates[classIndex];
        if (!clss) {
          continue;
        }
        clss.distance = Math.min(clss.distance, distance);
        ++clss.count;
        clss.self += selfSize;
        clss.idxs.push(nodeIndex);
      }
    }

    // Shave off provisionally allocated space.
    for (let i = 0, l = classIndexes.length; i < l; ++i) {
      const classIndex = classIndexes[i];
      const classIndexValues = aggregates[classIndex];
      if (!classIndexValues) {
        continue;
      }
      classIndexValues.idxs = classIndexValues.idxs.slice();
    }

    return {aggregatesByClassName: aggregatesByClassName, aggregatesByClassIndex: aggregates};
  }

  private calculateClassesRetainedSize(
      aggregates: {[x: number]: AggregatedInfo}, filter?: ((arg0: HeapSnapshotNode) => boolean)): void {
    const rootNodeIndex = this.rootNodeIndexInternal;
    const node = this.createNode(rootNodeIndex);
    const list = [rootNodeIndex];
    const sizes = [-1];
    const classes = [];

    const seenClassNameIndexes = new Map<number, boolean>();
    const nodeFieldCount = this.nodeFieldCount;
    const dominatedNodes = this.dominatedNodes;
    const firstDominatedNodeIndex = this.firstDominatedNodeIndex;

    while (list.length) {
      const nodeIndex = (list.pop() as number);
      node.nodeIndex = nodeIndex;
      let classIndex = node.classIndex();
      const seen = Boolean(seenClassNameIndexes.get(classIndex));
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const dominatedIndexFrom = firstDominatedNodeIndex[nodeOrdinal];
      const dominatedIndexTo = firstDominatedNodeIndex[nodeOrdinal + 1];

      if (!seen && (!filter || filter(node)) && node.selfSize()) {
        aggregates[classIndex].maxRet += node.retainedSize();
        if (dominatedIndexFrom !== dominatedIndexTo) {
          seenClassNameIndexes.set(classIndex, true);
          sizes.push(list.length);
          classes.push(classIndex);
        }
      }
      for (let i = dominatedIndexFrom; i < dominatedIndexTo; i++) {
        list.push(dominatedNodes[i]);
      }

      const l = list.length;
      while (sizes[sizes.length - 1] === l) {
        sizes.pop();
        classIndex = (classes.pop() as number);
        seenClassNameIndexes.set(classIndex, false);
      }
    }
  }

  private sortAggregateIndexes(aggregates: {[x: string]: AggregatedInfo}): void {
    const nodeA = this.createNode();
    const nodeB = this.createNode();

    for (const clss in aggregates) {
      aggregates[clss].idxs.sort((idxA, idxB) => {
        nodeA.nodeIndex = idxA;
        nodeB.nodeIndex = idxB;
        return nodeA.id() < nodeB.id() ? -1 : 1;
      });
    }
  }

  tryParseWeakMapEdgeName(edgeNameIndex: number): {duplicatedPart: string, tableId: string}|undefined {
    const previousResult = this.#edgeNamesThatAreNotWeakMaps.getBit(edgeNameIndex);
    if (previousResult) {
      return undefined;
    }
    const edgeName = this.strings[edgeNameIndex];
    const ephemeronNameRegex =
        /^\d+(?<duplicatedPart> \/ part of key \(.*? @\d+\) -> value \(.*? @\d+\) pair in WeakMap \(table @(?<tableId>\d+)\))$/;
    const match = edgeName.match(ephemeronNameRegex);
    if (!match) {
      this.#edgeNamesThatAreNotWeakMaps.setBit(edgeNameIndex);
      return undefined;
    }
    return match.groups as {duplicatedPart: string, tableId: string};
  }

  /**
   * The function checks is the edge should be considered during building
   * postorder iterator and dominator tree.
   */
  private isEssentialEdge(nodeIndex: number, edgeIndex: number): boolean {
    const edgeType = this.containmentEdges.getValue(edgeIndex + this.edgeTypeOffset);

    // Values in WeakMaps are retained by the key and table together. Removing
    // either the key or the table would be sufficient to remove the edge from
    // the other one, so we needn't use both of those edges when computing
    // dominators. We've found that the edge from the key generally produces
    // more useful results, so here we skip the edge from the table.
    if (edgeType === this.edgeInternalType) {
      const edgeNameIndex = this.containmentEdges.getValue(edgeIndex + this.edgeNameOffset);
      const match = this.tryParseWeakMapEdgeName(edgeNameIndex);
      if (match) {
        const nodeId = this.nodes.getValue(nodeIndex + this.nodeIdOffset);
        return nodeId !== parseInt(match.tableId, 10);
      }
    }

    // Shortcuts at the root node have special meaning of marking user global objects.
    return edgeType !== this.edgeWeakType &&
        (edgeType !== this.edgeShortcutType || nodeIndex === this.rootNodeIndexInternal);
  }

  private buildPostOrderIndex(): {postOrderIndex2NodeOrdinal: Uint32Array, nodeOrdinal2PostOrderIndex: Uint32Array} {
    const nodeFieldCount = this.nodeFieldCount;
    const nodeCount = this.nodeCount;
    const rootNodeOrdinal = this.rootNodeIndexInternal / nodeFieldCount;

    const edgeFieldsCount = this.edgeFieldsCount;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const firstEdgeIndexes = this.firstEdgeIndexes;
    const containmentEdges = this.containmentEdges;

    const mapAndFlag = this.userObjectsMapAndFlag();
    const flags = mapAndFlag ? mapAndFlag.map : null;
    const flag = mapAndFlag ? mapAndFlag.flag : 0;

    const stackNodes = new Uint32Array(nodeCount);
    const stackCurrentEdge = new Uint32Array(nodeCount);
    const postOrderIndex2NodeOrdinal = new Uint32Array(nodeCount);
    const nodeOrdinal2PostOrderIndex = new Uint32Array(nodeCount);
    const visited = new Uint8Array(nodeCount);
    let postOrderIndex = 0;

    let stackTop = 0;
    stackNodes[0] = rootNodeOrdinal;
    stackCurrentEdge[0] = firstEdgeIndexes[rootNodeOrdinal];
    visited[rootNodeOrdinal] = 1;

    let iteration = 0;
    while (true) {
      ++iteration;
      while (stackTop >= 0) {
        const nodeOrdinal = stackNodes[stackTop];
        const edgeIndex = stackCurrentEdge[stackTop];
        const edgesEnd = firstEdgeIndexes[nodeOrdinal + 1];

        if (edgeIndex < edgesEnd) {
          stackCurrentEdge[stackTop] += edgeFieldsCount;
          if (!this.isEssentialEdge(nodeOrdinal * nodeFieldCount, edgeIndex)) {
            continue;
          }
          const childNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
          const childNodeOrdinal = childNodeIndex / nodeFieldCount;
          if (visited[childNodeOrdinal]) {
            continue;
          }
          const nodeFlag = !flags || (flags[nodeOrdinal] & flag);
          const childNodeFlag = !flags || (flags[childNodeOrdinal] & flag);
          // We are skipping the edges from non-page-owned nodes to page-owned nodes.
          // Otherwise the dominators for the objects that also were retained by debugger would be affected.
          if (nodeOrdinal !== rootNodeOrdinal && childNodeFlag && !nodeFlag) {
            continue;
          }
          ++stackTop;
          stackNodes[stackTop] = childNodeOrdinal;
          stackCurrentEdge[stackTop] = firstEdgeIndexes[childNodeOrdinal];
          visited[childNodeOrdinal] = 1;
        } else {
          // Done with all the node children
          nodeOrdinal2PostOrderIndex[nodeOrdinal] = postOrderIndex;
          postOrderIndex2NodeOrdinal[postOrderIndex++] = nodeOrdinal;
          --stackTop;
        }
      }

      if (postOrderIndex === nodeCount || iteration > 1) {
        break;
      }
      const errors = new HeapSnapshotProblemReport(`Heap snapshot: ${
          nodeCount - postOrderIndex} nodes are unreachable from the root. Following nodes have only weak retainers:`);
      const dumpNode = this.rootNode();
      // Remove root from the result (last node in the array) and put it at the bottom of the stack so that it is
      // visited after all orphan nodes and their subgraphs.
      --postOrderIndex;
      stackTop = 0;
      stackNodes[0] = rootNodeOrdinal;
      stackCurrentEdge[0] = firstEdgeIndexes[rootNodeOrdinal + 1];  // no need to reiterate its edges
      for (let i = 0; i < nodeCount; ++i) {
        if (visited[i] || !this.hasOnlyWeakRetainers(i)) {
          continue;
        }

        // Add all nodes that have only weak retainers to traverse their subgraphs.
        stackNodes[++stackTop] = i;
        stackCurrentEdge[stackTop] = firstEdgeIndexes[i];
        visited[i] = 1;

        dumpNode.nodeIndex = i * nodeFieldCount;
        const retainers = [];
        for (let it = dumpNode.retainers(); it.hasNext(); it.next()) {
          retainers.push(`${it.item().node().name()}@${it.item().node().id()}.${it.item().name()}`);
        }
        errors.addError(`${dumpNode.name()} @${dumpNode.id()}  weak retainers: ${retainers.join(', ')}`);
      }
      console.warn(errors.toString());
    }

    // If we already processed all orphan nodes that have only weak retainers and still have some orphans...
    if (postOrderIndex !== nodeCount) {
      const errors = new HeapSnapshotProblemReport(
          'Still found ' + (nodeCount - postOrderIndex) + ' unreachable nodes in heap snapshot:');
      const dumpNode = this.rootNode();
      // Remove root from the result (last node in the array) and put it at the bottom of the stack so that it is
      // visited after all orphan nodes and their subgraphs.
      --postOrderIndex;
      for (let i = 0; i < nodeCount; ++i) {
        if (visited[i]) {
          continue;
        }
        dumpNode.nodeIndex = i * nodeFieldCount;
        errors.addError(dumpNode.name() + ' @' + dumpNode.id());
        // Fix it by giving the node a postorder index anyway.
        nodeOrdinal2PostOrderIndex[i] = postOrderIndex;
        postOrderIndex2NodeOrdinal[postOrderIndex++] = i;
      }
      nodeOrdinal2PostOrderIndex[rootNodeOrdinal] = postOrderIndex;
      postOrderIndex2NodeOrdinal[postOrderIndex++] = rootNodeOrdinal;
      console.warn(errors.toString());
    }

    return {
      postOrderIndex2NodeOrdinal: postOrderIndex2NodeOrdinal,
      nodeOrdinal2PostOrderIndex: nodeOrdinal2PostOrderIndex,
    };
  }

  private hasOnlyWeakRetainers(nodeOrdinal: number): boolean {
    const edgeTypeOffset = this.edgeTypeOffset;
    const edgeWeakType = this.edgeWeakType;
    const edgeShortcutType = this.edgeShortcutType;
    const containmentEdges = this.containmentEdges;
    const retainingEdges = this.retainingEdges;
    const beginRetainerIndex = this.firstRetainerIndex[nodeOrdinal];
    const endRetainerIndex = this.firstRetainerIndex[nodeOrdinal + 1];
    for (let retainerIndex = beginRetainerIndex; retainerIndex < endRetainerIndex; ++retainerIndex) {
      const retainerEdgeIndex = retainingEdges[retainerIndex];
      const retainerEdgeType = containmentEdges.getValue(retainerEdgeIndex + edgeTypeOffset);
      if (retainerEdgeType !== edgeWeakType && retainerEdgeType !== edgeShortcutType) {
        return false;
      }
    }
    return true;
  }

  // The algorithm is based on the article:
  // K. Cooper, T. Harvey and K. Kennedy "A Simple, Fast Dominance Algorithm"
  // Softw. Pract. Exper. 4 (2001), pp. 1-10.
  private buildDominatorTree(postOrderIndex2NodeOrdinal: Uint32Array, nodeOrdinal2PostOrderIndex: Uint32Array):
      Uint32Array {
    const nodeFieldCount = this.nodeFieldCount;
    const firstRetainerIndex = this.firstRetainerIndex;
    const retainingNodes = this.retainingNodes;
    const retainingEdges = this.retainingEdges;
    const edgeFieldsCount = this.edgeFieldsCount;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const firstEdgeIndexes = this.firstEdgeIndexes;
    const containmentEdges = this.containmentEdges;
    const rootNodeIndex = this.rootNodeIndexInternal;

    const mapAndFlag = this.userObjectsMapAndFlag();
    const flags = mapAndFlag ? mapAndFlag.map : null;
    const flag = mapAndFlag ? mapAndFlag.flag : 0;

    const nodesCount = postOrderIndex2NodeOrdinal.length;
    const rootPostOrderedIndex = nodesCount - 1;
    const noEntry = nodesCount;
    const dominators = new Uint32Array(nodesCount);
    for (let i = 0; i < rootPostOrderedIndex; ++i) {
      dominators[i] = noEntry;
    }
    dominators[rootPostOrderedIndex] = rootPostOrderedIndex;

    // The affected array is used to mark entries which dominators
    // have to be recalculated because of changes in their retainers.
    const affected = Platform.TypedArrayUtilities.createBitVector(nodesCount);
    let nodeOrdinal;

    {  // Mark the root direct children as affected.
      nodeOrdinal = this.rootNodeIndexInternal / nodeFieldCount;
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      for (let edgeIndex = firstEdgeIndexes[nodeOrdinal]; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
        if (!this.isEssentialEdge(this.rootNodeIndexInternal, edgeIndex)) {
          continue;
        }
        const childNodeOrdinal = containmentEdges.getValue(edgeIndex + edgeToNodeOffset) / nodeFieldCount;
        affected.setBit(nodeOrdinal2PostOrderIndex[childNodeOrdinal]);
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (let postOrderIndex = affected.previous(rootPostOrderedIndex); postOrderIndex >= 0;
           postOrderIndex = affected.previous(postOrderIndex)) {
        affected.clearBit(postOrderIndex);
        // If dominator of the entry has already been set to root,
        // then it can't propagate any further.
        if (dominators[postOrderIndex] === rootPostOrderedIndex) {
          continue;
        }
        nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
        const nodeFlag = !flags || (flags[nodeOrdinal] & flag);
        let newDominatorIndex: number = noEntry;
        const beginRetainerIndex = firstRetainerIndex[nodeOrdinal];
        const endRetainerIndex = firstRetainerIndex[nodeOrdinal + 1];
        let orphanNode = true;
        for (let retainerIndex = beginRetainerIndex; retainerIndex < endRetainerIndex; ++retainerIndex) {
          const retainerEdgeIndex = retainingEdges[retainerIndex];
          const retainerNodeIndex = retainingNodes[retainerIndex];
          if (!this.isEssentialEdge(retainerNodeIndex, retainerEdgeIndex)) {
            continue;
          }
          orphanNode = false;
          const retainerNodeOrdinal = retainerNodeIndex / nodeFieldCount;
          const retainerNodeFlag = !flags || (flags[retainerNodeOrdinal] & flag);
          // We are skipping the edges from non-page-owned nodes to page-owned nodes.
          // Otherwise the dominators for the objects that also were retained by debugger would be affected.
          if (retainerNodeIndex !== rootNodeIndex && nodeFlag && !retainerNodeFlag) {
            continue;
          }
          let retainerPostOrderIndex: number = nodeOrdinal2PostOrderIndex[retainerNodeOrdinal];
          if (dominators[retainerPostOrderIndex] !== noEntry) {
            if (newDominatorIndex === noEntry) {
              newDominatorIndex = retainerPostOrderIndex;
            } else {
              while (retainerPostOrderIndex !== newDominatorIndex) {
                while (retainerPostOrderIndex < newDominatorIndex) {
                  retainerPostOrderIndex = dominators[retainerPostOrderIndex];
                }
                while (newDominatorIndex < retainerPostOrderIndex) {
                  newDominatorIndex = dominators[newDominatorIndex];
                }
              }
            }
            // If item has already reached the root, it doesn't make sense
            // to check other retainers.
            if (newDominatorIndex === rootPostOrderedIndex) {
              break;
            }
          }
        }
        // Make root dominator of orphans.
        if (orphanNode) {
          newDominatorIndex = rootPostOrderedIndex;
        }
        if (newDominatorIndex !== noEntry && dominators[postOrderIndex] !== newDominatorIndex) {
          dominators[postOrderIndex] = newDominatorIndex;
          changed = true;
          nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
          const beginEdgeToNodeFieldIndex = firstEdgeIndexes[nodeOrdinal] + edgeToNodeOffset;
          const endEdgeToNodeFieldIndex = firstEdgeIndexes[nodeOrdinal + 1];
          for (let toNodeFieldIndex = beginEdgeToNodeFieldIndex; toNodeFieldIndex < endEdgeToNodeFieldIndex;
               toNodeFieldIndex += edgeFieldsCount) {
            const childNodeOrdinal = containmentEdges.getValue(toNodeFieldIndex) / nodeFieldCount;
            affected.setBit(nodeOrdinal2PostOrderIndex[childNodeOrdinal]);
          }
        }
      }
    }

    const dominatorsTree = new Uint32Array(nodesCount);
    for (let postOrderIndex = 0, l = dominators.length; postOrderIndex < l; ++postOrderIndex) {
      nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
      dominatorsTree[nodeOrdinal] = postOrderIndex2NodeOrdinal[dominators[postOrderIndex]];
    }
    return dominatorsTree;
  }

  private calculateRetainedSizes(postOrderIndex2NodeOrdinal: Uint32Array): void {
    const nodeCount = this.nodeCount;
    const nodes = this.nodes;
    const nodeSelfSizeOffset = this.nodeSelfSizeOffset;
    const nodeFieldCount = this.nodeFieldCount;
    const dominatorsTree = this.dominatorsTree;
    const retainedSizes = this.retainedSizes;

    for (let nodeOrdinal = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
      retainedSizes[nodeOrdinal] = nodes.getValue(nodeOrdinal * nodeFieldCount + nodeSelfSizeOffset);
    }

    // Propagate retained sizes for each node excluding root.
    for (let postOrderIndex = 0; postOrderIndex < nodeCount - 1; ++postOrderIndex) {
      const nodeOrdinal = postOrderIndex2NodeOrdinal[postOrderIndex];
      const dominatorOrdinal = dominatorsTree[nodeOrdinal];
      retainedSizes[dominatorOrdinal] += retainedSizes[nodeOrdinal];
    }
  }

  private buildDominatedNodes(): void {
    // Builds up two arrays:
    //  - "dominatedNodes" is a continuous array, where each node owns an
    //    interval (can be empty) with corresponding dominated nodes.
    //  - "indexArray" is an array of indexes in the "dominatedNodes"
    //    with the same positions as in the _nodeIndex.
    const indexArray = this.firstDominatedNodeIndex;
    // All nodes except the root have dominators.
    const dominatedNodes = this.dominatedNodes;

    // Count the number of dominated nodes for each node. Skip the root (node at
    // index 0) as it is the only node that dominates itself.
    const nodeFieldCount = this.nodeFieldCount;
    const dominatorsTree = this.dominatorsTree;

    let fromNodeOrdinal = 0;
    let toNodeOrdinal: number = this.nodeCount;
    const rootNodeOrdinal = this.rootNodeIndexInternal / nodeFieldCount;
    if (rootNodeOrdinal === fromNodeOrdinal) {
      fromNodeOrdinal = 1;
    } else if (rootNodeOrdinal === toNodeOrdinal - 1) {
      toNodeOrdinal = toNodeOrdinal - 1;
    } else {
      throw new Error('Root node is expected to be either first or last');
    }
    for (let nodeOrdinal = fromNodeOrdinal; nodeOrdinal < toNodeOrdinal; ++nodeOrdinal) {
      ++indexArray[dominatorsTree[nodeOrdinal]];
    }
    // Put in the first slot of each dominatedNodes slice the count of entries
    // that will be filled.
    let firstDominatedNodeIndex = 0;
    for (let i = 0, l = this.nodeCount; i < l; ++i) {
      const dominatedCount = dominatedNodes[firstDominatedNodeIndex] = indexArray[i];
      indexArray[i] = firstDominatedNodeIndex;
      firstDominatedNodeIndex += dominatedCount;
    }
    indexArray[this.nodeCount] = dominatedNodes.length;
    // Fill up the dominatedNodes array with indexes of dominated nodes. Skip the root (node at
    // index 0) as it is the only node that dominates itself.
    for (let nodeOrdinal = fromNodeOrdinal; nodeOrdinal < toNodeOrdinal; ++nodeOrdinal) {
      const dominatorOrdinal = dominatorsTree[nodeOrdinal];
      let dominatedRefIndex = indexArray[dominatorOrdinal];
      dominatedRefIndex += (--dominatedNodes[dominatedRefIndex]);
      dominatedNodes[dominatedRefIndex] = nodeOrdinal * nodeFieldCount;
    }
  }

  private calculateObjectNames(): void {
    const {
      nodes,
      nodeCount,
      nodeNameOffset,
      nodeNativeType,
      nodeHiddenType,
      nodeObjectType,
      nodeCodeType,
      nodeClosureType,
      nodeRegExpType,
    } = this;

    // If the snapshot doesn't contain a detachedness field in each node, then
    // allocate a separate array so there is somewhere to store the class index.
    if (this.nodeDetachednessAndClassIndexOffset === -1) {
      this.detachednessAndClassIndexArray = new Uint32Array(nodeCount);
    }

    // We'll add some new values to the `strings` array during the processing below.
    // This map lets us easily find the index for each added string.
    const stringTable = new Map<string, number>();
    const getIndexForString = (s: string): number => {
      let index = stringTable.get(s);
      if (index === undefined) {
        index = this.addString(s);
        stringTable.set(s, index);
      }
      return index;
    };

    const hiddenClassIndex = getIndexForString('(system)');
    const codeClassIndex = getIndexForString('(compiled code)');
    const functionClassIndex = getIndexForString('Function');
    const regExpClassIndex = getIndexForString('RegExp');

    function getNodeClassIndex(node: HeapSnapshotNode): number {
      switch (node.rawType()) {
        case nodeHiddenType:
          return hiddenClassIndex;
        case nodeObjectType:
        case nodeNativeType: {
          let name = node.rawName();

          // If the node name is (for example) '<div id="a">', then the class
          // name should be just '<div>'. If the node name is already short
          // enough, like '<div>', we must still call getIndexForString on that
          // name, because the names added by getIndexForString are not
          // deduplicated with preexisting strings, and we want all objects with
          // class name '<div>' to refer to that class name via the same index.
          // Otherwise, object categorization doesn't work.
          if (name.startsWith('<')) {
            const firstSpace = name.indexOf(' ');
            if (firstSpace !== -1) {
              name = name.substring(0, firstSpace) + '>';
            }
            return getIndexForString(name);
          }
          if (name.startsWith('Detached <')) {
            const firstSpace = name.indexOf(' ', 10);
            if (firstSpace !== -1) {
              name = name.substring(0, firstSpace) + '>';
            }
            return getIndexForString(name);
          }

          // Avoid getIndexForString here; the class name index should match the name index.
          return nodes.getValue(node.nodeIndex + nodeNameOffset);
        }
        case nodeCodeType:
          return codeClassIndex;
        case nodeClosureType:
          return functionClassIndex;
        case nodeRegExpType:
          return regExpClassIndex;
        default:
          return getIndexForString('(' + node.type() + ')');
      }
    }

    const node = this.createNode(0);
    for (let i = 0; i < nodeCount; ++i) {
      node.setClassIndex(getNodeClassIndex(node));
      node.nodeIndex = node.nextNodeIndex();
    }
  }

  /**
   * Iterates children of a node.
   */
  private iterateFilteredChildren(
      nodeOrdinal: number, edgeFilterCallback: (arg0: number) => boolean, childCallback: (arg0: number) => void): void {
    const beginEdgeIndex = this.firstEdgeIndexes[nodeOrdinal];
    const endEdgeIndex = this.firstEdgeIndexes[nodeOrdinal + 1];
    for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += this.edgeFieldsCount) {
      const childNodeIndex = this.containmentEdges.getValue(edgeIndex + this.edgeToNodeOffset);
      const childNodeOrdinal = childNodeIndex / this.nodeFieldCount;
      const type = this.containmentEdges.getValue(edgeIndex + this.edgeTypeOffset);
      if (!edgeFilterCallback(type)) {
        continue;
      }
      childCallback(childNodeOrdinal);
    }
  }

  /**
   * Adds a string to the snapshot.
   */
  private addString(string: string): number {
    this.strings.push(string);
    return this.strings.length - 1;
  }

  /**
   * The phase propagates whether a node is attached or detached through the
   * graph and adjusts the low-level representation of nodes.
   *
   * State propagation:
   * 1. Any object reachable from an attached object is itself attached.
   * 2. Any object reachable from a detached object that is not already
   *    attached is considered detached.
   *
   * Representation:
   * - Name of any detached node is changed from "<Name>"" to
   *   "Detached <Name>".
   */
  private propagateDOMState(): void {
    if (this.nodeDetachednessAndClassIndexOffset === -1) {
      return;
    }

    console.time('propagateDOMState');

    const visited = new Uint8Array(this.nodeCount);
    const attached: number[] = [];
    const detached: number[] = [];

    const stringIndexCache = new Map<number, number>();
    const node = this.createNode(0);

    /**
     * Adds a 'Detached ' prefix to the name of a node.
     */
    const addDetachedPrefixToNodeName = function(snapshot: HeapSnapshot, nodeIndex: number): void {
      const oldStringIndex = snapshot.nodes.getValue(nodeIndex + snapshot.nodeNameOffset);
      let newStringIndex = stringIndexCache.get(oldStringIndex);
      if (newStringIndex === undefined) {
        newStringIndex = snapshot.addString('Detached ' + snapshot.strings[oldStringIndex]);
        stringIndexCache.set(oldStringIndex, newStringIndex);
      }
      snapshot.nodes.setValue(nodeIndex + snapshot.nodeNameOffset, newStringIndex);
    };

    /**
     * Processes a node represented by nodeOrdinal:
     * - Changes its name based on newState.
     * - Puts it onto working sets for attached or detached nodes.
     */
    const processNode = function(snapshot: HeapSnapshot, nodeOrdinal: number, newState: number): void {
      if (visited[nodeOrdinal]) {
        return;
      }

      const nodeIndex = nodeOrdinal * snapshot.nodeFieldCount;

      // Early bailout: Do not propagate the state (and name change) through JavaScript. Every
      // entry point into embedder code is a node that knows its own state. All embedder nodes
      // have their node type set to native.
      if (snapshot.nodes.getValue(nodeIndex + snapshot.nodeTypeOffset) !== snapshot.nodeNativeType) {
        visited[nodeOrdinal] = 1;
        return;
      }

      node.nodeIndex = nodeIndex;
      node.setDetachedness(newState);

      if (newState === DOMLinkState.Attached) {
        attached.push(nodeOrdinal);
      } else if (newState === DOMLinkState.Detached) {
        // Detached state: Rewire node name.
        addDetachedPrefixToNodeName(snapshot, nodeIndex);
        detached.push(nodeOrdinal);
      }

      visited[nodeOrdinal] = 1;
    };

    const propagateState = function(snapshot: HeapSnapshot, parentNodeOrdinal: number, newState: number): void {
      snapshot.iterateFilteredChildren(
          parentNodeOrdinal,
          edgeType => ![snapshot.edgeHiddenType, snapshot.edgeInvisibleType, snapshot.edgeWeakType].includes(edgeType),
          nodeOrdinal => processNode(snapshot, nodeOrdinal, newState));
    };

    // 1. We re-use the deserialized field to store the propagated state. While
    //    the state for known nodes is already set, they still need to go
    //    through processing to have their name adjusted and them enqueued in
    //    the respective queues.
    for (let nodeOrdinal = 0; nodeOrdinal < this.nodeCount; ++nodeOrdinal) {
      node.nodeIndex = nodeOrdinal * this.nodeFieldCount;
      const state = node.detachedness();
      // Bail out for objects that have no known state. For all other objects set that state.
      if (state === DOMLinkState.Unknown) {
        continue;
      }
      processNode(this, nodeOrdinal, state);
    }
    // 2. If the parent is attached, then the child is also attached.
    while (attached.length !== 0) {
      const nodeOrdinal = (attached.pop() as number);
      propagateState(this, nodeOrdinal, DOMLinkState.Attached);
    }
    // 3. If the parent is not attached, then the child inherits the parent's state.
    while (detached.length !== 0) {
      const nodeOrdinal = (detached.pop() as number);
      node.nodeIndex = nodeOrdinal * this.nodeFieldCount;
      const nodeState = node.detachedness();
      // Ignore if the node has been found through propagating forward attached state.
      if (nodeState === DOMLinkState.Attached) {
        continue;
      }
      propagateState(this, nodeOrdinal, DOMLinkState.Detached);
    }

    console.timeEnd('propagateDOMState');
  }

  private buildSamples(): void {
    const samples = this.#rawSamples;
    if (!samples || !samples.length) {
      return;
    }
    const sampleCount = samples.length / 2;
    const sizeForRange = new Array(sampleCount);
    const timestamps = new Array(sampleCount);
    const lastAssignedIds = new Array(sampleCount);

    const timestampOffset = this.#metaNode.sample_fields.indexOf('timestamp_us');
    const lastAssignedIdOffset = this.#metaNode.sample_fields.indexOf('last_assigned_id');
    for (let i = 0; i < sampleCount; i++) {
      sizeForRange[i] = 0;
      timestamps[i] = (samples[2 * i + timestampOffset]) / 1000;
      lastAssignedIds[i] = samples[2 * i + lastAssignedIdOffset];
    }

    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeFieldCount = this.nodeFieldCount;
    const node = this.rootNode();
    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      node.nodeIndex = nodeIndex;

      const nodeId = node.id();
      // JS objects have odd ids, skip native objects.
      if (nodeId % 2 === 0) {
        continue;
      }
      const rangeIndex =
          Platform.ArrayUtilities.lowerBound(lastAssignedIds, nodeId, Platform.ArrayUtilities.DEFAULT_COMPARATOR);
      if (rangeIndex === sampleCount) {
        // TODO: make heap profiler not allocate while taking snapshot
        continue;
      }
      sizeForRange[rangeIndex] += node.selfSize();
    }
    this.#samples = new HeapSnapshotModel.HeapSnapshotModel.Samples(timestamps, lastAssignedIds, sizeForRange);
  }

  private buildLocationMap(): void {
    const map = new Map<number, HeapSnapshotModel.HeapSnapshotModel.Location>();
    const locations = this.#locations;

    for (let i = 0; i < locations.length; i += this.#locationFieldCount) {
      const nodeIndex = locations[i + this.#locationIndexOffset];
      const scriptId = locations[i + this.#locationScriptIdOffset];
      const line = locations[i + this.#locationLineOffset];
      const col = locations[i + this.#locationColumnOffset];
      map.set(nodeIndex, new HeapSnapshotModel.HeapSnapshotModel.Location(scriptId, line, col));
    }

    this.#locationMap = map;
  }

  getLocation(nodeIndex: number): HeapSnapshotModel.HeapSnapshotModel.Location|null {
    return this.#locationMap.get(nodeIndex) || null;
  }

  getSamples(): HeapSnapshotModel.HeapSnapshotModel.Samples|null {
    return this.#samples;
  }

  calculateFlags(): void {
    throw new Error('Not implemented');
  }

  calculateStatistics(): void {
    throw new Error('Not implemented');
  }

  userObjectsMapAndFlag(): {map: Uint32Array, flag: number}|null {
    throw new Error('Not implemented');
  }

  calculateSnapshotDiff(
      baseSnapshotId: string,
      baseSnapshotAggregates: {[x: string]: HeapSnapshotModel.HeapSnapshotModel.AggregateForDiff}):
      {[x: string]: HeapSnapshotModel.HeapSnapshotModel.Diff} {
    let snapshotDiff: {[x: string]: HeapSnapshotModel.HeapSnapshotModel.Diff}|{
      [x: string]: HeapSnapshotModel.HeapSnapshotModel.Diff,
    } = this.#snapshotDiffs[baseSnapshotId];
    if (snapshotDiff) {
      return snapshotDiff;
    }
    snapshotDiff = ({} as {
      [x: string]: HeapSnapshotModel.HeapSnapshotModel.Diff,
    });

    const aggregates = this.getAggregatesByClassName(true, 'allObjects');
    for (const className in baseSnapshotAggregates) {
      const baseAggregate = baseSnapshotAggregates[className];
      const diff = this.calculateDiffForClass(baseAggregate, aggregates[className]);
      if (diff) {
        snapshotDiff[className] = diff;
      }
    }
    const emptyBaseAggregate = new HeapSnapshotModel.HeapSnapshotModel.AggregateForDiff();
    for (const className in aggregates) {
      if (className in baseSnapshotAggregates) {
        continue;
      }
      const classDiff = this.calculateDiffForClass(emptyBaseAggregate, aggregates[className]);
      if (classDiff) {
        snapshotDiff[className] = classDiff;
      }
    }

    this.#snapshotDiffs[baseSnapshotId] = snapshotDiff;
    return snapshotDiff;
  }

  private calculateDiffForClass(
      baseAggregate: HeapSnapshotModel.HeapSnapshotModel.AggregateForDiff,
      aggregate: HeapSnapshotModel.HeapSnapshotModel.Aggregate): HeapSnapshotModel.HeapSnapshotModel.Diff|null {
    const baseIds = baseAggregate.ids;
    const baseIndexes = baseAggregate.indexes;
    const baseSelfSizes = baseAggregate.selfSizes;

    const indexes = aggregate ? aggregate.idxs : [];

    let i = 0;
    let j = 0;
    const l = baseIds.length;
    const m = indexes.length;
    const diff = new HeapSnapshotModel.HeapSnapshotModel.Diff();

    const nodeB = this.createNode(indexes[j]);
    while (i < l && j < m) {
      const nodeAId = baseIds[i];
      if (nodeAId < nodeB.id()) {
        diff.deletedIndexes.push(baseIndexes[i]);
        diff.removedCount++;
        diff.removedSize += baseSelfSizes[i];
        ++i;
      } else if (
          nodeAId >
          nodeB.id()) {  // Native nodes(e.g. dom groups) may have ids less than max JS object id in the base snapshot
        diff.addedIndexes.push(indexes[j]);
        diff.addedCount++;
        diff.addedSize += nodeB.selfSize();
        nodeB.nodeIndex = indexes[++j];
      } else {  // nodeAId === nodeB.id()
        ++i;
        nodeB.nodeIndex = indexes[++j];
      }
    }
    while (i < l) {
      diff.deletedIndexes.push(baseIndexes[i]);
      diff.removedCount++;
      diff.removedSize += baseSelfSizes[i];
      ++i;
    }
    while (j < m) {
      diff.addedIndexes.push(indexes[j]);
      diff.addedCount++;
      diff.addedSize += nodeB.selfSize();
      nodeB.nodeIndex = indexes[++j];
    }
    diff.countDelta = diff.addedCount - diff.removedCount;
    diff.sizeDelta = diff.addedSize - diff.removedSize;
    if (!diff.addedCount && !diff.removedCount) {
      return null;
    }
    return diff;
  }

  private nodeForSnapshotObjectId(snapshotObjectId: number): HeapSnapshotNode|null {
    for (let it = this.allNodes(); it.hasNext(); it.next()) {
      if (it.node.id() === snapshotObjectId) {
        return it.node;
      }
    }
    return null;
  }

  nodeClassName(snapshotObjectId: number): string|null {
    const node = this.nodeForSnapshotObjectId(snapshotObjectId);
    if (node) {
      return node.className();
    }
    return null;
  }

  idsOfObjectsWithName(name: string): number[] {
    const ids = [];
    for (let it = this.allNodes(); it.hasNext(); it.next()) {
      if (it.item().name() === name) {
        ids.push(it.item().id());
      }
    }
    return ids;
  }

  createEdgesProvider(nodeIndex: number): HeapSnapshotEdgesProvider {
    const node = this.createNode(nodeIndex);
    const filter = this.containmentEdgesFilter();
    const indexProvider = new HeapSnapshotEdgeIndexProvider(this);
    return new HeapSnapshotEdgesProvider(this, filter, node.edges(), indexProvider);
  }

  createEdgesProviderForTest(nodeIndex: number, filter: ((arg0: HeapSnapshotEdge) => boolean)|null):
      HeapSnapshotEdgesProvider {
    const node = this.createNode(nodeIndex);
    const indexProvider = new HeapSnapshotEdgeIndexProvider(this);
    return new HeapSnapshotEdgesProvider(this, filter, node.edges(), indexProvider);
  }

  retainingEdgesFilter(): ((arg0: HeapSnapshotEdge) => boolean)|null {
    return null;
  }

  containmentEdgesFilter(): ((arg0: HeapSnapshotEdge) => boolean)|null {
    return null;
  }

  createRetainingEdgesProvider(nodeIndex: number): HeapSnapshotEdgesProvider {
    const node = this.createNode(nodeIndex);
    const filter = this.retainingEdgesFilter();
    const indexProvider = new HeapSnapshotRetainerEdgeIndexProvider(this);
    return new HeapSnapshotEdgesProvider(this, filter, node.retainers(), indexProvider);
  }

  createAddedNodesProvider(baseSnapshotId: string, className: string): HeapSnapshotNodesProvider {
    const snapshotDiff = this.#snapshotDiffs[baseSnapshotId];
    const diffForClass = snapshotDiff[className];
    return new HeapSnapshotNodesProvider(this, diffForClass.addedIndexes);
  }

  createDeletedNodesProvider(nodeIndexes: number[]): HeapSnapshotNodesProvider {
    return new HeapSnapshotNodesProvider(this, nodeIndexes);
  }

  createNodesProviderForClass(className: string, nodeFilter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter):
      HeapSnapshotNodesProvider {
    return new HeapSnapshotNodesProvider(this, this.aggregatesWithFilter(nodeFilter)[className].idxs);
  }

  private maxJsNodeId(): number {
    const nodeFieldCount = this.nodeFieldCount;
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    let id = 0;
    for (let nodeIndex = this.nodeIdOffset; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      const nextId = nodes.getValue(nodeIndex);
      // JS objects have odd ids, skip native objects.
      if (nextId % 2 === 0) {
        continue;
      }
      if (id < nextId) {
        id = nextId;
      }
    }
    return id;
  }

  updateStaticData(): HeapSnapshotModel.HeapSnapshotModel.StaticData {
    return new HeapSnapshotModel.HeapSnapshotModel.StaticData(
        this.nodeCount, this.rootNodeIndexInternal, this.totalSize, this.maxJsNodeId());
  }

  ignoreNodeInRetainersView(nodeIndex: number): void {
    this.#ignoredNodesInRetainersView.add(nodeIndex);
    this.calculateDistances(/* isForRetainersView=*/ true);
    this.#updateIgnoredEdgesInRetainersView();
  }

  unignoreNodeInRetainersView(nodeIndex: number): void {
    this.#ignoredNodesInRetainersView.delete(nodeIndex);
    if (this.#ignoredNodesInRetainersView.size === 0) {
      this.#nodeDistancesForRetainersView = undefined;
    } else {
      this.calculateDistances(/* isForRetainersView=*/ true);
    }
    this.#updateIgnoredEdgesInRetainersView();
  }

  unignoreAllNodesInRetainersView(): void {
    this.#ignoredNodesInRetainersView.clear();
    this.#nodeDistancesForRetainersView = undefined;
    this.#updateIgnoredEdgesInRetainersView();
  }

  #updateIgnoredEdgesInRetainersView(): void {
    const distances = this.#nodeDistancesForRetainersView;
    this.#ignoredEdgesInRetainersView.clear();
    if (distances === undefined) {
      return;
    }

    // To retain a value in a WeakMap, both the WeakMap and the corresponding
    // key must stay alive. If one of those two retainers is unreachable due to
    // the user ignoring some nodes, then the other retainer edge should also be
    // shown as unreachable, since it would be insufficient on its own to retain
    // the value.
    const unreachableWeakMapEdges = new Platform.MapUtilities.Multimap<number, string>();
    const noDistance = this.#noDistance;
    const {nodeCount, nodeFieldCount} = this;
    const node = this.createNode(0);

    // Populate unreachableWeakMapEdges.
    for (let nodeOrdinal = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
      if (distances[nodeOrdinal] !== noDistance) {
        continue;
      }
      node.nodeIndex = nodeOrdinal * nodeFieldCount;
      for (let iter = node.edges(); iter.hasNext(); iter.next()) {
        const edge = iter.edge;
        if (!edge.isInternal()) {
          continue;
        }
        const match = this.tryParseWeakMapEdgeName(edge.nameIndex());
        if (match) {
          unreachableWeakMapEdges.set(edge.nodeIndex(), match.duplicatedPart);
        }
      }
    }

    // Iterate the retaining edges for the target nodes found in the previous
    // step and mark any relevant WeakMap edges as ignored.
    for (const targetNodeIndex of unreachableWeakMapEdges.keys()) {
      node.nodeIndex = targetNodeIndex;
      for (let it = node.retainers(); it.hasNext(); it.next()) {
        const reverseEdge = it.item();
        if (!reverseEdge.isInternal()) {
          continue;
        }
        const match = this.tryParseWeakMapEdgeName(reverseEdge.nameIndex());
        if (match && unreachableWeakMapEdges.hasValue(targetNodeIndex, match.duplicatedPart)) {
          const forwardEdgeIndex = this.retainingEdges[reverseEdge.itemIndex()];
          this.#ignoredEdgesInRetainersView.add(forwardEdgeIndex);
        }
      }
    }
  }

  areNodesIgnoredInRetainersView(): boolean {
    return this.#ignoredNodesInRetainersView.size > 0;
  }

  getDistanceForRetainersView(nodeIndex: number): number {
    const nodeOrdinal = nodeIndex / this.nodeFieldCount;
    const distances = this.#nodeDistancesForRetainersView ?? this.nodeDistances;
    const distance = distances[nodeOrdinal];
    if (distance === this.#noDistance) {
      // An unreachable node should be sorted to the end, not the beginning.
      // To give such nodes a reasonable sorting order, we add a very large
      // number to the original distance computed without ignoring any nodes.
      return Math.max(0, this.nodeDistances[nodeOrdinal]) + HeapSnapshotModel.HeapSnapshotModel.baseUnreachableDistance;
    }
    return distance;
  }

  isNodeIgnoredInRetainersView(nodeIndex: number): boolean {
    return this.#ignoredNodesInRetainersView.has(nodeIndex);
  }

  isEdgeIgnoredInRetainersView(edgeIndex: number): boolean {
    return this.#ignoredEdgesInRetainersView.has(edgeIndex);
  }
}

class HeapSnapshotMetainfo {
  location_fields: string[] = [];              // eslint-disable-line @typescript-eslint/naming-convention
  node_fields: string[] = [];                  // eslint-disable-line @typescript-eslint/naming-convention
  node_types: string[][] = [];                 // eslint-disable-line @typescript-eslint/naming-convention
  edge_fields: string[] = [];                  // eslint-disable-line @typescript-eslint/naming-convention
  edge_types: string[][] = [];                 // eslint-disable-line @typescript-eslint/naming-convention
  trace_function_info_fields: string[] = [];   // eslint-disable-line @typescript-eslint/naming-convention
  trace_node_fields: string[] = [];            // eslint-disable-line @typescript-eslint/naming-convention
  sample_fields: string[] = [];                // eslint-disable-line @typescript-eslint/naming-convention
  type_strings: {[key: string]: string} = {};  // eslint-disable-line @typescript-eslint/naming-convention
}

export class HeapSnapshotHeader {
  title: string;
  meta: HeapSnapshotMetainfo;
  node_count: number;            // eslint-disable-line @typescript-eslint/naming-convention
  edge_count: number;            // eslint-disable-line @typescript-eslint/naming-convention
  trace_function_count: number;  // eslint-disable-line @typescript-eslint/naming-convention
  root_index: number;            // eslint-disable-line @typescript-eslint/naming-convention
  constructor() {
    // New format.
    this.title = '';
    this.meta = new HeapSnapshotMetainfo();
    this.node_count = 0;
    this.edge_count = 0;
    this.trace_function_count = 0;
    this.root_index = 0;
  }
}

export abstract class HeapSnapshotItemProvider {
  protected readonly iterator: HeapSnapshotItemIterator;
  readonly #indexProvider: HeapSnapshotItemIndexProvider;
  readonly #isEmptyInternal: boolean;
  protected iterationOrder: number[]|null;
  protected currentComparator: HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig|null;
  #sortedPrefixLength: number;
  #sortedSuffixLength: number;
  constructor(iterator: HeapSnapshotItemIterator, indexProvider: HeapSnapshotItemIndexProvider) {
    this.iterator = iterator;
    this.#indexProvider = indexProvider;
    this.#isEmptyInternal = !iterator.hasNext();
    this.iterationOrder = null;
    this.currentComparator = null;
    this.#sortedPrefixLength = 0;
    this.#sortedSuffixLength = 0;
  }

  protected createIterationOrder(): void {
    if (this.iterationOrder) {
      return;
    }
    this.iterationOrder = [];
    for (let iterator = this.iterator; iterator.hasNext(); iterator.next()) {
      this.iterationOrder.push(iterator.item().itemIndex());
    }
  }

  isEmpty(): boolean {
    return this.#isEmptyInternal;
  }

  serializeItemsRange(begin: number, end: number): HeapSnapshotModel.HeapSnapshotModel.ItemsRange {
    this.createIterationOrder();
    if (begin > end) {
      throw new Error('Start position > end position: ' + begin + ' > ' + end);
    }

    if (!this.iterationOrder) {
      throw new Error('Iteration order undefined');
    }

    if (end > this.iterationOrder.length) {
      end = this.iterationOrder.length;
    }
    if (this.#sortedPrefixLength < end && begin < this.iterationOrder.length - this.#sortedSuffixLength &&
        this.currentComparator) {
      const currentComparator = this.currentComparator;
      this.sort(
          currentComparator, this.#sortedPrefixLength, this.iterationOrder.length - 1 - this.#sortedSuffixLength, begin,
          end - 1);
      if (begin <= this.#sortedPrefixLength) {
        this.#sortedPrefixLength = end;
      }
      if (end >= this.iterationOrder.length - this.#sortedSuffixLength) {
        this.#sortedSuffixLength = this.iterationOrder.length - begin;
      }
    }
    let position = begin;
    const count = end - begin;
    const result = new Array(count);
    for (let i = 0; i < count; ++i) {
      const itemIndex = this.iterationOrder[position++];
      const item = this.#indexProvider.itemForIndex(itemIndex);
      result[i] = item.serialize();
    }
    return new HeapSnapshotModel.HeapSnapshotModel.ItemsRange(begin, end, this.iterationOrder.length, result);
  }

  sortAndRewind(comparator: HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig): void {
    this.currentComparator = comparator;
    this.#sortedPrefixLength = 0;
    this.#sortedSuffixLength = 0;
  }

  abstract sort(
      comparator: HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig, leftBound: number, rightBound: number,
      windowLeft: number, windowRight: number): void;
}

export class HeapSnapshotEdgesProvider extends HeapSnapshotItemProvider {
  snapshot: HeapSnapshot;
  constructor(
      snapshot: HeapSnapshot, filter: ((arg0: HeapSnapshotEdge) => boolean)|null,
      edgesIter: HeapSnapshotEdgeIterator|HeapSnapshotRetainerEdgeIterator,
      indexProvider: HeapSnapshotItemIndexProvider) {
    const iter = filter ? new HeapSnapshotFilteredIterator(edgesIter, (filter as (arg0: HeapSnapshotItem) => boolean)) :
                          edgesIter;
    super(iter, indexProvider);
    this.snapshot = snapshot;
  }

  sort(
      comparator: HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig, leftBound: number, rightBound: number,
      windowLeft: number, windowRight: number): void {
    const fieldName1 = comparator.fieldName1;
    const fieldName2 = comparator.fieldName2;
    const ascending1 = comparator.ascending1;
    const ascending2 = comparator.ascending2;

    const edgeA = (this.iterator.item() as HeapSnapshotEdge | HeapSnapshotRetainerEdge).clone();
    const edgeB = edgeA.clone();
    const nodeA = this.snapshot.createNode();
    const nodeB = this.snapshot.createNode();

    function compareEdgeField(fieldName: string, ascending: boolean, indexA: number, indexB: number): number {
      edgeA.edgeIndex = indexA;
      edgeB.edgeIndex = indexB;
      let result: number = 0;
      if (fieldName === '!edgeName') {
        if (edgeB.name() === '__proto__') {
          return -1;
        }
        if (edgeA.name() === '__proto__') {
          return 1;
        }
        result = edgeA.hasStringName() === edgeB.hasStringName() ?
            (edgeA.name() < edgeB.name() ? -1 : (edgeA.name() > edgeB.name() ? 1 : 0)) :
            (edgeA.hasStringName() ? -1 : 1);
      } else {
        result = edgeA.getValueForSorting(fieldName) - edgeB.getValueForSorting(fieldName);
      }
      return ascending ? result : -result;
    }

    function compareNodeField(fieldName: string, ascending: boolean, indexA: number, indexB: number): number {
      edgeA.edgeIndex = indexA;
      nodeA.nodeIndex = edgeA.nodeIndex();
      // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const valueA = (nodeA as any)[fieldName]();

      edgeB.edgeIndex = indexB;
      nodeB.nodeIndex = edgeB.nodeIndex();
      // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const valueB = (nodeB as any)[fieldName]();

      const result = valueA < valueB ? -1 : (valueA > valueB ? 1 : 0);
      return ascending ? result : -result;
    }

    function compareEdgeAndEdge(indexA: number, indexB: number): number {
      let result = compareEdgeField(fieldName1, ascending1, indexA, indexB);
      if (result === 0) {
        result = compareEdgeField(fieldName2, ascending2, indexA, indexB);
      }
      if (result === 0) {
        return indexA - indexB;
      }
      return result;
    }

    function compareEdgeAndNode(indexA: number, indexB: number): number {
      let result = compareEdgeField(fieldName1, ascending1, indexA, indexB);
      if (result === 0) {
        result = compareNodeField(fieldName2, ascending2, indexA, indexB);
      }
      if (result === 0) {
        return indexA - indexB;
      }
      return result;
    }

    function compareNodeAndEdge(indexA: number, indexB: number): number {
      let result = compareNodeField(fieldName1, ascending1, indexA, indexB);
      if (result === 0) {
        result = compareEdgeField(fieldName2, ascending2, indexA, indexB);
      }
      if (result === 0) {
        return indexA - indexB;
      }
      return result;
    }

    function compareNodeAndNode(indexA: number, indexB: number): number {
      let result = compareNodeField(fieldName1, ascending1, indexA, indexB);
      if (result === 0) {
        result = compareNodeField(fieldName2, ascending2, indexA, indexB);
      }
      if (result === 0) {
        return indexA - indexB;
      }
      return result;
    }

    if (!this.iterationOrder) {
      throw new Error('Iteration order not defined');
    }

    function isEdgeFieldName(fieldName: string): boolean {
      return fieldName.startsWith('!edge');
    }

    if (isEdgeFieldName(fieldName1)) {
      if (isEdgeFieldName(fieldName2)) {
        Platform.ArrayUtilities.sortRange(
            this.iterationOrder, compareEdgeAndEdge, leftBound, rightBound, windowLeft, windowRight);
      } else {
        Platform.ArrayUtilities.sortRange(
            this.iterationOrder, compareEdgeAndNode, leftBound, rightBound, windowLeft, windowRight);
      }
    } else if (isEdgeFieldName(fieldName2)) {
      Platform.ArrayUtilities.sortRange(
          this.iterationOrder, compareNodeAndEdge, leftBound, rightBound, windowLeft, windowRight);
    } else {
      Platform.ArrayUtilities.sortRange(
          this.iterationOrder, compareNodeAndNode, leftBound, rightBound, windowLeft, windowRight);
    }
  }
}

export class HeapSnapshotNodesProvider extends HeapSnapshotItemProvider {
  snapshot: HeapSnapshot;
  constructor(snapshot: HeapSnapshot, nodeIndexes: number[]|Uint32Array) {
    const indexProvider = new HeapSnapshotNodeIndexProvider(snapshot);
    const it = new HeapSnapshotIndexRangeIterator(indexProvider, nodeIndexes);
    super(it, indexProvider);
    this.snapshot = snapshot;
  }

  nodePosition(snapshotObjectId: number): number {
    this.createIterationOrder();
    const node = this.snapshot.createNode();
    let i = 0;
    if (!this.iterationOrder) {
      throw new Error('Iteration order not defined');
    }

    for (; i < this.iterationOrder.length; i++) {
      node.nodeIndex = this.iterationOrder[i];
      if (node.id() === snapshotObjectId) {
        break;
      }
    }
    if (i === this.iterationOrder.length) {
      return -1;
    }
    const targetNodeIndex = this.iterationOrder[i];
    let smallerCount = 0;

    const currentComparator = (this.currentComparator as HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig);
    const compare = this.buildCompareFunction(currentComparator);
    for (let i = 0; i < this.iterationOrder.length; i++) {
      if (compare(this.iterationOrder[i], targetNodeIndex) < 0) {
        ++smallerCount;
      }
    }
    return smallerCount;
  }

  private buildCompareFunction(comparator: HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig):
      (arg0: number, arg1: number) => number {
    const nodeA = this.snapshot.createNode();
    const nodeB = this.snapshot.createNode();
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fieldAccessor1 = (nodeA as any)[comparator.fieldName1];
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fieldAccessor2 = (nodeA as any)[comparator.fieldName2];
    const ascending1 = comparator.ascending1 ? 1 : -1;
    const ascending2 = comparator.ascending2 ? 1 : -1;

    function sortByNodeField(fieldAccessor: () => void, ascending: number): number {
      const valueA = fieldAccessor.call(nodeA);
      const valueB = fieldAccessor.call(nodeB);
      return valueA < valueB ? -ascending : (valueA > valueB ? ascending : 0);
    }

    function sortByComparator(indexA: number, indexB: number): number {
      nodeA.nodeIndex = indexA;
      nodeB.nodeIndex = indexB;
      let result = sortByNodeField(fieldAccessor1, ascending1);
      if (result === 0) {
        result = sortByNodeField(fieldAccessor2, ascending2);
      }
      return result || indexA - indexB;
    }

    return sortByComparator;
  }

  sort(
      comparator: HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig, leftBound: number, rightBound: number,
      windowLeft: number, windowRight: number): void {
    if (!this.iterationOrder) {
      throw new Error('Iteration order not defined');
    }

    Platform.ArrayUtilities.sortRange(
        this.iterationOrder, this.buildCompareFunction(comparator), leftBound, rightBound, windowLeft, windowRight);
  }
}

export class JSHeapSnapshot extends HeapSnapshot {
  readonly nodeFlags: {
    // bit flags
    canBeQueried: number,
    detachedDOMTreeNode: number,
    pageObject:
        number,  // The idea is to track separately the objects owned by the page and the objects owned by debugger.
  };
  override lazyStringCache: {};
  private flags!: Uint32Array;
  #statistics?: HeapSnapshotModel.HeapSnapshotModel.Statistics;
  constructor(profile: Profile, progress: HeapSnapshotProgress) {
    super(profile, progress);
    this.nodeFlags = {
      // bit flags
      canBeQueried: 1,
      detachedDOMTreeNode: 2,
      pageObject:
          4,  // The idea is to track separately the objects owned by the page and the objects owned by debugger.
    };
    this.lazyStringCache = {};
    this.initialize();
  }

  createNode(nodeIndex?: number): JSHeapSnapshotNode {
    return new JSHeapSnapshotNode(this, nodeIndex === undefined ? -1 : nodeIndex);
  }

  createEdge(edgeIndex: number): JSHeapSnapshotEdge {
    return new JSHeapSnapshotEdge(this, edgeIndex);
  }

  createRetainingEdge(retainerIndex: number): JSHeapSnapshotRetainerEdge {
    return new JSHeapSnapshotRetainerEdge(this, retainerIndex);
  }

  override containmentEdgesFilter(): (arg0: HeapSnapshotEdge) => boolean {
    return (edge: HeapSnapshotEdge): boolean => !edge.isInvisible();
  }

  override retainingEdgesFilter(): (arg0: HeapSnapshotEdge) => boolean {
    const containmentEdgesFilter = this.containmentEdgesFilter();
    function filter(edge: HeapSnapshotEdge): boolean {
      return containmentEdgesFilter(edge) && !edge.node().isRoot() && !edge.isWeak();
    }
    return filter;
  }

  override calculateFlags(): void {
    this.flags = new Uint32Array(this.nodeCount);
    this.markDetachedDOMTreeNodes();
    this.markQueriableHeapObjects();
    this.markPageOwnedNodes();
  }

  #hasUserRoots(): boolean {
    for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
      if (this.isUserRoot(iter.edge.node())) {
        return true;
      }
    }
    return false;
  }

  // Updates the shallow sizes for "owned" objects of types kArray or kHidden to
  // zero, and add their sizes to the "owner" object instead.
  override calculateShallowSizes(): void {
    // If there are no user roots, then that means the snapshot was produced with
    // the "expose internals" option enabled. In that case, we should faithfully
    // represent the actual memory allocations rather than attempting to make the
    // output more understandable to web developers.
    if (!this.#hasUserRoots()) {
      return;
    }

    const {nodeCount, nodes, nodeFieldCount, nodeSelfSizeOffset} = this;

    const kUnvisited = 0xffffffff;
    const kHasMultipleOwners = 0xfffffffe;
    if (nodeCount >= kHasMultipleOwners) {
      throw new Error('Too many nodes for calculateShallowSizes');
    }
    // For each node in order, `owners` will contain the index of the owning
    // node or one of the two values kUnvisited or kHasMultipleOwners. The
    // indexes in this array are NOT already multiplied by nodeFieldCount.
    const owners = new Uint32Array(nodeCount);
    // The worklist contains the indexes of nodes which should be visited during
    // the second loop below. The order of visiting doesn't matter. The indexes
    // in this array are NOT already multiplied by nodeFieldCount.
    const worklist: number[] = [];

    const node = this.createNode(0);
    for (let i = 0; i < nodeCount; ++i) {
      if (node.isHidden() || node.isArray()) {
        owners[i] = kUnvisited;
      } else {
        // The node owns itself.
        owners[i] = i;
        worklist.push(i);
      }
      node.nodeIndex = node.nextNodeIndex();
    }

    while (worklist.length !== 0) {
      const id = worklist.pop() as number;
      const owner = owners[id];
      node.nodeIndex = id * nodeFieldCount;
      for (let iter = node.edges(); iter.hasNext(); iter.next()) {
        const edge = iter.edge;
        if (edge.isWeak()) {
          continue;
        }
        const targetId = edge.nodeIndex() / nodeFieldCount;
        switch (owners[targetId]) {
          case kUnvisited:
            owners[targetId] = owner;
            worklist.push(targetId);
            break;
          case targetId:
          case owner:
          case kHasMultipleOwners:
            // There is no change necessary if the target is already marked as:
            // * owned by itself,
            // * owned by the owner of the current source node, or
            // * owned by multiple nodes.
            break;
          default:
            owners[targetId] = kHasMultipleOwners;
            // It is possible that this node is already in the worklist
            // somewhere, but visiting it an extra time is not harmful. The
            // iteration is guaranteed to complete because each node can only be
            // added twice to the worklist: once when changing from kUnvisited
            // to a specific owner, and a second time when changing from that
            // owner to kHasMultipleOwners.
            worklist.push(targetId);
            break;
        }
      }
    }

    for (let i = 0; i < nodeCount; ++i) {
      const ownerId = owners[i];
      switch (ownerId) {
        case kUnvisited:
        case kHasMultipleOwners:
        case i:
          break;
        default: {
          const ownedNodeIndex = i * nodeFieldCount;
          const ownerNodeIndex = ownerId * nodeFieldCount;
          node.nodeIndex = ownerNodeIndex;
          if (node.isSynthetic() || node.isRoot()) {
            // Adding shallow size to synthetic or root nodes is not useful.
            break;
          }
          const sizeToTransfer = nodes.getValue(ownedNodeIndex + nodeSelfSizeOffset);
          nodes.setValue(ownedNodeIndex + nodeSelfSizeOffset, 0);
          nodes.setValue(
              ownerNodeIndex + nodeSelfSizeOffset,
              nodes.getValue(ownerNodeIndex + nodeSelfSizeOffset) + sizeToTransfer);
          break;
        }
      }
    }
  }

  override calculateDistances(isForRetainersView: boolean): void {
    const pendingEphemeronEdges = new Set<string>();
    const snapshot = this;
    function filter(node: HeapSnapshotNode, edge: HeapSnapshotEdge): boolean {
      if (node.isHidden() && edge.name() === 'sloppy_function_map' && node.rawName() === 'system / NativeContext') {
        return false;
      }
      if (node.isArray() && node.rawName() === '(map descriptors)') {
        // DescriptorArrays are fixed arrays used to hold instance descriptors.
        // The format of the these objects is:
        //   [0]: Number of descriptors
        //   [1]: Either Smi(0) if uninitialized, or a pointer to small fixed array:
        //          [0]: pointer to fixed array with enum cache
        //          [1]: either Smi(0) or pointer to fixed array with indices
        //   [i*3+2]: i-th key
        //   [i*3+3]: i-th type
        //   [i*3+4]: i-th descriptor
        // As long as maps may share descriptor arrays some of the descriptor
        // links may not be valid for all the maps. We just skip
        // all the descriptor links when calculating distances.
        // For more details see http://crbug.com/413608
        const index = parseInt(edge.name(), 10);
        return index < 2 || (index % 3) !== 1;
      }
      if (edge.isInternal()) {
        // Snapshots represent WeakMap values as being referenced by two edges:
        // one from the WeakMap, and a second from the corresponding key. To
        // avoid the case described in crbug.com/1290800, we should set the
        // distance of that value to the greater of (WeakMap+1, key+1). This
        // part of the filter skips the first edge in the matched pair of edges,
        // so that the distance gets set based on the second, which should be
        // greater or equal due to traversal order.
        const match = snapshot.tryParseWeakMapEdgeName(edge.nameIndex());
        if (match) {
          if (!pendingEphemeronEdges.delete(match.duplicatedPart)) {
            pendingEphemeronEdges.add(match.duplicatedPart);
            return false;
          }
        }
      }
      return true;
    }
    super.calculateDistances(isForRetainersView, filter);
  }

  override isUserRoot(node: HeapSnapshotNode): boolean {
    return node.isUserRoot() || node.isDocumentDOMTreesRoot();
  }

  override userObjectsMapAndFlag(): {map: Uint32Array, flag: number}|null {
    return {map: this.flags, flag: this.nodeFlags.pageObject};
  }

  flagsOfNode(node: HeapSnapshotNode): number {
    return this.flags[node.nodeIndex / this.nodeFieldCount];
  }

  private markDetachedDOMTreeNodes(): void {
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeFieldCount = this.nodeFieldCount;
    const nodeNativeType = this.nodeNativeType;
    const nodeTypeOffset = this.nodeTypeOffset;
    const flag = this.nodeFlags.detachedDOMTreeNode;
    const node = this.rootNode();
    for (let nodeIndex = 0, ordinal = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount, ordinal++) {
      const nodeType = nodes.getValue(nodeIndex + nodeTypeOffset);
      if (nodeType !== nodeNativeType) {
        continue;
      }
      node.nodeIndex = nodeIndex;
      if (node.name().startsWith('Detached ')) {
        this.flags[ordinal] |= flag;
      }
    }
  }

  private markQueriableHeapObjects(): void {
    // Allow runtime properties query for objects accessible from Window objects
    // via regular properties, and for DOM wrappers. Trying to access random objects
    // can cause a crash due to inconsistent state of internal properties of wrappers.
    const flag = this.nodeFlags.canBeQueried;
    const hiddenEdgeType = this.edgeHiddenType;
    const internalEdgeType = this.edgeInternalType;
    const invisibleEdgeType = this.edgeInvisibleType;
    const weakEdgeType = this.edgeWeakType;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const edgeTypeOffset = this.edgeTypeOffset;
    const edgeFieldsCount = this.edgeFieldsCount;
    const containmentEdges = this.containmentEdges;
    const nodeFieldCount = this.nodeFieldCount;
    const firstEdgeIndexes = this.firstEdgeIndexes;

    const flags = (this.flags as Uint32Array);
    const list: number[] = [];

    for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
      if (iter.edge.node().isUserRoot()) {
        list.push(iter.edge.node().nodeIndex / nodeFieldCount);
      }
    }

    while (list.length) {
      const nodeOrdinal = (list.pop() as number);
      if (flags[nodeOrdinal] & flag) {
        continue;
      }
      flags[nodeOrdinal] |= flag;
      const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
        const childNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
        const childNodeOrdinal = childNodeIndex / nodeFieldCount;
        if (flags[childNodeOrdinal] & flag) {
          continue;
        }
        const type = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
        if (type === hiddenEdgeType || type === invisibleEdgeType || type === internalEdgeType ||
            type === weakEdgeType) {
          continue;
        }
        list.push(childNodeOrdinal);
      }
    }
  }

  private markPageOwnedNodes(): void {
    const edgeShortcutType = this.edgeShortcutType;
    const edgeElementType = this.edgeElementType;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const edgeTypeOffset = this.edgeTypeOffset;
    const edgeFieldsCount = this.edgeFieldsCount;
    const edgeWeakType = this.edgeWeakType;
    const firstEdgeIndexes = this.firstEdgeIndexes;
    const containmentEdges = this.containmentEdges;
    const nodeFieldCount = this.nodeFieldCount;
    const nodesCount = this.nodeCount;

    const flags = (this.flags as Uint32Array);
    const pageObjectFlag = this.nodeFlags.pageObject;

    const nodesToVisit = new Uint32Array(nodesCount);
    let nodesToVisitLength = 0;

    const rootNodeOrdinal = this.rootNodeIndexInternal / nodeFieldCount;
    const node = this.rootNode();

    // Populate the entry points. They are Window objects and DOM Tree Roots.
    for (let edgeIndex = firstEdgeIndexes[rootNodeOrdinal], endEdgeIndex = firstEdgeIndexes[rootNodeOrdinal + 1];
         edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
      const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
      const nodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
      if (edgeType === edgeElementType) {
        node.nodeIndex = nodeIndex;
        if (!node.isDocumentDOMTreesRoot()) {
          continue;
        }
      } else if (edgeType !== edgeShortcutType) {
        continue;
      }
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      nodesToVisit[nodesToVisitLength++] = nodeOrdinal;
      flags[nodeOrdinal] |= pageObjectFlag;
    }

    // Mark everything reachable with the pageObject flag.
    while (nodesToVisitLength) {
      const nodeOrdinal = nodesToVisit[--nodesToVisitLength];
      const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
        const childNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
        const childNodeOrdinal = childNodeIndex / nodeFieldCount;
        if (flags[childNodeOrdinal] & pageObjectFlag) {
          continue;
        }
        const type = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
        if (type === edgeWeakType) {
          continue;
        }
        nodesToVisit[nodesToVisitLength++] = childNodeOrdinal;
        flags[childNodeOrdinal] |= pageObjectFlag;
      }
    }
  }

  override calculateStatistics(): void {
    const nodeFieldCount = this.nodeFieldCount;
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeTypeOffset = this.nodeTypeOffset;
    const nodeSizeOffset = this.nodeSelfSizeOffset;
    const nodeNativeType = this.nodeNativeType;
    const nodeCodeType = this.nodeCodeType;
    const nodeConsStringType = this.nodeConsStringType;
    const nodeSlicedStringType = this.nodeSlicedStringType;
    const distances = this.nodeDistances;
    let sizeNative = 0;
    let sizeCode = 0;
    let sizeStrings = 0;
    let sizeJSArrays = 0;
    let sizeSystem = 0;
    const node = this.rootNode();
    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      const nodeSize = nodes.getValue(nodeIndex + nodeSizeOffset);
      const ordinal = nodeIndex / nodeFieldCount;
      if (distances[ordinal] >= HeapSnapshotModel.HeapSnapshotModel.baseSystemDistance) {
        sizeSystem += nodeSize;
        continue;
      }
      const nodeType = nodes.getValue(nodeIndex + nodeTypeOffset);
      node.nodeIndex = nodeIndex;
      if (nodeType === nodeNativeType) {
        sizeNative += nodeSize;
      } else if (nodeType === nodeCodeType) {
        sizeCode += nodeSize;
      } else if (nodeType === nodeConsStringType || nodeType === nodeSlicedStringType || node.type() === 'string') {
        sizeStrings += nodeSize;
      } else if (node.name() === 'Array') {
        sizeJSArrays += this.calculateArraySize(node);
      }
    }
    this.#statistics = new HeapSnapshotModel.HeapSnapshotModel.Statistics();
    this.#statistics.total = this.totalSize;
    this.#statistics.v8heap = this.totalSize - sizeNative;
    this.#statistics.native = sizeNative;
    this.#statistics.code = sizeCode;
    this.#statistics.jsArrays = sizeJSArrays;
    this.#statistics.strings = sizeStrings;
    this.#statistics.system = sizeSystem;
  }

  private calculateArraySize(node: HeapSnapshotNode): number {
    let size = node.selfSize();
    const beginEdgeIndex = node.edgeIndexesStart();
    const endEdgeIndex = node.edgeIndexesEnd();
    const containmentEdges = this.containmentEdges;
    const strings = this.strings;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const edgeTypeOffset = this.edgeTypeOffset;
    const edgeNameOffset = this.edgeNameOffset;
    const edgeFieldsCount = this.edgeFieldsCount;
    const edgeInternalType = this.edgeInternalType;
    for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
      const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
      if (edgeType !== edgeInternalType) {
        continue;
      }
      const edgeName = strings[containmentEdges.getValue(edgeIndex + edgeNameOffset)];
      if (edgeName !== 'elements') {
        continue;
      }
      const elementsNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
      node.nodeIndex = elementsNodeIndex;
      if (node.retainersCount() === 1) {
        size += node.selfSize();
      }
      break;
    }
    return size;
  }

  getStatistics(): HeapSnapshotModel.HeapSnapshotModel.Statistics {
    return this.#statistics as HeapSnapshotModel.HeapSnapshotModel.Statistics;
  }
}

export class JSHeapSnapshotNode extends HeapSnapshotNode {
  constructor(snapshot: JSHeapSnapshot, nodeIndex?: number) {
    super(snapshot, nodeIndex);
  }

  canBeQueried(): boolean {
    const snapshot = (this.snapshot as JSHeapSnapshot);
    const flags = snapshot.flagsOfNode(this);
    return Boolean(flags & snapshot.nodeFlags.canBeQueried);
  }

  override rawName(): string {
    return super.name();
  }

  override name(): string {
    const snapshot = this.snapshot;
    if (this.rawType() === snapshot.nodeConsStringType) {
      let string: string = snapshot.lazyStringCache[this.nodeIndex];
      if (typeof string === 'undefined') {
        string = this.consStringName();
        snapshot.lazyStringCache[this.nodeIndex] = string;
      }
      return string;
    }
    return this.rawName();
  }

  private consStringName(): string {
    const snapshot = this.snapshot;
    const consStringType = snapshot.nodeConsStringType;
    const edgeInternalType = snapshot.edgeInternalType;
    const edgeFieldsCount = snapshot.edgeFieldsCount;
    const edgeToNodeOffset = snapshot.edgeToNodeOffset;
    const edgeTypeOffset = snapshot.edgeTypeOffset;
    const edgeNameOffset = snapshot.edgeNameOffset;
    const strings = snapshot.strings;
    const edges = snapshot.containmentEdges;
    const firstEdgeIndexes = snapshot.firstEdgeIndexes;
    const nodeFieldCount = snapshot.nodeFieldCount;
    const nodeTypeOffset = snapshot.nodeTypeOffset;
    const nodeNameOffset = snapshot.nodeNameOffset;
    const nodes = snapshot.nodes;
    const nodesStack = [];
    nodesStack.push(this.nodeIndex);
    let name = '';

    while (nodesStack.length && name.length < 1024) {
      const nodeIndex = (nodesStack.pop() as number);
      if (nodes.getValue(nodeIndex + nodeTypeOffset) !== consStringType) {
        name += strings[nodes.getValue(nodeIndex + nodeNameOffset)];
        continue;
      }
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      let firstNodeIndex = 0;
      let secondNodeIndex = 0;
      for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex && (!firstNodeIndex || !secondNodeIndex);
           edgeIndex += edgeFieldsCount) {
        const edgeType = edges.getValue(edgeIndex + edgeTypeOffset);
        if (edgeType === edgeInternalType) {
          const edgeName = strings[edges.getValue(edgeIndex + edgeNameOffset)];
          if (edgeName === 'first') {
            firstNodeIndex = edges.getValue(edgeIndex + edgeToNodeOffset);
          } else if (edgeName === 'second') {
            secondNodeIndex = edges.getValue(edgeIndex + edgeToNodeOffset);
          }
        }
      }
      nodesStack.push(secondNodeIndex);
      nodesStack.push(firstNodeIndex);
    }
    return name;
  }

  override id(): number {
    const snapshot = this.snapshot;
    return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeIdOffset);
  }

  override isHidden(): boolean {
    return this.rawType() === this.snapshot.nodeHiddenType;
  }

  override isArray(): boolean {
    return this.rawType() === this.snapshot.nodeArrayType;
  }

  override isSynthetic(): boolean {
    return this.rawType() === this.snapshot.nodeSyntheticType;
  }

  override isUserRoot(): boolean {
    return !this.isSynthetic();
  }

  override isDocumentDOMTreesRoot(): boolean {
    return this.isSynthetic() && this.name() === '(Document DOM trees)';
  }

  override serialize(): HeapSnapshotModel.HeapSnapshotModel.Node {
    const result = super.serialize();
    const snapshot = (this.snapshot as JSHeapSnapshot);
    const flags = snapshot.flagsOfNode(this);
    if (flags & snapshot.nodeFlags.canBeQueried) {
      result.canBeQueried = true;
    }
    if (flags & snapshot.nodeFlags.detachedDOMTreeNode) {
      result.detachedDOMTreeNode = true;
    }
    return result;
  }
}

export class JSHeapSnapshotEdge extends HeapSnapshotEdge {
  constructor(snapshot: JSHeapSnapshot, edgeIndex?: number) {
    super(snapshot, edgeIndex);
  }

  override clone(): JSHeapSnapshotEdge {
    const snapshot = (this.snapshot as JSHeapSnapshot);
    return new JSHeapSnapshotEdge(snapshot, this.edgeIndex);
  }

  override hasStringName(): boolean {
    if (!this.isShortcut()) {
      return this.hasStringNameInternal();
    }
    // @ts-ignore parseInt is successful against numbers.
    return isNaN(parseInt(this.nameInternal(), 10));
  }

  isElement(): boolean {
    return this.rawType() === this.snapshot.edgeElementType;
  }

  isHidden(): boolean {
    return this.rawType() === this.snapshot.edgeHiddenType;
  }

  override isWeak(): boolean {
    return this.rawType() === this.snapshot.edgeWeakType;
  }

  override isInternal(): boolean {
    return this.rawType() === this.snapshot.edgeInternalType;
  }

  override isInvisible(): boolean {
    return this.rawType() === this.snapshot.edgeInvisibleType;
  }

  isShortcut(): boolean {
    return this.rawType() === this.snapshot.edgeShortcutType;
  }

  override name(): string {
    const name = this.nameInternal();
    if (!this.isShortcut()) {
      return String(name);
    }
    // @ts-ignore parseInt is successful against numbers.
    const numName = parseInt(name, 10);
    return String(isNaN(numName) ? name : numName);
  }

  override toString(): string {
    const name = this.name();
    switch (this.type()) {
      case 'context':
        return '->' + name;
      case 'element':
        return '[' + name + ']';
      case 'weak':
        return '[[' + name + ']]';
      case 'property':
        return name.indexOf(' ') === -1 ? '.' + name : '["' + name + '"]';
      case 'shortcut':
        if (typeof name === 'string') {
          return name.indexOf(' ') === -1 ? '.' + name : '["' + name + '"]';
        }
        return '[' + name + ']';
      case 'internal':
      case 'hidden':
      case 'invisible':
        return '{' + name + '}';
    }
    return '?' + name + '?';
  }

  private hasStringNameInternal(): boolean {
    const type = this.rawType();
    const snapshot = this.snapshot;
    return type !== snapshot.edgeElementType && type !== snapshot.edgeHiddenType;
  }

  private nameInternal(): string|number {
    return this.hasStringNameInternal() ? this.snapshot.strings[this.nameOrIndex()] : this.nameOrIndex();
  }

  private nameOrIndex(): number {
    return this.edges.getValue(this.edgeIndex + this.snapshot.edgeNameOffset);
  }

  override rawType(): number {
    return this.edges.getValue(this.edgeIndex + this.snapshot.edgeTypeOffset);
  }

  override nameIndex(): number {
    if (!this.hasStringNameInternal()) {
      throw new Error('Edge does not have string name');
    }
    return this.nameOrIndex();
  }
}

export class JSHeapSnapshotRetainerEdge extends HeapSnapshotRetainerEdge {
  constructor(snapshot: JSHeapSnapshot, retainerIndex: number) {
    super(snapshot, retainerIndex);
  }

  override clone(): JSHeapSnapshotRetainerEdge {
    const snapshot = (this.snapshot as JSHeapSnapshot);
    return new JSHeapSnapshotRetainerEdge(snapshot, this.retainerIndex());
  }

  isHidden(): boolean {
    return this.edge().isHidden();
  }

  isInvisible(): boolean {
    return this.edge().isInvisible();
  }

  isShortcut(): boolean {
    return this.edge().isShortcut();
  }

  isWeak(): boolean {
    return this.edge().isWeak();
  }
}
export interface AggregatedInfo {
  count: number;
  distance: number;
  self: number;
  maxRet: number;
  name: string|null;
  idxs: number[];
}
