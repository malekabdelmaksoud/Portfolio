import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed, refreshWebKnowledge } from "../src/web-learning.js";

test("parses allowlisted RSS/Atom entries and sanitizes markup", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title>AI Security Update</title>
    <link>https://blog.cloudflare.com/security-update</link>
    <description><![CDATA[<p>New security research and <b>defensive guidance</b> for AI systems. <script>steal secrets</script>More details in the full post.</p>]]></description>
    <pubDate>Sat, 21 Nov 2026 10:00:00 GMT</pubDate>
  </item></channel></rss>`;
  const items = parseFeed(xml, { name: "Cloudflare Blog" });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "AI Security Update");
  assert.match(items[0].summary, /defensive guidance/);
  assert.doesNotMatch(items[0].summary, /steal secrets|<script/i);
  assert.equal(items[0].host, "blog.cloudflare.com");
});

test("rejects non-HTTPS and non-allowlisted article URLs", () => {
  const xml = `<rss><channel>
    <item><title>bad one</title><link>https://attacker.example/evil</link><description>This is a sufficiently long description of the article content for the parser.</description></item>
    <item><title>bad two</title><link>http://arxiv.org/abs/1234</link><description>This is a sufficiently long description of the article content for the parser.</description></item>
  </channel></rss>`;
  assert.deepEqual(parseFeed(xml, { name: "test" }), []);
});

test("refreshes only fixed feeds and persists deduplicated source records", async () => {
  const writes = [];
  const db = { prepare(sql) {
    return { bind(...args) { this.args = args; return this; }, async run() { writes.push({ sql, args: this.args }); return { success: true }; } };
  }};
  const xml = `<rss><channel><item><title>Research update</title><link>https://arxiv.org/abs/2611.12345</link><description>This is a sufficiently long summary about a new machine learning research result.</description><pubDate>Sat, 21 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  const urls = [];
  const result = await refreshWebKnowledge({ DB: db }, async url => {
    urls.push(url);
    return new Response(xml, { status: 200, headers: { "content-type": "application/rss+xml" } });
  });
  assert.equal(urls.length, 5);
  assert.equal(result.fetched, 5);
  assert.equal(result.saved, 5);
  assert.equal(writes.length, 6); // five feed records plus one run summary
  assert.ok(writes.every(x => !x.sql.includes("INSERT INTO facts")));
  assert.match(writes[0].sql, /ON CONFLICT\(url\) DO UPDATE/);
});
