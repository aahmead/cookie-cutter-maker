import { createFileRoute } from "@tanstack/react-router";

// A JSON endpoint without a page, private like every route: an uptime
// monitor reaches it with a personal access token.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true }),
    },
  },
});
