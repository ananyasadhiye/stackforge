let fetchHandler;
async function getFetchHandler() {
  if (fetchHandler) return fetchHandler;
  const mod = await import("../dist/server/server.js");
  if (mod.default && typeof mod.default.fetch === "function") {
    fetchHandler = mod.default.fetch.bind(mod.default);
    return fetchHandler;
  }
  if (typeof mod.createServerEntry === "function") {
    const entry = mod.createServerEntry({});
    if (entry && typeof entry.fetch === "function") {
      fetchHandler = entry.fetch.bind(entry);
      return fetchHandler;
    }
  }
  for (const val of Object.values(mod)) {
    if (val && typeof val.fetch === "function") {
      fetchHandler = val.fetch.bind(val);
      return fetchHandler;
    }
  }
  throw new Error("No fetch handler found. Exports: " + Object.keys(mod).join(", "));
}
export default async function handler(req, res) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = `${protocol}://${host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value != null) headers.set(key, value);
  }
  let body = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }
  const webRequest = new Request(url, {
    method: req.method,
    headers,
    body: body?.length ? body : undefined,
  });
  try {
    const fetch = await getFetchHandler();
    const response = await fetch(webRequest);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error("[StackForge] SSR error:", err);
    res.statusCode = 500;
    res.end("Internal Server Error: " + err.message);
  }
}
