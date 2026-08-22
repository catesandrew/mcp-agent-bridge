import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "MCP Agent Bridge",
  tagline:
    "Stop copy-pasting diffs between agent tabs. Get a second opinion without leaving your editor.",
  favicon: "img/favicon.ico",

  url: "https://mcp-agent-bridge.catesworks.dev",
  baseUrl: "/",

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
          to: "/docs/skills",
          position: "left",
          label: "Skills Catalog",
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
