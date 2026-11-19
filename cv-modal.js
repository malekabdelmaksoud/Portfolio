/* ── CV Generator & Action Modal Engine ── */
function initCvDownloadEngine() {
  // Inject Modal HTML into DOM if not exists
  if (!document.getElementById("cvActionModal")) {
    const modalHtml = `
      <div id="cvActionModal" class="cv-modal-backdrop" aria-hidden="true">
        <div class="cv-modal-box">
          <div class="cv-modal-head">
            <div class="cv-modal-title">
              <span class="cv-sparkle">✨</span>
              <strong>Génération du CV en temps réel</strong>
            </div>
            <button class="cv-modal-close" id="closeCvModal" aria-label="Fermer">✕</button>
          </div>
          
          <div class="cv-modal-body">
            <div class="cv-gen-status">
              <span class="cv-pulse-dot"></span>
              <span>CV compilé dynamiquement à partir de vos dernières données vérifiées.</span>
            </div>
            
            <p class="cv-modal-desc">
              Que souhaitez-vous faire avec votre Curriculum Vitae ?
            </p>

            <div class="cv-modal-buttons">
              <a href="cv-generator.html" target="_blank" class="cv-btn-action cv-btn-view">
                <span class="btn-icon">👁️</span>
                <div>
                  <strong>Visualiser le CV en ligne</strong>
                  <small>Consulter, personnaliser ou prévisualiser</small>
                </div>
              </a>

              <button type="button" class="cv-btn-action cv-btn-print" id="directPrintCvBtn">
                <span class="btn-icon">⬇️</span>
                <div>
                  <strong>Générer & Télécharger le CV (PDF)</strong>
                  <small>Exportation propre prête à l'envoi</small>
                </div>
              </button>
            </div>
          </div>
          
          <div class="cv-modal-foot">
            <span>Dossier professionnel • Melek Abdelmaksoud</span>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  const modal = document.getElementById("cvActionModal");
  const closeBtn = document.getElementById("closeCvModal");
  const printBtn = document.getElementById("directPrintCvBtn");

  function openModal(e) {
    if (e) e.preventDefault();
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }

  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Intercept all CV download links
  document.querySelectorAll('a[href*="CV_Melek_Abdelmaksoud.pdf"], a[href="#cv-action"], .ai-cv-quick').forEach(link => {
    link.addEventListener("click", openModal);
  });

  // Direct generation & download trigger
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      closeModal();
      // Open cv-generator in a hidden/print iframe or new window with print trigger
      const printWindow = window.open("cv-generator.html?autoprint=true", "_blank");
    });
  }
}

// Auto-run when DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCvDownloadEngine);
} else {
  initCvDownloadEngine();
}
