---
"@codemation/agent-skills": minor
---

feat(metadata): emit skills[] into package metadata — SkillFrontmatterParser reads YAML-frontmatter SKILL.md files and resolves @codemation/\* uses deps to concrete versions via monorepo walk (D8); PackageMetadataExtractor walks skills/ directory; all 8 agent-skills SKILL.md files updated with tags and version-sensitive uses declarations per D7
