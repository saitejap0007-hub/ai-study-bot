// Dynamic origin API client (works locally and on Render HTTPS without hardcoded localhost)
const API_BASE = window.location.origin;

const API = {
  // Materials
  async getMaterials() {
    const res = await fetch(`${API_BASE}/api/materials`);
    if (!res.ok) throw new Error("Failed to fetch materials");
    return res.json();
  },

  async getMaterial(id) {
    const res = await fetch(`${API_BASE}/api/materials/${id}`);
    if (!res.ok) throw new Error("Failed to fetch material");
    return res.json();
  },

  async uploadMaterials(formData) {
    const res = await fetch(`${API_BASE}/api/materials/upload`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Upload failed");
    }
    return res.json();
  },

  async deleteMaterial(id) {
    const res = await fetch(`${API_BASE}/api/materials/${id}`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error("Failed to delete material");
    return res.json();
  },

  async resetAllMaterials() {
    const res = await fetch(`${API_BASE}/api/materials/reset-all`, {
      method: "POST"
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to reset materials");
    }
    return res.json();
  },

  async clearHistory() {
    const res = await fetch(`${API_BASE}/api/progress/clear-history`, {
      method: "POST"
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to clear history");
    }
    return res.json();
  },

  // Settings & AI Configuration
  async getSettings() {
    const res = await fetch(`${API_BASE}/api/settings`);
    if (!res.ok) throw new Error("Failed to fetch settings");
    return res.json();
  },

  async saveSettings(data) {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to save settings");
    }
    return res.json();
  },

  async testAiConnection(data) {
    const res = await fetch(`${API_BASE}/api/settings/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async connectOnline(data) {
    const res = await fetch(`${API_BASE}/api/settings/connect-online`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async toggleOffline() {
    const res = await fetch(`${API_BASE}/api/settings/toggle-offline`, {
      method: "POST"
    });
    return res.json();
  },

  // Summaries
  async getSummary(materialId, summaryType = "medium") {
    const url = summaryType 
      ? `${API_BASE}/api/materials/${materialId}/summary?summary_type=${encodeURIComponent(summaryType)}`
      : `${API_BASE}/api/materials/${materialId}/summary`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  },


  async generateSummary(materialId, summaryType = "medium", forceRegenerate = false) {
    const res = await fetch(`${API_BASE}/api/materials/${materialId}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary_type: summaryType, force_regenerate: forceRegenerate })
    });
    if (!res.ok) throw new Error("Failed to generate summary");
    return res.json();
  },

  // Questions
  async getQuestions(materialId) {
    const res = await fetch(`${API_BASE}/api/materials/${materialId}/questions`);
    if (!res.ok) return null;
    return res.json();
  },

  async generateQuestions(materialId, forceRegenerate = false) {
    const res = await fetch(`${API_BASE}/api/materials/${materialId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force_regenerate: forceRegenerate })
    });
    if (!res.ok) throw new Error("Failed to generate questions");
    return res.json();
  },

  // Quiz
  async generateQuiz(materialId, numQuestions = 10, difficulty = "Medium", topic = null, quizStyle = "creative") {
    const res = await fetch(`${API_BASE}/api/materials/${materialId}/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ num_questions: numQuestions, difficulty: difficulty, topic: topic, quiz_style: quizStyle })
    });
    if (!res.ok) throw new Error("Failed to generate quiz");
    return res.json();
  },

  async submitQuiz(quizId, answers) {
    const res = await fetch(`${API_BASE}/api/quiz/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quiz_id: quizId, answers: answers })
    });
    if (!res.ok) throw new Error("Failed to submit quiz");
    return res.json();
  },

  // Flashcards
  async getFlashcards(materialId) {
    const res = await fetch(`${API_BASE}/api/materials/${materialId}/flashcards`);
    if (!res.ok) return null;
    return res.json();
  },

  async generateFlashcards(materialId, count = 8) {
    const res = await fetch(`${API_BASE}/api/materials/${materialId}/flashcards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: count })
    });
    if (!res.ok) throw new Error("Failed to generate flashcards");
    return res.json();
  },

  async updateFlashcardStatus(cardId, status) {
    const res = await fetch(`${API_BASE}/api/flashcards/${cardId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status })
    });
    return res.json();
  },

  // Tutor
  async sendTutorMessage(materialId, message, conversationId = null) {
    const res = await fetch(`${API_BASE}/api/materials/${materialId}/tutor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, conversation_id: conversationId })
    });
    if (!res.ok) throw new Error("Tutor failed to respond");
    return res.json();
  },

  async getTutorMessages(materialId) {
    const res = await fetch(`${API_BASE}/api/materials/${materialId}/tutor/messages`);
    if (!res.ok) return { messages: [] };
    return res.json();
  },

  // Planner
  async generatePlanner(materialId, examDate, dailyMinutes = 120) {
    const res = await fetch(`${API_BASE}/api/planner/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_id: materialId, exam_date: examDate, daily_minutes: dailyMinutes })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create study plan");
    }
    return res.json();
  },

  async getPlanner(materialId) {
    const res = await fetch(`${API_BASE}/api/planner/${materialId}`);
    if (!res.ok) return null;
    return res.json();
  },

  // Exam Crash Mode
  async generateExamCrash(materialId, hoursRemaining = 2.0) {
    const res = await fetch(`${API_BASE}/api/exam/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_id: materialId, hours_remaining: hoursRemaining })
    });
    if (!res.ok) throw new Error("Failed to generate crash plan");
    return res.json();
  },

  // Progress
  async getProgressStats() {
    const res = await fetch(`${API_BASE}/api/progress/stats`);
    if (!res.ok) throw new Error("Failed to fetch progress stats");
    return res.json();
  },

  async getProgressTopics() {
    const res = await fetch(`${API_BASE}/api/progress/topics`);
    if (!res.ok) throw new Error("Failed to fetch topic breakdown");
    return res.json();
  },

  async search(query) {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return { results: [] };
    return res.json();
  }
};

window.API = API;
