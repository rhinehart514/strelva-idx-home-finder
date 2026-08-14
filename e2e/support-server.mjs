import { createServer } from "node:http";

const emails = [];
let nextId = 1;

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/emails") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(emails));
    return;
  }
  if (request.method === "POST" && request.url === "/emails") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const email = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const id = `e2e-email-${nextId++}`;
    emails.push({ id, ...email });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id }));
    return;
  }
  response.writeHead(404);
  response.end();
}).listen(3101, "127.0.0.1");
