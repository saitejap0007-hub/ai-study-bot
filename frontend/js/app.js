// Global App State
window.AppState = {
  materials: [],
  activeMaterial: null,
  currentSection: "dashboard"
};

// Toast Notification Manager
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
window.showToast = showToast;

// Switch Active Section
function navigateToSection(sectionId) {
  const targetId = sectionId.replace("#", "");
  const targetSection = document.getElementById(`section-${targetId}`);
  if (!targetSection) return;

  document.querySelectorAll(".content-section").forEach(sec => sec.classList.remove("active"));
  targetSection.classList.add("active");

  document.querySelectorAll(".nav-link").forEach(link => {
    link.classList.toggle("active", link.getAttribute("data-section") === targetId);
  });

  window.AppState.currentSection = targetId;
  window.location.hash = targetId;

  // Trigger section specific refreshes
  if (targetId === "dashboard" && window.DashboardController) window.DashboardController.refresh();
  if (targetId === "materials" && window.MaterialsController) window.MaterialsController.refresh();
  if (targetId === "progress" && window.ProgressController) window.ProgressController.refresh();
  if (targetId === "summary" && window.SummaryController) window.SummaryController.onSectionActivated();
  if (targetId === "questions" && window.QuestionsController) window.QuestionsController.onSectionActivated();
  if (targetId === "quiz" && window.QuizController) window.QuizController.onSectionActivated();
  if (targetId === "flashcards" && window.FlashcardsController) window.FlashcardsController.onSectionActivated();

  // Close mobile sidebar if open
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.remove("open");
}
window.navigateToSection = navigateToSection;

// Set Active Study Material
function setActiveMaterial(material) {
  window.AppState.activeMaterial = material;

  const banner = document.getElementById("active-material-banner");
  const titleEl = document.getElementById("active-material-title");
  const statsEl = document.getElementById("active-material-stats");
  const selectEl = document.getElementById("sidebar-mat-select");

  if (material) {
    if (banner) banner.classList.remove("hidden");
    if (titleEl) titleEl.textContent = material.title;
    if (statsEl) statsEl.textContent = `(${material.char_count.toLocaleString()} chars • ${material.file_type.toUpperCase()})`;
    if (selectEl) selectEl.value = material.id;
  } else {
    if (banner) banner.classList.add("hidden");
    if (selectEl) selectEl.value = "";
  }

  // Notify controllers
  if (window.SummaryController) window.SummaryController.onMaterialChanged(material);
  if (window.QuestionsController) window.QuestionsController.onMaterialChanged(material);
  if (window.QuizController) window.QuizController.onMaterialChanged(material);
  if (window.FlashcardsController) window.FlashcardsController.onMaterialChanged(material);
  if (window.TutorController) window.TutorController.onMaterialChanged(material);
}
window.setActiveMaterial = setActiveMaterial;

// Global Search Handling
function initSearch() {
  const input = document.getElementById("global-search-input");
  const dropdown = document.getElementById("search-results-dropdown");
  if (!input || !dropdown) return;

  let debounceTimer;

  input.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const q = e.target.value.trim();
    if (q.length < 2) {
      dropdown.classList.add("hidden");
      dropdown.innerHTML = "";
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const data = await window.API.search(q);
        if (data.results && data.results.length > 0) {
          dropdown.innerHTML = data.results.map(r => `
            <div class="search-result-item" data-type="${r.type}" data-id="${r.id}" data-mat-id="${r.material_id || r.id}">
              <div class="res-title">${r.title}</div>
              <div class="res-snippet">${r.snippet}</div>
            </div>
          `).join("");
          dropdown.classList.remove("hidden");

          dropdown.querySelectorAll(".search-result-item").forEach(item => {
            item.addEventListener("click", () => {
              const matId = item.getAttribute("data-mat-id");
              const found = window.AppState.materials.find(m => m.id == matId);
              if (found) setActiveMaterial(found);
              
              const type = item.getAttribute("data-type");
              dropdown.classList.add("hidden");
              if (type === "summary") navigateToSection("summary");
              else if (type === "question") navigateToSection("questions");
              else navigateToSection("materials");
            });
          });
        } else {
          dropdown.innerHTML = `<div style="padding: 12px 16px; font-size: 0.85rem; color: #94a3b8;">No results found for "${q}"</div>`;
          dropdown.classList.remove("hidden");
        }
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 250);
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });
}

