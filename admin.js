(() => {
"use strict";
const $=(s,root=document)=>root.querySelector(s);
const state={facts:[],projects:[],editingFact:null,editingProject:null};
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
  const fr=node("p","",f.text_fr),en=node("p","",f.text_en),ar=node("p","",f.text_ar),actions=node("div","record-actions");\n  ar.dir="rtl";ar.lang="ar";
  actions.append(button("Modifier",()=>editFact(f)),button(f.approved?"Retirer l'approbation":"Approuver",()=>toggleFact(f),f.approved?"":"primary"),button("Supprimer",()=>deleteFact(f),"danger"));
  card.append(top,fr,en,ar,actions);root.append(card);
 }
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
  $("#identity").textContent=session.user.email;state.facts=facts.facts;state.projects=projects.projects;renderFacts();renderProjects();
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
 e.preventDefault();const form=e.currentTarget,d=formData(form),f={id:d.id.trim(),category:d.category,text_fr:d.text_fr.trim(),text_en:d.text_en.trim(),text_ar:d.text_ar.trim(),aliases:d.aliases.split(",").map(x=>x.trim()).filter(Boolean),source:{file:d.source_file.trim(),selector:d.source_selector.trim()},url:d.url.trim(),approved:form.elements.approved.checked};
 try{await api(state.editingFact?"/api/admin/facts/"+encodeURIComponent(state.editingFact):"/api/admin/facts",{method:state.editingFact?"PUT":"POST",body:JSON.stringify(f)});form.hidden=true;notice("Information enregistrée.");await load();}catch(err){notice(err.message,true);}
}
async function saveProject(e){
 e.preventDefault();const form=e.currentTarget,d=formData(form),p={id:d.id.trim(),title:d.title.trim(),type:d.type.trim(),description_fr:d.description_fr.trim(),description_en:d.description_en.trim(),url:d.url.trim(),visible:form.elements.visible.checked,sort_order:Number(d.sort_order)};
 try{await api(state.editingProject?"/api/admin/projects/"+encodeURIComponent(state.editingProject):"/api/admin/projects",{method:state.editingProject?"PUT":"POST",body:JSON.stringify(p)});form.hidden=true;notice("Projet enregistré.");await load();}catch(err){notice(err.message,true);}
}
async function toggleFact(f){try{await api("/api/admin/facts/"+encodeURIComponent(f.id),{method:"PUT",body:JSON.stringify({...f,approved:!f.approved})});notice("Statut de validation mis à jour.");await load();}catch(e){notice(e.message,true);}}
async function toggleProject(p){try{await api("/api/admin/projects/"+encodeURIComponent(p.id),{method:"PUT",body:JSON.stringify({...p,visible:!p.visible})});notice("Visibilité du projet mise à jour.");await load();}catch(e){notice(e.message,true);}}
async function deleteFact(f){if(!confirm("Supprimer définitivement "+f.id+" ?"))return;try{await api("/api/admin/facts/"+encodeURIComponent(f.id),{method:"DELETE"});notice("Information supprimée.");await load();}catch(e){notice(e.message,true);}}
async function deleteProject(p){if(!confirm("Supprimer définitivement "+p.title+" ?"))return;try{await api("/api/admin/projects/"+encodeURIComponent(p.id),{method:"DELETE"});notice("Projet supprimé.");await load();}catch(e){notice(e.message,true);}}
document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===tab));$("#factsPanel").hidden=tab.dataset.tab!=="facts";$("#projectsPanel").hidden=tab.dataset.tab!=="projects";}));
$("#newFact").addEventListener("click",()=>editFact(null));$("#newProject").addEventListener("click",()=>editProject(null));
$("#factForm").addEventListener("submit",saveFact);$("#projectForm").addEventListener("submit",saveProject);
document.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.cancel+"Form").hidden=true));
load();
})();