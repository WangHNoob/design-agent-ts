import { serve } from "@hono/node-server";
import { bootstrap } from "./bootstrap.js";

const port = Number(process.env.PORT ?? 3000);

bootstrap().then(({ app }) => {
  serve({
    fetch: app.fetch,
    port,
  });
  console.log(`Server is running on http://localhost:${port}`);
}).catch((err) => {
  console.error("Failed to bootstrap:", err);
  process.exit(1);
});
