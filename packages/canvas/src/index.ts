// Public surface — filled in as phases complete
export type { WorkflowDetailChromeState } from "./types/WorkflowDetailChromeState";
export type {
  WorkflowCanvasApiClient,
  RunWorkflowMode,
  RunWorkflowResult,
  RunWorkflowRequest,
} from "./types/WorkflowCanvasApiClient";
export type {
  WorkflowCanvasConfig,
  WorkflowCanvasRenderers,
  WorkflowCanvasIconRegistry,
  WorkflowCanvasNodeRendererProps,
  NodeCredentialBindingsSlotProps,
} from "./types/WorkflowCanvasConfig";
export type { WorkflowCanvasTheme } from "./types/WorkflowCanvasTheme";
export type { NavigationAdapter } from "./types/NavigationAdapter";

// Realtime domain types (moved from packages/next-host in Phase 2)
export * from "./realtime/realtimeDomainTypes";

// Phase 3: Realtime infrastructure
export * from "./realtime/PageVisibilityIdleTimer";
export * from "./realtime/RunRoomSubscriptionTracker";
export * from "./realtime/WorkflowQueryRetryPolicy";
export * from "./realtime/realtimeClientBridge";
export * from "./realtime/realtimeQueryKeys";
export * from "./realtime/realtimeRunMutations";
export * from "./realtime/realtimeTelemetryMutations";
export * from "./realtime/realtimeTestSuiteMutations";
export * from "./realtime/workflowTypes";

// Phase 3: WorkflowDetail lib
export * from "./lib/workflowDetail/workflowDetailTypes";
export * from "./lib/workflowDetail/WorkflowDetailUrlCodec";
export * from "./lib/workflowDetail/WorkflowDetailPresenter";
export * from "./lib/workflowDetail/WorkflowActivationHttpErrorFormat";
export * from "./lib/workflowDetail/WorkflowExecutionTreeBuilder";
export * from "./lib/workflowDetail/WorkflowExecutionTreeDataLoaderAdapter";
export * from "./lib/workflowDetail/ExecutionTreeItemGroupInjector";
export * from "./lib/workflowDetail/FocusedInvocationModelFactory";
export * from "./lib/workflowDetail/NodeInspectorTelemetryPresenter";
export * from "./lib/workflowDetail/PersistedWorkflowSnapshotMapper";
export * from "./lib/workflowDetailTreeStyles";

// Phase 3: Lib utilities
export * from "./lib/CodemationApiHttpError";
export * from "./lib/HumanFriendlyTimestampFormatter";

// Phase 3: Realtime components
export * from "./components/realtime/RealtimeContext";
export * from "./components/realtime/WorkflowRealtimeProvider";

// Phase 3: Realtime hooks
export * from "./hooks/realtime/realtime";
export * from "./hooks/realtime/runQueryPolling";
export * from "./hooks/realtime/testSuiteHooks";
export * from "./hooks/realtime/useTelemetryRunTraceQuery";
export { useWorkflowRealtimeInfrastructure } from "./hooks/realtime/useWorkflowRealtimeInfrastructure";
export * from "./hooks/realtime/useWorkflowRealtimeShowDisconnectedBadge";
export * from "./hooks/realtime/userAccountMutations";

// Phase 3: WorkflowDetail hooks
export * from "./hooks/workflowDetail/useExecutionTreeAutoFollow";
export * from "./hooks/workflowDetail/useWorkflowDetailController";

// Phase 3: Plain hooks
export * from "./hooks/useLastRunTrigger";
export * from "./hooks/useSelectedAssertionMetrics";
export * from "./hooks/useWorkflowCanvasRunButton";

// Phase 3: Context
export { WorkflowCanvasApiClientProvider, useWorkflowCanvasApiClient } from "./context/WorkflowCanvasApiClientContext";
export { WorkflowCanvasConfigProvider, useWorkflowCanvasConfig } from "./context/WorkflowCanvasConfigContext";

// Canvas lib utilities
export * from "./canvas/lib/workflowCanvasEdgeGeometry";
export * from "./canvas/lib/workflowCanvasEmbeddedStyles";
export * from "./canvas/lib/workflowCanvasFlowTypes";
export * from "./canvas/lib/workflowCanvasNodeData";
export * from "./canvas/lib/workflowCanvasNodeGeometry";
export * from "./canvas/lib/WorkflowCanvasBuiltinIconRegistry";
export * from "./canvas/lib/WorkflowCanvasEdgeCountResolver";
export * from "./canvas/lib/WorkflowCanvasEdgeStyleResolver";
export * from "./canvas/lib/WorkflowCanvasLabelLayoutEstimator";
export * from "./canvas/lib/WorkflowCanvasLucideIconRegistry";
export * from "./canvas/lib/WorkflowCanvasPortOrderResolver";
export * from "./canvas/lib/WorkflowCanvasRoundedOrthogonalPathPlanner";
export * from "./canvas/lib/WorkflowCanvasSiIconRegistry";
export * from "./canvas/lib/WorkflowCanvasSymmetricForkPathPlanner";
export * from "./canvas/lib/layoutWorkflow";
export * from "./canvas/lib/elk/ElkLayoutRunner";
export * from "./canvas/lib/elk/WorkflowElkGraphBuilder";
export * from "./canvas/lib/elk/WorkflowElkNodeSizingResolver";
export * from "./canvas/lib/elk/WorkflowElkPortInfoResolver";
export * from "./canvas/lib/elk/WorkflowElkResultMapper";

