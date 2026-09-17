const ExamModeController = {
  currentHours: 2.0,

  async runExamMode(hours) {
    this.currentHours = parseFloat(hours);
    const active = window.AppState.activeMaterial;
    const materialId = active ? active.id : null;

    const container = document.getElementById("exam-crash-container");
    container.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 32px;">🔥</div>
        <h3 style="margin-top: 12px;">Activating Emergency Exam Crash Engine...</h3>
        <p class="text-muted">Filtering for high-yield guaranteed marks and must-know definitions.</p>
      </div>
    `;

    try {
      const plan = await window.API.generateExamCrash(materialId, this.currentHours);
      this.renderCrashPlan(plan);
      window.showToast(`Emergency crash plan activated for ${this.currentHours} hours remaining!`, "warning");
    } catch (e) {
      container.innerHTML = `<p class="text-danger" style="padding: 24px;">Error: ${e.message}</p>`;
    }
  },

  renderCrashPlan(plan) {
    const container = document.getElementById("exam-crash-container");
    if (!container) return;

    const checklistHtml = (plan.priority_checklist || []).map((item, idx) => `
      <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; background: #fff; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <input type="checkbox" id="check-${idx}" style="margin-top: 4px; transform: scale(1.2); cursor: pointer;">
        <label for="check-${idx}" style="font-size: 0.92rem; color: #1e293b; cursor: pointer; flex: 1;">${item}</label>
      </div>
    `).join("");

    const stagesHtml = (plan.time_allocation || []).map(stg => `
      <div style="background: #faf5ff; border-left: 4px solid var(--secondary); padding: 14px; border-radius: 6px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 4px;">
          <span style="color: var(--secondary);">${stg.stage}</span>
          <span class="badge badge-accent">${stg.minutes} Minutes</span>
        </div>
        <div style="font-size: 0.88rem; color: #475569;">${stg.action}</div>
      </div>
    `).join("");

    const factsHtml = (plan.must_know_facts || []).map(f => `
      <li style="margin-bottom: 8px; font-size: 0.9rem; color: #1e293b;">💡 ${f}</li>
    `).join("");

    container.innerHTML = `
      <div class="card" style="background: linear-gradient(135deg, #fff1f2, #ffe4e6); border: 2px solid #fecdd3; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="font-size: 1.4rem; font-weight: 800; color: #be123c;">
              🚨 ${plan.hours_remaining} Hours Remaining (${plan.total_minutes} Total Minutes)
            </h2>
            <p style="color: #9f1239; font-size: 0.9rem;">Adaptive Last-Minute Crash Protocol Activated for <strong>${plan.material_title || 'Active Document'}</strong></p>
          </div>
          <span class="badge badge-danger" style="font-size: 0.85rem; padding: 8px 16px;">HIGH-YIELD ONLY</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
        <div>
          <h3 class="sub-heading" style="margin-top: 0;">Priority Exam Checklist</h3>
          <div>${checklistHtml}</div>
        </div>

        <div>
          <h3 class="sub-heading" style="margin-top: 0;">Time Budget & Sprint Strategy</h3>
          <div>${stagesHtml}</div>

          <div class="card mt-4" style="background: #f8fafc;">
            <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--primary); margin-bottom: 12px;">Guaranteed Core Definitions</h4>
            <ul style="list-style: none; padding-left: 0;">
              ${factsHtml}
            </ul>
          </div>
        </div>
      </div>
    `;
  }
};

window.ExamModeController = ExamModeController;

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".crash-tab-btn");
  const runBtn = document.getElementById("btn-run-exam-mode");
  const customInput = document.getElementById("exam-custom-hours");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const hrs = tab.getAttribute("data-hours");
      if (customInput) customInput.value = hrs;
      ExamModeController.runExamMode(hrs);
    });
  });

  if (runBtn) {
    runBtn.addEventListener("click", () => {
      const hrs = customInput ? customInput.value : 2.0;
      ExamModeController.runExamMode(hrs);
    });
  }
});
