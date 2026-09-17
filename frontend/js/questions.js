const QuestionsController = {
  questions: [],
  currentTab: "all",
  isGenerating: false,

  onMaterialChanged(material) {
    this.questions = [];
    if (material) {
      this.loadQuestions(material.id);
    } else {
      this.renderEmpty();
    }
  },

  onSectionActivated() {
    if (window.AppState.activeMaterial && this.questions.length === 0) {
      this.loadQuestions(window.AppState.activeMaterial.id);
    }
  },

  async loadQuestions(materialId) {
    try {
      const data = await window.API.getQuestions(materialId);
      if (data && data.questions && data.questions.length > 0) {
        this.questions = data.questions;
        this.renderQuestions();
      } else {
        this.renderEmpty();
      }
    } catch (e) {
      console.error("Failed to load questions:", e);
    }
  },

  async generateQuestions(forceRegenerate = false) {
    if (this.isGenerating) return;
    const active = window.AppState.activeMaterial;
    if (!active) {
      window.showToast("Please upload or select a material first", "warning");
      return;
    }

    const container = document.getElementById("questions-list-container");
    const genBtn = document.getElementById("btn-generate-questions");
    this.isGenerating = true;
    if (genBtn) genBtn.disabled = true;

    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <div style="font-size: 36px; animation: spin 1s infinite linear;">🎯</div>
        <h3 style="margin-top: 16px;">Generating Exam Questions with Google Gemini...</h3>
        <p class="text-muted">Extracting grounded 2-Mark definitions, 5-Mark explanatory workflows, and 10-Mark essay prompts.</p>
      </div>
    `;

    try {
      const data = await window.API.generateQuestions(active.id, forceRegenerate);
      this.questions = data.questions || [];
      this.renderQuestions();
      window.showToast(`Generated ${this.questions.length} exam questions with Gemini!`);
    } catch (e) {
      window.showToast(`Failed: ${e.message}`, "error");
      this.renderEmpty();
    } finally {
      this.isGenerating = false;
      if (genBtn) genBtn.disabled = false;
    }
  },

  renderEmpty() {
    const container = document.getElementById("questions-list-container");
    if (!container) return;
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎯</span>
        <h3>No Questions Generated Yet</h3>
        <p>Generate high-probability questions with grading criteria directly from your notes using Gemini.</p>
      </div>
    `;
  },

  renderQuestions() {
    const container = document.getElementById("questions-list-container");
    if (!container) return;

    let filtered = this.questions;
    if (this.currentTab !== "all") {
      const mark = parseInt(this.currentTab);
      filtered = this.questions.filter(q => q.mark_category === mark);
    }

    if (filtered.length === 0) {
      container.innerHTML = `<p class="text-muted" style="padding: 24px;">No ${this.currentTab}-mark questions found in this set.</p>`;
      return;
    }

    const cardsHtml = filtered.map((q, idx) => {
      let markBadgeClass = "badge-indigo";
      if (q.mark_category === 5) markBadgeClass = "badge-warning";
      if (q.mark_category === 10) markBadgeClass = "badge-danger";

      const keyPoints = q.key_points || q.keyPoints || [];
      const keyPointsHtml = Array.isArray(keyPoints) && keyPoints.length > 0 ? `
        <div style="margin: 10px 0;">
          <div style="font-size: 0.78rem; font-weight: 700; color: #4338ca; text-transform: uppercase; margin-bottom: 4px;">Key Expected Points:</div>
          <ul style="margin: 0; padding-left: 20px; font-size: 0.85rem; color: #334155;">
            ${keyPoints.map(kp => `<li style="margin-bottom: 2px;">${kp}</li>`).join("")}
          </ul>
        </div>
      ` : "";

      return `
        <div class="card" style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="badge ${markBadgeClass}">${q.mark_category} Marks</span>
              <span class="badge badge-accent">${q.difficulty || 'Medium'}</span>
              ${q.topic ? `<span class="badge" style="background-color: #f1f5f9; color: #475569;">${q.topic}</span>` : ""}
            </div>
            <span style="font-size: 0.78rem; color: #94a3b8;">Question #${idx + 1}</span>
          </div>

          <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 12px; color: #1e293b;">
            ${q.question_text || q.question}
          </h3>

          <div style="background-color: #f8fafc; border-radius: 8px; padding: 14px; margin-top: 12px; border: 1px solid var(--border);">
            <div style="font-size: 0.8rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">
              Marking Scheme & Guide
            </div>
            <div style="font-size: 0.88rem; color: #334155; margin-bottom: 10px;">
              ${q.marking_guide || "Full marks allocated based on technical accuracy and clarity."}
            </div>

            ${keyPointsHtml}

            <div style="font-size: 0.8rem; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-top: 10px; margin-bottom: 4px;">
              Model Answer
            </div>
            <div style="font-size: 0.9rem; color: #1e293b; white-space: pre-line; line-height: 1.6;">
              ${q.answer || q.modelAnswer}
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
        <button class="btn btn-outline btn-xs" id="btn-force-regenerate-questions">🔄 Regenerate Questions</button>
      </div>
      ${cardsHtml}
    `;

    const regenBtn = document.getElementById("btn-force-regenerate-questions");
    if (regenBtn) {
      regenBtn.addEventListener("click", () => this.generateQuestions(true));
    }
  }
};

window.QuestionsController = QuestionsController;

document.addEventListener("DOMContentLoaded", () => {
  const genBtn = document.getElementById("btn-generate-questions");
  if (genBtn) genBtn.addEventListener("click", () => QuestionsController.generateQuestions());

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      QuestionsController.currentTab = btn.getAttribute("data-tab");
      QuestionsController.renderQuestions();
    });
  });
});

