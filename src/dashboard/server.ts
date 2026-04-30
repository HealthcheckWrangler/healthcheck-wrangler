import { createServer, request as httpRequest } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RUNNER_API_URL = process.env.RUNNER_API_URL ?? "http://localhost:8080";
const PORT = Number(process.env.DASHBOARD_PORT ?? 3001);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".webp": "image/webp",
};

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// Resolve to project root then into the Vite build output
const PROJECT_ROOT = resolve(__dirname, "../../..");
const STATIC_DIR = process.env.STATIC_DIR ?? join(PROJECT_ROOT, "src/dashboard/ui/dist");

const runnerUrl = new URL(RUNNER_API_URL);

function proxyToRunner(path: string, clientReq: import("node:http").IncomingMessage, clientRes: import("node:http").ServerResponse): void {
  const options = {
    hostname: runnerUrl.hostname,
    port: Number(runnerUrl.port) || 80,
    path,
    method: clientReq.method,
    headers: { ...clientReq.headers, host: runnerUrl.host },
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    const isSSE = proxyRes.headers["content-type"]?.includes("text/event-stream");
    clientRes.writeHead(proxyRes.statusCode ?? 200, {
      ...proxyRes.headers,
      "Access-Control-Allow-Origin": "*",
      // Prevent buffering for SSE
      ...(isSSE ? { "X-Accel-Buffering": "no" } : {}),
    });
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on("error", (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "application/json" });
      clientRes.end(JSON.stringify({ error: "runner unavailable", detail: err.message }));
    }
  });

  clientReq.pipe(proxyReq, { end: true });
}

function serveStatic(filePath: string, res: import("node:http").ServerResponse): void {
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const stat = statSync(filePath);
  if (stat.isDirectory()) {
    serveStatic(join(filePath, "index.html"), res);
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  const url = req.url ?? "/";

  // Proxy all /api/* to runner
  if (url.startsWith("/api/")) {
    proxyToRunner(url, req, res);
    return;
  }

  // Serve static assets; fall back to index.html for SPA routing
  const filePath = join(STATIC_DIR, url === "/" ? "index.html" : url);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    serveStatic(filePath, res);
  } else {
    serveStatic(join(STATIC_DIR, "index.html"), res);
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard listening on http://0.0.0.0:${PORT}`);
  console.log(`Proxying API requests to ${RUNNER_API_URL}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
