/**
 * One-click discovery workflow. Use this FIRST to validate the OAuth credential
 * and learn what's actually on the connected drive — before configuring paths in
 * the other demos. No UI wiring needed; just click "Run now".
 *
 * Lists every drive the connected user has access to. DriveListMyDrives now emits
 * one item per drive, so the callback receives individual DriveInfo records and
 * formats them for display.
 */
import { Callback, ManualTrigger, createWorkflowBuilder } from "@codemation/core-nodes";
import { driveListMyDrivesNode, type DriveInfo } from "../../src/index";

type DriveSummary = Readonly<{
  driveId: string;
  driveType: string;
  name: string;
  owner?: string;
  webUrl?: string;
}>;

export default createWorkflowBuilder({
  id: "wf.msgraph.drive.discover",
  name: "MS Graph — Discover drives (start here)",
})
  .trigger(new ManualTrigger("Manual trigger", { message: "Discover drives" }, "msgraph_drive_discover_trigger"))
  .then(driveListMyDrivesNode.create({}, "List my drives", "msgraph_drive_list_my_drives"))
  .then(
    new Callback<DriveInfo, DriveSummary>("Summarize drives", (items) =>
      items.map((item) => ({
        json: {
          driveId: item.json.driveId,
          driveType: item.json.driveType,
          name: item.json.name,
          owner: item.json.owner?.email ?? item.json.owner?.displayName,
          webUrl: item.json.webUrl,
        } satisfies DriveSummary,
      })),
    ),
  )
  .build();
