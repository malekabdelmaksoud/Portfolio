(() => {
  const base=String(window.PORTFOLIO_API_BASE||"").replace(/\/$/,"");
  const $=id=>document.getElementById(id);
  let active=null;
  const api=async(path,options={})=>{
    const response=await fetch(base+path,{...options,credentials:"include",headers:{"content-type":"application/json","accept":"application/json",...(options.headers||{})}});
    if(response.status===401||response.status===403) throw new Error("Votre session e-mail n'est pas active. Rechargez cette page et terminez la connexion Cloudflare Access.");
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Erreur du serveur.");
    return data;
  };
  function toast(message){$("toast").textContent=message;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),3200);}
  function esc(value){return String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  async function load(){
    try{
      const me=await api("/api/user/me");
      $("identity").textContent=me.user.email;
      $("status").textContent="Compte vérifié · historique privé";
      const data=await api("/api/user/chats");
      renderList(data.chats||[]);
      if(active && (data.chats||[]).some(c=>c.id===active)) await openChat(active);
      else if(data.chats?.length) await openChat(data.chats[0].id);
    }catch(error){$("identity").textContent="Connexion requise";$("status").textContent=error.message;toast(error.message);}
  }
  function renderList(chats){
    const list=$("chat-list");list.replaceChildren();
    if(!chats.length){const p=document.createElement("p");p.className="empty";p.textContent="Aucune conversation enregistrée.";list.append(p);return;}
    chats.forEach(chat=>{
      const b=document.createElement("button");b.type="button";b.className="chat-item"+(chat.id===active?" active":"");
      const span=document.createElement("span");span.textContent=chat.title;
      const small=document.createElement("small");small.textContent=new Date(chat.updated_at+"Z").toLocaleDateString();
      b.append(span,small);b.addEventListener("click",()=>openChat(chat.id));list.append(b);
    });
  }
  async function openChat(id){
    active=id;const data=await api("/api/user/chats/"+encodeURIComponent(id));
    $("conversation-head").innerHTML="<div class='conversation-head'><h2>"+esc(data.chat.title)+"</h2><button id='delete-current' class='danger-link' type='button'>Supprimer</button></div>";
    $("delete-current").addEventListener("click",()=>deleteChat(id));
    const area=$("messages");area.replaceChildren();
    if(!data.messages.length){const p=document.createElement("p");p.className="empty";p.textContent="Cette conversation est vide.";area.append(p);}
    data.messages.forEach(m=>{const b=document.createElement("div");b.className="bubble "+(m.role==="user"?"user":"assistant");b.textContent=m.content;area.append(b);});
    renderList((await api("/api/user/chats")).chats||[]);
  }
  async function deleteChat(id){
    if(!confirm("Supprimer définitivement cette conversation et ses messages ?"))return;
    await api("/api/user/chats/"+encodeURIComponent(id),{method:"DELETE"});
    active=null;$("conversation-head").innerHTML="<h2>Choisissez une conversation</h2>";$("messages").innerHTML="<p class='empty'>Conversation supprimée.</p>";await load();toast("Conversation supprimée.");
  }
  $("new-chat").addEventListener("click",async()=>{try{const data=await api("/api/user/chats",{method:"POST",body:JSON.stringify({title:"Nouvelle conversation"})});await load();await openChat(data.chat.id);toast("Conversation créée.");}catch(e){toast(e.message);}});
  $("delete-all").addEventListener("click",async()=>{if(!confirm("Supprimer tout votre historique ? Cette action est irréversible."))return;try{await api("/api/user/chats",{method:"DELETE"});active=null;$("conversation-head").innerHTML="<h2>Choisissez une conversation</h2>";$("messages").innerHTML="<p class='empty'>Historique supprimé.</p>";await load();toast("Tout l'historique a été supprimé.");}catch(e){toast(e.message);}});
  load();
})();