/**
 * Shared {@link import("../di").TypeToken} marker for {@link CallableToolConfig}.
 * Callable tools are not registered in {@link NodeResolver}; this class only satisfies {@link ToolConfig#type}.
 */
export class CallableToolKindToken {}
