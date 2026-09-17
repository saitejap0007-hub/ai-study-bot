function formatSummaryText(rawText) {
  if (!rawText) return "";
  if (/<[a-z][\s\S]*>/i.test(rawText)) return rawText;

  return rawText
    .split(/\n\s*\n/)
    .map(para => {
      let trimmed = para.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("### ")) {
        return `<h4 style="font-size: 1.05rem; font-weight: 700; color: var(--primary); margin: 20px 0 8px 0; border-left: 3px solid var(--primary); padding-left: 10px;">${trimmed.substring(4)}</h4>`;
      }
      if (trimmed.startsWith("## ")) {
        return `<h3 style="font-size: 1.16rem; font-weight: 800; color: #1e293b; margin: 24px 0 10px 0;">${trimmed.substring(3)}</h3>`;
      }
      if (trimmed.startsWith("# ")) {
        return `<h2 style="font-size: 1.25rem; font-weight: 800; color: var(--primary); margin: 28px 0 12px 0;">${trimmed.substring(2)}</h2>`;
      }
      let formatted = trimmed
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');
      return `<p style="margin-bottom: 14px; line-height: 1.75; font-size: 0.95rem; color: #334155;">${formatted}</p>`;
    })
    .join("");
}

const SummaryController = {
  currentSummaryData: null,
  selectedType: "quick",
  isGenerating: false,

  syncTypeButtons(type) {
    const targetType = type || this.selectedType;
    const typeBtns = document.querySelectorAll("#summary-type-group .btn");
    typeBtns.forEach(btn => {
      const bType = btn.getAttribute("data-type");
      btn.classList.toggle("active", bType === targetType);
    });
  },

  onMaterialChanged(material) {
    this.currentSummaryData = null;
    if (material) {
      this.loadSummary(material.id);
    } else {
      this.renderEmpty();
    }
  },

  onSectionActivated() {
    if (window.AppState.activeMaterial && !this.currentSummaryData) {
      this.loadSummary(window.AppState.activeMaterial.id);
    }
  },

  async loadSummary(materialId) {
    try {
      const data = await window.API.getSummary(materialId, this.selectedType);
      if (data && data.summary) {
        this.currentSummaryData = data;
        if (data.summary_type) {
          this.selectedType = data.summary_type;
          this.syncTypeButtons(data.summary_type);
        }
        this.renderSummary(data);
      } else {
        this.renderEmpty();
      }
    } catch (e) {
      console.error("Error loading summary:", e);
      this.renderEmpty();
    }
  },

  async generateSummary(forceRegenerate = false) {
    if (this.isGenerating) return;
    const active = window.AppState.activeMaterial;
    if (!active) {
      window.showToast("Please upload or select a material first", "warning");
      return;
    }

    const area = document.getElementById("summary-content-area");
    const genBtn = document.getElementById("btn-generate-summary");
    this.isGenerating = true;
    if (genBtn) genBtn.disabled = true;

    let depthTitle = "Analyzing Document with AI...";
    let depthSubtitle = "Synthesizing concepts, formal definitions, formulas, and high-yield exam takeaways.";
    if (this.selectedType === "quick") {
      depthTitle = "Generating Quick (30s) Snapshot...";
      depthSubtitle = "Extracting high-level executive thesis, top concepts, and rapid key definitions.";
    } else if (this.selectedType === "detailed") {
      depthTitle = "Generating In-Depth Detailed Academic Study Guide...";
      depthSubtitle = "Building exhaustive section-by-section breakdown, comprehensive formulas, extensive definitions, examples, and revision roadmap.";
    } else {
      depthTitle = "Generating Medium Conceptual Summary...";
      depthSubtitle = "Balancing architectural workflows, core principles, and high-yield exam takeaways.";
    }

    area.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <div style="font-size: 36px; animation: spin 1s infinite linear;">⚡</div>
        <h3 style="margin-top: 16px;">${depthTitle}</h3>
        <p class="text-muted">${depthSubtitle}</p>
      </div>
    `;

    try {
      const data = await window.API.generateSummary(active.id, this.selectedType, forceRegenerate);
      this.currentSummaryData = data;
      this.syncTypeButtons(this.selectedType);
      this.renderSummary(data);
      window.showToast(`${this.selectedType.toUpperCase()} summary generated successfully!`, "success");
    } catch (e) {
      window.showToast(`Generation failed: ${e.message}`, "error");
      this.renderEmpty();
    } finally {
      this.isGenerating = false;
      if (genBtn) genBtn.disabled = false;
    }
  },

  renderEmpty() {
    const area = document.getElementById("summary-content-area");
    if (!area) return;
    area.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📝</span>
        <h3>No Summary Generated Yet</h3>
        <p>Choose a summary depth (Quick, Medium, or Detailed) and click "Generate Summary" to extract structured study notes.</p>
      </div>
    `;
  },

  renderSummary(data) {
    const area = document.getElementById("summary-content-area");
    if (!area) return;

    const titleText = data.title || (window.AppState.activeMaterial ? window.AppState.activeMaterial.title : "Document");
    const conceptsHtml = (data.key_concepts || []).map(c => `<span class="badge badge-indigo" style="font-size: 0.85rem; padding: 6px 14px;">${c}</span>`).join(" ");
    
    const defsHtml = (data.definitions || []).map(d => `
      <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 10px;">
        <strong style="color: var(--primary); font-size: 0.95rem;">${d.term}:</strong>
        <p style="font-size: 0.9rem; color: #334155; margin-top: 4px;">${d.definition}</p>
      </div>
    `).join("");

    const importantPointsHtml = (data.important_points || []).map(p => `
      <li style="margin-bottom: 8px; font-size: 0.92rem; color: #1e293b;">📌 ${p}</li>
    `).join("");

    const formulasHtml = (data.formulas || []).map(f => `
      <div style="background: #f8fafc; border-left: 4px solid var(--secondary); padding: 12px 16px; margin-bottom: 10px; border-radius: 4px;">
        <code style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: 600; color: #4338ca;">${f.formula}</code>
        <div style="font-size: 0.82rem; color: #64748b; margin-top: 4px;">${f.description}</div>
      </div>
    `).join("");

    const examplesHtml = (data.examples || []).map(ex => `
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px;">
        <strong style="color: #166534; font-size: 0.9rem;">💡 ${ex.concept}:</strong>
        <p style="font-size: 0.88rem; color: #14532d; margin-top: 4px;">${ex.example}</p>
      </div>
    `).join("");

    const examPointsHtml = (data.exam_points || []).map(p => `
      <li style="margin-bottom: 8px; font-size: 0.92rem; color: #1e293b;">🎯 ${p}</li>
    `).join("");

    const revisionHtml = data.revision_notes ? `
      <div style="background: linear-gradient(135deg, #fdf4ff, #fae8ff); border: 1px solid #f0abfc; border-radius: 8px; padding: 16px; margin-top: 24px;">
        <h3 style="font-size: 1rem; font-weight: 700; color: #86198f; margin-bottom: 6px;">⚡ Last-Minute Rapid Revision Digest</h3>
        <p style="font-size: 0.92rem; color: #701a75; line-height: 1.6; margin: 0;">${data.revision_notes.replace(/\n/g, '<br/>')}</p>
      </div>
    ` : "";

    const depth = data.summary_type || this.selectedType || "medium";
    let depthBadge = "";
    if (depth === "quick") {
      depthBadge = `<span class="badge badge-warning" style="font-size: 0.8rem; padding: 4px 10px; margin-right: 8px;">⚡ Quick (30s) Snapshot</span>`;
    } else if (depth === "detailed") {
      depthBadge = `<span class="badge badge-success" style="font-size: 0.8rem; padding: 4px 10px; margin-right: 8px;">📚 Detailed Comprehensive Guide</span>`;
    } else {
      depthBadge = `<span class="badge badge-indigo" style="font-size: 0.8rem; padding: 4px 10px; margin-right: 8px;">📘 Medium Standard Summary</span>`;
    }

    const wordCount = (data.summary || "").split(/\s+/).filter(Boolean).length;
    const estTime = depth === "quick" ? "30s glance" : (depth === "detailed" ? `${Math.max(3, Math.round(wordCount / 160))} min read` : `${Math.max(1, Math.round(wordCount / 180))} min read`);

    area.innerHTML = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
              ${depthBadge}
              <span class="text-muted" style="font-size: 0.82rem;">(~${wordCount} words • ${estTime})</span>
            </div>
            <h2 style="font-size: 1.35rem; font-weight: 800; color: var(--primary); margin: 0;">${titleText}</h2>
          </div>
          <button class="btn btn-outline btn-xs" id="btn-force-regenerate-summary" title="Force regenerate fresh summary notes">🔄 Regenerate</button>
        </div>

        <h3 class="sub-heading" style="margin-top: 0;">Overview</h3>
        <div style="font-size: 0.98rem; line-height: 1.75; color: #1e293b; margin-bottom: 24px;">
          ${formatSummaryText(data.summary)}
        </div>

        <h3 class="sub-heading">Important Concepts (${(data.key_concepts || []).length})</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;">
          ${conceptsHtml || "<p class='text-muted'>No key concepts identified.</p>"}
        </div>

        <h3 class="sub-heading">Key Definitions (${(data.definitions || []).length})</h3>
        <div style="margin-bottom: 24px;">
          ${defsHtml || "<p class='text-muted'>No definitions extracted.</p>"}
        </div>

        ${data.important_points && data.important_points.length > 0 ? `
          <h3 class="sub-heading">Important Points (${data.important_points.length})</h3>
          <ul style="list-style: none; padding-left: 0; margin-bottom: 24px;">
            ${importantPointsHtml}
          </ul>
        ` : ""}

        <h3 class="sub-heading">Formulas & Core Principles (${(data.formulas || []).length})</h3>
        <div style="margin-bottom: 24px;">
          ${formulasHtml || "<p class='text-muted'>No mathematical formulas in this document.</p>"}
        </div>

        ${data.examples && data.examples.length > 0 ? `
          <h3 class="sub-heading">Illustrative Examples (${data.examples.length})</h3>
          <div style="margin-bottom: 24px;">
            ${examplesHtml}
          </div>
        ` : ""}

        <h3 class="sub-heading">High-Yield Exam Points (${(data.exam_points || []).length})</h3>
        <ul style="list-style: none; padding-left: 0; margin-bottom: 24px;">
          ${examPointsHtml || "<p class='text-muted'>No exam points generated.</p>"}
        </ul>

        ${revisionHtml}
      </div>
    `;

    const regenBtn = document.getElementById("btn-force-regenerate-summary");
    if (regenBtn) {
      regenBtn.addEventListener("click", () => this.generateSummary(true));
    }
  },

  copySummary() {
    if (!this.currentSummaryData) {
      window.showToast("No summary available to copy", "warning");
      return;
    }
    const d = this.currentSummaryData;
    let text = `SUMMARY (${(d.summary_type || 'medium').toUpperCase()}): ${d.title || ''}\n\n${d.summary}\n\nKEY CONCEPTS:\n${(d.key_concepts || []).join(", ")}\n\nEXAM POINTS:\n${(d.exam_points || []).join("\n")}`;
    if (d.revision_notes) text += `\n\nREVISION:\n${d.revision_notes}`;
    navigator.clipboard.writeText(text).then(() => {
      window.showToast("Summary copied to clipboard!");
    });
  },

  exportMarkdown() {
    if (!this.currentSummaryData) {
      window.showToast("No summary available to export", "warning");
      return;
    }
    const d = this.currentSummaryData;
    let md = `# ${d.title || 'Study Material'} – AI Revision Notes (${(d.summary_type || 'medium').toUpperCase()})\n\n## Summary Overview\n${d.summary}\n\n`;
    md += `## Key Concepts\n${(d.key_concepts || []).map(c => `- ${c}`).join("\n")}\n\n`;
    md += `## Key Definitions\n${(d.definitions || []).map(x => `- **${x.term}**: ${x.definition}`).join("\n")}\n\n`;
    if (d.important_points && d.important_points.length > 0) {
      md += `## Important Points\n${d.important_points.map(p => `- ${p}`).join("\n")}\n\n`;
    }
    if (d.formulas && d.formulas.length > 0) {
      md += `## Formulas & Relations\n${d.formulas.map(f => `- \`${f.formula}\`: ${f.description}`).join("\n")}\n\n`;
    }
    if (d.examples && d.examples.length > 0) {
      md += `## Examples\n${d.examples.map(e => `- **${e.concept}**: ${e.example}`).join("\n")}\n\n`;
    }
    md += `## High-Yield Exam Points\n${(d.exam_points || []).map(p => `- ${p}`).join("\n")}\n\n`;
    if (d.revision_notes) {
      md += `## Rapid Revision Digest\n${d.revision_notes}\n`;
    }

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `study_notes_${d.summary_type || 'summary'}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    window.showToast("Markdown exported!");
  }
};

window.SummaryController = SummaryController;

document.addEventListener("DOMContentLoaded", () => {
  const genBtn = document.getElementById("btn-generate-summary");
  const copyBtn = document.getElementById("btn-copy-summary");
  const exportBtn = document.getElementById("btn-export-summary");
  const typeBtns = document.querySelectorAll("#summary-type-group .btn");

  if (genBtn) genBtn.addEventListener("click", () => SummaryController.generateSummary(false));
  if (copyBtn) copyBtn.addEventListener("click", () => SummaryController.copySummary());
  if (exportBtn) exportBtn.addEventListener("click", () => SummaryController.exportMarkdown());

  typeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const newType = btn.getAttribute("data-type");
      typeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      SummaryController.selectedType = newType;
      
      if (window.AppState.activeMaterial) {
        if (SummaryController.currentSummaryData && SummaryController.currentSummaryData.summary_type === newType) {
          SummaryController.renderSummary(SummaryController.currentSummaryData);
          return;
        }
        SummaryController.generateSummary(false);
      }
    });
  });
});
