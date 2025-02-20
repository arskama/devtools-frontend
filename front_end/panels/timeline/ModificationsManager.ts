// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Platform from '../../core/platform/platform.js';
import * as TraceEngine from '../../models/trace/trace.js';
import * as TimelineComponents from '../../panels/timeline/components/components.js';

import {EntriesFilter} from './EntriesFilter.js';
import {EventsSerializer} from './EventsSerializer.js';
import * as Overlays from './overlays/overlays.js';

const modificationsManagerByTraceIndex: ModificationsManager[] = [];
let activeManager: ModificationsManager|null;

export type UpdateAction = 'Remove'|'Add'|'UpdateLabel'|'UpdateTimeRange'|'UpdateLinkToEntry';

// Event dispatched after an annotation was added, removed or updated.
// The event argument is the Overlay that needs to be created,removed
// or updated by `Overlays.ts` and the action that needs to be applied to it.
export class AnnotationModifiedEvent extends Event {
  static readonly eventName = 'annotationmodifiedevent';

  constructor(public overlay: Overlays.Overlays.TimelineOverlay, public action: UpdateAction) {
    super(AnnotationModifiedEvent.eventName);
  }
}

type ModificationsManagerData = {
  traceParsedData: TraceEngine.Handlers.Types.TraceParseData,
  traceBounds: TraceEngine.Types.Timing.TraceWindowMicroSeconds,
  rawTraceEvents: readonly TraceEngine.Types.TraceEvents.TraceEventData[],
  syntheticEvents: TraceEngine.Types.TraceEvents.SyntheticBasedEvent[],
  modifications?: TraceEngine.Types.File.Modifications,
};

export class ModificationsManager extends EventTarget {
  #entriesFilter: EntriesFilter;
  #timelineBreadcrumbs: TimelineComponents.Breadcrumbs.Breadcrumbs;
  #modifications: TraceEngine.Types.File.Modifications|null = null;
  #traceParsedData: TraceEngine.Handlers.Types.TraceParseData;
  #eventsSerializer: EventsSerializer;
  #overlayForAnnotation: Map<TraceEngine.Types.File.Annotation, Overlays.Overlays.TimelineOverlay>;

  /**
   * Gets the ModificationsManager instance corresponding to a trace
   * given its index used in Model#traces. If no index is passed gets
   * the manager instance for the last trace. If no instance is found,
   * throws.
   */
  static activeManager(): ModificationsManager|null {
    return activeManager;
  }

  /**
   * Initializes a ModificationsManager instance for a parsed trace or changes the active manager for an existing one.
   * This needs to be called if and a trace has been parsed or switched to.
   */
  static initAndActivateModificationsManager(traceModel: TraceEngine.TraceModel.Model, traceIndex: number):
      ModificationsManager|null {
    // If a manager for a given index has already been created, active it.
    if (modificationsManagerByTraceIndex[traceIndex]) {
      activeManager = modificationsManagerByTraceIndex[traceIndex];
      ModificationsManager.activeManager()?.applyModificationsIfPresent();
    }
    const traceParsedData = traceModel.traceParsedData(traceIndex);
    if (!traceParsedData) {
      throw new Error('ModificationsManager was initialized without a corresponding trace data');
    }
    const traceBounds = traceParsedData.Meta.traceBounds;
    const traceEvents = traceModel.rawTraceEvents(traceIndex);
    if (!traceEvents) {
      throw new Error('ModificationsManager was initialized without a corresponding raw trace events array');
    }
    const syntheticEventsManager = traceModel.syntheticTraceEventsManager(traceIndex);
    if (!syntheticEventsManager) {
      throw new Error('ModificationsManager was initialized without a corresponding SyntheticEventsManager');
    }
    const metadata = traceModel.metadata(traceIndex);
    const newModificationsManager = new ModificationsManager({
      traceParsedData,
      traceBounds,
      rawTraceEvents: traceEvents,
      modifications: metadata?.modifications,
      syntheticEvents: syntheticEventsManager.getSyntheticTraceEvents(),
    });
    modificationsManagerByTraceIndex[traceIndex] = newModificationsManager;
    activeManager = newModificationsManager;
    ModificationsManager.activeManager()?.applyModificationsIfPresent();
    return this.activeManager();
  }

  private constructor({traceParsedData, traceBounds, modifications}: ModificationsManagerData) {
    super();
    const entryToNodeMap = new Map([...traceParsedData.Samples.entryToNode, ...traceParsedData.Renderer.entryToNode]);
    this.#entriesFilter = new EntriesFilter(entryToNodeMap);
    this.#timelineBreadcrumbs = new TimelineComponents.Breadcrumbs.Breadcrumbs(traceBounds);
    this.#modifications = modifications || null;
    this.#traceParsedData = traceParsedData;
    this.#eventsSerializer = new EventsSerializer();
    // TODO: Assign annotations loaded from the trace file
    this.#overlayForAnnotation = new Map();
  }

