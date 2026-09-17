const FlashcardsController = {
  cards: [],
  currentIndex: 0,
  isFlipped: false,

  onMaterialChanged(material) {
    this.cards = [];
    this.currentIndex = 0;
    this.isFlipped = false;
    if (material) {
      this.loadFlashcards(material.id);
    } else {
      this.renderEmpty();
    }
  },

  onSectionActivated() {
    if (window.AppState.activeMaterial && this.cards.length === 0) {
      this.loadFlashcards(window.AppState.activeMaterial.id);
    }
  },

  async loadFlashcards(materialId) {
    try {
      const data = await window.API.getFlashcards(materialId);
      if (data && data.flashcards && data.flashcards.length > 0) {
        this.cards = data.flashcards;
        this.currentIndex = 0;
        this.isFlipped = false;
        this.renderCard();
      } else {
        this.renderEmpty();
      }
    } catch (e) {
      console.error("Error loading flashcards:", e);
    }
  },

  async generateDeck() {
    const active = window.AppState.activeMaterial;
    if (!active) {
      window.showToast("Please select a study material first", "warning");
      return;
    }

    const container = document.getElementById("flashcards-deck-container");
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <div style="font-size: 36px;">🃏</div>
        <h3 style="margin-top: 16px;">Synthesizing 3D Interactive Flashcards...</h3>
        <p class="text-muted">Formulating front/back concept pairs and definitions.</p>
      </div>
    `;

    try {
      const data = await window.API.generateFlashcards(active.id, 8);
      this.cards = data.flashcards || [];
      this.currentIndex = 0;
      this.isFlipped = false;
      this.renderCard();
      window.showToast(`Loaded ${this.cards.length} flashcards in your deck!`);
    } catch (e) {
      window.showToast(`Generation failed: ${e.message}`, "error");
      this.renderEmpty();
    }
  },

  renderEmpty() {
    const container = document.getElementById("flashcards-deck-container");
    if (!container) return;
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🃏</span>
        <h3>No Flashcards Loaded</h3>
        <p>Click "Generate Deck" to produce interactive 3D concept flashcards from your material.</p>
      </div>
    `;
  },

  renderCard() {
    const container = document.getElementById("flashcards-deck-container");
    if (!container || this.cards.length === 0) {
      this.renderEmpty();
      return;
    }

    const card = this.cards[this.currentIndex];
    const total = this.cards.length;

    const knownCount = this.cards.filter(c => c.status === "known").length;
    const learningCount = this.cards.filter(c => c.status === "learning").length;

    container.innerHTML = `
      <div style="display: flex; gap: 16px; margin-bottom: 20px; font-size: 0.9rem;">
        <span class="badge badge-success">✓ Got It: ${knownCount}</span>
        <span class="badge badge-warning">🔄 Needs Practice: ${learningCount}</span>
        <span class="badge badge-indigo">Card ${this.currentIndex + 1} of ${total}</span>
      </div>

      <div class="flashcard-wrapper ${this.isFlipped ? 'flipped' : ''}" id="current-flashcard">
        <div class="flashcard-inner">
          <div class="flashcard-front">
            <div class="card-tag">${card.category || 'Core Concept'}</div>
            <div class="card-body-text">${card.front}</div>
            <div class="card-hint">Click anywhere or hit Space to flip &rarr;</div>
          </div>
          <div class="flashcard-back">
            <div class="card-tag">${card.category || 'Explanation'}</div>
            <div class="card-body-text">${card.back}</div>
            <div class="card-hint">&larr; Click to flip back</div>
          </div>
        </div>
      </div>

      <div class="flashcard-controls">
        <button class="btn btn-outline" id="btn-prev-card" ${this.currentIndex === 0 ? 'disabled' : ''}>&larr; Prev</button>
        <button class="btn btn-outline" id="btn-flip-card">🔄 Flip</button>
        <button class="btn btn-outline" style="border-color: var(--warning); color: #b45309;" id="btn-need-practice">Needs Practice</button>
        <button class="btn btn-primary" style="background-color: var(--success);" id="btn-got-it">Got It! ✓</button>
        <button class="btn btn-outline" id="btn-next-card" ${this.currentIndex === total - 1 ? 'disabled' : ''}>Next &rarr;</button>
      </div>
    `;

    // Event listeners
    const cardEl = document.getElementById("current-flashcard");
    const flipBtn = document.getElementById("btn-flip-card");

    const toggleFlip = () => {
      this.isFlipped = !this.isFlipped;
      cardEl.classList.toggle("flipped", this.isFlipped);
    };

    cardEl.addEventListener("click", toggleFlip);
    flipBtn.addEventListener("click", toggleFlip);

    document.getElementById("btn-prev-card").addEventListener("click", () => {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        this.isFlipped = false;
        this.renderCard();
      }
    });

    document.getElementById("btn-next-card").addEventListener("click", () => {
      if (this.currentIndex < this.cards.length - 1) {
        this.currentIndex++;
        this.isFlipped = false;
        this.renderCard();
      }
    });

    document.getElementById("btn-need-practice").addEventListener("click", async () => {
      card.status = "learning";
      await window.API.updateFlashcardStatus(card.id, "learning");
      window.showToast("Marked for practice!");
      this.nextCardOrFinish();
    });

    document.getElementById("btn-got-it").addEventListener("click", async () => {
      card.status = "known";
      await window.API.updateFlashcardStatus(card.id, "known");
      window.showToast("Mastered! (+1 Knowledge)", "success");
      if (window.DashboardController) window.DashboardController.refresh();
      this.nextCardOrFinish();
    });
  },

  nextCardOrFinish() {
    if (this.currentIndex < this.cards.length - 1) {
      this.currentIndex++;
      this.isFlipped = false;
      this.renderCard();
    } else {
      this.renderCard();
      window.showToast("Completed this deck! Great active recall session.", "success");
    }
  }
};

window.FlashcardsController = FlashcardsController;

document.addEventListener("DOMContentLoaded", () => {
  const genBtn = document.getElementById("btn-generate-flashcards");
  if (genBtn) genBtn.addEventListener("click", () => FlashcardsController.generateDeck());
});
