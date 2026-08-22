import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";

import styles from "./index.module.css";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started/prerequisites"
          >
            Get Started
          </Link>
          <Link
            className="button button--secondary button--outline button--lg"
            to="/docs/intro"
          >
            Learn More
          </Link>
        </div>
      </div>
    </header>
  );
}

const features = [
  {
    emoji: "🔍",
    title: "Second Opinions, No Tab-Switching",
    description:
      "Get a second opinion from a different AI without leaving your editor. Send diffs to Claude for structured review, ask Codex for analysis, or consult Copilot -- from inside the session you're already in.",
  },
  {
    emoji: "🔗",
    title: "Unified MCP Interface",
    description:
      "Expose Claude, Codex, and Copilot as standard MCP servers. Any MCP client can call any agent using the same protocol.",
  },
  {
    emoji: "⚡",
    title: "Singleton Background Services",
    description:
      "Each agent runs as a single background process behind an HTTP proxy. Multiple clients share one instance -- no cold starts.",
  },
  {
    emoji: "🖥️",
    title: "Cross-Platform",
    description:
      "Standalone binaries for macOS, Linux, and Windows. LaunchAgents, systemd units, or Windows Services -- your choice.",
  },
  {
    emoji: "🔒",
    title: "Secure by Default",
    description:
      "Read-only tool allowlist, localhost-only binding, input size limits, process timeouts, and working directory validation.",
  },
  {
    emoji: "📋",
    title: "Structured Output",
    description:
      "Reviews return typed JSON with verdict, issues by severity, and actionable suggestions. Parse results programmatically.",
  },
];

function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <ul className={styles.featureList}>
          {features.map(({ emoji, title, description }) => (
            <li key={title} className={styles.featureCard}>
              <div className={styles.featureEmoji}>{emoji}</div>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