  getEntriesFilter(): EntriesFilter {
    return this.#entriesFilter;
  }

  getTimelineBreadcrumbs(): TimelineComponents.Breadcrumbs.Breadcrumbs {
    return this.#timelineBreadcrumbs;
  }

  createAnnotation(newAnnotation: TraceEngine.Types.File.Annotation): void {
    const newOverlay = this.#createOverlayFromAnnotation(newAnnotation);
    this.#overlayForAnnotation.set(newAnnotation, newOverlay);
    this.dispatchEvent(new AnnotationModifiedEvent(newOverlay, 'Add'));
  }

  #createOverlayFromAnnotation(annotation: TraceEngine.Types.File.Annotation): Overlays.Overlays.EntryLabel
      |Overlays.Overlays.TimeRangeLabel|Overlays.Overlays.EntriesLink {
    switch (annotation.type) {
      case 'ENTRY_LABEL':
        return {
          type: 'ENTRY_LABEL',
          entry: annotation.entry,
          label: annotation.label,
        };
      case 'TIME_RANGE':
        return {
          type: 'TIME_RANGE',
          label: annotation.label,
          showDuration: true,
          bounds: annotation.bounds,
        };
      case 'ENTRIES_LINK':
        return {
          type: 'ENTRIES_LINK',
          entryFrom: annotation.entryFrom,
          entryTo: annotation.entryTo,
        };
      default:
        Platform.assertNever(annotation, 'Overlay for provided annotation cannot be created');
    }
  }

  removeAnnotation(removedAnnotation: TraceEngine.Types.File.Annotation): void {
    const overlayToRemove = this.#overlayForAnnotation.get(removedAnnotation);
    if (!overlayToRemove) {
      console.warn('Overlay for deleted Annotation does not exist');
      return;
    }
    this.#overlayForAnnotation.delete(removedAnnotation);
    this.dispatchEvent(new AnnotationModifiedEvent(overlayToRemove, 'Remove'));
  }

  removeAnnotationOverlay(removedOverlay: Overlays.Overlays.TimelineOverlay): void {
    const annotationForRemovedOverlay = this.getAnnotationByOverlay(removedOverlay);
    if (!annotationForRemovedOverlay) {
      console.warn('Annotation for deleted Overlay does not exist');
      return;
    }
    this.#overlayForAnnotation.delete(annotationForRemovedOverlay);
    this.dispatchEvent(new AnnotationModifiedEvent(removedOverlay, 'Remove'));
  }

  updateAnnotation(updatedAnnotation: TraceEngine.Types.File.Annotation): void {
    const overlay = this.#overlayForAnnotation.get(updatedAnnotation);

    if (overlay && Overlays.Overlays.isTimeRangeLabel(overlay) &&
        TraceEngine.Types.File.isTimeRangeAnnotation(updatedAnnotation)) {
      overlay.label = updatedAnnotation.label;
      overlay.bounds = updatedAnnotation.bounds;
      this.dispatchEvent(new AnnotationModifiedEvent(overlay, 'UpdateTimeRange'));

    } else if (
        overlay && Overlays.Overlays.isEntriesLink(overlay) &&
        TraceEngine.Types.File.isEntriesLinkAnnotation(updatedAnnotation)) {
      overlay.entryTo = updatedAnnotation.entryTo;
      this.dispatchEvent(new AnnotationModifiedEvent(overlay, 'UpdateLinkToEntry'));

    } else {
      console.error('Annotation could not be updated');
    }
  }

  updateAnnotationOverlay(updatedOverlay: Overlays.Overlays.TimelineOverlay): void {
    const annotationForUpdatedOverlay = this.getAnnotationByOverlay(updatedOverlay);
    if (!annotationForUpdatedOverlay) {
      console.warn('Annotation for updated Overlay does not exist');
      return;
    }

    if ((updatedOverlay.type === 'ENTRY_LABEL' && annotationForUpdatedOverlay.type === 'ENTRY_LABEL') ||
        (updatedOverlay.type === 'TIME_RANGE' && annotationForUpdatedOverlay.type === 'TIME_RANGE')) {
      annotationForUpdatedOverlay.label = updatedOverlay.label;
    }
    this.dispatchEvent(new AnnotationModifiedEvent(updatedOverlay, 'UpdateLabel'));
  }

