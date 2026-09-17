const MaterialsController = {
  async refresh() {
    try {
      const data = await window.API.getMaterials();
      window.AppState.materials = data.materials || [];

      // Update badge count
      const badge = document.getElementById("materials-count-badge");
      if (badge) badge.textContent = window.AppState.materials.length;

      // Update sidebar select
      const sidebarSelect = document.getElementById("sidebar-mat-select");
      if (sidebarSelect) {
        const currentActiveId = window.AppState.activeMaterial ? window.AppState.activeMaterial.id : "";
        sidebarSelect.innerHTML = `<option value="">No material selected</option>` +
          window.AppState.materials.map(m => `<option value="${m.id}" ${m.id == currentActiveId ? "selected" : ""}>${m.title}</option>`).join("");
      }

      this.renderGrid();
    } catch (err) {
      console.error("Failed to refresh materials:", err);
    }
  },

  renderGrid() {
    const grid = document.getElementById("materials-grid");
    if (!grid) return;

    if (window.AppState.materials.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
          <span style="font-size: 40px;">📚</span>
          <h3 style="margin: 12px 0 6px;">No Materials in Library</h3>
          <p class="text-muted">Drop files into the upload area above to start analyzing documents.</p>
        </div>
      `;
      return;
    }

    const activeId = window.AppState.activeMaterial ? window.AppState.activeMaterial.id : null;

    grid.innerHTML = window.AppState.materials.map(mat => {
      const isActive = mat.id === activeId;
      
      // Status badge
      let statusBadge = `<span class="badge badge-success">✓ Ready</span>`;
      if (mat.status === "scanned_ocr_required") {
        statusBadge = `<span class="badge badge-warning">⚠️ Scanned / OCR Needed</span>`;
      } else if (mat.status === "empty") {
        statusBadge = `<span class="badge badge-warning">Empty Text</span>`;
      } else if (mat.status === "failed") {
        statusBadge = `<span class="badge badge-danger">Failed</span>`;
      }

      const warningHtml = mat.error_message ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 0.78rem; padding: 6px 10px; border-radius: 6px; margin: 8px 0;">
          ⚠️ ${mat.error_message}
        </div>
      ` : "";

      return `
        <div class="material-card ${isActive ? 'active-material' : ''}" data-id="${mat.id}">
          <div>
            <div class="material-header" style="justify-content: space-between;">
              <div style="display: flex; gap: 6px; align-items: center;">
                <span class="file-badge ${mat.file_type}">${mat.file_type}</span>
                ${statusBadge}
              </div>
            </div>
            <h3 class="material-title" style="margin: 6px 0 4px;">${mat.title}</h3>
            
            <div class="material-meta">
              <span>${(mat.file_size / 1024).toFixed(1)} KB</span> • 
              <span>${mat.page_count || 1} ${mat.page_count === 1 ? 'page' : 'pages'}</span> • 
              <span>${mat.chunk_count || 0} chunks</span><br>
              <span>${mat.char_count.toLocaleString()} chars</span> • 
              <span>Uploaded ${new Date(mat.created_at).toLocaleDateString()}</span>
            </div>
            ${warningHtml}
          </div>
          <div class="material-actions">
            <button class="btn ${isActive ? 'btn-primary' : 'btn-outline'} btn-xs btn-activate-mat" data-id="${mat.id}">
              ${isActive ? '✓ Active' : 'Set Active'}
            </button>
            <button class="btn btn-outline btn-xs btn-preview-mat" data-id="${mat.id}">Preview</button>
            <button class="btn btn-outline btn-xs text-danger btn-delete-mat" data-id="${mat.id}">Delete</button>
          </div>
        </div>
      `;
    }).join("");

    // Bind action events
    grid.querySelectorAll(".btn-activate-mat").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.getAttribute("data-id"));
        const found = window.AppState.materials.find(m => m.id === id);
        if (found) {
          window.setActiveMaterial(found);
          this.renderGrid();
          window.showToast(`Active material set to: ${found.title}`);
        }
      });
    });

    grid.querySelectorAll(".btn-preview-mat").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.getAttribute("data-id"));
        try {
          const res = await window.API.getMaterial(id);
          document.getElementById("preview-modal-title").textContent = `${res.material.title} (Page Count: ${res.material.page_count || 1})`;
          document.getElementById("preview-modal-text").textContent = res.material.extracted_text || "No text.";
          document.getElementById("preview-modal").classList.remove("hidden");
        } catch (e) {
          window.showToast("Failed to load preview", "error");
        }
      });
    });

    grid.querySelectorAll(".btn-delete-mat").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.getAttribute("data-id"));
        if (!confirm("Are you sure you want to delete this study material and all generated notes?")) return;

        try {
          await window.API.deleteMaterial(id);
          window.showToast("Material deleted successfully");
          if (window.AppState.activeMaterial && window.AppState.activeMaterial.id === id) {
            window.setActiveMaterial(null);
          }
          await this.refresh();
        } catch (e) {
          window.showToast("Failed to delete material", "error");
        }
      });
    });
  },

  async handleUploadFiles(files) {
    if (!files || files.length === 0) return;

    const progressContainer = document.getElementById("upload-progress-container");
    const progressBar = document.getElementById("upload-progress-bar");
    const statusText = document.getElementById("upload-status-text");
    const percentText = document.getElementById("upload-percent-text");

    progressContainer.classList.remove("hidden");
    progressBar.style.width = "5%";
    percentText.textContent = "5%";

    const totalFiles = files.length;
    let uploadedCount = 0;

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      
      // Stage 1: Uploading
      statusText.textContent = `Uploading document (${i + 1}/${totalFiles}): ${file.name}...`;
      progressBar.style.width = "30%";
      percentText.textContent = "30%";
      
      const formData = new FormData();
      formData.append("files", file);

      try {
        // Stage 2: Processing & Chunking
        setTimeout(() => {
          statusText.textContent = `Extracting text, validating pages & creating searchable chunks for ${file.name}...`;
          progressBar.style.width = "65%";
          percentText.textContent = "65%";
        }, 150);

        const res = await window.API.uploadMaterials(formData);
        uploadedCount++;
        const pct = Math.round(((i + 1) / totalFiles) * 100);
        progressBar.style.width = `${pct}%`;
        percentText.textContent = `${pct}%`;

        // Check if there was a warning for scanned pages
        if (res.materials && res.materials[0]) {
          const mat = res.materials[0];
          if (mat.is_scanned) {
            window.showToast(`Uploaded ${file.name}, but document appears to contain scanned pages without selectable text.`, "warning");
          }
        }

        // Auto-select if first document
        if (res.materials && res.materials.length > 0 && !window.AppState.activeMaterial) {
          window.setActiveMaterial(res.materials[0]);
        }
      } catch (err) {
        window.showToast(err.message || `Error processing ${file.name}`, "error");
      }
    }

    statusText.textContent = "Document ingestion and indexing ready!";
    setTimeout(() => {
      progressContainer.classList.add("hidden");
      if (uploadedCount > 0) {
        window.showToast(`Processed ${uploadedCount} of ${totalFiles} documents successfully!`, "success");
      }
      this.refresh();
    }, 600);
  }
};

window.MaterialsController = MaterialsController;

document.addEventListener("DOMContentLoaded", () => {
  const dropzone = document.getElementById("upload-dropzone");
  const fileInput = document.getElementById("file-input");
  const selectBtn = document.getElementById("btn-select-files");

  if (selectBtn && fileInput) {
    selectBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (dropzone) {
    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        MaterialsController.handleUploadFiles(e.dataTransfer.files);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        MaterialsController.handleUploadFiles(e.target.files);
      }
    });
  }

  // Clear / Reset Library Button
  const resetBtn = document.getElementById("btn-reset-library");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const ok = confirm("⚠️ Are you sure you want to refresh and reset all study materials?\n\nThis will permanently remove all documents, summaries, quizzes, flashcards, and plans so you have a fresh, clean library.");
      if (!ok) return;

      try {
        await window.API.resetAllMaterials();
        window.setActiveMaterial(null);
        window.showToast("All study materials refreshed and library cleaned!", "success");
        await MaterialsController.refresh();
        if (window.DashboardController) await window.DashboardController.refresh();
        if (window.ProgressController) await window.ProgressController.refresh();
      } catch (err) {
        window.showToast(err.message || "Failed to reset materials", "error");
      }
    });
  }
});
