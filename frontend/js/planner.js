const PlannerController = {
  async generatePlan(examDate, dailyMinutes) {
    const active = window.AppState.activeMaterial;
    const materialId = active ? active.id : null;

    const container = document.getElementById("planner-results-container");
    container.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 32px;">📅</div>
        <h3 style="margin-top: 12px;">Synthesizing Date-Aware Timetable...</h3>
        <p class="text-muted">Balancing calendar days, daily study, practice, and breaks.</p>
      </div>
    `;

    try {
      const plan = await window.API.generatePlanner(materialId, examDate, dailyMinutes);
      this.renderPlan(plan);
      window.showToast("Study plan generated successfully!");
    } catch (e) {
      container.innerHTML = `<p class="text-danger" style="padding: 24px;">Failed: ${e.message}</p>`;
    }
  },

  renderPlan(plan) {
    const container = document.getElementById("planner-results-container");
    if (!container) return;

    const b = plan.breakdown;
    const scheduleHtml = (plan.schedule || []).map(item => `
      <div class="card" style="margin-bottom: 16px; border-left: 5px solid var(--primary);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h3 style="font-size: 1.05rem; font-weight: 700; color: #1e293b;">${item.focus}</h3>
          <span class="badge badge-accent">${item.date} • ${item.duration_minutes}m</span>
        </div>
        <ul style="list-style: none; padding-left: 0; margin-top: 12px;">
          ${(item.tasks || []).map(t => `<li style="margin-bottom: 6px; font-size: 0.88rem; color: #334155;">🔹 ${t}</li>`).join("")}
        </ul>
      </div>
    `).join("");

    container.innerHTML = `
      <div class="card" style="background: linear-gradient(135deg, #ede9fe, #ffffff); border: 2px solid #c7d2fe; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <h2 style="font-size: 1.4rem; font-weight: 800; color: var(--primary);">
              ${plan.days_remaining} Days Until Exam (${plan.exam_date})
            </h2>
            <p class="text-muted">Target Material: <strong>${plan.material_title || 'General Schedule'}</strong></p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.5rem; font-weight: 800; color: var(--secondary);">${plan.daily_minutes} mins / day</div>
            <span class="badge badge-indigo">Optimized Study Ratio</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 20px;">
          <div style="background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 0.75rem; color: #64748b; font-weight: 700;">STUDY (50%)</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--primary);">${b.study_minutes}m</div>
          </div>
          <div style="background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 0.75rem; color: #64748b; font-weight: 700;">PRACTICE (25%)</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--secondary);">${b.practice_minutes}m</div>
          </div>
          <div style="background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 0.75rem; color: #64748b; font-weight: 700;">REVISION (15%)</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #0891b2;">${b.revision_minutes}m</div>
          </div>
          <div style="background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 0.75rem; color: #64748b; font-weight: 700;">BREAKS (10%)</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--warning);">${b.break_minutes}m</div>
          </div>
        </div>
      </div>

      <h3 class="sub-heading">Day-by-Day Roadmap</h3>
      <div>${scheduleHtml}</div>
    `;
  }
};

window.PlannerController = PlannerController;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("planner-form");
  const dateInput = document.getElementById("planner-exam-date");

  // Set default date to 7 days from now
  if (dateInput) {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    dateInput.value = future.toISOString().split("T")[0];
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const examDate = dateInput.value;
      const dailyMinutes = parseInt(document.getElementById("planner-daily-minutes").value);
      PlannerController.generatePlan(examDate, dailyMinutes);
    });
  }
});
