// Headless re-exports from canvas-core (compat shim — keeps existing consumers working)
export * from "@codemation/canvas-core";

// Phase 3: Realtime components (UI — stays in canvas)
export * from "./components/realtime/WorkflowRealtimeProvider";

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

// Canvas lib (stays in canvas — imports canvas-ui components)
export * from "./canvas/lib/workflowCanvasFlowTypes";

// Canvas hooks (stays in canvas — depends on canvas-ui VisibleNodeStatusResolver)
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
