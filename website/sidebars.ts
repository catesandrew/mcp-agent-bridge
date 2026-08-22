import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    "intro",
    {
      type: "category",
      label: "Getting Started",
      items: [
        "getting-started/prerequisites",
        "getting-started/installation",
        "getting-started/quick-start",
      ],
    },
    {
      type: "category",
      label: "Guides",
      items: [
        "guides/claude-server",
        "guides/codex-server",
        "guides/copilot-server",
        "guides/cross-agent-review",
        "guides/resume-tools",
      ],
    },
    {
      type: "category",
      label: "Skills",
      items: ["skills/index", "skills/dual-review"],
    },
    {
      type: "category",
      label: "Deployment",
      items: [
        "deployment/macos",
        "deployment/windows",
        "deployment/linux",
      ],
    },
    {
      type: "category",
      label: "Configuration",
      items: [
        "configuration/environment-variables",
        "configuration/mcp-client-config",
        "configuration/ports",
      ],
    },
    {
      type: "category",
      label: "API Reference",
      items: [
        "api/claude-tools",
        "api/codex-tools",
        "api/copilot-tools",
      ],
    },
  ],
};

export default sidebars;
