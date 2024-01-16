// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';

import * as Helpers from './helpers/helpers.js';
import * as Types from './types/types.js';

type EntryToNodeMap = Map<Types.TraceEvents.SyntheticTraceEntry, Helpers.TreeHelpers.TraceEntryNode>;

export type FilterAction = FilterApplyAction|FilterUndoAction;

export const enum FilterApplyAction {
  MERGE_FUNCTION = 'MERGE_FUNCTION',
  COLLAPSE_FUNCTION = 'COLLAPSE_FUNCTION',
  COLLAPSE_REPEATING_DESCENDANTS = 'COLLAPSE_REPEATING_DESCENDANTS',
}

export const enum FilterUndoAction {
  RESET_CHILDREN = 'RESET_CHILDREN',
  UNDO_ALL_ACTIONS = 'UNDO_ALL_ACTIONS',
}

const filterApplyActionSet: Set<FilterApplyAction> = new Set([
  FilterApplyAction.MERGE_FUNCTION,
  FilterApplyAction.COLLAPSE_FUNCTION,
  FilterApplyAction.COLLAPSE_REPEATING_DESCENDANTS,
]);

const filterUndoActionSet: Set<FilterUndoAction> = new Set([
  FilterUndoAction.RESET_CHILDREN,
  FilterUndoAction.UNDO_ALL_ACTIONS,
]);

// Object passed from the frontend that can be either Undo or Apply filter action.
export interface UserFilterAction {
  type: FilterAction;
  entry: Types.TraceEvents.SyntheticTraceEntry;
}

export interface UserApplyFilterAction {
  type: FilterApplyAction;
  entry: Types.TraceEvents.SyntheticTraceEntry;
}

// Object used to indicate to the Context Menu if an action is possible on the selected entry.
export interface PossibleFilterActions {
  [FilterApplyAction.MERGE_FUNCTION]: boolean;
  [FilterApplyAction.COLLAPSE_FUNCTION]: boolean;
  [FilterApplyAction.COLLAPSE_REPEATING_DESCENDANTS]: boolean;
}

/**
 * This class can take in a thread that has been generated by the
 * RendererHandler and apply certain actions to it in order to modify what is
 * shown to the user. These actions can be automatically applied by DevTools or
 * applied by the user.
 *
 * Once actions are applied, the invisibleEntries() method will return the
 * entries that are invisible, and this is the list of entries that should be
 * removed before rendering the resulting thread on the timeline.
 **/
export class EntriesFilter {
  // Maps from an individual TraceEvent entry to its representation as a
  // RendererEntryNode. We need this so we can then parse the tree structure
  // generated by the RendererHandler.
  #entryToNode: EntryToNodeMap;

  // Track the set of invisible entries.
  #invisibleEntries: Types.TraceEvents.TraceEventData[] = [];
  // List of entries whose children are modified. This list is used to
  // keep track of entries that should be identified in the UI as modified.
  #modifiedVisibleEntries: Types.TraceEvents.TraceEventData[] = [];
  // Cache for descendants of entry that have already been gathered. The descendants
  // will never change so we can avoid running the potentially expensive search again.
  #entryToDescendantsMap: Map<Helpers.TreeHelpers.TraceEntryNode, Types.TraceEvents.TraceEventData[]> = new Map();

  constructor(entryToNode: EntryToNodeMap) {
    this.#entryToNode = entryToNode;
  }

  /**
   * Applies an action to hide entries or removes entries
   * from hidden entries array depending on the type of action.
   **/
  applyAction(action: UserFilterAction): void {
    if (/* FilterApplyActions */ this.#isUserApplyFilterAction(action)) {
      this.#applyFilterAction(action);

    } else if (/* FilterUndoActions */ this.#isFilterUndoAction(action.type)) {
      this.#applyUndoAction(action);
    }
  }

