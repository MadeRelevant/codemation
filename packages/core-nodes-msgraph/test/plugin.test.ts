import { describe, expect, it, vi } from "vitest";
import { register } from "../src/plugin";
import { DriveDownloadNode } from "../src/drive/driveDownloadNode";
import { DriveUploadNode } from "../src/drive/driveUploadNode";
import { DriveCopyNode } from "../src/drive/driveCopyNode";

describe("register", () => {
  it("registers both msgraph oauth credential types and all nodes", () => {
    const registerCredentialType = vi.fn();
    const registerNode = vi.fn();
    const registerFactory = vi.fn();
    const ctx = { registerCredentialType, registerNode, registerFactory } as unknown as Parameters<typeof register>[0];

    register(ctx);

    expect(registerCredentialType).toHaveBeenCalledTimes(2);
    //        OutlookMessagePatchNode, OutlookFolderResolveNode
    //            (DriveDownloadNode, DriveUploadNode registered via registerFactory)
    //            (DriveCopyNode registered via registerFactory)
    //            ExcelAddSheetNode, ExcelStyleRangeNode
    expect(registerNode).toHaveBeenCalledTimes(18);
    expect(registerFactory).toHaveBeenCalledTimes(3);
  });

  // Regression #1: DriveUploadNode, DriveDownloadNode, DriveCopyNode must use registerFactory
  // (not registerNode) because their interface-typed optional ctor params erase at runtime,
  // causing tsyringe to throw "TypeInfo not known" during workflow planning.
  it("registers DriveUploadNode, DriveDownloadNode, DriveCopyNode via registerFactory (not registerNode)", () => {
    const registerCredentialType = vi.fn();
    const registerNode = vi.fn();
    const registerFactory = vi.fn();
    const ctx = { registerCredentialType, registerNode, registerFactory } as unknown as Parameters<typeof register>[0];

    register(ctx);

    // Each of these three must appear in registerFactory calls
    expect(registerFactory).toHaveBeenCalledWith(DriveUploadNode, expect.any(Function));
    expect(registerFactory).toHaveBeenCalledWith(DriveDownloadNode, expect.any(Function));
    expect(registerFactory).toHaveBeenCalledWith(DriveCopyNode, expect.any(Function));

    // And must NOT appear in registerNode calls (that's the bug path)
    const registerNodeCalls = (registerNode as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(registerNodeCalls).not.toContain(DriveUploadNode);
    expect(registerNodeCalls).not.toContain(DriveDownloadNode);
    expect(registerNodeCalls).not.toContain(DriveCopyNode);
  });

  // Factory functions must produce working instances (not undefined/null)
  it("registerFactory callbacks produce DriveDownloadNode/DriveUploadNode/DriveCopyNode instances", () => {
    const factories = new Map<unknown, () => unknown>();
    const registerCredentialType = vi.fn();
    const registerNode = vi.fn();
    const registerFactory = vi.fn().mockImplementation((cls: unknown, factory: () => unknown) => {
      factories.set(cls, factory);
    });
    const ctx = { registerCredentialType, registerNode, registerFactory } as unknown as Parameters<typeof register>[0];

    register(ctx);

    expect(factories.get(DriveDownloadNode)!()).toBeInstanceOf(DriveDownloadNode);
    expect(factories.get(DriveUploadNode)!()).toBeInstanceOf(DriveUploadNode);
    expect(factories.get(DriveCopyNode)!()).toBeInstanceOf(DriveCopyNode);
  });
});
