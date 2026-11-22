import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { getArtwork } from "@/server/designs";

// The artwork a saved design was made from, for its owner only.
export const Route = createFileRoute("/api/designs/$id/artwork")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const artwork = await getArtwork(env.files, user.id, params.id);
        if (!artwork) return new Response("Not found", { status: 404 });
        return new Response(artwork.body, {
          headers: {
            "content-type": artwork.type,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            // An SVG opened on its own runs nothing.
            "content-security-policy":
              "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
          },
        });
      },
    },
  },
});
