(() => {
  const base=String(window.PORTFOLIO_API_BASE||"").replace(/\/$/,"");
  const $=id=>document.getElementById(id);
  let active=null,mode="chat",sending=false,chats=[],searchSequence=0,availableModels=[],attachment=null,lastAssistantAnswer="";
  const api=async(path,options={})=>{
    const response=await fetch(base+path,{...options,credentials:"include",headers:{"content-type":"application/json","accept":"application/json",...(options.headers||{})}});
    if(response.status===401||response.status===403)throw new Error("Votre session Cloudflare Access n'est pas active. Rechargez la page et terminez la connexion par e-mail.");
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Erreur du serveur.");return data;
  };
  function toast(message){$("toast").textContent=message;$("toast").classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("toast").classList.remove("show"),3000);}
  function escapeHTML(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function renderText(value){return escapeHTML(value).split("\n").map(line=>"<p>"+line+"</p>").join("");}
  function addMessage(role,content,withActions=true,sources=[]){
    const node=document.createElement("article");node.className="message "+(role==="user"?"user":"assistant");
    const avatar=document.createElement("div");avatar.className="message-avatar";avatar.textContent=role==="user"?"M":"AI";
    const body=document.createElement("div");body.className="message-body";
    const label=document.createElement("div");label.className="message-role";label.textContent=role==="user"?"You":"Melek AI";
    const text=document.createElement("div");text.className="message-text";text.innerHTML=renderText(content);
    body.append(label,text);
    if(role==="assistant"&&Array.isArray(sources)&&sources.length){
      const sourceList=document.createElement("div");sourceList.className="message-sources";
      const heading=document.createElement("strong");heading.textContent="Sources web indexées automatiquement";sourceList.append(heading);
      sources.slice(0,3).forEach(source=>{
        if(!source||typeof source.url!=="string"||!/^https:\/\//i.test(source.url))return;
        try{const url=new URL(source.url);if(!["blog.cloudflare.com","genai.owasp.org","huggingface.co","arxiv.org","export.arxiv.org"].includes(url.hostname))return;
          const link=document.createElement("a");link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";link.textContent=String(source.title||source.source||url.hostname).slice(0,120);sourceList.append(link);
        }catch(_){}
      });
      if(sourceList.querySelector("a"))body.append(sourceList);
    }
    if(role==="assistant"&&withActions){const actions=document.createElement("div");actions.className="message-actions";const copy=document.createElement("button");copy.type="button";copy.textContent="Copier";copy.addEventListener("click",()=>navigator.clipboard?.writeText(content).then(()=>toast("Réponse copiée."),()=>toast("Copie indisponible.")));const speak=document.createElement("button");speak.type="button";speak.textContent="Écouter";speak.addEventListener("click",()=>speakText(content));actions.append(copy,speak);body.append(actions);if(role==="assistant")lastAssistantAnswer=content;}
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
        const button=document.createElement("div");button.setAttribute("role","button");button.tabIndex=0;button.className="chat-item"+(chat.id===active?" active":"");
        const title=document.createElement("span");title.className="chat-name";title.textContent=chat.title||"New chat";
        const menu=document.createElement("button");menu.type="button";menu.className="chat-menu";menu.textContent="···";menu.title="Options";
        menu.addEventListener("click",async e=>{e.stopPropagation();const action=prompt("Tapez rename pour renommer ou delete pour supprimer :","rename");if(action==="rename"){const next=prompt("Nouveau titre :",chat.title);if(next?.trim())try{await api("/api/user/chats/"+encodeURIComponent(chat.id),{method:"PUT",body:JSON.stringify({title:next.trim()})});await refreshChats();if(active===chat.id)$("conversation-head").textContent=next.trim();}catch(err){toast(err.message);}}else if(action==="delete")await deleteChat(chat.id);});
        button.append(title,menu);button.addEventListener("click",()=>openChat(chat.id));button.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openChat(chat.id);}});list.append(button);
      });
    });
  }
  function notifyRetention(result){const count=Number(result?.retention?.deletedChats||0);if(count>0)toast(count+" anciennes conversations supprimées pour libérer de l’espace.");}
  async function refreshChats(){const data=await api("/api/user/chats");chats=data.chats||[];renderList();}
  async function openChat(id){
    try{
      if(window.innerWidth<=760)$("sidebar").classList.remove("mobile-open");
      const data=await api("/api/user/chats/"+encodeURIComponent(id));
      active=id;$("welcome").hidden=true;$("conversation").hidden=false;$("conversation-head").textContent=data.chat.title||"Conversation";
      $("messages").replaceChildren();(data.messages||[]).forEach(m=>addMessage(m.role,m.content));
      renderList();$("messages").scrollTop=$("messages").scrollHeight;
    }catch(e){toast(e.message);}
  }
  async function createChat(title="New chat"){
    if(window.innerWidth<=760)$("sidebar").classList.remove("mobile-open");
    const data=await api("/api/user/chats",{method:"POST",body:JSON.stringify({title})});active=data.chat.id;$("welcome").hidden=true;$("conversation").hidden=false;$("conversation-head").textContent=data.chat.title;$("messages").replaceChildren();await refreshChats();return data.chat;
  }
  async function deleteChat(id){if(!confirm("Supprimer définitivement cette conversation ?"))return;try{await api("/api/user/chats/"+encodeURIComponent(id),{method:"DELETE"});if(active===id){active=null;$("conversation").hidden=true;$("welcome").hidden=false;$("messages").replaceChildren();}await refreshChats();toast("Conversation supprimée.");}catch(e){toast(e.message);}}
  function setMode(next){mode=next;$("mode-chat").classList.toggle("selected",mode==="chat");$("mode-analyze").classList.toggle("selected",mode==="analyze");$("mode-hint").textContent=mode==="chat"?"Réponses directes et concises":"Réponse structurée et analyse détaillée";$("mobile-mode").textContent=mode==="chat"?"Chat":"Analyze";}
  async function sendMessage(event){
    event.preventDefault();const input=$("chat-input"),question=input.value.trim();if((!question&&!attachment)||sending)return;
    sending=true;$("send-message").disabled=true;input.value="";input.style.height="auto";
    let pending=null;
    try{
      if(!active)await createChat(question.slice(0,64));
      const submittedText=question+(attachment?"\n\n[Attached file: "+attachment.name+"]\n"+attachment.text:"");
      const userSave=await api("/api/user/chats/"+encodeURIComponent(active),{method:"POST",body:JSON.stringify({role:"user",content:submittedText.slice(0,6000)})});notifyRetention(userSave);
      addMessage("user",question+(attachment?"\n[File: "+attachment.name+"]":""));
      const history=[...$("messages").children].slice(0,-1).slice(-8).map(node=>({
        role:node.classList.contains("user")?"user":"assistant",
        content:node.querySelector(".message-text")?.textContent||""
      })).filter(item=>item.content.trim());
      pending=addMessage("assistant",mode==="analyze"?"Analyse en cours…":"Réponse en cours…",false);
      const data=await api("/api/assistant",{method:"POST",body:JSON.stringify({
        question:question||"Please analyze the attached file.",attachmentText:attachment?.text||"",attachmentName:attachment?.name||"",mode,model:$("model-select").value||undefined,history
      })});
      const answer=typeof data.answer==="string"?data.answer:"Aucune réponse disponible.";
      pending.remove();pending=null;attachment=null;renderAttachment();
      const assistantSave=await api("/api/user/chats/"+encodeURIComponent(active),{method:"POST",body:JSON.stringify({role:"assistant",content:answer})});notifyRetention(assistantSave);
      addMessage("assistant",answer,true,data.webSources||[]);await refreshChats();
    }catch(e){if(pending)pending.remove();toast(e.message);input.value=question;}
    finally{sending=false;$("send-message").disabled=false;input.focus();}
  }
  async function loadModels(){
    const select=$("model-select");
    try{
      const data=await api("/api/models");
      availableModels=Array.isArray(data.models)?data.models:[];
      select.replaceChildren();
      availableModels.forEach(model=>{
        const option=document.createElement("option");option.value=model.id;option.textContent=model.label;
        if(model.description)option.title=model.description;option.disabled=model.available===false;select.append(option);
      });
      const saved=localStorage.getItem("melek-ai-model");
      const preferred=availableModels.some(model=>model.id===saved&&model.available!==false)?saved:data.defaultModel;
      if(preferred)select.value=preferred;
      select.disabled=!data.available||!availableModels.length;
      if(!data.available)toast("Le service AI n'est pas encore configuré.");
    }catch(e){
      select.replaceChildren();const option=document.createElement("option");option.value="";option.textContent="Modèles indisponibles";select.append(option);select.disabled=true;
      toast("La liste des modèles est indisponible. L’historique reste accessible.");
    }
  }
  function speakText(text){if(!("speechSynthesis" in window)){toast("La lecture vocale n'est pas prise en charge par ce navigateur.");return;}window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=/[\u0600-\u06ff]/.test(text)?"ar-TN":/[àâçéèêëîïôûùüÿœ]/i.test(text)?"fr-FR":"en-US";window.speechSynthesis.speak(utterance);}
  function renderAttachment(){const chip=$("attachment-chip");chip.hidden=!attachment;chip.textContent=attachment?"📎 "+attachment.name+" · "+Math.ceil(attachment.text.length/1000)+"k caractères — ×":"";chip.onclick=()=>{attachment=null;renderAttachment();};}
  $("attach-file").addEventListener("click",()=>$("file-input").click());
  $("file-input").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>12000){toast("Fichier trop volumineux (maximum 12 Ko pour cette version).");e.target.value="";return;}try{const text=await file.text();if(!text.trim())throw new Error("Le fichier est vide.");attachment={name:file.name,text:text.slice(0,10000)};renderAttachment();toast("Fichier prêt à être analysé.");}catch(err){toast(err.message||"Impossible de lire ce fichier.");}e.target.value="";});
  $("voice-input").addEventListener("click",()=>{const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){toast("La dictée vocale n'est pas prise en charge. Essayez Chrome ou Edge.");return;}const recognition=new Recognition();recognition.lang=/[\u0600-\u06ff]/.test($("chat-input").value)?"ar-TN":"fr-FR";recognition.interimResults=false;recognition.onresult=event=>{$("chat-input").value=($("chat-input").value+" "+event.results[0][0].transcript).trim();$("chat-input").focus();};recognition.onerror=()=>toast("La dictée vocale n'a pas abouti. Vérifiez l'autorisation du microphone.");recognition.start();});
  $("read-aloud").addEventListener("click",()=>lastAssistantAnswer?speakText(lastAssistantAnswer):toast("Aucune réponse à lire."));
  async function load(){
    try{
      const me=await api("/api/user/me");$("identity").textContent=me.user.email;
      $("status").textContent="Compte vérifié · historique privé · nettoyage des plus anciennes si stockage saturé";
      try{const learning=await api("/api/learning/status");$("status").textContent="Compte vérifié · historique privé · nettoyage auto · "+learning.sourceCount+" sources indexées";}catch(_){}
      await loadModels();await refreshChats();if(chats.length)await openChat(chats[0].id);
    }
    catch(e){$("identity").textContent="Connexion requise";$("status").textContent=e.message;toast(e.message);}
  }
  $("new-chat").addEventListener("click",async()=>{try{active=null;await createChat();$("chat-input").focus();}catch(e){toast(e.message);}});
  $("chat-form").addEventListener("submit",sendMessage);
  $("chat-input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chat-form").requestSubmit();}});
  $("chat-input").addEventListener("input",()=>{$("chat-input").style.height="auto";$("chat-input").style.height=Math.min($("chat-input").scrollHeight,180)+"px";});
  $("mode-chat").addEventListener("click",()=>setMode("chat"));$("mode-analyze").addEventListener("click",()=>setMode("analyze"));
  $("model-select").addEventListener("change",()=>{try{localStorage.setItem("melek-ai-model",$("model-select").value);}catch(_){}});
  $("history-search").addEventListener("input",async e=>{const sequence=++searchSequence,q=e.target.value.trim();if(!q){await refreshChats();return;}try{const data=await api("/api/user/chats?q="+encodeURIComponent(q));if(sequence===searchSequence){chats=data.chats||[];renderList();}}catch(err){toast(err.message);}});
  $("delete-all").addEventListener("click",async()=>{if(!confirm("Supprimer tout votre historique ? Cette action est irréversible."))return;try{await api("/api/user/chats",{method:"DELETE"});active=null;chats=[];$("conversation").hidden=true;$("welcome").hidden=false;$("messages").replaceChildren();renderList();toast("Historique supprimé.");}catch(e){toast(e.message);}});
  $("sidebar-toggle").addEventListener("click",()=>{
    if(window.innerWidth<=760){$("sidebar").classList.remove("mobile-open");}
    else{$("sidebar").classList.toggle("collapsed");}
  });
  $("mobile-menu").addEventListener("click",()=>$("sidebar").classList.toggle("mobile-open"));
  document.addEventListener("click",e=>{
    if(window.innerWidth<=760&&$("sidebar").classList.contains("mobile-open")){
      if(!e.target.closest("#sidebar")&&!e.target.closest("#mobile-menu")){
        $("sidebar").classList.remove("mobile-open");
      }
    }
  });
  document.querySelectorAll("[data-prompt]").forEach(button=>button.addEventListener("click",()=>{$("chat-input").value=button.dataset.prompt;$("chat-input").focus();}));
  document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("new-chat").click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="f"){e.preventDefault();$("history-search").focus();}});
  load();
})();