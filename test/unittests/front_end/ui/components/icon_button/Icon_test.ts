// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as IconButton from '../../../../../../front_end/ui/components/icon_button/icon_button.js';
import {assertElement, assertShadowRoot, renderElementIntoDOM} from '../../../helpers/DOMHelpers.js';

const {assert} = chai;

function getSpanElement(icon: IconButton.Icon.Icon): HTMLSpanElement {
  const {shadowRoot} = icon;
  assertShadowRoot(shadowRoot);
  const span = shadowRoot.querySelector('span');
  assertElement(span, HTMLSpanElement);
  return span;
}

describe('Icon', () => {
  describe('Icon', () => {
    const {Icon} = IconButton.Icon;

    it('constructs a 20x20 icon by default', () => {
      const icon = new Icon();
      renderElementIntoDOM(icon);
      assert.strictEqual(icon.getBoundingClientRect().width, 20);
      assert.strictEqual(icon.getBoundingClientRect().height, 20);
    });

    describe('data', () => {
      it('can be used to set name and style', () => {
        const icon = new Icon();
        icon.data = {iconName: 'foo', color: 'red', width: '14px', height: '14px'};
        assert.strictEqual(icon.name, 'foo');
        assert.strictEqual(icon.style.color, 'red');
        assert.strictEqual(icon.style.width, '14px');
        assert.strictEqual(icon.style.height, '14px');
      });

      it('can be used to set path and style', () => {
        const icon = new Icon();
        icon.data = {iconPath: 'file:///path/to/bar.svg', color: 'darkblue', width: '8pt', height: '8pt'};
        assert.strictEqual(icon.name, 'file:///path/to/bar.svg');
        assert.strictEqual(icon.style.color, 'darkblue');
        assert.strictEqual(icon.style.width, '8pt');
        assert.strictEqual(icon.style.height, '8pt');
      });
    });

    describe('name', () => {
      it('is initially unset', () => {
        const icon = new Icon();
        assert.isNull(icon.name);
      });

      it('reflects the "name" attribute', () => {
        const icon = new Icon();
        icon.setAttribute('name', 'bar');
        assert.strictEqual(icon.name, 'bar');
      });

      it('is reflected to the "name" attribute', () => {
        const icon = new Icon();
        icon.name = 'foo';
        assert.strictEqual(icon.getAttribute('name'), 'foo');
      });

      it('accepts a `.svg` URL that is used verbatim for the icon URL', () => {
        const icon = new Icon();
        icon.name = 'devtools://path/to/images/file.svg';
        renderElementIntoDOM(icon);
        const span = getSpanElement(icon);
        assert.strictEqual(window.getComputedStyle(span).maskImage, 'url("devtools://path/to/images/file.svg")');
      });

      it('constructs the correct `.svg` icon URL for a name', () => {
        const icon = new Icon();
        icon.name = 'select-element';
        renderElementIntoDOM(icon);
        const span = getSpanElement(icon);
        assert.match(window.getComputedStyle(span).maskImage, /^url\("\S+\/front_end\/Images\/select-element\.svg"\)$/);
      });
    });
  });
});
