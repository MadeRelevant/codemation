import { inject, injectable } from "@codemation/core";
import type { McpServerDeclaration } from "@codemation/core";
import type { AppGalleryEntry, AppsResponse, CredentialInstanceDto } from "../contracts/CredentialContractsRegistry";
import { CredentialTypeRegistryImpl } from "../../domain/credentials/CredentialServices";

/**
 * Produces gallery-ready DTOs by joining MCP server declarations × credential
 * type registry × workspace credential instances.
 *
 * D2 rule: an instance belongs under a tile when its typeId is in
 * mcp.acceptedCredentialTypes. Instances with no MCP home land in customInstances.
 * An instance can appear under multiple tiles if more than one MCP accepts its type.
 *
 * D4 rule: primaryOAuthTypeId = first acceptedCredentialType whose
 * CredentialTypeDefinition.auth.kind === "oauth2". null when none found.
 *
 * D5 rule: when mcpServers is null (unpaired), apps is [] and all instances are custom.
 */
@injectable()
export class AppGalleryProjector {
  constructor(
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
  ) {}

  project(
    mcpServers: ReadonlyArray<McpServerDeclaration> | null,
    instances: ReadonlyArray<CredentialInstanceDto>,
  ): AppsResponse {
    if (mcpServers === null) {
      return { apps: [], customInstances: [...instances] };
    }

    const mcpInstancedSetIds = new Set<string>();

    const apps: AppGalleryEntry[] = mcpServers.map((mcp) => {
      const accepted = mcp.acceptedCredentialTypes ?? [];
      const acceptedSet = new Set(accepted);
      const mcpInstances = instances.filter((i) => acceptedSet.has(i.typeId));
      for (const i of mcpInstances) {
        mcpInstancedSetIds.add(i.instanceId);
      }
      const primaryOAuthTypeId = this.findPrimaryOAuthTypeId(accepted);
      return {
        mcpId: mcp.id,
        displayName: mcp.displayName,
        description: mcp.description,
        iconUrl: null,
        acceptedCredentialTypes: [...accepted],
        primaryOAuthTypeId,
        instances: mcpInstances,
      };
    });

    const customInstances = instances.filter((i) => !mcpInstancedSetIds.has(i.instanceId));

    return { apps, customInstances };
  }

  private findPrimaryOAuthTypeId(acceptedTypes: ReadonlyArray<string>): string | null {
    for (const typeId of acceptedTypes) {
      const credType = this.credentialTypeRegistry.getCredentialType(typeId);
      if (credType?.definition.auth?.kind === "oauth2") {
        return typeId;
      }
    }
    return null;
  }
}
