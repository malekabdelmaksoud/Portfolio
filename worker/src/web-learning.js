const FEEDS = [
  { name: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss", host: "blog.cloudflare.com" },
  { name: "OWASP GenAI Security", url: "https://genai.owasp.org/feed/", host: "genai.owasp.org" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", host: "huggingface.co" },
  { name: "arXiv AI", url: "https://export.arxiv.org/rss/cs.AI", host: "export.arxiv.org" },
  { name: "arXiv Machine Learning", url: "https://export.arxiv.org/rss/cs.LG", host: "export.arxiv.org" }
];
const ALLOWED_ARTICLE_HOSTS = new Set(["blog.cloudflare.com", "genai.owasp.org", "huggingface.co", "arxiv.org", "export.arxiv.org"]);

function decodeEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n))))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(n, 16))))
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}
function plainText(value, max = 3200) {
  return decodeEntities(String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, max);
}
function tagValue(block, tag) {
  const match = block.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + tag + ">", "i"));
  return match ? match[1] : "";
}
function parseFeed(xml, feed) {
  const blocks = [...String(xml || "").matchAll(/<(item|entry)\b[^>]*>[\s\S]*?<\/\1>/gi)].map(x => x[0]).slice(0, 12);
  const items = [];
  for (const block of blocks) {
    const title = plainText(tagValue(block, "title"), 240);
    const rawLink = tagValue(block, "link");
    const href = rawLink.match(/\bhref=["']([^"']+)["']/i)?.[1] || block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1] || plainText(rawLink, 1000);
    let url;
    try {
      url = new URL(decodeEntities(href));
      const feedHosts = feed.host === "export.arxiv.org" ? new Set(["arxiv.org", "export.arxiv.org"]) : new Set([feed.host]);
      if (url.protocol !== "https:" || !ALLOWED_ARTICLE_HOSTS.has(url.hostname) || !feedHosts.has(url.hostname)) continue;
      url.hash = "";
    } catch { continue; }
    const summary = plainText(tagValue(block, "summary") || tagValue(block, "description") || tagValue(block, "content"), 3200);
    if (!title || !summary || summary.length < 60) continue;
    // Drop obvious instruction-injection payloads before they can enter retrieval context.
    if (/ignore (all |any )?(previous|prior) instructions|reveal (the )?(system prompt|secrets)|send (the )?(conversation|data) to|you are now (the )?(system|assistant)|bypass (all )?(safety|security)/i.test(summary)) continue;
    const publishedRaw = plainText(tagValue(block, "published") || tagValue(block, "updated") || tagValue(block, "pubDate"), 80);
    const publishedDate = publishedRaw ? new Date(publishedRaw) : null;
    const published = publishedDate && Number.isFinite(publishedDate.getTime()) ? publishedDate.toISOString() : null;
    items.push({ title, url: url.toString(), summary, source: feed.name, published_at: published, host: url.hostname });
  }
  return items;
}
async function digest(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export async function refreshWebKnowledge(env, fetcher = fetch) {
  if (!env.DB) throw new Error("D1 binding DB is not configured.");
  const feedResults = await Promise.all(FEEDS.map(async feed => {
    try {
      const response = await fetcher(feed.url, {
        headers: { "accept": "application/rss+xml, application/atom+xml, application/xml, text/xml", "user-agent": "MelekGPT-WebKnowledge/1.0 (+portfolio)" },
        signal: AbortSignal.timeout(12000),
        redirect: "manual"
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const xml = await response.text();
      if (xml.length > 1_500_000) throw new Error("Feed exceeds size limit");
      return { items: parseFeed(xml, feed).slice(0, 8), failed: null };
    } catch (error) {
      return { items: [], failed: { source: feed.name, error: String(error?.message || error).slice(0, 160) } };
    }
  }));
  const items = feedResults.flatMap(x => x.items);
  const failed = feedResults.map(x => x.failed).filter(Boolean);
  let saved = 0;
  for (const item of items) {
    const id = await digest(item.url);
    await env.DB.prepare(
      "INSERT INTO web_knowledge(id,title,url,source_name,source_host,summary,published_at,content_hash,status,fetched_at) VALUES(?,?,?,?,?,?,?,?, 'active',CURRENT_TIMESTAMP) ON CONFLICT(url) DO UPDATE SET title=excluded.title,source_name=excluded.source_name,source_host=excluded.source_host,summary=excluded.summary,published_at=excluded.published_at,content_hash=excluded.content_hash,status='active',fetched_at=CURRENT_TIMESTAMP"
    ).bind(id, item.title, item.url, item.source, item.host, item.summary, item.published_at, await digest(item.title + "\n" + item.summary)).run();
    saved++;
  }
  await env.DB.prepare("INSERT INTO web_learning_runs(id,fetched,saved,failed_json,finished_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)")
    .bind(crypto.randomUUID(), items.length, saved, JSON.stringify(failed)).run();
  return { fetched: items.length, saved, failed };
}
export { FEEDS, parseFeed, plainText };
