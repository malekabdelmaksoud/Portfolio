import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function environment() {
  const facts=[
    {id:"skills-001",category:"skills",text_fr:"Langages mentionnés : C, Java, Python et PHP.",text_en:"Listed programming languages include C, Java, Python and PHP.",text_ar:"لغات البرمجة المذكورة تشمل C و Java و Python و PHP.",aliases_json:'["python","java","programming"]',source_file:"index.html",source_selector:"#skillsLangagesList",public_url:null,approved:1},
    {id:"project-001",category:"project",text_fr:"Projet Laravel publié sur le portfolio.",text_en:"Laravel project published in the portfolio.",text_ar:"مشروع Laravel منشور في ملف الأعمال.",aliases_json:'["project","projets","مشاريع","المشاريع"]',source_file:"index.html",source_selector:"#projets .project-card",public_url:"https://github.com/example/project",approved:1},
    {id:"private-001",category:"profile",text_fr:"Secret private draft.",text_en:"Secret private draft.",text_ar:"مسودة خاصة سرية.",aliases_json:'["secret"]',source_file:"draft.md",source_selector:"#private",public_url:null,approved:0}
  ];
  const projects=[{id:"project-001",title:"Demo",type:"WEB",description_fr:"Projet public",description_en:"Public project",url:"https://github.com/example/demo",sort_order:1,visible:1},{id:"hidden-001",title:"Hidden",type:"WEB",description_fr:"Brouillon",description_en:"Draft",url:"https://github.com/example/hidden",sort_order:2,visible:0}];
  const DB={prepare(sql){
    return {bind(){return this;},async first(){return {ok:1};},async all(){
      if(sql.includes("FROM facts")) return {results:facts.filter(f=>sql.includes("approved=1")?f.approved===1:true)};
      if(sql.includes("FROM projects")) return {results:sql.includes("WHERE visible=1")?projects.filter(p=>p.visible===1):projects};
      return {results:[]};
    },async run(){return {meta:{changes:1}};}};
  }};
  return {DB,ALLOWED_ORIGIN:"https://portfolio.test",ADMIN_EMAIL:"owner@example.test"};
}
const request=(path,body,origin="https://portfolio.test")=>new Request("https://api.test"+path,{method:"POST",headers:{"content-type":"application/json",Origin:origin},body:JSON.stringify(body)});

test("health endpoint checks D1 and reports the safe assistant mode",async()=>{
 const response=await worker.fetch(new Request("https://api.test/api/health"),environment());
 assert.equal(response.status,200);assert.equal((await response.json()).assistant,"approved-facts-only");
});

test("assistant returns reviewed fact text verbatim",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"Do you know Python?"}),environment());
 const data=await response.json();assert.equal(response.status,200);
 assert.match(data.answer,/Python/);assert.deepEqual(data.sources.map(x=>x.id),["skills-001"]);
 assert.equal(response.headers.get("access-control-allow-origin"),"https://portfolio.test");
 assert.equal(response.headers.get("access-control-allow-credentials"),"true");
});


test("assistant recognizes Tunisian Arabic project questions",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"شنو المشاريع متاع ملاك"}),environment());
 const data=await response.json();assert.equal(response.status,200);
 assert.match(data.answer,/مشروع Laravel/);assert.ok(data.sources.some(x=>x.category==="project"));
});


test("assistant uses recent topic for a short Arabic follow-up",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"زيد فسّرلي",context:["شنو المشاريع متاع ملاك؟"]}),environment());
 const data=await response.json();assert.equal(response.status,200);
 assert.match(data.answer,/مشروع Laravel/);assert.ok(data.sources.some(x=>x.category==="project"));
});

test("assistant never returns an unapproved fact",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"Tell me the secret private draft"}),environment());
 const data=await response.json();assert.equal(response.status,200);
 assert.match(data.answer,/not present|approved/i);assert.equal(data.sources.length,0);
});

test("assistant abstains when there is no matching approved evidence",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"What is the moon made of?"}),environment());
 const data=await response.json();assert.equal(data.sources.length,0);assert.match(data.answer,/not present/i);
});


test("assistant abstains in Tunisian Arabic when evidence is missing",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"شنو رقم جواز سفر ملاك؟"}),environment());
 const data=await response.json();assert.equal(data.sources.length,0);
 assert.match(data.answer,/المعلومة هاذي موش موجودة/);
});

test("public projects endpoint exposes only visible projects",async()=>{
 const response=await worker.fetch(new Request("https://api.test/api/projects"),environment());
 const data=await response.json();assert.equal(data.projects.length,1);assert.equal(data.projects[0].id,"project-001");
});

test("untrusted browser origin is rejected",async()=>{
 const response=await worker.fetch(request("/api/assistant",{question:"Python"},"https://attacker.test"),environment());
 assert.equal(response.status,403);
});

test("admin API refuses requests without Cloudflare Access identity",async()=>{
 const response=await worker.fetch(new Request("https://api.test/api/admin/facts"),environment());
 assert.equal(response.status,401);
});
