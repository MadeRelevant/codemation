/**
 * Validates a `dist/metadata.json` against the PackageMetadata schema.
 * Returns `{ valid: boolean; errors: string[] }` — callers check errors for details.
 */
export class PackageMetadataValidator {
  validate(metadata: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      return { valid: false, errors: ["metadata must be a non-null object"] };
    }

    const m = metadata as Record<string, unknown>;

    if (m["schemaVersion"] !== 1) {
      errors.push(`schemaVersion must be 1, got ${JSON.stringify(m["schemaVersion"])}`);
    }
    if (typeof m["packageName"] !== "string" || !m["packageName"]) {
      errors.push("packageName must be a non-empty string");
    }
    if (typeof m["packageVersion"] !== "string" || !m["packageVersion"]) {
      errors.push("packageVersion must be a non-empty string");
    }
    if (typeof m["description"] !== "string") {
      errors.push("description must be a string");
    }
    if (!["nodes", "examples", "skills", "mixed"].includes(m["kind"] as string)) {
      errors.push(`kind must be "nodes", "examples", "skills", or "mixed", got ${JSON.stringify(m["kind"])}`);
    }

    if (m["nodes"] !== undefined) {
      if (!Array.isArray(m["nodes"])) {
        errors.push("nodes must be an array");
      } else {
        for (const [i, node] of (m["nodes"] as unknown[]).entries()) {
          errors.push(...this.validateNode(node, `nodes[${i}]`));
        }
      }
    }

    if (m["credentials"] !== undefined) {
      if (!Array.isArray(m["credentials"])) {
        errors.push("credentials must be an array");
      } else {
        for (const [i, cred] of (m["credentials"] as unknown[]).entries()) {
          errors.push(...this.validateCredential(cred, `credentials[${i}]`));
        }
      }
    }

    if (m["examples"] !== undefined) {
      if (!Array.isArray(m["examples"])) {
        errors.push("examples must be an array");
      } else {
        for (const [i, ex] of (m["examples"] as unknown[]).entries()) {
          errors.push(...this.validateExample(ex, `examples[${i}]`));
        }
      }
    }

    if (m["skills"] !== undefined) {
      if (!Array.isArray(m["skills"])) {
        errors.push("skills must be an array");
      } else {
        for (const [i, skill] of (m["skills"] as unknown[]).entries()) {
          errors.push(...this.validateSkill(skill, `skills[${i}]`));
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private validateNode(node: unknown, prefix: string): string[] {
    const errors: string[] = [];
    if (typeof node !== "object" || node === null) {
      return [`${prefix} must be an object`];
    }
    const n = node as Record<string, unknown>;
    if (typeof n["name"] !== "string" || !n["name"]) errors.push(`${prefix}.name must be a non-empty string`);
    if (!["node", "trigger"].includes(n["kind"] as string)) {
      errors.push(`${prefix}.kind must be "node" or "trigger"`);
    }
    if (typeof n["description"] !== "string") errors.push(`${prefix}.description must be a string`);
    if (!Array.isArray(n["inputPorts"])) errors.push(`${prefix}.inputPorts must be an array`);
    if (!Array.isArray(n["outputPorts"])) errors.push(`${prefix}.outputPorts must be an array`);
    if (typeof n["sourcePath"] !== "string" || !n["sourcePath"]) {
      errors.push(`${prefix}.sourcePath must be a non-empty string`);
    }
    return errors;
  }

  private validateCredential(cred: unknown, prefix: string): string[] {
    const errors: string[] = [];
    if (typeof cred !== "object" || cred === null) {
      return [`${prefix} must be an object`];
    }
    const c = cred as Record<string, unknown>;
    if (typeof c["name"] !== "string" || !c["name"]) errors.push(`${prefix}.name must be a non-empty string`);
    if (typeof c["description"] !== "string") errors.push(`${prefix}.description must be a string`);
    if (!Array.isArray(c["fields"])) {
      errors.push(`${prefix}.fields must be an array`);
    } else {
      for (const [i, field] of (c["fields"] as unknown[]).entries()) {
        if (typeof field !== "object" || field === null) {
          errors.push(`${prefix}.fields[${i}] must be an object`);
          continue;
        }
        const f = field as Record<string, unknown>;
        if (typeof f["key"] !== "string") errors.push(`${prefix}.fields[${i}].key must be a string`);
        if (typeof f["type"] !== "string") errors.push(`${prefix}.fields[${i}].type must be a string`);
        if (typeof f["required"] !== "boolean") errors.push(`${prefix}.fields[${i}].required must be a boolean`);
      }
    }
    return errors;
  }

  private validateSkill(skill: unknown, prefix: string): string[] {
    const errors: string[] = [];
    if (typeof skill !== "object" || skill === null) {
      return [`${prefix} must be an object`];
    }
    const s = skill as Record<string, unknown>;
    if (typeof s["name"] !== "string" || !s["name"]) errors.push(`${prefix}.name must be a non-empty string`);
    if (typeof s["description"] !== "string") errors.push(`${prefix}.description must be a string`);
    if (!Array.isArray(s["tags"])) errors.push(`${prefix}.tags must be an array`);
    if (typeof s["sourcePath"] !== "string" || !s["sourcePath"]) {
      errors.push(`${prefix}.sourcePath must be a non-empty string`);
    }
    if (typeof s["dependencies"] !== "object" || s["dependencies"] === null || Array.isArray(s["dependencies"])) {
      errors.push(`${prefix}.dependencies must be an object`);
    }
    if (typeof s["code"] !== "string") errors.push(`${prefix}.code must be a string`);
    return errors;
  }

  private validateExample(ex: unknown, prefix: string): string[] {
    const errors: string[] = [];
    if (typeof ex !== "object" || ex === null) {
      return [`${prefix} must be an object`];
    }
    const e = ex as Record<string, unknown>;
    if (typeof e["name"] !== "string" || !e["name"]) errors.push(`${prefix}.name must be a non-empty string`);
    if (typeof e["description"] !== "string") errors.push(`${prefix}.description must be a string`);
    if (!Array.isArray(e["tags"])) errors.push(`${prefix}.tags must be an array`);
    if (typeof e["sourcePath"] !== "string" || !e["sourcePath"]) {
      errors.push(`${prefix}.sourcePath must be a non-empty string`);
    }
    if (typeof e["dependencies"] !== "object" || e["dependencies"] === null || Array.isArray(e["dependencies"])) {
      errors.push(`${prefix}.dependencies must be an object`);
    }
    if (typeof e["code"] !== "string") errors.push(`${prefix}.code must be a string`);
    return errors;
  }
}
