import { defineConfig } from "vitepress";

export default defineConfig({
  title: "HealthcheckWrangler",
  description: "Playwright + Lighthouse site monitoring with TimescaleDB.",
  base: "/healthcheck-wrangler/",

  head: [["link", { rel: "icon", href: "/healthcheck-wrangler/favicon.png" }]],

  markdown: {
    image: { lazyLoading: true },
  },

  themeConfig: {
    logo: "/favicon.png",

    nav: [
      { text: "Docs", link: "/guide" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        collapsed: false,
        items: [
          { text: "What is HCW?", link: "/guide" },
          { text: "Quick Start", link: "/getting-started/quick-start" },
          { text: "Configuration", link: "/getting-started/configuration" },
        ],
      },
      {
        text: "Distribution",
        collapsed: false,
        items: [
          { text: "Docker Image", link: "/distribution/docker" },
          { text: "npm Package", link: "/distribution/npm" },
        ],
      },
      {
        text: "Architecture",
        collapsed: false,
        items: [
          { text: "Overview", link: "/architecture/overview" },
          { text: "Runner", link: "/architecture/runner" },
          { text: "Dashboard", link: "/architecture/dashboard" },
          { text: "TimescaleDB", link: "/architecture/timescaledb" },
          { text: "Cloudflare Tunnel", link: "/architecture/tunnel" },
        ],
      },
      {
        text: "Dashboard UI",
        collapsed: false,
        items: [
          { text: "Overview Page", link: "/ui/overview" },
          { text: "Site Dashboard", link: "/ui/site-dashboard" },
          { text: "Logs", link: "/ui/logs" },
          { text: "Workers", link: "/ui/workers" },
          { text: "Pause & Resume", link: "/ui/pause-resume" },
          { text: "Time Range", link: "/ui/time-range" },
        ],
      },
      {
        text: "Alerting",
        collapsed: false,
        items: [
          { text: "How It Works", link: "/alerting/how-it-works" },
          { text: "Configuration", link: "/alerting/configuration" },
        ],
      },
      {
        text: "Workers Dashboard",
        collapsed: false,
        items: [
          { text: "Worker Stats", link: "/workers/stats" },
          { text: "Capacity Recommendations", link: "/workers/recommendations" },
        ],
      },
      {
        text: "Deployment",
        collapsed: false,
        items: [
          { text: "Workflow", link: "/deployment/workflow" },
          { text: "Tips", link: "/deployment/tips" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/HealthcheckWrangler/healthcheck-wrangler" },
    ],

    footer: {
      message: "Released under the MIT License.",
    },

    search: {
      provider: "local",
    },
  },
});
