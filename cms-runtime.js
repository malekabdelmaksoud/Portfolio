(function(){
"use strict";
function setText(selector,value){if(typeof value!=="string"||!value.trim())return;const el=document.querySelector(selector);if(!el)return;el.textContent=value;el.dataset.fr=value;el.dataset.en=value;}
function renderProjects(projects){
 const grid=document.querySelector("#projets .projects-grid");if(!grid||!Array.isArray(projects)||!projects.length)return;
 grid.replaceChildren();
 projects.forEach((p,i)=>{
  const card=document.createElement("article");card.className="project-card";
  const visual=document.createElement("div");visual.className="project-visual visual-"+(["one","two","three","four","five","six","seven"][i%7]);
  const number=document.createElement("span");number.textContent=String(i+1).padStart(2,"0");
  const symbol=document.createElement("div");symbol.className="project-symbol";symbol.textContent=(p.name||"P").trim().slice(0,2).toUpperCase();visual.append(number,symbol);
  const body=document.createElement("div");body.className="project-body";
  const type=document.createElement("p");type.className="project-type";type.textContent=p.type||"PROJECT";
  const title=document.createElement("h3");title.textContent=p.name||"Projet";
  const desc=document.createElement("p");desc.textContent=p.description||"";
  body.append(type,title,desc);
  if(p.url){const link=document.createElement("a");link.href=p.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Voir le projet ↗";body.append(link);}
  card.append(visual,body);grid.append(card);
 });
}
function renderExperience(items){
 const timeline=document.querySelector("#experiences .timeline");if(!timeline||!Array.isArray(items)||!items.length)return;
 timeline.replaceChildren();
 items.forEach(item=>{const row=document.createElement("article");row.className="timeline-item";const date=document.createElement("div");date.className="timeline-date";date.textContent=item.date||"";const body=document.createElement("div");body.className="timeline-content";const title=document.createElement("h3");title.textContent=item.title||"";const company=document.createElement("p");company.className="company";company.textContent=item.company||"";const desc=document.createElement("p");desc.textContent=item.description||"";body.append(title,company,desc);row.append(date,body);timeline.append(row);});
}
async function loadPublishedContent(){
 try{
  const res=await fetch("/api/content",{cache:"no-store"});if(!res.ok)return;const data=await res.json();const c=data.content;if(!c)return;
  if(c.hero){setText(".hero h2",c.hero.title);setText(".hero-text",c.hero.description);}
  if(c.about){setText("#apropos .section-title",c.about.title);const copy=document.querySelector("#apropos .about-copy");if(copy&&c.about.body){copy.textContent=c.about.body;}}
  if(c.skills){setText("#skillsLangagesList",c.skills.languages);setText("#skillsWebList",c.skills.web);setText("#skillsFrameworksList",c.skills.frameworks);setText("#skillsSystemesList",c.skills.systems);}
  renderProjects(c.projects);renderExperience(c.experience);
 }catch(_){}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",loadPublishedContent);else loadPublishedContent();
})();