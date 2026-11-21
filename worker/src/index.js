const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const ABSTENTION = "This detail is not present in the approved public portfolio information. Please contact Melek for confirmation.";
const STOP = new Set("a an the and or is are was were what who where when why how can could do does did tell about please your you my of to in on for with from at as this that these le la les un une des du de et ou est sont qui quoi comment pourquoi quand ou dans sur pour avec mon ma mes ton ta tes moi je il elle au aux en par d cette ces شنو شنوّة شنوة شنية شكون وين وقتاش علاش كيفاش كيف نحب نعرف قولي اعطيني وريني من في على الى إلى عن مع و او أو".split(/\s+/));
let jwksCache;
const enc = new TextEncoder();

function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function normalize(value) {
  return String(value ?? "").normalize("NFKD").toLocaleLowerCase()
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي")
    .replace(/[^\p{L}\p{N}+#]+/gu," ").trim();
}
function terms(value) {
  return new Set(normalize(value).split(/\s+/).filter(x => x.length > 1 && !STOP.has(x)));
}
function safeId(value) { return /^[a-z0-9][a-z0-9_-]{1,79}$/i.test(value); }
function parseJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function allowedOrigin(request, env) {
  const origin=request.headers.get("Origin");
  const allowed=(env.ALLOWED_ORIGIN || new URL(request.url).origin).replace(/\/$/,"");
  return !origin || origin===allowed;
}
function corsHeaders(request, env) {
  const origin=request.headers.get("Origin");
  const allowed=(env.ALLOWED_ORIGIN || new URL(request.url).origin).replace(/\/$/,"");
  return origin===allowed ? {"access-control-allow-origin":origin,"vary":"Origin","access-control-allow-methods":"GET,POST,PUT,DELETE,OPTIONS","access-control-allow-headers":"Content-Type,CF-Access-Jwt-Assertion"} : {};
}
function withCors(response, cors) { const headers=new Headers(response.headers); for(const [k,v] of Object.entries(cors)) headers.set(k,v); return new Response(response.body,{status:response.status,statusText:response.statusText,headers}); }
async function readBody(request, max=16000) {
  const raw=await request.text();
  if(raw.length>max) throw new Error("Request body is too large.");
  return JSON.parse(raw || "{}");
}
function validateFact(x) {
  if(!x || typeof x!=="object") return "A fact object is required.";
  if(!safeId(x.id)) return "ID must contain 2–80 letters, numbers, underscores or hyphens.";
  if(!["profile","contact","education","skills","experience","project","languages"].includes(x.category)) return "Unsupported fact category.";
  for(const k of ["text_fr","text_en"]) if(typeof x[k]!=="string" || !x[k].trim() || x[k].length>3000) return k+" is required (max 3000 characters).";
  if(!Array.isArray(x.aliases) || x.aliases.length>40 || x.aliases.some(a=>typeof a!=="string" || a.length>100)) return "Aliases must be up to 40 short strings.";
  if(!x.source || typeof x.source.file!=="string" || typeof x.source.selector!=="string") return "A source file and selector are required.";
  if(x.url && (!/^https:\/\//i.test(x.url) || x.url.length>500)) return "Links must be HTTPS URLs.";
  if(typeof x.approved!=="boolean") return "Approval must be a boolean.";
  return null;
}
function validateProject(x) {
  if(!x || typeof x!=="object") return "A project object is required.";
  if(!safeId(x.id)) return "Project ID is invalid.";
  for(const k of ["title","type","description_fr","description_en"]) if(typeof x[k]!=="string" || !x[k].trim() || x[k].length>2000) return k+" is required.";
  if(typeof x.url!=="string" || !/^https:\/\//i.test(x.url) || x.url.length>500) return "Project URL must be HTTPS.";
  if(typeof x.visible!=="boolean") return "Visibility must be boolean.";
  if(!Number.isInteger(x.sort_order) || x.sort_order<0 || x.sort_order>10000) return "Sort order is invalid.";
  return null;
}
function b64url(value) {
  const raw=atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function verifyAdmin(request, env) {
  if(!env.ACCESS_ISSUER || !env.ACCESS_AUD || !env.ADMIN_EMAIL) throw new Error("Admin authentication is not configured.");
  const token=request.headers.get("CF-Access-Jwt-Assertion");
  if(!token) throw new Error("Cloudflare Access authentication is required.");
  const parts=token.split(".");
  if(parts.length!==3) throw new Error("Invalid Access token.");
  const header=JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const claims=JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  const issuer=env.ACCESS_ISSUER.replace(/\/$/,"");
  const now=Math.floor(Date.now()/1000);
  const aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==issuer || !aud.includes(env.ACCESS_AUD) || !claims.exp || claims.exp<=now || (claims.nbf && claims.nbf>now)) throw new Error("Access token claims are invalid.");
  if(String(claims.email||"").toLowerCase()!==env.ADMIN_EMAIL.toLowerCase()) throw new Error("This account is not allowed to administer the portfolio.");
  if(!jwksCache || jwksCache.expires<Date.now()) {
    const response=await fetch(env.ACCESS_JWKS_URL || issuer+"/cdn-cgi/access/certs");
    if(!response.ok) throw new Error("Could not load Cloudflare Access signing keys.");
    jwksCache={keys:(await response.json()).keys,expires:Date.now()+300000};
  }
  const jwk=jwksCache.keys.find(k=>k.kid===header.kid);
  if(!jwk) { jwksCache=null; throw new Error("Unknown Access signing key."); }
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64url(parts[2]),enc.encode(parts[0]+"."+parts[1]));
  if(!valid) throw new Error("Access token signature is invalid.");
  return {email:claims.email,name:claims.name||claims.email};
}
async function assistant(request, env) {
  let body;
  try { body=await readBody(request,4000); } catch { return json({error:"Invalid request body."},400); }
  const question=String(body.question||"").trim().slice(0,800);
  const q=terms(question);
  if(!q.size) return json({answer:"Please ask a specific question.",sources:[]});
  const {results=[]}=await env.DB.prepare("SELECT id,category,text_fr,text_en,aliases_json,source_file,source_selector,public_url FROM facts WHERE approved=1").all();
  if(!results.length) return json({answer:ABSTENTION,sources:[]});
  const ranked=results.map(f=>{
    const hay=terms([f.text_fr,f.text_en,...parseJson(f.aliases_json,[])].join(" "));
    const matched=[...q].filter(t=>hay.has(t));
    return {fact:f,coverage:matched.length/q.size};
  }).filter(x=>x.coverage>=0.5).sort((a,b)=>b.coverage-a.coverage);
  if(!ranked.length) return json({answer:ABSTENTION,sources:[]});
  const selected=[];
  const seen=new Set();
  for(const row of ranked) {
    if(!seen.has(row.fact.id)) {selected.push(row.fact);seen.add(row.fact.id);}
    if(selected.length>=3) break;
  }
  const arabic=/[\u0600-\u06ff]/.test(question);
  const english=/\b(what|who|where|when|which|tell|show|experience|skills|projects|education)\b/i.test(question);
  const field=english?"text_en":"text_fr";
  const prefix=arabic?"حسب المعلومات المنشورة والمعتمدة في Portfolio:":english?"According to the approved information published in the portfolio:":"D'après les informations approuvées publiées dans le portfolio :";
  return json({answer:prefix+"\n"+selected.map(f=>f[field]).join("\n"),sources:selected.map(f=>({id:f.id,category:f.category,source:f.source_file}))});
}
async function adminRoute(request, env, path, method) {
  const actor=await verifyAdmin(request,env);
  if(path==="/api/admin/session" && method==="GET") return json({authenticated:true,user:actor});
  if(path==="/api/admin/facts" && method==="GET") {
    const {results=[]}=await env.DB.prepare("SELECT * FROM facts ORDER BY category,id").all();
    return json({facts:results.map(f=>({...f,aliases:parseJson(f.aliases_json,[]),approved:!!f.approved,source:{file:f.source_file,selector:f.source_selector},url:f.public_url||""}))});
  }
  if(path==="/api/admin/facts" && method==="POST") {
    const x=await readBody(request); const error=validateFact(x); if(error)return json({error},400);
    await env.DB.prepare("INSERT INTO facts(id,category,text_fr,text_en,aliases_json,source_file,source_selector,public_url,approved,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
      .bind(x.id,x.category,x.text_fr.trim(),x.text_en.trim(),JSON.stringify(x.aliases),x.source.file,x.source.selector,x.url||null,x.approved?1:0).run();
    return json({saved:true,id:x.id},201);
  }
  const factMatch=path.match(/^\/api\/admin\/facts\/([a-z0-9_-]+)$/i);
  if(factMatch && !safeId(factMatch[1])) return json({error:"Invalid ID."},400);
  if(factMatch && method==="PUT") {
    const x=await readBody(request); x.id=factMatch[1]; const error=validateFact(x); if(error)return json({error},400);
    const result=await env.DB.prepare("UPDATE facts SET category=?,text_fr=?,text_en=?,aliases_json=?,source_file=?,source_selector=?,public_url=?,approved=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(x.category,x.text_fr.trim(),x.text_en.trim(),JSON.stringify(x.aliases),x.source.file,x.source.selector,x.url||null,x.approved?1:0,x.id).run();
    if(!result.meta.changes)return json({error:"Fact not found."},404);
    return json({saved:true,id:x.id});
  }
  if(factMatch && method==="DELETE") {
    const result=await env.DB.prepare("DELETE FROM facts WHERE id=?").bind(factMatch[1]).run();
    return result.meta.changes?json({deleted:true}):json({error:"Fact not found."},404);
  }
  if(path==="/api/admin/projects" && method==="GET") {
    const {results=[]}=await env.DB.prepare("SELECT * FROM projects ORDER BY sort_order,title").all();
    return json({projects:results.map(p=>({...p,visible:!!p.visible}))});
  }
  if(path==="/api/admin/projects" && method==="POST") {
    const x=await readBody(request); const error=validateProject(x); if(error)return json({error},400);
    await env.DB.prepare("INSERT INTO projects(id,title,type,description_fr,description_en,url,visible,sort_order,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
      .bind(x.id,x.title.trim(),x.type.trim(),x.description_fr.trim(),x.description_en.trim(),x.url,x.visible?1:0,x.sort_order).run();
    return json({saved:true,id:x.id},201);
  }
  const projectMatch=path.match(/^\/api\/admin\/projects\/([a-z0-9_-]+)$/i);
  if(projectMatch && method==="PUT") {
    const x=await readBody(request); x.id=projectMatch[1]; const error=validateProject(x); if(error)return json({error},400);
    const result=await env.DB.prepare("UPDATE projects SET title=?,type=?,description_fr=?,description_en=?,url=?,visible=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(x.title.trim(),x.type.trim(),x.description_fr.trim(),x.description_en.trim(),x.url,x.visible?1:0,x.sort_order,x.id).run();
    if(!result.meta.changes)return json({error:"Project not found."},404);
    return json({saved:true,id:x.id});
  }
  if(projectMatch && method==="DELETE") {
    const result=await env.DB.prepare("DELETE FROM projects WHERE id=?").bind(projectMatch[1]).run();
    return result.meta.changes?json({deleted:true}):json({error:"Project not found."},404);
  }
  return json({error:"Not found."},404);
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url),path=url.pathname,method=request.method;
    const cors=corsHeaders(request,env);
    if(method==="OPTIONS") return new Response(null,{status:204,headers:cors});
    if(!allowedOrigin(request,env)) return json({error:"Origin not allowed."},403);
    try {
      if(path==="/api/health" && method==="GET") {
        await env.DB.prepare("SELECT 1").first();
        return withCors(json({ok:true,service:"portfolio-api",assistant:"approved-facts-only",admin:"cloudflare-access"}),cors);
      }
      if(path==="/api/assistant" && method==="POST") return withCors(await assistant(request,env),cors);
      if(path==="/api/projects" && method==="GET") {
        const {results=[]}=await env.DB.prepare("SELECT id,title,type,description_fr,description_en,url,sort_order FROM projects WHERE visible=1 ORDER BY sort_order,title").all();
        return withCors(json({projects:results}),cors);
      }
      if(path.startsWith("/api/admin/")) return withCors(await adminRoute(request,env,path,method),cors);
      return withCors(json({error:"Not found."},404),cors);
    } catch(error) {
      const status=/Access authentication|not allowed to administer|token|signing keys|authentication is not configured/i.test(error.message)?401:500;
      return withCors(json({error:status===401?error.message:"The server could not complete this request."},status),cors);
    }
  }
};
