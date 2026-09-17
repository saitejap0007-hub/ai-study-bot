const ProgressController = {
  async refresh() {
    try {
      const topicsData = await window.API.getProgressTopics();
      const statsData = await window.API.getProgressStats();

      // Render weak topics badges
      const weakContainer = document.getElementById("weak-topics-badges");
      if (weakContainer) {
        if (topicsData.weak_topics && topicsData.weak_topics.length > 0) {
          weakContainer.innerHTML = topicsData.weak_topics.map(t => 
            `<span class="badge badge-warning" style="margin: 4px; font-size: 0.85rem; padding: 6px 12px;">⚠️ ${t}</span>`
          ).join(" ");
        } else {
          weakContainer.innerHTML = `<span class="text-muted">No weak topics recorded yet.</span>`;
        }
      }

      // Render strong topics badges
      const strongContainer = document.getElementById("strong-topics-badges");
      if (strongContainer) {
        if (topicsData.strong_topics && topicsData.strong_topics.length > 0) {
          strongContainer.innerHTML = topicsData.strong_topics.map(t => 
            `<span class="badge badge-success" style="margin: 4px; font-size: 0.85rem; padding: 6px 12px;">✅ ${t}</span>`
          ).join(" ");
        } else {
          strongContainer.innerHTML = `<span class="text-muted">Take quizzes to build mastery!</span>`;
        }
      }

      // Render activity table
      const tableWrapper = document.getElementById("analytics-activity-table");
      if (tableWrapper) {
        const activities = statsData.recent_activities || [];
        if (activities.length === 0) {
          tableWrapper.innerHTML = `<p class="text-muted" style="padding: 16px;">No learning activities logged yet.</p>`;
        } else {
          tableWrapper.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
              <thead>
                <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b;">
                  <th style="padding: 10px;">Time</th>
                  <th style="padding: 10px;">Type</th>
                  <th style="padding: 10px;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${activities.map(a => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px; color: #94a3b8; font-size: 0.8rem;">${new Date(a.created_at).toLocaleString()}</td>
                    <td style="padding: 10px;"><span class="badge badge-indigo">${a.activity_type}</span></td>
                    <td style="padding: 10px; font-weight: 500;">${a.description}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `;
        }
      }
    } catch (err) {
      console.error("ProgressController refresh error:", err);
    }
  }
};

window.ProgressController = ProgressController;

document.addEventListener("DOMContentLoaded", () => {
  ProgressController.refresh();

  const clearBtn = document.getElementById("btn-clear-history");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      const ok = confirm("⚠️ Are you sure you want to clear your activity and quiz history?\n\nThis will remove all logged learning actions and quiz score records.");
      if (!ok) return;

      try {
        await window.API.clearHistory();
        window.showToast("Activity and quiz history cleared successfully!", "success");
        await ProgressController.refresh();
        if (window.DashboardController) await window.DashboardController.refresh();
      } catch (err) {
        window.showToast(err.message || "Failed to clear history", "error");
      }
    });
  }
});

