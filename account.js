(() => {
  const base=String(window.PORTFOLIO_API_BASE||"").replace(/\/$/,"");
  const $=id=>document.getElementById(id);
  let active=null,mode="chat",sending=false,chats=[];
  const api=async(path,options={})=>{
    const response=await fetch(base+path,{...options,credentials:"include",headers:{"content-type":"application/json","accept":"application/json",...(options.headers||{})}});
    if(response.status===401||response.status===403)throw new Error("Votre session Cloudflare Access n'est pas active. Rechargez la page et terminez la connexion par e-mail.");
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Erreur du serveur.");return data;
  };
  function toast(message){$("toast").textContent=message;$("toast").classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("toast").classList.remove("show"),3000);}
  function escapeHTML(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function renderText(value){return escapeHTML(value).split("\n").map(line=>"<p>"+line+"</p>").join("");}
  function addMessage(role,content,withActions=true){
    const node=document.createElement("article");node.className="message "+(role==="user"?"user":"assistant");
    const avatar=document.createElement("div");avatar.className="message-avatar";avatar.textContent=role==="user"?"M":"AI";
    const body=document.createElement("div");body.className="message-body";
    const label=document.createElement("div");label.className="message-role";label.textContent=role==="user"?"You":"Melek AI";
    const text=document.createElement("div");text.className="message-text";text.innerHTML=renderText(content);
    body.append(label,text);
    if(role==="assistant"&&withActions){const actions=document.createElement("div");actions.className="message-actions";const copy=document.createElement("button");copy.type="button";copy.textContent="Copier";copy.addEventListener("click",()=>navigator.clipboard?.writeText(content).then(()=>toast("Réponse copiée."),()=>toast("Copie indisponible.")));actions.append(copy);body.append(actions);}
    node.append(avatar,body);$("messages").append(node);$("messages").scrollTop=$("messages").scrollHeight;return node;
  }
  function groupFor(value){const d=new Date(String(value).endsWith("Z")?value:value+"Z"),n=new Date(),today=new Date(n.getFullYear(),n.getMonth(),n.getDate()),day=new Date(d.getFullYear(),d.getMonth(),d.getDate()),diff=Math.round((today-day)/86400000);return diff<=0?"Today":diff===1?"Yesterday":diff<7?"Previous 7 days":"Older";}
  function renderList(){
    const list=$("chat-list");list.replaceChildren();const query=$("history-search").value.trim().toLowerCase(),filtered=chats.filter(c=>(c.title||"").toLowerCase().includes(query));
    if(!filtered.length){const p=document.createElement("p");p.className="list-empty";p.textContent=query?"Aucun résultat.":"Aucune conversation pour le moment.";list.append(p);return;}
    ["Today","Yesterday","Previous 7 days","Older"].forEach(group=>{
      const items=filtered.filter(c=>groupFor(c.updated_at)===group);if(!items.length)return;
      const heading=document.createElement("div");heading.className="history-group";heading.textContent=group;list.append(heading);
      items.forEach(chat=>{
        const button=document.createElement("button");button.type="button";button.className="chat-item"+(chat.id===active?" active":"");
        const title=document.createElement("span");title.className="chat-name";title.textContent=chat.title||"New chat";
        const menu=document.createElement("button");menu.type="button";menu.className="chat-menu";menu.textContent="···";menu.title="Options";
        menu.addEventListener("click",async e=>{e.stopPropagation();const action=prompt("Tapez rename pour renommer ou delete pour supprimer :","rename");if(action==="rename"){const next=prompt("Nouveau titre :",chat.title);if(next?.trim())try{await api("/api/user/chats/"+encodeURIComponent(chat.id),{method:"PUT",body:JSON.stringify({title:next.trim()})});await refreshChats();if(active===chat.id)$("conversation-head").textContent=next.trim();}catch(err){toast(err.message);}}else if(action==="delete")await deleteChat(chat.id);});
        button.append(title,menu);button.addEventListener("click",()=>openChat(chat.id));list.append(button);
      });
    });
  }
  async function refreshChats(){const data=await api("/api/user/chats");chats=data.chats||[];renderList();}
  async function openChat(id){
    try{const data=await api("/api/user/chats/"+encodeURIComponent(id));active=id;$("welcome").hidden=true;$("conversation").hidden=false;$("conversation-head").textContent=data.chat.title||"Conversation";$("messages").replaceChildren();(data.messages||[]).forEach(m=>addMessage(m.role,m.content));renderList();$("messages").scrollTop=$("messages").scrollHeight;}catch(e){toast(e.message);}
  }
  async function createChat(title="New chat"){
    const data=await api("/api/user/chats",{method:"POST",body:JSON.stringify({title})});active=data.chat.id;$("welcome").hidden=true;$("conversation").hidden=false;$("conversation-head").textContent=data.chat.title;$("messages").replaceChildren();await refreshChats();return data.chat;
  }
  async function deleteChat(id){if(!confirm("Supprimer définitivement cette conversation ?"))return;try{await api("/api/user/chats/"+encodeURIComponent(id),{method:"DELETE"});if(active===id){active=null;$("conversation").hidden=true;$("welcome").hidden=false;$("messages").replaceChildren();}await refreshChats();toast("Conversation supprimée.");}catch(e){toast(e.message);}}
  function setMode(next){mode=next;$("mode-chat").classList.toggle("selected",mode==="chat");$("mode-analyze").classList.toggle("selected",mode==="analyze");$("mode-hint").textContent=mode==="chat"?"Réponses directes et concises":"Réponse structurée et analyse détaillée";$("mobile-mode").textContent=mode==="chat"?"Chat":"Analyze";}
  async function sendMessage(event){
    event.preventDefault();const input=$("chat-input"),question=input.value.trim();if(!question||sending)return;sending=true;$("send-message").disabled=true;input.value="";input.style.height="auto";
    try{
      if(!active)await createChat(question.slice(0,64));
      await api("/api/user/chats/"+encodeURIComponent(active),{method:"POST",body:JSON.stringify({role:"user",content:question})});addMessage("user",question);
      const pending=addMessage("assistant",mode==="analyze"?"Analyse en cours…":"Réponse en cours…",false);
      const context=[...$("messages").querySelectorAll(".message")].slice(-8,-1).map(n=>n.querySelector(".message-text")?.textContent||"");
      const response=await fetch(base+"/api/assistant",{method:"POST",credentials:"omit",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify({question,mode,context})});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Le service AI est indisponible.");
      const answer=typeof data.answer==="string"?data.answer:"Aucune réponse disponible.";pending.remove();
      await api("/api/user/chats/"+encodeURIComponent(active),{method:"POST",body:JSON.stringify({role:"assistant",content:answer})});addMessage("assistant",answer);await refreshChats();
    }catch(e){toast(e.message);input.value=question;}
    finally{sending=false;$("send-message").disabled=false;input.focus();}
  }
  async function load(){
    try{const me=await api("/api/user/me");$("identity").textContent=me.user.email;$("status").textContent="Compte vérifié · historique privé";await refreshChats();if(chats.length)await openChat(chats[0].id);}
    catch(e){$("identity").textContent="Connexion requise";$("status").textContent=e.message;toast(e.message);}
  }
  $("new-chat").addEventListener("click",async()=>{try{active=null;await createChat();$("chat-input").focus();}catch(e){toast(e.message);}});
  $("chat-form").addEventListener("submit",sendMessage);
  $("chat-input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chat-form").requestSubmit();}});
  $("chat-input").addEventListener("input",()=>{$("chat-input").style.height="auto";$("chat-input").style.height=Math.min($("chat-input").scrollHeight,180)+"px";});
  $("mode-chat").addEventListener("click",()=>setMode("chat"));$("mode-analyze").addEventListener("click",()=>setMode("analyze"));
  $("history-search").addEventListener("input",renderList);
  $("delete-all").addEventListener("click",async()=>{if(!confirm("Supprimer tout votre historique ? Cette action est irréversible."))return;try{await api("/api/user/chats",{method:"DELETE"});active=null;chats=[];$("conversation").hidden=true;$("welcome").hidden=false;$("messages").replaceChildren();renderList();toast("Historique supprimé.");}catch(e){toast(e.message);}});
  $("sidebar-toggle").addEventListener("click",()=>$("sidebar").classList.toggle("collapsed"));
  $("mobile-menu").addEventListener("click",()=>$("sidebar").classList.toggle("mobile-open"));
  document.querySelectorAll("[data-prompt]").forEach(button=>button.addEventListener("click",()=>{$("chat-input").value=button.dataset.prompt;$("chat-input").focus();}));
  document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("new-chat").click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="f"){e.preventDefault();$("history-search").focus();}});
  load();
})();