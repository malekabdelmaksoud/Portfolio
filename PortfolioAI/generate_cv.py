"""
generate_cv.py – Générateur de CV HTML/PDF dynamique
======================================================
Usage:
  python generate_cv.py           → génère CV_generated.html
  python generate_cv.py --pdf     → génère aussi CV_generated.pdf (nécessite wkhtmltopdf ou weasyprint)

Le CV est entièrement construit depuis data.json.
Ajoutez un projet ou une expérience dans data.json et relancez ce script → nouveau CV généré.
"""

import json
import sys
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / "data.json"
OUT_HTML  = BASE_DIR / "CV_generated.html"
OUT_PDF   = BASE_DIR / "CV_generated.pdf"

with open(DATA_FILE, encoding="utf-8") as f:
    D = json.load(f)

p  = D["personal"]
sk = D["skills"]

# ── Helper ─────────────────────────────────────────────────────────────────
def skill_tags(lst):
    return "".join(f'<span class="tag">{s}</span>' for s in lst)

def exp_items():
    out = ""
    for e in D["experiences"]:
        out += f"""
        <div class="item">
          <div class="item-header">
            <span class="item-title">{e['title']}</span>
            <span class="item-date">{e['period']}</span>
          </div>
          <div class="item-sub">{e['company']}{' · ' + e.get('location','') if e.get('location') else ''}</div>
          <p class="item-desc">{e['description']}</p>
        </div>"""
    return out

def edu_items():
    out = ""
    for ed in D["education"]:
        out += f"""
        <div class="item">
          <div class="item-header">
            <span class="item-title">{ed['degree']}</span>
            <span class="item-date">{ed['period']}</span>
          </div>
          <div class="item-sub">{ed['institution']}</div>
          {'<p class="item-desc">' + ed.get('speciality','') + '</p>' if ed.get('speciality') else ''}
        </div>"""
    return out

def project_items():
    out = ""
    for pr in D["projects"]:
        out += f"""
        <div class="project-item">
          <div class="item-header">
            <span class="item-title">{pr['name']}</span>
            <span class="tag small">{pr['type']}</span>
          </div>
          <p class="item-desc">{pr['description']}</p>
          <a href="{pr['github']}" class="gh-link">GitHub ↗</a>
        </div>"""
    return out

def lang_items():
    out = ""
    for lg in D["languages"]:
        out += f'<div class="lang-item"><span>{lg["language"]}</span><span class="lang-level">{lg["level"]}</span></div>'
    return out

