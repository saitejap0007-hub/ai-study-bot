const TutorController = {
  conversationId: null,

  onMaterialChanged(material) {
    this.conversationId = null;
    const history = document.getElementById("tutor-chat-history");
    if (history) {
      history.innerHTML = `
        <div class="chat-message assistant">
          <div class="chat-avatar">🤖</div>
          <div class="chat-bubble">
            <p>Hello! I am your AI Study Buddy Tutor. I am now grounded in <strong>${material ? material.title : 'your study notes'}</strong>. Ask me any question, request 5-mark answer templates, or click one of the quick prompts above!</p>
          </div>
        </div>
      `;
    }
  },

  async sendMessage(userText) {
    const active = window.AppState.activeMaterial;
    if (!active) {
      window.showToast("Please select a study material first", "warning");
      return;
    }

    const history = document.getElementById("tutor-chat-history");
    const input = document.getElementById("tutor-input-text");

    // Append user message
    const userMsgEl = document.createElement("div");
    userMsgEl.className = "chat-message user";
    userMsgEl.innerHTML = `
      <div class="chat-bubble"><p>${userText}</p></div>
    `;
    history.appendChild(userMsgEl);
    history.scrollTop = history.scrollHeight;

    if (input) input.value = "";

    // Append loading placeholder
    const loadingEl = document.createElement("div");
    loadingEl.className = "chat-message assistant";
    loadingEl.innerHTML = `
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble"><p><em>Reviewing material notes...</em></p></div>
    `;
    history.appendChild(loadingEl);
    history.scrollTop = history.scrollHeight;

    try {
      const res = await window.API.sendTutorMessage(active.id, userText, this.conversationId);
      this.conversationId = res.conversation_id;

      loadingEl.innerHTML = `
        <div class="chat-avatar">🤖</div>
        <div class="chat-bubble"><div style="white-space: pre-line;">${res.response}</div></div>
      `;
      history.scrollTop = history.scrollHeight;
    } catch (e) {
      loadingEl.innerHTML = `
        <div class="chat-avatar">🤖</div>
        <div class="chat-bubble"><p style="color: var(--danger);">Sorry, could not process request: ${e.message}</p></div>
      `;
    }
  }
};

window.TutorController = TutorController;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("tutor-chat-form");
  const input = document.getElementById("tutor-input-text");

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) TutorController.sendMessage(text);
    });
  }

  // Starter chips
  document.querySelectorAll(".starter-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const prompt = chip.getAttribute("data-prompt");
      if (prompt) TutorController.sendMessage(prompt);
    });
  });
});
