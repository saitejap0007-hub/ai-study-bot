const DashboardController = {
  async refresh() {
    try {
      const stats = await window.API.getProgressStats();
      
      const matCountEl = document.getElementById("stat-materials-count");
      const quizAccEl = document.getElementById("stat-quiz-accuracy");
      const fcMasteredEl = document.getElementById("stat-flashcards-mastered");
      const studyTimeEl = document.getElementById("stat-study-time");

      if (matCountEl) matCountEl.textContent = stats.materials_count || 0;
      if (quizAccEl) quizAccEl.textContent = `${stats.average_quiz_score || 0}%`;
      if (fcMasteredEl) fcMasteredEl.textContent = stats.flashcards_mastered || 0;
      if (studyTimeEl) {
        const mins = stats.total_study_minutes || 0;
        studyTimeEl.textContent = mins >= 60 ? `${Math.round(mins / 60)}h ${mins % 60}m` : `${mins}m`;
      }

      // Recent Activity Timeline
      const timelineEl = document.getElementById("recent-activity-list");
      if (timelineEl) {
        if (stats.recent_activities && stats.recent_activities.length > 0) {
          timelineEl.innerHTML = stats.recent_activities.map(act => `
            <div style="display: flex; gap: 12px; margin-bottom: 12px; font-size: 0.88rem; align-items: center;">
              <span style="font-size: 16px;">📌</span>
              <div style="flex: 1;">
                <strong>${act.description}</strong>
                <div style="font-size: 0.75rem; color: #94a3b8;">${new Date(act.created_at).toLocaleString()}</div>
              </div>
            </div>
          `).join("");
        } else {
          timelineEl.innerHTML = `<p class="text-muted">No recent activities yet. Upload your first document to get started!</p>`;
        }
      }

      // Check Weak Topics
      const topicsData = await window.API.getProgressTopics();
      const alertEl = document.getElementById("weak-topic-alert");
      const weakListEl = document.getElementById("weak-topic-list");

      if (topicsData.weak_topics && topicsData.weak_topics.length > 0 && topicsData.weak_topics[0] !== "Take your first quiz to identify weak areas!") {
        if (alertEl) alertEl.classList.remove("hidden");
        if (weakListEl) weakListEl.textContent = topicsData.weak_topics.slice(0, 3).join(", ");
      } else {
        if (alertEl) alertEl.classList.add("hidden");
      }
    } catch (err) {
      console.error("Dashboard refresh error:", err);
    }
  }
};

window.DashboardController = DashboardController;

document.addEventListener("DOMContentLoaded", () => {
  // Quick action clicks
  document.querySelectorAll(".action-card").forEach(card => {
    card.addEventListener("click", () => {
      const action = card.getAttribute("data-action");
      if (action) {
        window.navigateToSection(action);
        if (action === "upload") {
          const fileInput = document.getElementById("file-input");
          if (fileInput) fileInput.click();
        }
      }
    });
  });

  // Clear dashboard history button
  const clearDashBtn = document.getElementById("btn-clear-dashboard-history");
  if (clearDashBtn) {
    clearDashBtn.addEventListener("click", async () => {
      const ok = confirm("⚠️ Clear recent activity history?");
      if (!ok) return;
      try {
        await window.API.clearHistory();
        window.showToast("Activity history cleared!", "success");
        await DashboardController.refresh();
        if (window.ProgressController) await window.ProgressController.refresh();
      } catch (err) {
        window.showToast(err.message || "Failed to clear history", "error");
      }
    });
  }

  DashboardController.refresh();
});

