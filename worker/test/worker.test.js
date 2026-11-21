import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
function environment(){
 const facts=[{id:"skills-001",category:"skills",text_fr:"Langages mentionnés : C, Java, Python et PHP.",text_en:"Listed programming languages include C, Java, Python and PHP.",text_ar:"لغات البرمجة المذكورة تشمل C و Java و Python و PHP.",aliases_json:'["python","java","programming"]',source_file:"index.html",source_selector:"#skillsLangagesList",public_url:null,approved:1},
 {id:"private-001",category:"profile",text_fr:"Secret private draft.",text_en:"Secret private draft.",text_ar:"مسودة خاصة سرية.",aliases_json:'["secret"]',source_file:"draft.md",source_selector:"#private",public_url:null,approved:0}];
 const DB={prepare(sql){return{bind(){return this;},async first(){return{ok:1};},async all(){if(sql.includes("FROM facts"))return{results:facts.filter(f=>sql.includes("approved=1")?f.approved===1:true)};return{results:[]};},async run(){return{meta:{changes:1}};}};}};
 return{DB,ALLOWED_ORIGIN:"https://portfolio.test",ADMIN_EMAIL:"owner@example.test"};
}
const request=(path,body,origin="https://portfolio.test")=>new Request("https://api.test"+path,{method:"POST",headers:{"content-type":"application/json",Origin:origin},body:JSON.stringify(body)});
test("health endpoint checks D1 and reports authenticated assistant mode",async()=>{
 const r=await worker.fetch(new Request("https://api.test/api/health"),environment());assert.equal(r.status,200);
 const d=await r.json();assert.equal(d.ok,true);assert.equal(d.assistant,"authenticated-llm");
});
test("assistant endpoint requires a verified Access identity",async()=>{
 const r=await worker.fetch(request("/api/assistant",{question:"What is Python?"}),environment());assert.equal(r.status,401);
 assert.match((await r.json()).error,/sign-in is not configured/i);
});
test("model catalogue requires a verified Access identity",async()=>{
 const r=await worker.fetch(new Request("https://api.test/api/models"),environment());assert.equal(r.status,401);
});
test("untrusted browser origin is rejected",async()=>{
 const r=await worker.fetch(request("/api/assistant",{question:"Python"},"https://attacker.test"),environment());assert.equal(r.status,403);
});
test("public projects endpoint exposes only visible projects",async()=>{
 const projects=[{id:"visible",visible:1},{id:"hidden",visible:0}];
 const env=environment();env.DB.prepare=(sql)=>({bind(){return this;},async all(){return{results:projects.filter(p=>sql.includes("WHERE visible=1")?p.visible===1:true)};}});
 const r=await worker.fetch(new Request("https://api.test/api/projects"),env);assert.equal(r.status,200);assert.deepEqual((await r.json()).projects.map(x=>x.id),["visible"]);
});
test("admin API refuses requests without Cloudflare Access identity",async()=>{
 const r=await worker.fetch(new Request("https://api.test/api/admin/facts"),environment());assert.equal(r.status,401);
});
test("per-user chat endpoints require a verified email Access identity",async()=>{
 const r=await worker.fetch(new Request("https://api.test/api/user/chats"),environment());assert.equal(r.status,401);
 assert.match((await r.json()).error,/sign-in is not configured/i);
});
