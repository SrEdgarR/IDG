// Fake session and cross-origin redirect fixtures. Records only credential presence,
// never credential values; the only accepted cookie is an inert local test marker.
import http from "node:http";
import { createHash } from "node:crypto";

const sessionCookie = "idg_fixture_session=local-only";
const publicBody = Buffer.from("IDG public redirect fixture\n");
const loginBody = Buffer.concat([
  Buffer.from("<!doctype html><title>Fixture login</title>"),
  Buffer.alloc(1024 * 1024 + 1, 120),
]);

function record(req, route) {
  return {
    route,
    method: req.method,
    cookie: Boolean(req.headers.cookie),
    authorization: Boolean(req.headers.authorization),
  };
}

export async function startSessionRedirectFixture() {
  const records = [];
  let target;
  const targetServer = http.createServer((req, res) => {
    const route = new URL(req.url, "http://fixture").pathname;
    records.push({ origin: "target", ...record(req, route) });
    if (route === "/public.bin") {
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": publicBody.length });
      res.end(publicBody);
      return;
    }
    if (route === "/login.bin") {
      res.writeHead(200, { "Content-Type": "text/html", "Content-Length": loginBody.length });
      res.end(loginBody);
      return;
    }
    res.writeHead(404).end();
  });
  const originServer = http.createServer((req, res) => {
    const route = new URL(req.url, "http://fixture").pathname;
    records.push({ origin: "source", ...record(req, route) });
    if (route === "/redirect-public.bin" || route === "/session.bin") {
      const authenticated = req.headers.cookie?.split(";").some((part) => part.trim() === sessionCookie);
      if (route === "/session.bin" && authenticated) {
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": publicBody.length });
        res.end(publicBody);
      } else {
        const suffix = route === "/session.bin" ? "/login.bin" : "/public.bin";
        res.writeHead(302, { Location: `http://127.0.0.1:${target.address().port}${suffix}` }).end();
      }
      return;
    }
    if (route === "/post-only.bin") {
      if (req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": publicBody.length });
        res.end(publicBody);
      } else {
        res.writeHead(200, { "Content-Type": "text/html", "Content-Length": loginBody.length });
        res.end(loginBody);
      }
      return;
    }
    res.writeHead(404).end();
  });
  const listen = (server) => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  await listen(targetServer);
  target = targetServer;
  try {
    await listen(originServer);
  } catch (error) {
    await new Promise((resolve) => targetServer.close(resolve));
    throw error;
  }
  const url = `http://127.0.0.1:${originServer.address().port}`;
  const targetUrl = `http://127.0.0.1:${targetServer.address().port}`;
  return {
    url,
    targetUrl,
    records,
    publicSha256: createHash("sha256").update(publicBody).digest("hex"),
    close: async () => {
      for (const server of [originServer, targetServer]) server.closeAllConnections();
      await Promise.all([originServer, targetServer].map((server) => new Promise((resolve) => server.close(resolve))));
    },
  };
}