// Modal Preview Handling
function initPreviewModal() {
  const modal = document.getElementById("preview-modal");
  const closeBtn = document.getElementById("btn-close-preview");
  const previewBtn = document.getElementById("btn-preview-active");
  const modalTitle = document.getElementById("preview-modal-title");
  const modalText = document.getElementById("preview-modal-text");

  if (previewBtn) {
    previewBtn.addEventListener("click", async () => {
      const active = window.AppState.activeMaterial;
      if (!active) {
        showToast("No active document chosen", "warning");
        return;
      }
      try {
        const data = await window.API.getMaterial(active.id);
        modalTitle.textContent = `${data.material.title} (Raw Extracted Text)`;
        modalText.textContent = data.material.extracted_text || "No text extracted.";
        modal.classList.remove("hidden");
      } catch (e) {
        showToast("Could not load preview", "error");
      }
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }
}

// Initializer
document.addEventListener("DOMContentLoaded", async () => {
  // Navigation links
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const sec = link.getAttribute("data-section");
      navigateToSection(sec);
    });
  });

  // Mobile menu toggle
  const mobileToggle = document.getElementById("mobile-toggle");
  const mobileClose = document.getElementById("mobile-close-btn");
  const sidebar = document.getElementById("sidebar");
  if (mobileToggle) mobileToggle.addEventListener("click", () => sidebar.classList.add("open"));
  if (mobileClose) mobileClose.addEventListener("click", () => sidebar.classList.remove("open"));

  // Topbar quick upload button
  const quickUpload = document.getElementById("btn-quick-upload");
  if (quickUpload) {
    quickUpload.addEventListener("click", () => {
      navigateToSection("materials");
      const fileInput = document.getElementById("file-input");
      if (fileInput) fileInput.click();
    });
  }

  // Sidebar select dropdown
  const sidebarSelect = document.getElementById("sidebar-mat-select");
  if (sidebarSelect) {
    sidebarSelect.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      const found = window.AppState.materials.find(m => m.id == selectedId);
      setActiveMaterial(found || null);
    });
  }

  initSearch();
  initPreviewModal();
  SettingsController.init();

  // Load initial materials and settings
  try {
    const [matData, settingsData] = await Promise.all([
      window.API.getMaterials(),
      window.API.getSettings().catch(() => null)
    ]);
    window.AppState.materials = matData.materials || [];
    
    // Update sidebar engine badge if settings loaded
    if (settingsData) {
      const engineBadge = document.querySelector(".sidebar-footer .engine-badge span:last-child");
      if (engineBadge) {
        if (settingsData.active_engine === "gemini") engineBadge.textContent = "Google Gemini 1.5 Active";
        else if (settingsData.active_engine === "openai") engineBadge.textContent = "OpenAI GPT-4o Active";
        else engineBadge.textContent = "Dual AI Engine (Offline Safe)";
      }
    }

    // Populate sidebar select
    if (sidebarSelect) {
      sidebarSelect.innerHTML = `<option value="">No material selected</option>` +
        window.AppState.materials.map(m => `<option value="${m.id}">${m.title}</option>`).join("");
    }

    if (window.AppState.materials.length > 0) {
      setActiveMaterial(window.AppState.materials[0]);
    }
  } catch (err) {
    console.error("Failed to load initial materials:", err);
  }

  // Check URL hash for routing
  if (window.location.hash) {
    navigateToSection(window.location.hash);
  } else {
    navigateToSection("dashboard");
  }
});

