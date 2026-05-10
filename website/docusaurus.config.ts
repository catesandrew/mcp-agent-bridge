import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "MCP Agent Bridge",
  tagline:
    "Bridge AI coding agents as MCP servers for cross-agent code review and collaboration",
  favicon: "img/favicon.ico",

  url: "https://catesandrew.github.io",
  baseUrl: "/mcp-agent-bridge/",

  organizationName: "catesandrew",
  projectName: "mcp-agent-bridge",

  onBrokenLinks: "throw",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/catesandrew/mcp-agent-bridge/tree/main/website/",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: "MCP Agent Bridge",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          href: "https://github.com/catesandrew/mcp-agent-bridge",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Getting Started", to: "/docs/getting-started/prerequisites" },
            { label: "Guides", to: "/docs/guides/claude-server" },
            { label: "API Reference", to: "/docs/api/claude-tools" },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/catesandrew/mcp-agent-bridge",
            },
            {
              label: "MCP Specification",
              href: "https://modelcontextprotocol.io",
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Andrew Cates. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "toml", "powershell", "ini"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