// Canvas components
export * from "./canvas/CanvasNodeChromeTooltip";
export * from "./canvas/CanvasNodeIconSlot";
export * from "./canvas/VisibleNodeStatusResolver";
export * from "./canvas/WorkflowCanvas";
export * from "./canvas/WorkflowCanvasCodemationNode";
export * from "./canvas/WorkflowCanvasCodemationNodeAccents";
export * from "./canvas/WorkflowCanvasCodemationNodeAgentBottomSourceHandles";
export * from "./canvas/WorkflowCanvasCodemationNodeAgentLabels";
export * from "./canvas/WorkflowCanvasCodemationNodeCard";
export * from "./canvas/WorkflowCanvasCodemationNodeHandles";
export * from "./canvas/WorkflowCanvasCodemationNodeLabelBelow";
export * from "./canvas/WorkflowCanvasCodemationNodeMainGlyph";
export * from "./canvas/WorkflowCanvasCodemationNodeToolbar";
export * from "./canvas/WorkflowCanvasLoadingPlaceholder";
export * from "./canvas/WorkflowCanvasLucideRemoteGlyph";
export * from "./canvas/WorkflowCanvasNodeIcon";
export * from "./canvas/WorkflowCanvasSimpleIconGlyph";
export * from "./canvas/WorkflowCanvasStraightCountEdge";
export * from "./canvas/WorkflowCanvasStructureSignature";
export * from "./canvas/WorkflowCanvasSymmetricForkEdge";
export * from "./canvas/WorkflowCanvasToolbarIconButton";
export * from "./canvas/workflowCanvasNodeChrome";

// Canvas hooks
export * from "./hooks/canvas/useAsyncWorkflowLayout";
export * from "./hooks/canvas/useWorkflowCanvasVisibleNodeStatuses";

// Phase 4: Panels
export * from "./panels/NodeCredentialBindingRow";
export * from "./panels/NodeCredentialBindingsSection";
export * from "./panels/NodeInspectorSummaryRow";
export * from "./panels/NodeInspectorSummarySection";
export * from "./panels/NodePropertiesConfigSection";
export * from "./panels/NodePropertiesDescriptionSection";
export * from "./panels/NodePropertiesPanelHeader";
export * from "./panels/NodePropertiesSectionNavigationButtons";
export * from "./panels/NodePropertiesSectionRenderer";
export * from "./panels/NodePropertiesSlidePanel";
export * from "./panels/NodePropertiesTimelineRenderer";
export * from "./panels/WorkflowActivationErrorDialog";
export * from "./panels/WorkflowActivationHeaderControl";
export * from "./panels/WorkflowCanvasRunButton";
export * from "./panels/WorkflowDetailIcons";
export * from "./panels/WorkflowExecutionInspector";
export * from "./panels/WorkflowExecutionInspectorDetailBody";
export * from "./panels/WorkflowExecutionInspectorPanes";
export * from "./panels/WorkflowExecutionInspectorSidebarResizer";
export * from "./panels/WorkflowExecutionInspectorTreePanel";
export * from "./panels/WorkflowExecutionInspectorTreePanelContent";
export * from "./panels/WorkflowInspectorAttachmentGroupingPresenter";
export * from "./panels/WorkflowInspectorAttachmentList";
export * from "./panels/WorkflowInspectorBinaryView";
export * from "./panels/WorkflowInspectorErrorView";
export * from "./panels/WorkflowInspectorJsonView";
export * from "./panels/WorkflowInspectorPrettyTreePresenter";
export * from "./panels/WorkflowInspectorPrettyTreeViewRenderer";
export * from "./panels/WorkflowInspectorPrettyView";
export * from "./panels/WorkflowInspectorViews";
export * from "./panels/WorkflowJsonEditorBinaryAttachmentRow";
export * from "./panels/WorkflowJsonEditorBinaryUploadRow";
export * from "./panels/WorkflowJsonEditorDialog";
export * from "./panels/WorkflowRunsList";
export * from "./panels/WorkflowRunsSidebar";
export * from "./panels/tryAutoBindUnboundWorkflowSlot";
export * from "./panels/tests/ExpandableJsonValue";
export * from "./panels/tests/MetricSelector";
export * from "./panels/tests/TestAssertionRow";
export * from "./panels/tests/TestAssertionsList";
export * from "./panels/tests/TestSuiteCaseFilter";
export * from "./panels/tests/TestSuiteCaseFilterStrip";
export * from "./panels/tests/TestSuiteCaseRow";
export * from "./panels/tests/TestSuiteCaseStatusIcon";
export * from "./panels/tests/TestSuitePassRateChart";
export * from "./panels/tests/TestSuiteRunDeltaBadge";
export * from "./panels/tests/TestSuiteRunDetailPanel";
export * from "./panels/tests/TestSuiteRunDetailTreeTable";
export * from "./panels/tests/TestSuiteRunMetricRow";
export * from "./panels/tests/TestSuiteRunMetricsComparison";
export * from "./panels/tests/TestSuiteRunStatusBadge";
export * from "./panels/tests/TestSuiteRunsList";
export * from "./panels/tests/TestsPanel";

// Phase 4: Screens
export { WorkflowDetailScreen } from "./screens/WorkflowDetailScreen";
export type { WorkflowDetailScreenArgs } from "./screens/WorkflowDetailScreen";
export * from "./screens/WorkflowDetailScreenCanvasTabs";
export * from "./screens/WorkflowDetailScreenInspectorPanel";
export * from "./screens/workflowDetailScreenRealtimeBadge";
