(() => {
"use strict";
const $=(s,root=document)=>root.querySelector(s);
const THEME_MODES=["dark","light","atelier"];
const THEME_META={dark:{icon:"🌙",label:"Obsidian"},light:{icon:"☀️",label:"Daylight"},atelier:{icon:"✦",label:"Atelier"}};
function applyAdminTheme(theme){
  const resolved=THEME_MODES.includes(theme)?theme:"dark";
  document.documentElement.setAttribute("data-theme",resolved);
  const btn=$("#admin-theme");
  if(btn){const m=THEME_META[resolved];btn.textContent=`${m.icon} ${m.label}`;btn.title=`Mode: ${m.label}`;}
  try{localStorage.setItem("portfolio-theme",resolved);}catch(_){}
}
let adminTheme="dark";
try{adminTheme=localStorage.getItem("portfolio-theme")||"dark";}catch(_){}
if(!THEME_MODES.includes(adminTheme))adminTheme="dark";
applyAdminTheme(adminTheme);
$("#admin-theme")?.addEventListener("click",()=>{
  adminTheme=THEME_MODES[(THEME_MODES.indexOf(adminTheme)+1)%THEME_MODES.length];
  applyAdminTheme(adminTheme);
});
const state={facts:[],projects:[],learning:null,usage:null,repos:[],editingFact:null,editingProject:null};
const API_BASE=String(window.PORTFOLIO_API_BASE||"").replace(/\/$/,"");
const notice=(message,error=false)=>{const n=$("#notice");n.textContent=message;n.className="notice show"+(error?" error":"");};
async function api(path,options={}) {
  const response=await fetch(API_BASE+path,{credentials:"include",...options,headers:{"content-type":"application/json",...(options.headers||{})}});
  const data=await response.json().catch(()=>({error:"Réponse serveur illisible."}));
  if(!response.ok) throw new Error(data.error||("HTTP "+response.status));
  return data;
}
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function button(label,action,extra=""){const b=node("button",extra,label);b.type="button";b.addEventListener("click",action);return b;}
function renderFacts(){
 const root=$("#factsList");root.replaceChildren();$("#factCount").textContent=String(state.facts.length);
 if(!state.facts.length){root.append(node("p","muted","Aucune information enregistrée."));return;}
 for(const f of state.facts){
  const card=node("article","record"),top=node("div","record-top"),left=node("div"),title=node("h3","",f.id+" · "+f.category),meta=node("div","meta",f.source_file+" · "+f.source_selector);
  left.append(title,meta);const status=node("span","status"+(f.approved?" on":""),f.approved?"APPROUVÉ · UTILISABLE":"BROUILLON · NON PUBLIÉ");top.append(left,status);
  const fr=node("p","",f.text_fr),en=node("p","",f.text_en),ar=node("p","",f.text_ar),actions=node("div","record-actions");
  ar.dir="rtl";ar.lang="ar";
  actions.append(button("Modifier",()=>editFact(f)),button(f.approved?"Retirer l'approbation":"Approuver",()=>toggleFact(f),f.approved?"":"primary"),button("Supprimer",()=>deleteFact(f),"danger"));
  card.append(top,fr,en,ar,actions);root.append(card);
 }
}
function renderLearning(){
 const data=state.learning,summary=$("#learningSummary"),root=$("#learningList");summary.replaceChildren();root.replaceChildren();
 if(!data){summary.append(node("p","muted","Aucune donnée de synchronisation disponible."));return;}
 $("#learningCount").textContent=String(data.total||0);
 const stats=node("div","learning-stats");
 stats.append(node("div","learning-stat",String(data.total||0)+" sources indexées"));
 const latest=(data.runs||[])[0];
 stats.append(node("div","learning-stat",latest?"Dernière actualisation : "+new Date(latest.finished_at+"Z").toLocaleString():"Aucune actualisation exécutée"));
 stats.append(node("div","learning-stat",latest?latest.saved+" entrées enregistrées · "+latest.fetched+" trouvées":"Planification quotidienne à 03:00 UTC"));
 stats.append(node("div","learning-stat",data.liveSearchEnabled?"Recherche web en direct : activée":"Recherche web en direct : non configurée"));
 stats.append(node("div","learning-stat","Budget maximum : "+(data.searchLimitPerMonth||5000)+" recherches par mois"));
 summary.append(stats);
 if(!data.items?.length){root.append(node("p","muted","Aucune source indexée pour le moment. Lancez une actualisation."));return;}
 for(const item of data.items){
  const card=node("article","record"),top=node("div","record-top"),left=node("div"),title=node("h3","",item.title),meta=node("div","meta",item.source_name+" · "+item.source_host+" · "+(item.published_at||"date non fournie"));
  left.append(title,meta);const status=node("span","status on","INDEXÉ");top.append(left,status);
  const excerpt=node("p","",item.url);const link=node("a","learning-link","Ouvrir la source ↗");link.href=item.url;link.target="_blank";link.rel="noopener noreferrer";
  card.append(top,excerpt,link);root.append(card);
 }
}


function statCard(label,value,hint){const card=node("div","overview-card"),k=node("div","kicker",label),v=node("div","value",String(value)),h=node("div","hint",hint||"");card.append(k,v,h);return card;}
function renderOverview(){
 const root=$("#overviewStats");root.replaceChildren();
 const u=state.usage||{},s=u.summary||{};
 root.append(statCard("Utilisateurs",s.users??"—","Comptes enregistrés"));
 root.append(statCard("Projets publiés",state.projects.filter(p=>p.visible).length,"Sur le portfolio public"));
 root.append(statCard("Requêtes AI ce mois",s.requests_month??"—","Demandes traitées par l'assistant"));
 root.append(statCard("Tokens estimés ce mois",Number(s.tokens_month||0).toLocaleString(),"Entrée + sortie estimées"));
 $("#overviewUsageNote").textContent=u.quota_per_user_month?("Quota par utilisateur : "+Number(u.quota_per_user_month).toLocaleString()+" tokens estimés / mois."):("Quota individuel non configuré. Les statistiques affichent la consommation estimée, sans inventer un solde restant.");
}
function renderUsage(){
 const u=state.usage||{},s=u.summary||{},root=$("#usageSummary");root.replaceChildren();
 root.append(statCard("Total utilisateurs",s.users??"—","Comptes enregistrés"));
 root.append(statCard("Tokens utilisés",Number(s.tokens_month||0).toLocaleString(),"Estimation ce mois"));
 root.append(statCard("Tokens restants",s.remaining_all===null||s.remaining_all===undefined?"Non configuré":Number(s.remaining_all).toLocaleString(),u.quota_per_user_month?"Quota app estimé, pas Cloudflare":"Définir AI_USER_MONTHLY_TOKEN_LIMIT"));
 root.append(statCard("Requêtes AI",Number(s.requests_month||0).toLocaleString(),"Ce mois"));
 const filter=($("#usageFilter")?.value||"").toLowerCase();
 const rows=(u.users||[]).filter(x=>String(x.email).toLowerCase().includes(filter));
 const host=$("#usageTable");host.replaceChildren();
 if(!rows.length){host.append(node("p","muted","Aucun utilisateur correspondant."));return;}
 const table=node("table"),thead=node("thead"),tr=node("tr");
 ["Utilisateur","Requêtes","Tokens utilisés","Tokens restants","Dernière activité"].forEach(x=>tr.append(node("th","",x)));
 thead.append(tr);table.append(thead);const tbody=node("tbody");
 for(const user of rows){
  const row=node("tr");
  row.append(node("td","",user.email),node("td","num",Number(user.requests||0).toLocaleString()),node("td","num",Number(user.tokens_used||0).toLocaleString()),node("td","num",user.tokens_remaining===null?"—":Number(user.tokens_remaining).toLocaleString()),node("td","",user.last_activity?new Date(user.last_activity+"Z").toLocaleString():"—"));
  tbody.append(row);
 }
 table.append(tbody);host.append(table);
}
async function refreshUsage(){
 try{state.usage=await api("/api/admin/ai/usage");renderUsage();renderOverview();}
 catch(e){notice("Impossible de charger les statistiques AI : "+e.message,true);}
}
async function loadGithubRepos(){
 const select=$("#githubRepoSelect"),status=$("#githubImportStatus"),btn=$("#importGithubRepo"),refresh=$("#refreshGithubRepos");
 refresh.disabled=true;select.replaceChildren(new Option("Chargement des repositories…",""));
 try{
  const data=await api("/api/admin/github/repos");state.repos=data.repositories||[];
  select.replaceChildren(new Option(state.repos.length?"Choisir un repository…":"Aucun repository public trouvé",""));
  for(const repo of state.repos){const option=new Option(repo.name+" · "+(repo.language||"Repository")+" · "+repo.updated_at.slice(0,10),repo.url);option.dataset.repo=repo.full_name;select.append(option);}
  status.textContent=state.repos.length?state.repos.length+" repositories publics chargés. Choisissez-en un puis cliquez sur Importer.":"Aucun repository public disponible.";
  btn.disabled=true;
 }catch(e){select.replaceChildren(new Option("Erreur de chargement",""));status.textContent=e.message;status.className="github-import-status error";}
 finally{refresh.disabled=false;}
}

async function importGithubProject(){
 const select=$("#githubRepoSelect"),status=$("#githubImportStatus"),btn=$("#importGithubRepo");
 const selected=state.repos.find(r=>r.url===select.value);
 if(!selected){status.textContent="Choisissez un repository dans la liste.";status.className="github-import-status error";return;}
 btn.disabled=true;btn.textContent="Importation…";status.className="github-import-status";status.textContent="Lecture du repository et préparation de la fiche projet…";
 try{
  const result=await api("/api/admin/projects/import",{method:"POST",body:JSON.stringify({url:selected.url,provider:"github"})});
  status.textContent="Projet importé et publié : "+(result.project?.title||selected.name)+".";
  status.className="github-import-status success";select.value="";await Promise.all([load(),loadGithubRepos()]);
 }catch(error){status.textContent=error.message||"Échec de l'import.";status.className="github-import-status error";}
 finally{btn.disabled=!select.value;btn.textContent="Importer le projet ↗";}
}
function renderProjects(){
 const root=$("#projectsList");root.replaceChildren();$("#projectCount").textContent=String(state.projects.length);
 if(!state.projects.length){root.append(node("p","muted","Aucun projet enregistré."));return;}
 for(const p of state.projects){
  const card=node("article","record"),top=node("div","record-top"),left=node("div"),title=node("h3","",p.title),meta=node("div","meta",p.id+" · "+p.type+" · ordre "+p.sort_order);
  left.append(title,meta);const status=node("span","status"+(p.visible?" on":""),p.visible?"VISIBLE":"MASQUÉ");top.append(left,status);
  const desc=node("p","",p.description_fr),url=node("p","",p.url),actions=node("div","record-actions");
  actions.append(button("Modifier",()=>editProject(p)),button(p.visible?"Masquer":"Publier",()=>toggleProject(p),p.visible?"":"primary"),button("Supprimer",()=>deleteProject(p),"danger"));
  card.append(top,desc,url,actions);root.append(card);
 }
}
async function load(){
 try{
  const [session,facts,projects]=await Promise.all([api("/api/admin/session"),api("/api/admin/facts"),api("/api/admin/projects")]);
  $("#identity").textContent=session.user.email;state.facts=facts.facts;state.projects=projects.projects;renderFacts();renderProjects();renderOverview();await Promise.allSettled([refreshUsage(),loadGithubRepos()]);
  try{state.learning=await api("/api/admin/learning");renderLearning();}catch(_){$("#learningSummary").textContent="La migration web_knowledge n'est pas encore déployée.";} 
 }catch(e){$("#identity").textContent="Accès non vérifié";notice(e.message+" Vérifiez que Cloudflare Access protège /admin.html et que l'API est configurée.",true);}
}
function formData(form){return Object.fromEntries(new FormData(form).entries());}
function editFact(f){
 state.editingFact=f?f.id:null;const form=$("#factForm");form.hidden=false;form.reset();$("#factFormTitle").textContent=f?"Modifier l'information":"Nouvelle information";
 if(f){for(const [k,v] of Object.entries({id:f.id,category:f.category,text_fr:f.text_fr,text_en:f.text_en,text_ar:f.text_ar,aliases:f.aliases.join(", "),source_file:f.source_file,source_selector:f.source_selector,url:f.url||""})){form.elements[k].value=v;}form.elements.approved.checked=f.approved;}
 else {form.elements.source_file.value="index.html";form.elements.approved.checked=false;}
 form.elements.id.readOnly=!!f;form.scrollIntoView({behavior:"smooth",block:"center"});
}
function editProject(p){
 state.editingProject=p?p.id:null;const form=$("#projectForm");form.hidden=false;form.reset();$("#projectFormTitle").textContent=p?"Modifier le projet":"Nouveau projet";
 if(p){for(const [k,v] of Object.entries(p)){if(form.elements[k]&&k!=="visible")form.elements[k].value=v;}form.elements.visible.checked=p.visible;}
 else {form.elements.sort_order.value=String(state.projects.length*10);form.elements.visible.checked=false;}
 form.elements.id.readOnly=!!p;form.scrollIntoView({behavior:"smooth",block:"center"});
}
async function saveFact(e){
 e.preventDefault();const form=e.currentTarget,d=formData(form),f={id:d.id.trim(),category:d.category,text_fr:d.text_fr.trim(),text_en:d.text_en.trim(),text_ar:d.text_ar.trim(),aliases:d.aliases.split(/[,،]/).map(x=>x.trim()).filter(Boolean),source:{file:d.source_file.trim(),selector:d.source_selector.trim()},url:d.url.trim(),approved:form.elements.approved.checked};
 try{await api(state.editingFact?"/api/admin/facts/"+encodeURIComponent(state.editingFact):"/api/admin/facts",{method:state.editingFact?"PUT":"POST",body:JSON.stringify(f)});form.hidden=true;notice("Information enregistrée.");await load();}catch(err){notice(err.message,true);}
}
async function saveProject(e){
 e.preventDefault();const form=e.currentTarget,d=formData(form),p={id:d.id.trim(),title:d.title.trim(),type:d.type.trim(),description_fr:d.description_fr.trim(),description_en:d.description_en.trim(),url:d.url.trim(),visible:form.elements.visible.checked,sort_order:Number(d.sort_order)};
 try{await api(state.editingProject?"/api/admin/projects/"+encodeURIComponent(state.editingProject):"/api/admin/projects",{method:state.editingProject?"PUT":"POST",body:JSON.stringify(p)});form.hidden=true;notice("Projet enregistré.");await load();}catch(err){notice(err.message,true);}
}
async function toggleFact(f){try{const payload={id:f.id,category:f.category,text_fr:f.text_fr,text_en:f.text_en,text_ar:f.text_ar,aliases:f.aliases,source:f.source,url:f.url||"",approved:!f.approved};await api("/api/admin/facts/"+encodeURIComponent(f.id),{method:"PUT",body:JSON.stringify(payload)});notice("Statut de validation mis à jour.");await load();}catch(e){notice(e.message,true);}}
async function toggleProject(p){try{await api("/api/admin/projects/"+encodeURIComponent(p.id),{method:"PUT",body:JSON.stringify({...p,visible:!p.visible})});notice("Visibilité du projet mise à jour.");await load();}catch(e){notice(e.message,true);}}
async function deleteFact(f){if(!confirm("Supprimer définitivement "+f.id+" ?"))return;try{await api("/api/admin/facts/"+encodeURIComponent(f.id),{method:"DELETE"});notice("Information supprimée.");await load();}catch(e){notice(e.message,true);}}
async function deleteProject(p){if(!confirm("Supprimer définitivement "+p.title+" ?"))return;try{await api("/api/admin/projects/"+encodeURIComponent(p.id),{method:"DELETE"});notice("Projet supprimé.");await load();}catch(e){notice(e.message,true);}}
document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===tab));["overview","usage","facts","projects","learning"].forEach(name=>$("#"+name+"Panel").hidden=tab.dataset.tab!==name);}));document.querySelectorAll("[data-go-tab]").forEach(b=>b.addEventListener("click",()=>document.querySelector(`[data-tab="${b.dataset.goTab}"]`).click()));
$("#refreshLearning").addEventListener("click",async()=>{const b=$("#refreshLearning");b.disabled=true;b.textContent="Actualisation…";try{const result=await api("/api/admin/learning/refresh",{method:"POST",body:"{}"});notice("Actualisation terminée : "+result.saved+" sources enregistrées, "+result.failed.length+" flux en erreur.");state.learning=await api("/api/admin/learning");renderLearning();}catch(e){notice(e.message,true);}finally{b.disabled=false;b.textContent="↻ Actualiser maintenant";}});
$("#newFact").addEventListener("click",()=>editFact(null));$("#newProject").addEventListener("click",()=>editProject(null));$("#importGithubRepo").addEventListener("click",importGithubProject);$("#githubRepoSelect").addEventListener("change",e=>$("#importGithubRepo").disabled=!e.target.value);$("#refreshGithubRepos").addEventListener("click",loadGithubRepos);$("#refreshDashboard").addEventListener("click",()=>{load();refreshUsage();});$("#refreshUsage").addEventListener("click",refreshUsage);$("#usageFilter").addEventListener("input",renderUsage);
$("#factForm").addEventListener("submit",saveFact);$("#projectForm").addEventListener("submit",saveProject);
document.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.cancel+"Form").hidden=true));
load();
})();