  /**
   * Checks which actions can be applied on an entry. This allows us to only show possible actions in the Context Menu.
   * For example, if an entry has no children, COLLAPSE_FUNCTION will not change the FlameChart, therefore there is no need to show this action as an option.
   **/
  findPossibleActions(entry: Types.TraceEvents.SyntheticTraceEntry): PossibleFilterActions {
    const entryNode = this.#entryToNode.get(entry);
    if (!entryNode) {
      // Invalid node was given, return no possible actions.
      return {
        [FilterApplyAction.MERGE_FUNCTION]: false,
        [FilterApplyAction.COLLAPSE_FUNCTION]: false,
        [FilterApplyAction.COLLAPSE_REPEATING_DESCENDANTS]: false,
      };
    }
    const entryParent = entryNode.parent;
    const allDescendants = this.#findAllDescendantsOfNode(entryNode);
    const allRepeatingDescendants = this.#findAllRepeatingDescendantsOfNext(entryNode);
    // If there are children to hide, indicate action as possible
    const possibleActions: PossibleFilterActions = {
      [FilterApplyAction.MERGE_FUNCTION]: entryParent !== null,
      [FilterApplyAction.COLLAPSE_FUNCTION]: allDescendants.length > 0,
      [FilterApplyAction.COLLAPSE_REPEATING_DESCENDANTS]: allRepeatingDescendants.length > 0,
    };
    return possibleActions;
  }

  /**
   * Returns the amount of entry descendants that belong to the hidden entries array.
   * **/
  findHiddenDescendantsAmount(entry: Types.TraceEvents.SyntheticTraceEntry): number {
    const entryNode = this.#entryToNode.get(entry);
    if (!entryNode) {
      return 0;
    }
    const allDescendants = this.#findAllDescendantsOfNode(entryNode);
    return allDescendants.filter(descendant => this.invisibleEntries().includes(descendant)).length;
  }

