# Portfolio AI Assistant

This small project bundles **your CV** and a lightweight **AI agent** that can answer any question about your portfolio and personal information.

## What it contains
- `CV_placeholder.pdf` – a placeholder file. Replace it with your real résumé (PDF).
- `data.json` – a JSON file that stores the list of projects (name, description, GitHub link) extracted from the portfolio website.
- `app.py` – a minimal Flask application that:
  1. Serves the CV for download (`/cv`).
  2. Exposes an endpoint `/ask` that receives a question (POST JSON `{ "question": "..." }`).
  3. Calls the **Gemini API** (if you set the environment variable `GEMINI_API_KEY`) to generate an answer using the content of `data.json` and the CV text.
- `requirements.txt` – required Python packages.
- `docker-compose.yml` – optional Docker compose file to run the app in a container.

## How to set up
1. **Replace the CV**
   - Put your actual résumé (PDF) in the folder and rename it to `CV.pdf` (or keep the placeholder name and change the reference in `app.py`).
2. **Edit `data.json`** if you want to add/remove projects.
3. **Install dependencies**
   ```bash
   cd PortfolioAI
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. **Add your Gemini API key** (optional but recommended for a real AI answer)
   ```bash
   set GEMINI_API_KEY=YOUR_KEY_HERE   # Windows cmd
   # or in PowerShell
   $env:GEMINI_API_KEY="YOUR_KEY_HERE"
   ```
5. **Run the server**
   ```bash
   python app.py
   ```
   It will start on `http://127.0.0.1:5000`.
6. **Use the endpoints**
   - Download your CV: `GET http://127.0.0.1:5000/cv`
   - Ask a question: `POST http://127.0.0.1:5000/ask` with JSON body `{ "question": "Give me a summary of my Java projects" }`

## Zip the project
If you want a single “disc” (zip file) to share, simply run:
```bash
powershell Compress-Archive -Path . -DestinationPath PortfolioAI.zip
```
inside the `PortfolioAI` folder.

---
Feel free to customize the UI, add authentication, or host it on a cloud platform.
