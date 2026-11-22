(() => {
"use strict";
const $=(s,root=document)=>root.querySelector(s);
const state={facts:[],projects:[],backups:[],editingFact:null,editingProject:null};
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
function renderBackups(backupData) {
 const root=$("#backupsList");root.replaceChildren();const backups=backupData?.backups||state.backups||[];
 $("#backupCount").textContent=String(backups.length);
 $("#backupLatestDate").textContent=backupData?.latest?.created_at?new Date(backupData.latest.created_at).toLocaleString():"Aucune sauvegarde";
 const latestStatus=backupData?.latest?.status;
 $("#backupLatestStatus").textContent=latestStatus==="stored"?"Stocké dans R2 (Opérationnel)":latestStatus==="not_stored"?"Non Stocké (R2 Déconnecté)":latestStatus==="failed"?"Échoué":(latestStatus||"En attente");
 $("#backupR2Status").textContent=backupData?.r2_bound?"R2 Actif & Connecté":"Non lié (Stockage en mémoire uniquement)";
 if(!backups.length){root.append(node("p","muted","Aucune sauvegarde enregistrée pour le moment."));return;}
 for(const b of backups){
  const card=node("article","record"),top=node("div","record-top"),left=node("div"),title=node("h3","",b.key);
  const sizeKb=b.size_bytes?(b.size_bytes/1024).toFixed(1)+" Ko":"—";
  const meta=node("div","meta","Taille: "+sizeKb+" · Date: "+(b.created_at?new Date(b.created_at).toLocaleString():"Inconnue"));
  left.append(title,meta);
  const bStatus=b.status==="stored"?"STOCKÉ (R2)":b.status==="not_stored"?"NON STOCKÉ (MÉMOIRE)":"ÉCHOUÉ";
  const statusClass=b.status==="stored"?"status on":"status off";
  const status=node("span",statusClass,bStatus);top.append(left,status);
  const hashP=node("p","",b.sha256?"SHA-256 (plaintext): "+b.sha256:"");
  const actions=node("div","record-actions");
  actions.append(
   button("Télécharger",()=>downloadBackup(b.key),"ghost"),
   button("Vérifier l'intégrité",()=>verifyBackup(b.key),"ghost"),
   button("Sélectionner pour restauration",()=>selectForRestore(b.key),"")
  );
  card.append(top,hashP,actions);root.append(card);
 }
}
async function load(){
 try{
  const [session,facts,projects,backups]=await Promise.all([
   api("/api/admin/session"),
   api("/api/admin/facts"),
   api("/api/admin/projects"),
   api("/api/admin/backups").catch(()=>({backups:[],latest:null,r2_bound:false}))
  ]);
  $("#identity").textContent=session.user.email;state.facts=facts.facts;state.projects=projects.projects;state.backups=backups.backups||[];
  renderFacts();renderProjects();renderBackups(backups);
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

async function triggerManualBackup(){
 try{
  notice("Création de la sauvegarde en cours…");
  const res=await api("/api/admin/backups/create",{method:"POST",body:"{}"});
  if(res.backup?.stored_to_r2){
    notice("Sauvegarde chiffrée créée et stockée dans R2 avec succès ("+res.backup.key+").");
  } else {
    notice("Sauvegarde chiffrée créée en mémoire ("+res.backup.key+") mais NON stockée dans R2 (R2 non connecté).", true);
  }
  await load();
 }catch(e){notice(e.message,true);}
}
function downloadBackup(key){
 window.open(API_BASE+"/api/admin/backups/download?key="+encodeURIComponent(key),"_blank");
}
async function verifyBackup(key){
 try{
  notice("Vérification cryptographique de l'intégrité…");
  const res=await api("/api/admin/backups/verify",{method:"POST",body:JSON.stringify({key})});
  notice("Sauvegarde "+res.key+" intègre et valide (SHA-256: "+res.sha256_plain.slice(0,16)+"…).");
 }catch(e){notice("Échec de vérification: "+e.message,true);}
}
function selectForRestore(key){
 $("#restoreKey").value=key;
 $("#restoreKey").scrollIntoView({behavior:"smooth",block:"center"});
}
async function dryRunRestore(){
 const key=$("#restoreKey").value.trim();
 if(!key){notice("Veuillez spécifier la clé de sauvegarde à tester.",true);return;}
 try{
  notice("Simulation de restauration (Dry Run) en cours…");
  const res=await api("/api/admin/backups/restore",{method:"POST",body:JSON.stringify({key,dry_run:true})});
  $("#restoreOutput").hidden=false;
  $("#restoreOutput").textContent="=== RÉSULTAT DU DRY RUN (AUCUNE MODIFICATION) ===\n" +
   "Valide: "+res.valid+"\nDate de source: "+res.backup_date+"\nLignes détectées:\n" +
   JSON.stringify(res.row_counts,null,2);
  notice("Dry run réussi. Les données sont intègres.");
 }catch(e){
  $("#restoreOutput").hidden=false;
  $("#restoreOutput").textContent="ERREUR DRY RUN:\n"+e.message;
  notice(e.message,true);
 }
}
async function liveRestore(){
 const key=$("#restoreKey").value.trim();
 const confirmation=$("#restoreConfirmation").value.trim();
 if(!key){notice("Spécifiez la clé de sauvegarde.",true);return;}
 if(!confirm("ATTENTION: Cette action va écraser les données de production. Êtes-vous absolument sûr ?")) return;
 try{
  notice("Restauration réelle en cours…");
  const res=await api("/api/admin/backups/restore",{method:"POST",body:JSON.stringify({key,dry_run:false,confirmation})});
  $("#restoreOutput").hidden=false;
  $("#restoreOutput").textContent="=== RESTAURATION RÉELLE TERMINÉE ===\n"+JSON.stringify(res,null,2);
  notice("Restauration terminée avec succès.");
  await load();
 }catch(e){
  $("#restoreOutput").hidden=false;
  $("#restoreOutput").textContent="ERREUR DE RESTAURATION:\n"+e.message;
  notice(e.message,true);
 }
}

document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===tab));
 $("#factsPanel").hidden=tab.dataset.tab!=="facts";
 $("#projectsPanel").hidden=tab.dataset.tab!=="projects";
 $("#backupsPanel").hidden=tab.dataset.tab!=="backups";
}));
$("#newFact").addEventListener("click",()=>editFact(null));$("#newProject").addEventListener("click",()=>editProject(null));
$("#factForm").addEventListener("submit",saveFact);$("#projectForm").addEventListener("submit",saveProject);
document.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.cancel+"Form").hidden=true));
$("#triggerBackup").addEventListener("click",triggerManualBackup);
$("#btnRestoreDryRun").addEventListener("click",dryRunRestore);
$("#btnRestoreLive").addEventListener("click",liveRestore);
$("#restoreConfirmation").addEventListener("input",e=>{
 $("#btnRestoreLive").disabled=e.target.value.trim()!=="CONFIRM_RESTORE_OVERWRITE_PRODUCTION";
});
load();
})();