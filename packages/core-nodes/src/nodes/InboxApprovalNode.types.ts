import { z } from "zod";
import { defineHumanApprovalNode } from "@codemation/core";
import type { JsonValue } from "@codemation/core";
import { InboxChannelResolverToken } from "@codemation/core";

/**
 * Renders a simple string template, replacing `${item.json.<key>}` placeholders.
 */
function renderTemplate(template: string, vars: { item: { json: unknown } }): string {
  const json = vars.item.json as Record<string, unknown>;
  return template.replace(/\$\{item\.json\.([^}]+)\}/g, (_match, key: string) => {
    const val = json[key];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

/**
 * Auto-detecting inbox approval node.
 *
 * Uses `ctx.resolve(InboxChannelResolverToken)` to pick the right inbox channel
 * at runtime:
 * - In managed mode (PairingConfig present): routes to the control-plane inbox.
 * - Otherwise: routes to the local inbox.
 *
 * Authors use this node directly; no extra wiring needed per deployment mode.
 */
export const inboxApproval = defineHumanApprovalNode({
  key: "inbox.approval",
  title: "Inbox Approval",
  description: "Suspend and wait for a human reviewer to approve or reject.",
  icon: "lucide:inbox",
  channel: "inbox",

  configSchema: z.object({
    title: z.string(),
    body: z.string(),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    timeout: z.string().default("24h"),
    onTimeout: z.enum(["halt", "auto-accept"]).default("halt"),
  }),
  decisionSchema: z.object({
    approved: z.boolean(),
    note: z.string().optional(),
  }),
  defaultTimeout: "24h",
  defaultOnTimeout: "halt",

  async deliver({ task, config, item }, ctx) {
    const resolver = ctx.resolve(InboxChannelResolverToken);
    if (!resolver) {
      throw new Error("inboxApproval: no InboxChannelResolver registered. Ensure the host DI container is wired.");
    }
    const { channel, workspaceId } = resolver.resolve();
    const subject = {
      title: renderTemplate(config.title, { item }),
      summary: renderTemplate(config.body, { item }),
      attributes: { workflowId: ctx.workflowId, item: item.json as JsonValue },
    };
    const delivery = await channel.deliver({
      task,
      subject,
      priority: config.priority,
      item,
      workspaceId,
    });
    ctx.telemetry.addSpanEvent({
      name: "hitl.task.delivered",
      attributes: { taskId: task.taskId, channel: channel.kind },
    });
    return delivery;
  },

  async onDecision({ decision, actor, delivery }, ctx) {
    const resolver = ctx.resolve(InboxChannelResolverToken);
    if (!resolver) return;
    const { channel } = resolver.resolve();
    await channel.updateOnDecision?.({ delivery, decision, actor });
  },

  async onTimeout({ delivery, policy }, ctx) {
    const resolver = ctx.resolve(InboxChannelResolverToken);
    if (!resolver) return;
    const { channel } = resolver.resolve();
    await channel.updateOnTimeout?.({ delivery, policy });
  },
});
