"""
Portfolio AI Assistant – app.py
================================
Routes:
  GET  /          → Chat UI + CV download button
  GET  /cv        → Télécharger le CV (PDF)
  POST /ask       → AI agent JSON endpoint  { "question": "..." } → { "answer": "..." }

Setup:
  1. Place votre CV PDF dans ce dossier sous le nom  CV.pdf
  2. Créez un fichier .env  avec :  GEMINI_API_KEY=your_key
  3. pip install -r requirements.txt
  4. python app.py
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template_string, request, send_file

load_dotenv()

app = Flask(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / "data.json"
CV_FILE      = BASE_DIR / "CV.pdf"
CV_HTML_FILE = BASE_DIR / "CV_generated.html"

# ── Load portfolio data ────────────────────────────────────────────────────
with open(DATA_FILE, encoding="utf-8") as f:
    PORTFOLIO = json.load(f)

# ── Gemini setup ───────────────────────────────────────────────────────────
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
gemini_client = None
if GEMINI_KEY:
    try:
        from google import genai as google_genai
        gemini_client = google_genai.Client(api_key=GEMINI_KEY)
        print("✅ Gemini AI connected")
    except Exception as e:
        print(f"⚠️  Gemini not available: {e}")


def build_system_prompt() -> str:
    """Build a system prompt containing all portfolio information."""
    p = PORTFOLIO["personal"]
    return f"""
Tu es l'assistant IA personnel de {p['name']}.
Tu réponds en français (ou dans la langue de la question).
Tu as accès aux informations complètes du portfolio ci-dessous.
Réponds de manière claire, concise et professionnelle.

=== INFORMATIONS PERSONNELLES ===
Nom        : {p['name']}
Email      : {p['email']}
Localisation: {p['location']}
LinkedIn   : {p['linkedin']}
GitHub     : {p['github']}
Titre      : {p['title']}
À propos   : {p['about']}

=== FORMATION ===
{json.dumps(PORTFOLIO['education'], ensure_ascii=False, indent=2)}

=== COMPÉTENCES ===
{json.dumps(PORTFOLIO['skills'], ensure_ascii=False, indent=2)}

=== EXPÉRIENCES ===
{json.dumps(PORTFOLIO['experiences'], ensure_ascii=False, indent=2)}

=== PROJETS ===
{json.dumps(PORTFOLIO['projects'], ensure_ascii=False, indent=2)}

