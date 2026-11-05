import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 5173);
const PROJECT_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PROJECT_ROOT_PREFIX = `${PROJECT_ROOT}${sep}`;
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new RangeError("PORT must be an integer between 1 and 65535.");
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed.");
    return;
  }

  let filePath;

  try {
    const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`);
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    filePath = resolve(PROJECT_ROOT, relativePath);
  } catch (error) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Invalid request path.");
    return;
  }

  if (filePath !== PROJECT_ROOT && !filePath.startsWith(PROJECT_ROOT_PREFIX)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden.");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }

    console.error("Unable to serve the requested file.", error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error.");
  }
});

server.on("error", (error) => {
  console.error("Unable to start the local server.", error);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`Seat booking app available at http://${HOST}:${PORT}/`);
});
