// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../../../../core/common/common.js';
import * as i18n from '../../../../core/i18n/i18n.js';
import * as Platform from '../../../../core/platform/platform.js';
import {type LCPInsightResult} from '../../../../models/trace/insights/types.js';
import * as TraceEngine from '../../../../models/trace/trace.js';
import * as IconButton from '../../../../ui/components/icon_button/icon_button.js';
import * as LitHtml from '../../../../ui/lit-html/lit-html.js';
import {type TimelineOverlay} from '../../overlays/OverlaysImpl.js';

import {BaseInsight, shouldRenderForCategory} from './Helpers.js';
import discoveryStyles from './lcpDiscovery.css.js';
import * as SidebarInsight from './SidebarInsight.js';
import {InsightsCategories} from './types.js';

const UIStrings = {
  /**
   * @description Text to tell the user how long after the earliest discovery time their LCP element loaded.
   * @example {401ms} PH1
   */
  lcpLoadDelay: 'LCP image loaded {PH1} after earliest start point.',
};

const str_ = i18n.i18n.registerUIStrings('panels/timeline/components/insights/LCPDiscovery.ts', UIStrings);

interface LCPImageDiscoveryData {
  shouldIncreasePriorityHint: boolean;
  shouldPreloadImage: boolean;
  shouldRemoveLazyLoading: boolean;
  resource: TraceEngine.Types.TraceEvents.SyntheticNetworkRequest;
  discoveryDelay: TraceEngine.Types.Timing.MicroSeconds|null;
}

export function getLCPInsightData(
    insights: TraceEngine.Insights.Types.TraceInsightData|null, navigationId: string|null): LCPInsightResult|null {
  if (!insights || !navigationId) {
    return null;
  }

  const insightsByNavigation = insights.get(navigationId);
  if (!insightsByNavigation) {
    return null;
  }

  const lcpInsight: TraceEngine.Insights.Types.LCPInsightResult|Error = insightsByNavigation.LargestContentfulPaint;
  if (lcpInsight instanceof Error) {
    return null;
  }
  return lcpInsight;
}

function getImageData(
    insights: TraceEngine.Insights.Types.TraceInsightData|null, navigationId: string|null): LCPImageDiscoveryData|null {
  const lcpInsight = getLCPInsightData(insights, navigationId);
  if (!lcpInsight) {
    return null;
  }

  if (lcpInsight.lcpResource === undefined) {
    return null;
  }

  const shouldIncreasePriorityHint = lcpInsight.shouldIncreasePriorityHint;
  const shouldPreloadImage = lcpInsight.shouldPreloadImage;
  const shouldRemoveLazyLoading = lcpInsight.shouldRemoveLazyLoading;

  const imageLCP = shouldIncreasePriorityHint !== undefined && shouldPreloadImage !== undefined &&
      shouldRemoveLazyLoading !== undefined;

  // Shouldn't render anything if lcp insight is null or lcp is text.
  if (!imageLCP) {
    return null;
  }

  const data: LCPImageDiscoveryData = {
    shouldIncreasePriorityHint,
    shouldPreloadImage,
    shouldRemoveLazyLoading,
    resource: lcpInsight.lcpResource,
    discoveryDelay: null,
  };

  if (lcpInsight.earliestDiscoveryTimeTs && lcpInsight.lcpResource) {
    const discoveryDelay = lcpInsight.lcpResource.ts - lcpInsight.earliestDiscoveryTimeTs;
    data.discoveryDelay = TraceEngine.Types.Timing.MicroSeconds(discoveryDelay);
  }

  return data;
}

export class LCPDiscovery extends BaseInsight {
  static readonly litTagName = LitHtml.literal`devtools-performance-lcp-discovery`;
  override insightCategory: InsightsCategories = InsightsCategories.LCP;
  override internalName: string = 'lcp-discovery';
  override userVisibleTitle: string = 'LCP request discovery';

  override connectedCallback(): void {
    super.connectedCallback();
    this.shadow.adoptedStyleSheets.push(discoveryStyles);
  }

  #adviceIcon(didFail: boolean): LitHtml.TemplateResult {
    const icon = didFail ? 'clear' : 'check-circle';

    return LitHtml.html`
      <${IconButton.Icon.Icon.litTagName}
      name=${icon}
      class=${didFail ? 'metric-value-bad' : 'metric-value-good'}
      ></${IconButton.Icon.Icon.litTagName}>
    `;
  }

  #renderDiscoveryDelay(delay: TraceEngine.Types.Timing.MicroSeconds): Element {
    const timeWrapper = document.createElement('span');
    timeWrapper.classList.add('discovery-time-ms');
    timeWrapper.innerText = i18n.TimeUtilities.formatMicroSecondsTime(delay);
    return i18n.i18n.getFormatLocalizedString(str_, UIStrings.lcpLoadDelay, {PH1: timeWrapper});
  }

  override createOverlays(): TimelineOverlay[] {
    // TODO: create overlays
    return [];
  }

  #renderDiscovery(imageData: LCPImageDiscoveryData): LitHtml.TemplateResult {
    // clang-format off
    return LitHtml.html`
        <div class="insights">
          <${SidebarInsight.SidebarInsight.litTagName} .data=${{
            title: this.userVisibleTitle,
            expanded: this.isActive(),
          } as SidebarInsight.InsightDetails}
          @insighttoggleclick=${this.onSidebarClick}
        >
          <div slot="insight-description" class="insight-description">
          ${imageData.discoveryDelay ? LitHtml.html`<p class="discovery-delay">${this.#renderDiscoveryDelay(imageData.discoveryDelay)}</p>` : LitHtml.nothing}
            <ul class="insight-results discovery-icon-results">
              <li class="insight-entry">
                ${this.#adviceIcon(imageData.shouldIncreasePriorityHint)}
                <span>fetchpriority=high applied</span>
              </li>
              <li class="insight-entry">
                ${this.#adviceIcon(imageData.shouldPreloadImage)}
                <span>Request is discoverable in initial document</span>
              </li>
              <li class="insight-entry">
                ${this.#adviceIcon(imageData.shouldRemoveLazyLoading)}
                <span>lazyload not applied</span>
              </li>
            </ul>
          </div>
          <div slot="insight-content" class="insight-content">
            <img class="element-img" data-src=${imageData.resource.args.data.url} src=${imageData.resource.args.data.url}>
            <div class="element-img-details">
              ${Common.ParsedURL.ParsedURL.extractName(imageData.resource.args.data.url ?? '')}
              <div class="element-img-details-size">${Platform.NumberUtilities.bytesToString(imageData.resource.args.data.decodedBodyLength ?? 0)}</div>
            </div>
          </div>
        </${SidebarInsight.SidebarInsight}>
      </div>`;
    // clang-format on
  }

  override render(): void {
    const imageResults = getImageData(this.data.insights, this.data.navigationId);
    const matchesCategory = shouldRenderForCategory({
      activeCategory: this.data.activeCategory,
      insightCategory: this.insightCategory,
    });
    const output = imageResults && matchesCategory ? this.#renderDiscovery(imageResults) : LitHtml.nothing;
    LitHtml.render(output, this.shadow, {host: this});
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'devtools-performance-lcp-discovery': LCPDiscovery;
  }
}

customElements.define('devtools-performance-lcp-discovery', LCPDiscovery);
