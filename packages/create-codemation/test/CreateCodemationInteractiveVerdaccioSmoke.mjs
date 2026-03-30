process.env.CODEMATION_SMOKE_INSTALL_MODE = "registry";
process.env.CODEMATION_SMOKE_TEMPLATE_ID = "default";
process.env.CODEMATION_SMOKE_INTERACTIVE_ONBOARDING = "true";

await import("./CreateCodemationSmoke.mjs");