  /**
   * If undo action is UNDO_ALL_ACTIONS, assign invisibleEntries array to an empty one.
   * **/
  #applyUndoAction(action: UserFilterAction): void {
    switch (action.type) {
      case FilterUndoAction.UNDO_ALL_ACTIONS: {
        this.#invisibleEntries = [];
        this.#modifiedVisibleEntries = [];
        break;
      }
      case FilterUndoAction.RESET_CHILDREN: {
        this.#makeEntryChildrenVisible(action.entry);
        break;
      }
    }
  }

  /**
   * Returns the set of entries that are invisible given the set of applied actions.
   **/
  invisibleEntries(): Types.TraceEvents.TraceEventData[] {
    return this.#invisibleEntries;
  }

  #applyFilterAction(action: UserApplyFilterAction): Types.TraceEvents.TraceEventData[] {
    // We apply new user action to the set of all entries, and mark
    // any that should be hidden by adding them to this set.
    // Another approach would be to use splice() to remove items from the
    // array, but doing this would be a mutation of the arry for every hidden
    // event. Instead, we add entries to this set and return it as an array at the end.
    const entriesToHide = new Set<Types.TraceEvents.TraceEventData>();

    switch (action.type) {
      case FilterApplyAction.MERGE_FUNCTION: {
        // The entry that was clicked on is merged into its parent. All its
        // children remain visible, so we just have to hide the entry that was
        // selected.
        entriesToHide.add(action.entry);
        // If parent node exists, add it to modifiedVisibleEntries, so it would be possible to uncollapse its' children.
        const actionNode = this.#entryToNode.get(action.entry) || null;
        const parentNode = actionNode && this.#findNextVisibleParent(actionNode);
        if (parentNode) {
          this.#modifiedVisibleEntries.push(parentNode?.entry);
        }
        break;
      }

      case FilterApplyAction.COLLAPSE_FUNCTION: {
        // The entry itself remains visible, but all of its descendants are hidden.
        const entryNode = this.#entryToNode.get(action.entry);
        if (!entryNode) {
          // Invalid node was given, just ignore and move on.
          break;
        }
        const allDescendants = this.#findAllDescendantsOfNode(entryNode);
        allDescendants.forEach(descendant => entriesToHide.add(descendant));
        // If there are any children to hide, add selected entry to modifiedVisibleEntries array to identify in the UI that children of the selected entry are modified.
        if (entriesToHide.size > 0) {
          this.#modifiedVisibleEntries.push(action.entry);
        }
        break;
      }

      case FilterApplyAction.COLLAPSE_REPEATING_DESCENDANTS: {
        const entryNode = this.#entryToNode.get(action.entry);
        if (!entryNode) {
          // Invalid node was given, just ignore and move on.
          break;
        }
        const allRepeatingDescendants = this.#findAllRepeatingDescendantsOfNext(entryNode);
        allRepeatingDescendants.forEach(descendant => entriesToHide.add(descendant));
        if (entriesToHide.size > 0) {
          this.#modifiedVisibleEntries.push(action.entry);
        }
        break;
      }
      default:
        Platform.assertNever(action.type, `Unknown EntriesFilter action: ${action.type}`);
    }

    this.#invisibleEntries.push(...entriesToHide);

    return this.#invisibleEntries;
  }

  // The direct parent might be hidden by other actions, therefore we look for the next visible parent.
  #findNextVisibleParent(node: Helpers.TreeHelpers.TraceEntryNode): Helpers.TreeHelpers.TraceEntryNode|null {
    let parent = node.parent;
    while (parent && this.#invisibleEntries.includes(parent.entry)) {
      parent = parent.parent;
    }
    return parent;
  }

  #findAllDescendantsOfNode(root: Helpers.TreeHelpers.TraceEntryNode): Types.TraceEvents.TraceEventData[] {
    const cachedDescendants = this.#entryToDescendantsMap.get(root);
    if (cachedDescendants) {
      return cachedDescendants;
    }

    const descendants: Types.TraceEvents.TraceEventData[] = [];

    // Walk through all the descendants, starting at the root node.
    const children: Helpers.TreeHelpers.TraceEntryNode[] = [...root.children];
    while (children.length > 0) {
      const childNode = children.shift();
      if (childNode) {
        descendants.push(childNode.entry);
        const childNodeCachedDescendants = this.#entryToDescendantsMap.get(childNode);
        // If the descendants of a child are cached, get them from the cache instead of iterating through them again
        if (childNodeCachedDescendants) {
          descendants.push(...childNodeCachedDescendants);
        } else {
          children.push(...childNode.children);
        }
      }
    }

    this.#entryToDescendantsMap.set(root, descendants);
    return descendants;
  }

  #findAllRepeatingDescendantsOfNext(root: Helpers.TreeHelpers.TraceEntryNode):
      Types.TraceEvents.SyntheticTraceEntry[] {
    // Walk through all the ancestors, starting at the root node.
    const children: Helpers.TreeHelpers.TraceEntryNode[] = [...root.children];
    const repeatingNodes: Types.TraceEvents.SyntheticTraceEntry[] = [];
    const rootIsProfileCall = Types.TraceEvents.isProfileCall(root.entry);

    while (children.length > 0) {
      const childNode = children.shift();
      if (childNode) {
        const childIsProfileCall = Types.TraceEvents.isProfileCall(childNode.entry);
        if (/* Handle SyntheticProfileCalls */ rootIsProfileCall && childIsProfileCall) {
          const rootNodeEntry = root.entry as Types.TraceEvents.SyntheticProfileCall;
          const childNodeEntry = childNode.entry as Types.TraceEvents.SyntheticProfileCall;

          if (Helpers.SamplesIntegrator.SamplesIntegrator.framesAreEqual(
                  rootNodeEntry.callFrame, childNodeEntry.callFrame)) {
            repeatingNodes.push(childNode.entry);
          }
        } /* Handle SyntheticRendererEvents */ else if (!rootIsProfileCall && !childIsProfileCall) {
          if (root.entry.name === childNode.entry.name) {
            repeatingNodes.push(childNode.entry);
          }
        }
        children.push(...childNode.children);
      }
    }

    return repeatingNodes;
  }

  /**
   * Removes all of the entry children from the
   * invisible entries array to make them visible.
   **/
  #makeEntryChildrenVisible(entry: Types.TraceEvents.SyntheticTraceEntry): void {
    const entryNode = this.#entryToNode.get(entry);
    if (!entryNode) {
      // Invalid node was given, just ignore and move on.
      return;
    }
    const descendants = this.#findAllDescendantsOfNode(entryNode);

    /**
     * Filter out all descendant of the node
     * from the invisible entries list.
     **/
    this.#invisibleEntries = this.#invisibleEntries.filter(entry => {
      if (descendants.includes(entry)) {
        return false;
      }
      return true;
    });

    /**
     * Filter out all descentants and entry from modified entries
     * list to not show that some entries below those are hidden.
     **/
    this.#modifiedVisibleEntries = this.#modifiedVisibleEntries.filter(iterEntry => {
      if (descendants.includes(iterEntry) || iterEntry === entry) {
        return false;
      }
      return true;
    });
  }

  isEntryModified(event: Types.TraceEvents.TraceEventData): boolean {
    return this.#modifiedVisibleEntries.includes(event);
  }

  #isUserApplyFilterAction(action: UserFilterAction): action is UserApplyFilterAction {
    return filterApplyActionSet.has(action.type as FilterApplyAction);
  }

  #isFilterUndoAction(action: FilterAction): action is FilterUndoAction {
    return filterUndoActionSet.has(action as FilterUndoAction);
  }
}
