/**
 * figma-pi-mcp — pi extension
 *
 * Bridges the Figma desktop app's local MCP server into pi as native tools.
 * Requires Figma desktop open with Dev Mode → Inspect panel → MCP server enabled.
 *
 * Server: http://127.0.0.1:3845/mcp (local only, no auth)
 * Tools are discovered dynamically from the server on session start.
 * Commands: /figma-mcp — show connection status and available tools
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type TSchema } from "@sinclair/typebox";

const MCP_URL = `http://127.0.0.1:${process.env.FIGMA_MCP_PORT ?? "3845"}/mcp`;
const MAX_OUTPUT_BYTES = 50 * 1024;

// ## State

let sessionId: string | undefined;
let requestId = 1;
let connected = false;
let availableTools: Array<{ name: string; description: string }> = [];

// ## MCP HTTP client

async function mcpPost(
  method: string,
  params?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<unknown> {
  const id = requestId++;
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal,
  });

  const newSid = response.headers.get("mcp-session-id");
  if (newSid) sessionId = newSid;

  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  let json: { result?: unknown; error?: { message: string } };

  if (contentType.includes("text/event-stream")) {
    // Parse SSE — find the first data line with our response
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
    if (!dataLine) throw new Error("No data in SSE response");
    json = JSON.parse(dataLine.slice(6));
  } else {
    json = JSON.parse(text);
  }

  if (json.error) throw new Error(json.error.message);
  return json.result;
}

// ## Initialize MCP session

async function initialize(signal?: AbortSignal): Promise<boolean> {
  try {
    sessionId = undefined;
    await mcpPost(
      "initialize",
      { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "pi", version: "1.0" } },
      signal
    );
    return true;
  } catch {
    return false;
  }
}

// ## Tool discovery and invocation

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, { type: string; description?: string; enum?: string[]; items?: unknown; default?: unknown }>;
    required?: string[];
  };
}

interface McpContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
}

async function listTools(signal?: AbortSignal): Promise<McpTool[]> {
  const result = await mcpPost("tools/list", undefined, signal) as { tools: McpTool[] };
  return result.tools ?? [];
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<McpToolResult> {
  return await mcpPost("tools/call", { name, arguments: args }, signal) as McpToolResult;
}

// ## Content conversion

function truncate(text: string): string {
  if (Buffer.byteLength(text, "utf8") <= MAX_OUTPUT_BYTES) return text;
  return (
    Buffer.from(text, "utf8").slice(0, MAX_OUTPUT_BYTES).toString("utf8") +
    "\n\n[Output truncated — use a more specific nodeId or break the design into smaller sections.]"
  );
}

function convertContent(mcpContent: McpContent[]): Array<
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }
> {
  const out: ReturnType<typeof convertContent> = [];
  for (const c of mcpContent) {
    if (c.type === "text" && c.text) {
      out.push({ type: "text", text: truncate(c.text) });
    } else if (c.type === "image" && c.data && c.mimeType) {
      out.push({ type: "image", mimeType: c.mimeType, data: c.data });
    } else if (c.type === "resource" && c.uri) {
      out.push({ type: "text", text: `[Resource: ${c.uri}]` });
    }
  }
  return out;
}

// ## Schema builder

function buildSchema(inputSchema: McpTool["inputSchema"]): TSchema {
  const props = inputSchema.properties ?? {};
  const required = new Set(inputSchema.required ?? []);
  const fields: Record<string, TSchema> = {};

  for (const [key, prop] of Object.entries(props)) {
    let schema: TSchema;

    if (prop.enum) {
      schema = Type.Union(prop.enum.map((v) => Type.Literal(v)));
    } else if (prop.type === "boolean") {
      schema = Type.Boolean();
    } else if (prop.type === "number" || prop.type === "integer") {
      schema = Type.Number();
    } else if (prop.type === "array") {
      schema = Type.Array(Type.Any());
    } else {
      schema = Type.String();
    }

    const description = prop.description ?? "";
    const withDesc = description ? { ...schema, description } : schema;
    fields[key] = required.has(key) ? withDesc : Type.Optional(withDesc);
  }

  return Type.Object(fields);
}

// ## Tool registration

function formatLabel(name: string): string {
  return name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function registerMcpTools(pi: ExtensionAPI, tools: McpTool[]) {
  availableTools = tools.map((t) => ({ name: t.name, description: t.description }));

  for (const tool of tools) {
    const schema = buildSchema(tool.inputSchema);

    pi.registerTool({
      name: tool.name,
      label: formatLabel(tool.name),
      description: tool.description,
      parameters: schema,

      async execute(_id, params, signal) {
        if (!sessionId) {
          const ok = await initialize(signal);
          if (!ok) {
            return {
              content: [{ type: "text", text: "Figma MCP server is not reachable. Make sure the Figma desktop app is open and the MCP server is enabled in Dev Mode (Inspect panel → MCP server → Enable desktop MCP server)." }],
              isError: true,
            };
          }
        }

        try {
          const result = await callTool(tool.name, params as Record<string, unknown>, signal);
          return {
            content: convertContent(result.content),
            isError: result.isError ?? false,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("404") || msg.includes("session")) sessionId = undefined;
          return {
            content: [{ type: "text", text: `Figma MCP error: ${msg}` }],
            isError: true,
          };
        }
      },
    });
  }
}

// ## Extension

export default function (pi: ExtensionAPI) {

  pi.on("session_start", async (_event, ctx) => {
    // Fire-and-forget — don't block startup when Figma is closed
    (async () => {
      const signal = AbortSignal.timeout(3000);
      const ok = await initialize(signal);
      if (!ok) {
        connected = false;
        ctx.ui.setStatus("figma", "figma ✗");
        return;
      }
      try {
        const tools = await listTools(signal);
        connected = true;
        ctx.ui.setStatus("figma", "figma ✓");
        registerMcpTools(pi, tools);
      } catch {
        connected = false;
        ctx.ui.setStatus("figma", "figma ✗");
      }
    })();
  });

  pi.on("before_agent_start", async (event) => {
    if (!connected) return;
    return {
      systemPrompt:
        event.systemPrompt +
        `

## Figma MCP Server

You have a live connection to the Figma desktop app via the local MCP server.

Use these tools for **design inspection and code generation** (Dev Mode, read-only). To manipulate the canvas — create, update, or delete nodes — use the \`figma_*\` tools (figma-pi) instead.

**nodeId format:** Use \`123:456\` or \`123-456\`. Extract from Figma URLs: \`?node-id=1-2\` → \`1:2\`. If no nodeId is given, the tool uses whatever is currently selected in Figma.

**Design-to-code workflow:** call \`get_screenshot\` first for visual reference, then \`get_design_context\` for layout and structure. If the response is too large, use \`get_metadata\` to get an overview, then \`get_design_context\` on specific child nodes.
`,
    };
  });

  pi.registerCommand("figma-mcp", {
    description: "Show Figma MCP server connection status and available tools",
    handler: async (_args, ctx) => {
      if (!connected) {
        ctx.ui.notify(
          "Figma MCP server is not connected.\n\nTo enable:\n1. Open Figma desktop app\n2. Open a Design file\n3. Switch to Dev Mode (Shift+D)\n4. In the Inspect panel → MCP server → Enable desktop MCP server",
          "error"
        );
        return;
      }
      ctx.ui.notify(
        `Figma MCP server connected ✓\n\nAvailable tools (${availableTools.length}):\n${availableTools.map((t) => `  • ${t.name}`).join("\n")}`,
        "success"
      );
    },
  });
}
