/* Portfolio Assistant — offline, evidence-grounded retrieval engine.
 * No external AI API, model download, tracking, or visitor compute beyond small JS search.
 * This is a focused portfolio assistant, not a general-purpose LLM.
 */
(function () {
  "use strict";

  const STOP = new Set(("the a an and or is are was were what who where when why how can could do does did tell me about please your you my i of to in on for with from at as this that these those le la les un une des du de et ou est sont qui quoi comment pourquoi quand où dans sur pour avec mon ma mes ton ta tes moi je il elle ses son sa au aux en par d cette ces quel quelle quels quelles peux peut avez a fait fais").split(" "));
  const SYNONYMS = {
    project: "projet projets project projects réalisation réalisations work portfolio application app",
    skill: "compétence compétences skill skills technology technologies technologie stack langage langages language framework frameworks outil outils",
    experience: "expérience expériences experience experiences stage stages internship internships work travail emploi",
    education: "formation études education study studies diplôme diplome degree licence university université iset",
    contact: "contact email mail linkedin github joindre coordonnées coordonnees reach",
    cv: "cv resume résumé curriculum vitae télécharger download pdf",
    profile: "melek profil about présentation presentation qui suis identité parcours",
    location: "lieu localisation location ville city sfax tunisie tunisia",
    language: "langue langues language languages français anglais french english",
    ai: "intelligence artificielle ia artificial intelligence machine learning",
    web: "web développement developpement development frontend backend fullstack",
    hospital: "hôpital hopital hedi chaker soins dmi inventory",
    availability: "disponible disponibilité availability opportunité opportunity recrutement hire hiring",
    strengths: "qualité qualités soft skills teamwork équipe autonomie leadership adaptabilité"
  };
  const GROUPS = [
    { id: "profile", terms: "melek profil about présentation presentation qui suis identité parcours", selectors: [".hero", "#apropos"] },
    { id: "projects", terms: "projet projets project projects réalisation réalisations application github", selectors: ["#projets"] },
    { id: "skills", terms: "compétence compétences skill skills technologie technologies langage langages framework outils", selectors: ["#competences"] },
    { id: "experience", terms: "expérience expériences stage stages internship internships travail emploi hôpital hopital", selectors: ["#experiences"] },
    { id: "education", terms: "formation études education diplôme diplome licence iset baccalauréat", selectors: ["#apropos"] },
    { id: "contact", terms: "contact email mail linkedin github coordonnées joindre", selectors: ["#contact", ".hero-meta"] },
    { id: "languages", terms: "langue langues language languages français anglais french english", selectors: [".language-list"] },
    { id: "ai", terms: "intelligence artificielle ia artificial intelligence machine learning", selectors: ["#competences", "#projets"] }
  ];

  function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, " ").replace(/[^a-z0-9\u0600-\u06ff+#.\s-]/gi, " ")
      .replace(/\s+/g, " ").trim();
  }
  function tokens(value) {
    return normalize(value).split(/[\s-]+/).filter(t => t.length > 1 && !STOP.has(t));
  }
  function expand(queryTokens) {
    const result = new Set(queryTokens);
    for (const [key, values] of Object.entries(SYNONYMS)) {
      const all = values.split(" ");
      if (queryTokens.some(t => all.includes(t) || t === key)) {
        result.add(key);
        all.forEach(t => { if (t.length > 2) result.add(t); });
      }
    }
    return [...result];
  }
  function textOf(selector) {
    const node = document.querySelector(selector);
    return node ? node.innerText.replace(/\s+/g, " ").trim() : "";
  }
  function collectDocs() {
    const docs = GROUPS.map(group => ({
      id: group.id,
      text: group.selectors.map(textOf).filter(Boolean).join(" "),
      selectors: group.selectors
    })).filter(doc => doc.text);
    const cards = [...document.querySelectorAll("#projets .project-card")].map(card => ({
      id: "project",
      text: card.innerText.replace(/\s+/g, " ").trim(),
      url: card.querySelector('a[href]')?.href || ""
    }));
    return docs.concat(cards);
  }
  function score(queryTokens, doc) {
    const words = new Set(tokens(doc.text));
    let total = 0;
    for (const token of queryTokens) {
      if (words.has(token)) total += token.length > 5 ? 2.2 : 1.25;
      else if ([...words].some(w => w.length > 4 && (w.startsWith(token) || token.startsWith(w)))) total += 0.65;
    }
    const q = normalize(queryTokens.join(" "));
    if (doc.id === "project" && /project|projet|application|github|realisation/.test(q)) total += 1.5;
    return total / Math.sqrt(Math.max(5, words.size));
  }
  function safe(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function bullets(items) {
    return "<ul>" + items.map(item => "<li>" + safe(item) + "</li>").join("") + "</ul>";
  }
  function intentOf(q) {
    const n = normalize(q);
    const has = (...terms) => terms.some(term => n.includes(normalize(term)));
    if (has("cv", "resume", "curriculum", "télécharger", "download")) return "cv";
    if (has("contact", "email", "mail", "linkedin", "github", "joindre", "coordonnées")) return "contact";
    if (has("projet", "project", "réalisation", "application", "repository", "repo")) return "projects";
    if (has("compétence", "skill", "technologie", "langage", "framework", "stack")) return "skills";
    if (has("stage", "expérience", "experience", "internship", "hôpital", "hopital", "travail")) return "experience";
    if (has("formation", "étude", "education", "diplôme", "diplome", "iset", "licence", "baccalauréat")) return "education";
    if (has("langue", "languages", "french", "english", "anglais", "français")) return "languages";
    if (has("qui est", "qui suis", "about", "présente", "presentation", "melek")) return "profile";
    if (has("ia", "intelligence artificielle", "artificial intelligence", "ai")) return "ai";
    return null;
  }
  function answerFor(intent, docs, query) {
    const n = normalize(query);
    const doc = id => docs.find(item => item.id === id);
    if (intent === "cv") return "📄 <b>Curriculum Vitae de Melek</b><p>Vous pouvez consulter et télécharger son CV au format PDF depuis le portfolio.</p><button type=\"button\" onclick=\"openCvModal(event)\" style=\"margin-top:6px;padding:8px 14px;background:#6957e8;color:#fff;border:0;border-radius:20px;font-weight:700;cursor:pointer\">Consulter et télécharger le CV ↗</button>";
    if (intent === "contact") {
      const contact = doc("contact")?.text || "";
      return "📬 <b>Contacter Melek</b>" + bullets([
        "E-mail : melekabdelmaksoud72@gmail.com",
        "LinkedIn : linkedin.com/in/melek-abdelmaksoud-518713436/",
        "GitHub : github.com/malekabdelmaksoud",
        "Localisation indiquée : Sfax, Tunisie"
      ]) + "<p>" + safe(contact.slice(0, 220)) + "</p>";
    }
    if (intent === "projects") {
      const projects = docs.filter(item => item.id === "project");
      if (!projects.length) return "Les fiches projets ne sont pas disponibles pour le moment. Vous pouvez consulter le profil GitHub de Melek : <a href=\"https://github.com/malekabdelmaksoud\" target=\"_blank\" rel=\"noopener noreferrer\">GitHub ↗</a>.";
      const matched = projects.map(item => ({ item, score: score(expand(tokens(query)), item) })).sort((a,b) => b.score-a.score);
      const specific = matched.filter(x => x.score > 0.12);
      const selected = /tous|all|liste|list|princip|main|quels|which/.test(n) ? projects : (specific.length ? specific.slice(0, 3).map(x=>x.item) : projects.slice(0, 3));
      return "🚀 <b>Projets de Melek</b>" + bullets(selected.map(item => item.text.slice(0, 330))) + '<p>Les dépôts sont disponibles sur <a href="https://github.com/malekabdelmaksoud" target="_blank" rel="noopener noreferrer">son profil GitHub ↗</a>.</p>';
    }
    if (intent === "skills") {
      const source = doc("skills")?.text || "";
      return "🛠️ <b>Compétences mentionnées dans le portfolio</b><p>" + safe(source.slice(0, 1150)) + "</p><p>Le portfolio précise que le niveau évolue avec la pratique : les technologies listées ne signifient pas nécessairement une maîtrise experte.</p>";
    }
    if (intent === "experience") {
      const source = doc("experience")?.text || "";
      return "💼 <b>Stages et expériences</b><p>" + safe(source.slice(0, 1450)) + "</p>";
    }
    if (intent === "education") {
      const source = doc("education")?.text || "";
      return "🎓 <b>Formation</b><p>" + safe(source.slice(0, 1000)) + "</p>";
    }
    if (intent === "languages") {
      const source = doc("languages")?.text || "";
      return source ? "🌍 <b>Langues</b><p>" + safe(source.slice(0, 800)) + "</p>" : "La section des langues n'a pas fourni de détails lisibles. Consultez le portfolio ou contactez Melek pour confirmer ses niveaux.";
    }
    if (intent === "profile") {
      const source = [doc("profile")?.text, doc("education")?.text].filter(Boolean).join(" ");
      return "👋 <b>À propos de Melek Abdelmaksoud</b><p>" + safe(source.slice(0, 1250)) + "</p>";
    }
    if (intent === "ai") {
      const source = doc("ai")?.text || "";
      return "🤖 <b>Intelligence artificielle</b><p>Le portfolio indique un intérêt pour les applications intelligentes et une exploration progressive de l'IA. " + safe(source.slice(0, 650)) + "</p><p>Je préfère ne pas présenter l'IA comme une spécialité déjà maîtrisée si le portfolio ne le confirme pas.</p>";
    }
    return null;
  }

  function answer(query) {
    const clean = String(query || "").trim().slice(0, 1200);
    if (!clean) return "Écrivez une question pour commencer.";
    const docs = collectDocs();
    const intent = intentOf(clean);
    const direct = answerFor(intent, docs, clean);
    if (direct) return direct;

    const expanded = expand(tokens(clean));
    const ranked = docs.map(item => ({ item, value: score(expanded, item) })).sort((a,b) => b.value-a.value);
    const best = ranked[0];
    if (!best || best.value < 0.12) {
      return "Je n'ai pas trouvé de réponse suffisamment fiable dans les informations publiques du portfolio. Je peux aider sur le parcours, les études, les stages, les compétences, les projets, les langues ou les moyens de contact. Pour une information non publiée, le plus sûr est de contacter Melek directement.";
    }
    const excerpt = best.item.text.slice(0, 900);
    return "D'après les informations publiées dans le portfolio, voici ce qui correspond le mieux à votre question :<p>" + safe(excerpt) + "</p><p>Si vous cherchez un détail précis, reformulez la question ou indiquez le projet / la compétence concerné(e).</p>";
  }

  window.PortfolioAssistant = { answer, version: "1.0.0", mode: "offline-portfolio-retrieval" };
})();