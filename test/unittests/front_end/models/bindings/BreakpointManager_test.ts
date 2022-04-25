// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {assert} = chai;
import * as Root from '../../../../../front_end/core/root/root.js';
import * as SDK from '../../../../../front_end/core/sdk/sdk.js';
import * as Workspace from '../../../../../front_end/models/workspace/workspace.js';
import * as Bindings from '../../../../../front_end/models/bindings/bindings.js';
import type * as Platform from '../../../../../front_end/core/platform/platform.js';
import type * as Protocol from '../../../../../front_end/generated/protocol.js';

import {describeWithRealConnection} from '../../helpers/RealConnection.js';
import {createUISourceCode} from '../../helpers/UISourceCodeHelpers.js';
import {assertNotNullOrUndefined} from '../../../../../front_end/core/platform/platform.js';

describeWithRealConnection('BreakpointManager', () => {
  const URL = 'file:///tmp/example.html' as Platform.DevToolsPath.UrlString;
  const SCRIPT_ID = 'SCRIPT_ID' as Protocol.Runtime.ScriptId;
  const BREAKPOINT_ID = 'BREAKPOINT_ID' as Protocol.Debugger.BreakpointId;
  const JS_MIME_TYPE = 'text/javascript';

  let target: SDK.Target.Target;
  let breakpointManager: Bindings.BreakpointManager.BreakpointManager;
  class TestDebuggerModel extends SDK.DebuggerModel.DebuggerModel {
    constructor(target: SDK.Target.Target) {
      super(target);
    }

    async setBreakpointByURL(
        _url: Platform.DevToolsPath.UrlString, _lineNumber: number, _columnNumber?: number,
        _condition?: string): Promise<SDK.DebuggerModel.SetBreakpointResult> {
      return Promise.resolve(
          {breakpointId: BREAKPOINT_ID, locations: [new SDK.DebuggerModel.Location(this, SCRIPT_ID, 42)]});
    }

    scriptForId(scriptId: string): SDK.Script.Script|null {
      if (scriptId === SCRIPT_ID) {
        return new SDK.Script.Script(
            this, scriptId as Protocol.Runtime.ScriptId, URL, 0, 0, 0, 0, 0, '', false, false, undefined, false, 0,
            null, null, null, null, null, null);
      }
      return null;
    }
  }

  function createFakeScriptMapping(debuggerModel: TestDebuggerModel, SCRIPT_ID: Protocol.Runtime.ScriptId):
      Bindings.DebuggerWorkspaceBinding.DebuggerSourceMapping {
    const sdkLocation = new SDK.DebuggerModel.Location(debuggerModel, SCRIPT_ID as Protocol.Runtime.ScriptId, 13);
    const mapping = {
      rawLocationToUILocation: (_: SDK.DebuggerModel.Location) => null,
      uiLocationToRawLocations:
          (_uiSourceCode: Workspace.UISourceCode.UISourceCode, _lineNumber: number,
           _columnNumber?: number) => [sdkLocation],
    };
    return mapping;
  }

  beforeEach(() => {
    breakpointManager = Bindings.BreakpointManager.BreakpointManager.instance();
    assertNotNullOrUndefined(breakpointManager);

    const targetManager = SDK.TargetManager.TargetManager.instance();
    const mainTarget = targetManager.mainTarget();
    assertNotNullOrUndefined(mainTarget);
    target = mainTarget;
  });

  it('allows awaiting the restoration of breakpoints', async () => {
    Root.Runtime.experiments.enableForTest(Root.Runtime.ExperimentName.INSTRUMENTATION_BREAKPOINTS);

    const {uiSourceCode} = createUISourceCode({url: URL, mimeType: JS_MIME_TYPE});
    const breakpoint = await breakpointManager.setBreakpoint(uiSourceCode, 0, 0, '', true);

    // Create a new DebuggerModel and notify the breakpoint engine about it.
    const debuggerModel = new TestDebuggerModel(target);
    breakpoint.modelAdded(debuggerModel);

    // Make sure that we await all updates that are triggered by adding the model.
    await breakpoint.updateBreakpoint();

    // Retrieve the ModelBreakpoint that is linked to our DebuggerModel.
    const modelBreakpoint = breakpoint.modelBreakpoint(debuggerModel);
    assertNotNullOrUndefined(modelBreakpoint);

    // Make sure that we do not have a linked script yet.
    assertNotNullOrUndefined(modelBreakpoint.currentState);
    assert.lengthOf(modelBreakpoint.currentState.positions, 1);
    assert.isEmpty(modelBreakpoint.currentState.positions[0].scriptId);

    // Create a fake mapping that can be used to set a breakpoint.
    const mapping = createFakeScriptMapping(debuggerModel, SCRIPT_ID);
    Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().addSourceMapping(mapping);

    // Now await restoring the breakpoint.
    // A successful restore should update the ModelBreakpoint of the DebuggerModel
    // to reflect a state, in which we have successfully set a breakpoint (i.e. a script id
    // is available).
    const script = debuggerModel.scriptForId(SCRIPT_ID);
    assertNotNullOrUndefined(script);
    await breakpointManager.restoreBreakpointsForScript(script);
    assertNotNullOrUndefined(modelBreakpoint.currentState);
    assert.lengthOf(modelBreakpoint.currentState.positions, 1);
    assert.strictEqual(modelBreakpoint.currentState.positions[0].scriptId, SCRIPT_ID);

    // Clean up.
    breakpointManager.removeBreakpoint(breakpoint, true);
    breakpointManager.modelRemoved(debuggerModel);
    Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().removeSourceMapping(mapping);
    Root.Runtime.experiments.disableForTest(Root.Runtime.ExperimentName.INSTRUMENTATION_BREAKPOINTS);
  });

  it('allows awaiting on scheduled update in debugger', async () => {
    const {uiSourceCode, project} = createUISourceCode({url: URL, mimeType: JS_MIME_TYPE});

    const debuggerModel = new TestDebuggerModel(target);
    const breakpoint = await breakpointManager.setBreakpoint(uiSourceCode, 42, 0, '', true);

    const modelBreakpoint = new Bindings.BreakpointManager.ModelBreakpoint(
        debuggerModel, breakpoint, breakpointManager.debuggerWorkspaceBinding);
    const mapping = createFakeScriptMapping(debuggerModel, SCRIPT_ID);
    Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().addSourceMapping(mapping);
    assert.isNull(breakpoint.currentState);
    const update = modelBreakpoint.scheduleUpdateInDebugger();
    assert.isNull(breakpoint.currentState);
    await update;
    assert.strictEqual(breakpoint.currentState?.positions[0]?.lineNumber, 13);
    Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().removeSourceMapping(mapping);
    breakpointManager.removeBreakpoint(breakpoint, true);
    Workspace.Workspace.WorkspaceImpl.instance().removeProject(project);
  });
});
