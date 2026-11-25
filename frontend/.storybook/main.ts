import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  staticDirs: [],
  core: { disableTelemetry: true },
};
export default config;