=== LANGUES ===
{json.dumps(PORTFOLIO['languages'], ensure_ascii=False, indent=2)}
""".strip()


def simple_fallback(question: str) -> str:
    """Rule-based fallback when Gemini key is not provided."""
    q = question.lower()
    p = PORTFOLIO["personal"]

    if any(w in q for w in ["nom", "name", "qui", "who"]):
        return f"Je suis {p['name']}, {p['title']}."
    if any(w in q for w in ["email", "mail", "contact"]):
        return f"Mon adresse e-mail est {p['email']}."
    if any(w in q for w in ["linkedin"]):
        return f"Mon profil LinkedIn : {p['linkedin']}"
    if any(w in q for w in ["github"]):
        return f"Mon GitHub : {p['github']}"
    if any(w in q for w in ["projet", "project"]):
        lines = [f"- **{pr['name']}** ({pr['type']}) : {pr['description']} → {pr['github']}"
                 for pr in PORTFOLIO["projects"]]
        return "Voici mes projets :\n\n" + "\n".join(lines)
    if any(w in q for w in ["compétence", "skill", "technologie", "language"]):
        sk = PORTFOLIO["skills"]
        return (f"Langages : {', '.join(sk['languages'])}\n"
                f"Web : {', '.join(sk['web'])}\n"
                f"Frameworks : {', '.join(sk['frameworks'])}")
    if any(w in q for w in ["stage", "expérience", "experience"]):
        lines = [f"- **{e['title']}** chez {e['company']} ({e['period']}) : {e['description']}"
                 for e in PORTFOLIO["experiences"]]
        return "Mes expériences :\n\n" + "\n".join(lines)
    if any(w in q for w in ["formation", "étude", "diplôme", "education"]):
        lines = [f"- **{ed['degree']}** – {ed['institution']} ({ed['period']})"
                 for ed in PORTFOLIO["education"]]
        return "Ma formation :\n\n" + "\n".join(lines)
    if any(w in q for w in ["langue", "language"]):
        lines = [f"- {lg['language']} : {lg['level']}" for lg in PORTFOLIO["languages"]]
        return "Langues :\n\n" + "\n".join(lines)

    return ("Je suis l'assistant IA de Melek. Posez-moi des questions sur ses projets, "
            "compétences, expériences ou informations de contact !")


# ── Routes ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template_string(HTML_PAGE)


@app.route("/cv")
def download_cv():
    if CV_FILE.exists():
        return send_file(str(CV_FILE), as_attachment=True, download_name="CV_Melek_Abdelmaksoud.pdf")
    return jsonify({"error": "CV.pdf not found. Place your CV PDF in the PortfolioAI folder."}), 404


@app.route("/cv/view")
def view_cv():
    """View the auto-generated CV as HTML (can print to PDF from browser)."""
    if CV_HTML_FILE.exists():
        return CV_HTML_FILE.read_text(encoding="utf-8")
    return jsonify({"error": "CV_generated.html not found. Run generate_cv.py first."}), 404


@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json(silent=True) or {}
    question = str(data.get("question", "")).strip()
    if not question:
        return jsonify({"error": "No question provided"}), 400

    if gemini_client:
        try:
            full_prompt = build_system_prompt() + "\n\nQuestion: " + question
            response = gemini_client.models.generate_content(
                model="gemini-2.0-flash",
                contents=full_prompt,
            )
            answer = response.text
        except Exception as e:
            answer = simple_fallback(question) + f"\n\n*(Gemini error: {e})*"
    else:
        answer = simple_fallback(question)

    return jsonify({"answer": answer})


# ── Embedded HTML UI ───────────────────────────────────────────────────────
HTML_PAGE = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Portfolio AI – Melek Abdelmaksoud</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',sans-serif;background:#0f0f13;color:#e0e0e0;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:2rem 1rem}
  h1{font-size:1.8rem;font-weight:700;background:linear-gradient(135deg,#6957e8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:.3rem}
  .sub{color:#888;font-size:.9rem;margin-bottom:2rem}
  .cv-btn{display:inline-block;padding:.75rem 1.75rem;background:linear-gradient(135deg,#6957e8,#a78bfa);color:#fff;border-radius:50px;text-decoration:none;font-weight:600;font-size:.95rem;margin-bottom:2.5rem;transition:opacity .2s}
  .cv-btn:hover{opacity:.85}
  .chat-box{width:100%;max-width:680px;background:#1a1a24;border-radius:1.2rem;padding:1.5rem;border:1px solid #2d2d44}
  .chat-title{font-size:1rem;font-weight:600;color:#a78bfa;margin-bottom:1rem}
  #messages{height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:.75rem;margin-bottom:1rem;padding-right:.3rem}
  #messages::-webkit-scrollbar{width:4px}
  #messages::-webkit-scrollbar-thumb{background:#3d3d60;border-radius:4px}
  .msg{max-width:88%;padding:.7rem 1rem;border-radius:1rem;font-size:.9rem;line-height:1.5;white-space:pre-wrap}
  .user{background:#6957e8;color:#fff;align-self:flex-end;border-bottom-right-radius:.2rem}
  .bot{background:#252535;color:#ddd;align-self:flex-start;border-bottom-left-radius:.2rem}
  .input-row{display:flex;gap:.5rem}
  #q{flex:1;padding:.7rem 1rem;border-radius:50px;border:1px solid #3d3d60;background:#0f0f13;color:#e0e0e0;font-size:.9rem;outline:none}
  #q:focus{border-color:#6957e8}
  #send{padding:.7rem 1.4rem;border-radius:50px;background:#6957e8;color:#fff;border:none;font-weight:600;cursor:pointer;transition:background .2s}
  #send:hover{background:#5544cc}
  .typing{color:#666;font-style:italic;font-size:.85rem}
</style>
</head>
<body>
<h1>👩‍💻 Melek Abdelmaksoud</h1>
<p class="sub">Portfolio AI Assistant — posez-moi n'importe quelle question</p>

<a class="cv-btn" href="/cv" download>⬇ Télécharger mon CV (PDF)</a>

<div class="chat-box">
  <p class="chat-title">💬 Assistant IA – Portfolio</p>
  <div id="messages">
    <div class="msg bot">Bonjour ! Je suis l'assistant IA de Melek. Posez-moi une question sur ses projets, compétences, expériences ou comment la contacter 🚀</div>
  </div>
  <div class="input-row">
    <input id="q" type="text" placeholder="Ex: Quels sont tes projets Java ?" autocomplete="off">
    <button id="send">Envoyer</button>
  </div>
</div>

<script>
const msgs = document.getElementById('messages');
const input = document.getElementById('q');
const btn   = document.getElementById('send');

function addMsg(text, role){
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  d.textContent = text;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

async function send(){
  const q = input.value.trim();
  if(!q) return;
  input.value = '';
  addMsg(q, 'user');
  const typing = addMsg('...', 'bot typing');
  btn.disabled = true;
  try{
    const res = await fetch('/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})});
    const data = await res.json();
    typing.textContent = data.answer || data.error || 'Erreur inconnue.';
    typing.className = 'msg bot';
  }catch(e){
    typing.textContent = 'Erreur de connexion.';
    typing.className = 'msg bot';
  }
  btn.disabled = false;
  input.focus();
}

btn.addEventListener('click', send);
input.addEventListener('keydown', e=>{ if(e.key==='Enter') send(); });
</script>
</body>
</html>"""


if __name__ == "__main__":
    print("🚀  Portfolio AI starting at http://127.0.0.1:5000")
    print(f"   Gemini AI: {'✅ enabled' if gemini_client else '⚠️  disabled (no GEMINI_API_KEY)'}")
    print(f"   CV file  : {'✅ found' if CV_FILE.exists() else '❌ not found – place CV.pdf in PortfolioAI/'}")
    app.run(debug=True, port=5000)