# ── HTML Template ───────────────────────────────────────────────────────────
HTML = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CV – {p['name']}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:'DM Sans',sans-serif;background:#fff;color:#1a1a2e;font-size:13px;line-height:1.6}}
  .page{{max-width:860px;margin:0 auto;padding:40px 48px;background:#fff}}

  /* Header */
  .cv-header{{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #6957e8;padding-bottom:18px;margin-bottom:24px}}
  .cv-name{{font-size:26px;font-weight:700;color:#6957e8;letter-spacing:-.5px}}
  .cv-title{{font-size:12px;color:#555;margin-top:4px}}
  .cv-contact{{text-align:right;font-size:11.5px;color:#444;line-height:1.8}}
  .cv-contact a{{color:#6957e8;text-decoration:none}}

  /* Layout */
  .cv-body{{display:grid;grid-template-columns:1fr 1fr;gap:28px}}
  .col-left{{border-right:1px solid #ebe8ff;padding-right:24px}}
  .col-right{{padding-left:4px}}

  /* Section */
  .section{{margin-bottom:22px}}
  .section-title{{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#6957e8;margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid #ebe8ff}}

  /* Items */
  .item{{margin-bottom:12px}}
  .item-header{{display:flex;justify-content:space-between;align-items:baseline;gap:8px}}
  .item-title{{font-weight:600;font-size:12.5px;color:#1a1a2e}}
  .item-date{{font-size:10.5px;color:#888;white-space:nowrap}}
  .item-sub{{font-size:11px;color:#6957e8;margin-top:1px;font-style:italic}}
  .item-desc{{font-size:11.5px;color:#444;margin-top:4px}}

  /* Tags */
  .tags{{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}}
  .tag{{background:#ebe8ff;color:#6957e8;padding:2px 8px;border-radius:50px;font-size:10.5px;font-weight:500}}
  .tag.small{{font-size:9.5px;padding:1px 6px}}

  /* Projects */
  .project-item{{margin-bottom:12px;padding:8px;background:#f8f7ff;border-radius:8px;border-left:3px solid #6957e8}}
  .gh-link{{font-size:10.5px;color:#6957e8;text-decoration:none}}

  /* Languages */
  .lang-item{{display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0;border-bottom:1px dotted #eee}}
  .lang-level{{color:#888;font-size:10.5px}}

  /* About */
  .about-text{{font-size:11.5px;color:#444;line-height:1.65}}

  /* Footer */
  .cv-footer{{margin-top:28px;border-top:1px solid #eee;padding-top:10px;text-align:center;font-size:10px;color:#aaa}}

  @media print{{
    body{{background:#fff}}
    .page{{padding:20px 24px}}
    .gh-link{{color:#6957e8!important}}
  }}
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="cv-header">
    <div>
      <div class="cv-name">{p['name']}</div>
      <div class="cv-title">{p['title']}</div>
      <div style="margin-top:6px;font-size:11px;color:#555">📍 {p['location']}</div>
    </div>
    <div class="cv-contact">
      <div><a href="mailto:{p['email']}">{p['email']}</a></div>
      <div><a href="{p['linkedin']}">LinkedIn</a></div>
      <div><a href="{p['github']}">GitHub</a></div>
    </div>
  </div>

  <!-- BODY -->
  <div class="cv-body">

    <!-- LEFT COLUMN -->
    <div class="col-left">

      <!-- À PROPOS -->
      <div class="section">
        <div class="section-title">À propos</div>
        <p class="about-text">{p['about']}</p>
      </div>

      <!-- FORMATION -->
      <div class="section">
        <div class="section-title">Formation</div>
        {edu_items()}
      </div>

      <!-- EXPÉRIENCES -->
      <div class="section">
        <div class="section-title">Expériences</div>
        {exp_items()}
      </div>

    </div>

    <!-- RIGHT COLUMN -->
    <div class="col-right">

      <!-- COMPÉTENCES -->
      <div class="section">
        <div class="section-title">Langages de programmation</div>
        <div class="tags">{skill_tags(sk['languages'])}</div>
      </div>

      <div class="section">
        <div class="section-title">Web & Frameworks</div>
        <div class="tags">{skill_tags(sk['web'] + sk['frameworks'])}</div>
      </div>

      <div class="section">
        <div class="section-title">Systèmes & Réseaux</div>
        <div class="tags">{skill_tags(sk['systems'])}</div>
      </div>

      <div class="section">
        <div class="section-title">Soft skills</div>
        <div class="tags">{skill_tags(sk['soft_skills'])}</div>
      </div>

      <!-- PROJETS -->
      <div class="section">
        <div class="section-title">Projets GitHub</div>
        {project_items()}
      </div>

      <!-- LANGUES -->
      <div class="section">
        <div class="section-title">Langues</div>
        {lang_items()}
      </div>

    </div>
  </div>

  <div class="cv-footer">Généré automatiquement le {datetime.now().strftime('%d/%m/%Y')} · {p['name']} · Portfolio AI</div>
</div>
</body>
</html>"""

# ── Write HTML ──────────────────────────────────────────────────────────────
OUT_HTML.write_text(HTML, encoding="utf-8")
print(f"✅ CV HTML généré : {OUT_HTML}")

# ── Optional PDF export ─────────────────────────────────────────────────────
if "--pdf" in sys.argv:
    # Try weasyprint first
    try:
        from weasyprint import HTML as WHTML
        WHTML(string=HTML, base_url=str(BASE_DIR)).write_pdf(str(OUT_PDF))
        print(f"✅ CV PDF généré  : {OUT_PDF}")
    except ImportError:
        print("⚠️  weasyprint non installé.")
        print("   Installez-le avec :  pip install weasyprint")
        print(f"   Ou ouvrez {OUT_HTML.name} dans Chrome et utilisez Ctrl+P → Enregistrer en PDF")
