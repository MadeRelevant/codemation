import type { WorkflowWebsocketMessage } from "../contracts/WorkflowWebsocketMessage";

export interface WorkflowWebsocketPublisher {
  publishToRoom(roomId: string, message: WorkflowWebsocketMessage): Promise<void>;
}