// Settings Controller for AI API Keys
const SettingsController = {
  async openModal() {
    const modal = document.getElementById("settings-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    await this.loadSettings();
  },

  closeModal() {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.classList.add("hidden");
  },

  updateAiStatusUI(data) {
    const isOnline = !!data.is_online;
    const pill = document.getElementById("ai-status-pill");
    const dot = document.getElementById("ai-status-pulse-dot");
    const text = document.getElementById("ai-status-text");
    const connectBtn = document.getElementById("btn-connect-online");
    
    const sideDot = document.getElementById("sidebar-status-dot");
    const sideText = document.getElementById("sidebar-status-text");

    const dashBanner = document.getElementById("dashboard-ai-banner");
    const dashIcon = document.getElementById("dashboard-ai-banner-icon");
    const dashTitle = document.getElementById("dashboard-ai-banner-title");
    const dashDesc = document.getElementById("dashboard-ai-banner-desc");
    const dashBtn = document.getElementById("btn-dashboard-connect-online");

    const engineLabel = data.engine_display || (isOnline ? "Google Gemini (Online)" : "Offline Heuristics");

    // Topbar Pill & Connect Button
    if (pill && dot && text) {
      if (isOnline) {
        pill.className = "ai-status-pill online";
        dot.className = "status-pulse-dot online";
        text.textContent = `🟢 AI Online (${data.verified_model || "Gemini"})`;
        pill.title = `AI Study Buddy is ONLINE with ${engineLabel}. Click to manage settings.`;
        if (connectBtn) connectBtn.style.display = "none";
      } else {
        pill.className = "ai-status-pill offline";
        dot.className = "status-pulse-dot offline";
        text.textContent = "AI Offline (Local)";
        pill.title = "AI is running in offline rule-based fallback mode. Click to connect online.";
        if (connectBtn) {
          connectBtn.style.display = "inline-flex";
          connectBtn.innerHTML = "⚡ Connect Online";
        }
      }
    }

    // Sidebar
    if (sideDot && sideText) {
      if (isOnline) {
        sideDot.style.backgroundColor = "#10b981";
        sideDot.style.boxShadow = "0 0 8px #10b981";
        sideText.textContent = `🟢 Online: ${data.verified_model || "Gemini"}`;
      } else {
        sideDot.style.backgroundColor = "#ea580c";
        sideDot.style.boxShadow = "0 0 6px #ea580c";
        sideText.textContent = "AI Offline (Local Fallback)";
      }
    }

    // Dashboard Banner
    if (dashBanner && dashTitle && dashDesc) {
      if (isOnline) {
        dashBanner.className = "dashboard-ai-banner online";
        if (dashIcon) dashIcon.textContent = "🟢";
        dashTitle.textContent = `AI Cloud Intelligence Active: ${engineLabel}`;
        dashDesc.textContent = "Your study materials are analyzed using real cloud LLM reasoning with high-accuracy summaries, exam questions, and grounded tutoring.";
        if (dashBtn) {
          dashBtn.innerHTML = "⚙️ Configure AI";
          dashBtn.className = "btn btn-sm btn-outline";
        }
      } else {
        dashBanner.className = "dashboard-ai-banner offline";
        if (dashIcon) dashIcon.textContent = "📡";
        dashTitle.textContent = "Current AI Mode: Offline Heuristics (Local Parser)";
        dashDesc.textContent = "Summaries and questions are running offline with basic text splitting. Connect a free Google Gemini key to activate 10x smarter AI reasoning.";
        if (dashBtn) {
          dashBtn.innerHTML = "⚡ Connect Online";
          dashBtn.className = "btn btn-sm btn-connect-online";
        }
      }
    }

    // Quiz Section AI Indicator
    const quizIndicator = document.getElementById("quiz-ai-indicator");
    const quizIndicatorText = document.getElementById("quiz-ai-indicator-text");
    if (quizIndicator && quizIndicatorText) {
      if (isOnline) {
        quizIndicator.style.background = "#eff6ff";
        quizIndicator.style.color = "#1d4ed8";
        quizIndicator.style.borderColor = "#bfdbfe";
        quizIndicatorText.textContent = `${data.verified_model || "Gemini"} Online`;
      } else {
        quizIndicator.style.background = "#fff7ed";
        quizIndicator.style.color = "#c2410c";
        quizIndicator.style.borderColor = "#fed7aa";
        quizIndicatorText.textContent = "Offline (Click to Connect Gemini)";
      }
    }
  },

  async loadSettings() {
    const badge = document.getElementById("settings-active-engine-badge");
    const engineSelect = document.getElementById("settings-preferred-engine");
    const geminiInput = document.getElementById("input-gemini-key");
    const openaiInput = document.getElementById("input-openai-key");
    const geminiResult = document.getElementById("gemini-test-result");
    const openaiResult = document.getElementById("openai-test-result");

    if (geminiResult) geminiResult.textContent = "";
    if (openaiResult) openaiResult.textContent = "";

    try {
      const data = await window.API.getSettings();
      this.updateAiStatusUI(data);

      if (badge) {
        if (data.is_online) {
          badge.innerHTML = `<span class="badge badge-success">🟢 ${data.engine_display} (Online & Ready)</span>`;
        } else {
          badge.innerHTML = `<span class="badge badge-warning">🟠 Offline Heuristics (No Valid API Keys Connected)</span>`;
        }
      }

      if (engineSelect && data.preferred_engine) {
        engineSelect.value = data.preferred_engine;
      }

      if (geminiInput) {
        geminiInput.value = "";
        geminiInput.placeholder = data.gemini_key_masked ? `Configured: ${data.gemini_key_masked}` : "Enter Gemini API key (AIzaSy...)";
      }

      if (openaiInput) {
        openaiInput.value = "";
        openaiInput.placeholder = data.openai_key_masked ? `Configured: ${data.openai_key_masked}` : "Enter OpenAI API key (sk-...)";
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      if (badge) badge.textContent = "Error loading settings";
    }
  },

  async saveSettings() {
    const geminiKey = document.getElementById("input-gemini-key").value.trim();
    const openaiKey = document.getElementById("input-openai-key").value.trim();
    const preferredEngine = document.getElementById("settings-preferred-engine").value;

    const payload = { preferred_engine: preferredEngine };
    if (geminiKey) payload.gemini_api_key = geminiKey;
    if (openaiKey) payload.openai_api_key = openaiKey;

    try {
      const res = await window.API.saveSettings(payload);
      this.loadSettings();

      if (res.is_online) {
        window.showToast("🎉 Successfully connected to AI! Study Buddy is now ONLINE.", "success");
      } else {
        window.showToast("Saved! AI is currently in Offline Heuristics mode.", "info");
      }
      this.closeModal();
    } catch (err) {
      window.showToast(err.message || "Failed to save settings", "error");
    }
  },

  async testConnection(engine) {
    const isGemini = engine === "gemini";
    const input = document.getElementById(isGemini ? "input-gemini-key" : "input-openai-key");
    const resultEl = document.getElementById(isGemini ? "gemini-test-result" : "openai-test-result");
    const testBtn = document.getElementById(isGemini ? "btn-test-gemini" : "btn-test-openai");

    const key = input ? input.value.trim() : "";
    if (resultEl) {
      resultEl.innerHTML = `<span style="color: var(--primary);">⏳ Testing ${engine} connection...</span>`;
    }
    if (testBtn) testBtn.disabled = true;

    try {
      const payload = { engine };
      if (key) {
        if (isGemini) payload.gemini_api_key = key;
        else payload.openai_api_key = key;
      }
      const res = await window.API.testAiConnection(payload);
      if (resultEl) {
        if (res.success) {
          resultEl.innerHTML = `<span style="color: #16a34a; font-weight: 600;">✓ Connected! Latency: ${res.latency_ms || 120}ms (${res.model || engine})</span>`;
          this.loadSettings();
        } else {
          resultEl.innerHTML = `<span style="color: #dc2626; font-weight: 600;">✕ ${res.error || "Connection failed"}</span>`;
        }
      }
    } catch (err) {
      if (resultEl) {
        resultEl.innerHTML = `<span style="color: #dc2626; font-weight: 600;">✕ ${err.message}</span>`;
      }
    } finally {
      if (testBtn) testBtn.disabled = false;
    }
  },

  async toggleOfflineMode() {
    try {
      const res = await window.API.toggleOffline();
      window.showToast(res.message || "Switched to Offline Mode", "info");
      await this.loadSettings();
      this.closeModal();
    } catch (err) {
      window.showToast(err.message || "Failed to switch mode", "error");
    }
  },

  init() {
    const openBtn = document.getElementById("btn-ai-settings");
    const closeBtn = document.getElementById("btn-close-settings");
    const cancelBtn = document.getElementById("btn-cancel-settings");
    const saveBtn = document.getElementById("btn-save-settings");
    const offlineBtn = document.getElementById("btn-toggle-offline-mode");
    const modal = document.getElementById("settings-modal");

    // Quick Connect & Status click triggers
    const pill = document.getElementById("ai-status-pill");
    const topConnectBtn = document.getElementById("btn-connect-online");
    const dashConnectBtn = document.getElementById("btn-dashboard-connect-online");
    const sideBadge = document.getElementById("sidebar-engine-badge");

    const triggerOpen = () => {
      this.openModal();
      const geminiInp = document.getElementById("input-gemini-key");
      if (geminiInp) setTimeout(() => geminiInp.focus(), 150);
    };

    if (pill) pill.addEventListener("click", triggerOpen);
    if (topConnectBtn) topConnectBtn.addEventListener("click", triggerOpen);
    if (dashConnectBtn) dashConnectBtn.addEventListener("click", triggerOpen);
    if (sideBadge) sideBadge.addEventListener("click", triggerOpen);
    const quizAiIndicator = document.getElementById("quiz-ai-indicator");
    if (quizAiIndicator) quizAiIndicator.addEventListener("click", triggerOpen);

    if (openBtn) openBtn.addEventListener("click", () => this.openModal());
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());
    if (cancelBtn) cancelBtn.addEventListener("click", () => this.closeModal());
    if (saveBtn) saveBtn.addEventListener("click", () => this.saveSettings());
    if (offlineBtn) offlineBtn.addEventListener("click", () => this.toggleOfflineMode());

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) this.closeModal();
      });
    }

    const toggleGemini = document.getElementById("btn-toggle-gemini-visibility");
    if (toggleGemini) {
      toggleGemini.addEventListener("click", () => {
        const inp = document.getElementById("input-gemini-key");
        inp.type = inp.type === "password" ? "text" : "password";
      });
    }

    const toggleOpenai = document.getElementById("btn-toggle-openai-visibility");
    if (toggleOpenai) {
      toggleOpenai.addEventListener("click", () => {
        const inp = document.getElementById("input-openai-key");
        inp.type = inp.type === "password" ? "text" : "password";
      });
    }

    const testGeminiBtn = document.getElementById("btn-test-gemini");
    if (testGeminiBtn) {
      testGeminiBtn.addEventListener("click", () => this.testConnection("gemini"));
    }

    const testOpenaiBtn = document.getElementById("btn-test-openai");
    if (testOpenaiBtn) {
      testOpenaiBtn.addEventListener("click", () => this.testConnection("openai"));
    }

    // Load initial settings and update status bar
    this.loadSettings();
  }
};
window.SettingsController = SettingsController;


