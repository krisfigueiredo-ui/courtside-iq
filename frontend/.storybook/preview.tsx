import "../app/globals.css";
import "./fonts.css";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { Preview } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const preview: Preview = {
  globalTypes: {
    theme: { description: "Theme", toolbar: { title: "Theme", items: ["dark", "light"], dynamicTitle: true } },
  },
  initialGlobals: { theme: "dark" },
  parameters: { layout: "padded", controls: { expanded: true }, backgrounds: { disable: true } },
  decorators: [
    (Story, ctx) => {
      if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", ctx.globals.theme ?? "dark");
      return (
        <QueryClientProvider client={client}>
          <TooltipPrimitive.Provider delayDuration={150}>
            <div className="font-sans" style={{ background: "rgb(var(--c-canvas))", padding: 16, minHeight: "100vh" }}>
              <Story />
            </div>
          </TooltipPrimitive.Provider>
        </QueryClientProvider>
      );
    },
  ],
};
export default preview;
