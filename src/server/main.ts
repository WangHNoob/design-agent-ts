import { serve } from "@hono/node-server";
import { bootstrap } from "./bootstrap.js";

const { app } = bootstrap();

const port = Number(process.env.PORT ?? 3000);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server is running on http://localhost:${port}`);
