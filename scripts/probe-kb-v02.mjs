import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfYWRtaW4iLCJ1c2VybmFtZSI6ImFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzg2MTU4NTE0fQ.OYXBJUBTGKyoqk0u7LB0i4TRaI3PlyHFITNJNDU7c0k";

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:4174/mcp"), {
  requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
});
const client = new Client({ name: "probe", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tool count:", tools.tools.length);
console.log("tools:", tools.tools.map(t => t.name).join(", "));

const res = await client.callTool({ name: "kb_list_tables", arguments: {} });
const txt = res.content.map(c => c.text || "").join("\n");
console.log("=== kb_list_tables (first 2500 chars) ===");
console.log(txt.slice(0, 2500));
await client.close();