  getAnnotationByOverlay(overlay: Overlays.Overlays.TimelineOverlay): TraceEngine.Types.File.Annotation|null {
    for (const [annotation, currOverlay] of this.#overlayForAnnotation.entries()) {
      if (currOverlay === overlay) {
        return annotation;
      }
    }
    return null;
  }

  getAnnotations(): TraceEngine.Types.File.Annotation[] {
    return [...this.#overlayForAnnotation.keys()];
  }

  getOverlays(): Overlays.Overlays.TimelineOverlay[] {
    return [...this.#overlayForAnnotation.values()];
  }

  /**
   * Builds all modifications into a serializable object written into
   * the 'modifications' trace file metadata field.
   */
  toJSON(): TraceEngine.Types.File.Modifications {
    const hiddenEntries = this.#entriesFilter.invisibleEntries()
                              .map(entry => this.#eventsSerializer.keyForEvent(entry))
                              .filter(entry => entry !== null) as TraceEngine.Types.File.TraceEventSerializableKey[];
    const expandableEntries =
        this.#entriesFilter.expandableEntries()
            .map(entry => this.#eventsSerializer.keyForEvent(entry))
            .filter(entry => entry !== null) as TraceEngine.Types.File.TraceEventSerializableKey[];
    this.#modifications = {
      entriesModifications: {
        hiddenEntries: hiddenEntries,
        expandableEntries: expandableEntries,
      },
      initialBreadcrumb: this.#timelineBreadcrumbs.initialBreadcrumb,
      annotations: this.#annotationsJSON(),
    };
    return this.#modifications;
  }

  #annotationsJSON(): TraceEngine.Types.File.SerializedAnnotations {
    const annotations = this.getAnnotations();
    const entryLabelsSerialized: TraceEngine.Types.File.EntryLabelAnnotationSerialized[] = [];
    const labelledTimeRangesSerialized: TraceEngine.Types.File.TimeRangeAnnotationSerialized[] = [];

    for (let i = 0; i < annotations.length; i++) {
      const currAnnotation = annotations[i];
      if (TraceEngine.Types.File.isEntryLabelAnnotation(currAnnotation)) {
        const serializedEvent = this.#eventsSerializer.keyForEvent(currAnnotation.entry);
        if (serializedEvent) {
          entryLabelsSerialized.push({
            entry: serializedEvent,
            label: currAnnotation.label,
          });
        }
      } else if (TraceEngine.Types.File.isTimeRangeAnnotation(currAnnotation)) {
        labelledTimeRangesSerialized.push({
          bounds: currAnnotation.bounds,
          label: currAnnotation.label,
        });
      }
    }

    return {
      entryLabels: entryLabelsSerialized,
      labelledTimeRanges: labelledTimeRangesSerialized,
    };
  }

  applyModificationsIfPresent(): void {
    const modifications = this.#modifications;
    if (!modifications || !modifications.annotations) {
      return;
    }
    const hiddenEntries = modifications.entriesModifications.hiddenEntries;
    const expandableEntries = modifications.entriesModifications.expandableEntries;
    this.#applyEntriesFilterModifications(hiddenEntries, expandableEntries);
    this.#timelineBreadcrumbs.setInitialBreadcrumbFromLoadedModifications(modifications.initialBreadcrumb);

    // Assign annotations to an empty array if they don't exist to not
    // break the traces that were saved before those annotations were implemented
    const entryLabels = modifications.annotations.entryLabels ?? [];
    entryLabels.forEach(entryLabel => {
      this.createAnnotation({
        type: 'ENTRY_LABEL',
        entry: this.#eventsSerializer.eventForKey(entryLabel.entry, this.#traceParsedData),
        label: entryLabel.label,
      });
    });

    const timeRanges = modifications.annotations.labelledTimeRanges ?? [];
    timeRanges.forEach(timeRange => {
      this.createAnnotation({
        type: 'TIME_RANGE',
        bounds: timeRange.bounds,
        label: timeRange.label,
      });
    });
  }

  #applyEntriesFilterModifications(
      hiddenEntriesKeys: TraceEngine.Types.File.TraceEventSerializableKey[],
      expandableEntriesKeys: TraceEngine.Types.File.TraceEventSerializableKey[]): void {
    const hiddenEntries = hiddenEntriesKeys.map(key => this.#eventsSerializer.eventForKey(key, this.#traceParsedData));
    const expandableEntries =
        expandableEntriesKeys.map(key => this.#eventsSerializer.eventForKey(key, this.#traceParsedData));
    this.#entriesFilter.setHiddenAndExpandableEntries(hiddenEntries, expandableEntries);
  }
}
