// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as TraceEngine from '../../../models/trace/trace.js';
import * as ThemeSupport from '../../../ui/legacy/theme_support/theme_support.js';

export function extensionEntryColor(event: TraceEngine.Types.Extensions.SyntheticExtensionEntry): string {
  const color = event.args.color;
  // Use a default value for when the color of the extension entry
  // was not passed or was set an unknown value.
  let themeColor = '--ref-palette-primary60';

  switch (color) {
    case 'primary':
      themeColor = '--ref-palette-primary60';
      break;
    case 'primary-light':
      themeColor = '--ref-palette-primary80';
      break;
    case 'primary-dark':
      themeColor = '--ref-palette-primary50';
      break;
    case 'secondary':
      themeColor = '--ref-palette-secondary60';
      break;
    case 'secondary-light':
      themeColor = '--ref-palette-secondary80';
      break;
    case 'secondary-dark':
      themeColor = '--ref-palette-secondary50';
      break;
    case 'tertiary':
      themeColor = '--ref-palette-tertiary60';
      break;
    case 'tertiary-light':
      themeColor = '--ref-palette-tertiary80';
      break;
    case 'tertiary-dark':
      themeColor = '--ref-palette-tertiary50';
      break;
    case 'error':
      themeColor = '--ref-palette-error40';
      break;
  }
  return ThemeSupport.ThemeSupport.instance().getComputedValue(themeColor);
}
