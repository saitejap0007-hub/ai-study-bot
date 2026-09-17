const QuizController = {
  activeQuiz: null,
  currentIndex: 0,
  userAnswers: {}, // { question_id: 'A' | 'B' | 'C' | 'D' }
  timerInterval: null,
  timeRemaining: 600, // seconds
  totalTime: 600,

  onMaterialChanged(material) {
    this.activeQuiz = null;
    this.currentIndex = 0;
    this.userAnswers = {};
    this.stopTimer();
    this.renderEmpty();
  },

  onSectionActivated() {
    if (!this.activeQuiz) {
      this.renderEmpty();
    }
  },

  async startNewQuiz() {
    const active = window.AppState.activeMaterial;
    if (!active) {
      window.showToast("Please select a study material first", "warning");
      return;
    }

    const countSelect = document.getElementById("quiz-count-select");
    const diffSelect = document.getElementById("quiz-difficulty-select");
    const styleSelect = document.getElementById("quiz-style-select");
    const numQuestions = countSelect ? parseInt(countSelect.value, 10) || 10 : 10;
    const difficulty = diffSelect ? diffSelect.value : "Medium";
    const quizStyle = styleSelect ? styleSelect.value : "creative";

    const styleNames = {
      creative: "Creative & Scenario-Based",
      traps: "Conceptual Traps & Nuances",
      dynamics: "System Dynamics & Cascades",
      scenario: "Applied Case Studies",
      mix: "Comprehensive Mix"
    };
    const styleTitle = styleNames[quizStyle] || "Creative & Scenario-Based";

    const arena = document.getElementById("quiz-arena");
    if (arena) {
      arena.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
          <div style="font-size: 42px; animation: bounce 1s infinite;">✨</div>
          <h3 style="margin-top: 16px; font-size: 1.35rem; font-weight: 800;">Synthesizing ${numQuestions} ${styleTitle} Questions...</h3>
          <p class="text-muted" style="max-width: 540px; margin: 10px auto 0 auto; line-height: 1.6;">
            Google Gemini AI is synthesizing scenario-driven challenges, conceptual traps, and pedagogical clues grounded strictly in <strong>${active.title}</strong>.
          </p>
        </div>
      `;
    }

    try {
      const data = await window.API.generateQuiz(active.id, numQuestions, difficulty, null, quizStyle);
      if (!data || !data.questions || data.questions.length === 0) {
        throw new Error("No quiz questions were returned by the engine.");
      }

      this.activeQuiz = data;
      this.currentIndex = 0;
      this.userAnswers = {};

      const indicator = document.getElementById("quiz-ai-indicator-text");
      if (indicator) {
        indicator.textContent = data.engine ? `${data.engine} Active` : "Gemini AI Active";
      }

      // Allocate 60 seconds per question
      const totalSeconds = Math.max(120, data.questions.length * 60);
      this.startTimer(totalSeconds);
      this.renderCurrentQuestion();
      window.showToast(`Dynamic quiz loaded with ${data.questions.length} creative questions!`);
    } catch (e) {
      console.error("Quiz generation failed:", e);
      window.showToast(`Quiz generation failed: ${e.message}`, "error");
      this.renderEmpty();
    }
  },

  startTimer(seconds) {
    this.stopTimer();
    this.timeRemaining = seconds;
    this.totalTime = seconds;
    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      this.updateTimerDisplay();

      if (this.timeRemaining <= 0) {
        this.stopTimer();
        window.showToast("Time is up! Submitting answers automatically.", "warning");
        this.submitQuiz(true);
      }
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  },

  updateTimerDisplay() {
    const timerEl = document.getElementById("quiz-timer-display");
    if (!timerEl) return;
    const mins = Math.floor(Math.max(0, this.timeRemaining) / 60);
    const secs = Math.max(0, this.timeRemaining) % 60;
    timerEl.textContent = `⏱️ ${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    // Color code warning when under 60 seconds
    if (this.timeRemaining <= 60) {
      timerEl.style.backgroundColor = "#fee2e2";
      timerEl.style.color = "#dc2626";
      timerEl.style.borderColor = "#f87171";
    } else {
      timerEl.style.backgroundColor = "#ede9fe";
      timerEl.style.color = "var(--primary)";
      timerEl.style.borderColor = "#c7d2fe";
    }
  },

  renderEmpty() {
    const arena = document.getElementById("quiz-arena");
    if (!arena) return;
    arena.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚡</span>
        <h3>Ready to test your knowledge?</h3>
        <p>Choose your question count and difficulty above, then click Start Quiz to begin active recall testing.</p>
        <button class="btn btn-primary" id="btn-start-quiz-empty" style="margin-top: 16px;">Start Dynamic Quiz</button>
      </div>
    `;
    const btn = document.getElementById("btn-start-quiz-empty");
    if (btn) btn.addEventListener("click", () => this.startNewQuiz());
  },

  renderCurrentQuestion() {
    const arena = document.getElementById("quiz-arena");
    if (!arena || !this.activeQuiz || !this.activeQuiz.questions) return;

    const questions = this.activeQuiz.questions;
    const total = questions.length;
    if (total === 0) {
      this.renderEmpty();
      return;
    }

    if (this.currentIndex < 0) this.currentIndex = 0;
    if (this.currentIndex >= total) this.currentIndex = total - 1;

    const q = questions[this.currentIndex];
    const qid = String(q.id);
    const selectedOpt = this.userAnswers[qid] || null;
    const answeredCount = Object.keys(this.userAnswers).length;
    const progressPct = Math.round(((this.currentIndex + 1) / total) * 100);

    // Build navigation pills
    const pillsHtml = questions.map((item, idx) => {
      const isCurrent = idx === this.currentIndex;
      const isAnswered = this.userAnswers[String(item.id)] !== undefined;
      let classes = "quiz-pill-btn";
      if (isCurrent) classes += " active";
      else if (isAnswered) classes += " answered";

      return `
        <button class="${classes}" data-jump-idx="${idx}" title="Question ${idx + 1}${isAnswered ? ' (Answered)' : ''}">
          ${idx + 1}
        </button>
      `;
    }).join("");

    const engineAttribution = this.activeQuiz.engine || "Google Gemini";
    const qType = q.question_type || "Scenario Application";

    arena.innerHTML = `
      <!-- Quiz Header -->
      <div class="quiz-header" style="flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <h2 style="font-size: 1.15rem; font-weight: 800; margin: 0;">${this.activeQuiz.title || "Dynamic AI Knowledge Assessment"}</h2>
            <span class="badge" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-weight: 700;">🌟 ${qType}</span>
            <span class="badge badge-accent">${q.difficulty || "Medium"}</span>
            <span class="badge badge-outline" style="border-color: #c7d2fe; color: var(--primary);">${q.topic || "Core Topic"}</span>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 4px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span>Question <strong>${this.currentIndex + 1}</strong> of <strong>${total}</strong></span>
            <span>•</span>
            <span>Answered: <strong>${answeredCount}/${total}</strong></span>
            <span>•</span>
            <span style="color: #2563eb; font-weight: 600;">✨ Powered by ${engineAttribution}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div id="quiz-timer-display" class="quiz-timer" style="border: 1px solid #c7d2fe;">⏱️ 00:00</div>
          <button class="btn btn-outline btn-sm" id="btn-submit-early" style="font-weight: 600;">Submit</button>
        </div>
      </div>

      <!-- Linear Progress Bar -->
      <div class="progress-bar-bg" style="height: 6px; margin-bottom: 16px; background-color: #e2e8f0; border-radius: 999px; overflow: hidden;">
        <div class="progress-bar-fill" style="width: ${progressPct}%; height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary)); transition: width 0.3s ease;"></div>
      </div>

      <!-- Question Palette / Jump Navigation -->
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 24px; padding: 10px 14px; background: #f8fafc; border: 1px solid var(--border); border-radius: var(--radius-md); align-items: center;">
        <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-right: 4px;">JUMP TO:</span>
        ${pillsHtml}
      </div>

      <!-- Active Question Card -->
      <div class="quiz-question-box" data-qid="${q.id}" style="margin-bottom: 24px;">
        <div class="quiz-question-title" style="font-size: 1.15rem; line-height: 1.5; color: var(--text-primary); margin-bottom: 12px;">
          <span style="color: var(--primary); font-weight: 800;">Q${this.currentIndex + 1}.</span> ${q.question}
        </div>

        <!-- Interactive Clue / Hint Toggle -->
        <div style="margin-bottom: 16px;">
          <button type="button" id="btn-toggle-hint" class="btn btn-outline btn-xs" style="color: #b45309; border-color: #fcd34d; background: #fffbeb; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; border-radius: 6px; padding: 5px 12px; cursor: pointer;">
            💡 Need a Clue? (Show Hint)
          </button>
          <div id="quiz-hint-box" class="hidden" style="margin-top: 8px; padding: 12px 16px; background: #fffbeb; border: 1px dashed #f59e0b; border-radius: var(--radius-sm); font-size: 0.85rem; color: #92400e; line-height: 1.5;">
            ${q.hint || "💡 Clue: Recall how this concept operates in the source document."}
          </div>
        </div>

        <!-- Options List -->
        <div class="quiz-options-list">
          <div class="quiz-option ${selectedOpt === 'A' ? 'selected' : ''}" data-opt="A">
            <strong style="width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: ${selectedOpt === 'A' ? 'var(--primary)' : '#e2e8f0'}; color: ${selectedOpt === 'A' ? '#fff' : '#475569'}; font-size: 0.8rem;">A</strong>
            <span style="flex: 1;">${q.option_a}</span>
          </div>
          <div class="quiz-option ${selectedOpt === 'B' ? 'selected' : ''}" data-opt="B">
            <strong style="width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: ${selectedOpt === 'B' ? 'var(--primary)' : '#e2e8f0'}; color: ${selectedOpt === 'B' ? '#fff' : '#475569'}; font-size: 0.8rem;">B</strong>
            <span style="flex: 1;">${q.option_b}</span>
          </div>
          <div class="quiz-option ${selectedOpt === 'C' ? 'selected' : ''}" data-opt="C">
            <strong style="width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: ${selectedOpt === 'C' ? 'var(--primary)' : '#e2e8f0'}; color: ${selectedOpt === 'C' ? '#fff' : '#475569'}; font-size: 0.8rem;">C</strong>
            <span style="flex: 1;">${q.option_c}</span>
          </div>
          <div class="quiz-option ${selectedOpt === 'D' ? 'selected' : ''}" data-opt="D">
            <strong style="width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: ${selectedOpt === 'D' ? 'var(--primary)' : '#e2e8f0'}; color: ${selectedOpt === 'D' ? '#fff' : '#475569'}; font-size: 0.8rem;">D</strong>
            <span style="flex: 1;">${q.option_d}</span>
          </div>
        </div>
      </div>

      <!-- Navigation Actions -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 20px;">
        <button class="btn btn-outline" id="btn-quiz-prev" ${this.currentIndex === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
          ← Previous
        </button>

        <div style="display: flex; gap: 10px;">
          ${this.currentIndex < total - 1 ? `
            <button class="btn btn-primary" id="btn-quiz-next">
              Next Question →
            </button>
          ` : `
            <button class="btn btn-success" id="btn-quiz-finish" style="background-color: var(--success); border-color: var(--success); color: #fff;">
              Finish & Submit Assessment ✓
            </button>
          `}
        </div>
      </div>
    `;

    this.updateTimerDisplay();

    // Attach Hint Toggle listener
    const hintBtn = document.getElementById("btn-toggle-hint");
    const hintBox = document.getElementById("quiz-hint-box");
    if (hintBtn && hintBox) {
      hintBtn.addEventListener("click", () => {
        const isHidden = hintBox.classList.contains("hidden");
        if (isHidden) {
          hintBox.classList.remove("hidden");
          hintBtn.innerHTML = "🙈 Hide Clue";
        } else {
          hintBox.classList.add("hidden");
          hintBtn.innerHTML = "💡 Need a Clue? (Show Hint)";
        }
      });
    }

    // Attach jump listeners to navigator pills
    arena.querySelectorAll(".quiz-pill-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetIdx = parseInt(btn.getAttribute("data-jump-idx"), 10);
        if (!isNaN(targetIdx) && targetIdx >= 0 && targetIdx < total) {
          this.currentIndex = targetIdx;
          this.renderCurrentQuestion();
        }
      });
    });

    // Attach option selection listeners
    arena.querySelectorAll(".quiz-option").forEach(opt => {
      opt.addEventListener("click", () => {
        const chosen = opt.getAttribute("data-opt");
        this.userAnswers[qid] = chosen;
        this.renderCurrentQuestion();
      });
    });

    // Prev / Next button listeners
    const prevBtn = document.getElementById("btn-quiz-prev");
    if (prevBtn && this.currentIndex > 0) {
      prevBtn.addEventListener("click", () => {
        this.currentIndex--;
        this.renderCurrentQuestion();
      });
    }

    const nextBtn = document.getElementById("btn-quiz-next");
    if (nextBtn && this.currentIndex < total - 1) {
      nextBtn.addEventListener("click", () => {
        this.currentIndex++;
        this.renderCurrentQuestion();
      });
    }

    const finishBtn = document.getElementById("btn-quiz-finish");
    if (finishBtn) {
      finishBtn.addEventListener("click", () => this.confirmAndSubmit());
    }

    const submitEarlyBtn = document.getElementById("btn-submit-early");
    if (submitEarlyBtn) {
      submitEarlyBtn.addEventListener("click", () => this.confirmAndSubmit());
    }
  },

  confirmAndSubmit() {
    if (!this.activeQuiz || !this.activeQuiz.questions) return;
    const total = this.activeQuiz.questions.length;
    const answeredCount = Object.keys(this.userAnswers).length;
    const unanswered = total - answeredCount;

    if (unanswered > 0) {
      const proceed = window.confirm(
        `You have answered ${answeredCount} of ${total} questions (${unanswered} unanswered).\n\nDo you want to submit the assessment now?`
      );
      if (!proceed) return;
    }

    this.submitQuiz(false);
  },

  async submitQuiz(forced = false) {
    this.stopTimer();
    const arena = document.getElementById("quiz-arena");

    if (arena) {
      arena.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
          <div style="font-size: 36px;">📊</div>
          <h3 style="margin-top: 16px;">Calculating Diagnostic Score...</h3>
          <p class="text-muted">Evaluating answer keys, topic mastery, and revision recommendations.</p>
        </div>
      `;
    }

    try {
      const result = await window.API.submitQuiz(this.activeQuiz.quiz_id, this.userAnswers);
      this.renderResults(result);
      window.showToast(`Quiz completed! You scored ${result.score}/${result.total} (${result.percentage}%)`);
      if (window.DashboardController) window.DashboardController.refresh();
      if (window.ProgressController) window.ProgressController.refresh();
    } catch (e) {
      console.warn("Backend quiz submission failed, computing local score:", e);
      // Client-side fallback calculation
      const fallbackResult = this.calculateLocalResults();
      this.renderResults(fallbackResult);
      window.showToast(`Quiz completed! You scored ${fallbackResult.score}/${fallbackResult.total} (${fallbackResult.percentage}%)`);
    }
  },

  calculateLocalResults() {
    const questions = this.activeQuiz.questions || [];
    let score = 0;
    const total = questions.length;
    const breakdown = [];
    const weakTopics = new Set();
    const strongTopics = new Set();

    questions.forEach(q => {
      const qid = String(q.id);
      const submitted = (this.userAnswers[qid] || "").toUpperCase().trim();
      const correct = (q.correct_option || "").toUpperCase().trim();
      const isCorrect = submitted === correct && correct !== "";
      const topic = q.topic || "General";

      if (isCorrect) {
        score++;
        strongTopics.add(topic);
      } else {
        weakTopics.add(topic);
      }

      breakdown.append ? null : breakdown.push({
        question_id: q.id,
        question: q.question,
        submitted_option: submitted,
        correct_option: correct,
        is_correct: isCorrect,
        explanation: q.explanation || "No explanation provided.",
        topic: topic,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d
      });
    });

    const finalWeak = Array.from(weakTopics);
    const finalStrong = Array.from(strongTopics).filter(t => !weakTopics.has(t));
    const percentage = total > 0 ? Math.round((score / total) * 1000) / 10 : 0;

    return {
      score,
      total,
      correct: score,
      incorrect: total - score,
      percentage,
      weak_topics: finalWeak,
      strong_topics: finalStrong,
      breakdown
    };
  },

  renderResults(result) {
    const arena = document.getElementById("quiz-arena");
    if (!arena) return;

    const isHighPass = result.percentage >= 75;
    const isPass = result.percentage >= 50;
    const gradeColor = isHighPass ? "var(--success)" : isPass ? "var(--primary)" : "var(--danger)";
    const gradeMessage = isHighPass
      ? "Outstanding Mastery! 🏆 You demonstrated a thorough understanding of the material."
      : isPass
      ? "Good Progress! 👍 A little more review on weak areas will get you to top scores."
      : "Needs Systematic Revision ⚠️ Review the highlighted concepts and retake the quiz.";

    const breakdownHtml = (result.breakdown || []).map((item, idx) => {
      const isCorrect = item.is_correct;
      const borderCol = isCorrect ? "var(--success)" : "var(--danger)";
      const badgeClass = isCorrect ? "badge-success" : "badge-danger";
      const statusText = isCorrect ? "✓ Correct (+1)" : "✗ Incorrect (0)";

      return `
        <div class="card" style="margin-bottom: 16px; border-left: 6px solid ${borderCol}; padding: 18px 20px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">
              <span style="color: var(--primary);">Q${idx + 1}.</span> ${item.question}
            </div>
            <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
              ${item.question_type ? `<span class="badge" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 0.75rem;">🌟 ${item.question_type}</span>` : ''}
              <span class="badge ${badgeClass}" style="white-space: nowrap;">${statusText}</span>
            </div>
          </div>

          <div style="display: flex; gap: 16px; font-size: 0.88rem; margin-bottom: 12px; flex-wrap: wrap; background: #f8fafc; padding: 10px 14px; border-radius: var(--radius-sm);">
            <div>
              <span class="text-muted">Your Selection:</span> 
              <strong style="color: ${isCorrect ? 'var(--success)' : 'var(--danger)'};">
                Option ${item.submitted_option || 'None (Unanswered)'}
              </strong>
            </div>
            <div>
              <span class="text-muted">Correct Answer:</span> 
              <strong style="color: var(--success);">
                Option ${item.correct_option}
              </strong>
            </div>
            <div>
              <span class="text-muted">Topic:</span> 
              <span class="badge badge-outline" style="border-color: #cbd5e1;">${item.topic || 'General'}</span>
            </div>
          </div>

          <div class="quiz-explanation" style="margin-top: 0;">
            <strong style="color: var(--text-primary);">💡 Explanation:</strong> ${item.explanation || "Grounded in source document analysis."}
          </div>
        </div>
      `;
    }).join("");

    arena.innerHTML = `
      <!-- Assessment Score Banner -->
      <div class="card" style="text-align: center; padding: 36px 24px; background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border: 2px solid #c7d2fe; margin-bottom: 28px;">
        <span class="badge badge-accent" style="font-size: 0.85rem; padding: 6px 14px; text-transform: uppercase;">Assessment Complete</span>
        
        <div style="font-size: 3.6rem; font-weight: 900; margin: 16px 0 6px 0; color: #1e1b4b; letter-spacing: -0.03em;">
          ${result.score} <span style="font-size: 2rem; font-weight: 600; color: var(--text-muted);">/ ${result.total}</span>
        </div>
        
        <div style="font-size: 1.3rem; font-weight: 800; color: ${gradeColor}; margin-bottom: 12px;">
          ${result.percentage}% Accuracy
        </div>

        <p style="font-size: 0.95rem; color: var(--text-secondary); max-width: 550px; margin: 0 auto 20px auto;">
          ${gradeMessage}
        </p>

        <!-- Stat Pills -->
        <div style="display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;">
          <div style="background: #fff; border: 1px solid #bbf7d0; padding: 8px 18px; border-radius: var(--radius-md);">
            <span style="color: var(--success); font-weight: 800; font-size: 1.1rem;">${result.correct}</span>
            <span style="font-size: 0.82rem; color: var(--text-muted); display: block;">Correct</span>
          </div>
          <div style="background: #fff; border: 1px solid #fecaca; padding: 8px 18px; border-radius: var(--radius-md);">
            <span style="color: var(--danger); font-weight: 800; font-size: 1.1rem;">${result.incorrect}</span>
            <span style="font-size: 0.82rem; color: var(--text-muted); display: block;">Incorrect</span>
          </div>
          <div style="background: #fff; border: 1px solid #c7d2fe; padding: 8px 18px; border-radius: var(--radius-md);">
            <span style="color: var(--primary); font-weight: 800; font-size: 1.1rem;">${result.total}</span>
            <span style="font-size: 0.82rem; color: var(--text-muted); display: block;">Total Questions</span>
          </div>
        </div>

        <!-- Topic Mastery Badges -->
        <div style="display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; text-align: left; max-width: 650px; margin: 0 auto;">
          <div style="flex: 1; min-width: 220px; background: rgba(255, 255, 255, 0.7); padding: 14px; border-radius: var(--radius-md); border: 1px solid #e2e8f0;">
            <strong style="font-size: 0.85rem; color: var(--success); display: block; margin-bottom: 6px;">🏆 Mastered Topics:</strong>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${(result.strong_topics && result.strong_topics.length > 0)
                ? result.strong_topics.map(t => `<span class="badge badge-success">${t}</span>`).join("")
                : '<span class="text-muted" style="font-size: 0.82rem;">None yet — review notes below</span>'}
            </div>
          </div>
          <div style="flex: 1; min-width: 220px; background: rgba(255, 255, 255, 0.7); padding: 14px; border-radius: var(--radius-md); border: 1px solid #e2e8f0;">
            <strong style="font-size: 0.85rem; color: var(--warning); display: block; margin-bottom: 6px;">⚠️ Topics Needing Revision:</strong>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${(result.weak_topics && result.weak_topics.length > 0)
                ? result.weak_topics.map(t => `<span class="badge badge-warning">${t}</span>`).join("")
                : '<span class="badge badge-success">Flawless! No weak topics.</span>'}
            </div>
          </div>
        </div>

        <div style="margin-top: 28px; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-retake-quiz">🔄 Take Another Quiz</button>
          <button class="btn btn-outline" id="btn-review-summary-from-quiz">📝 Review Summary Notes</button>
        </div>
      </div>

      <!-- Question by Question Breakdown -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 class="sub-heading" style="margin: 0;">Detailed Question Breakdown (${result.breakdown ? result.breakdown.length : 0})</h3>
        <span class="text-muted" style="font-size: 0.85rem;">Answer explanations grounded in source text</span>
      </div>
      <div>${breakdownHtml}</div>
    `;

    const retakeBtn = document.getElementById("btn-retake-quiz");
    if (retakeBtn) retakeBtn.addEventListener("click", () => this.startNewQuiz());

    const reviewSummaryBtn = document.getElementById("btn-review-summary-from-quiz");
    if (reviewSummaryBtn) {
      reviewSummaryBtn.addEventListener("click", () => {
        if (window.navigateToSection) window.navigateToSection("summary");
      });
    }
  }
};

window.QuizController = QuizController;

document.addEventListener("DOMContentLoaded", () => {
  const newQuizBtn = document.getElementById("btn-new-quiz");
  if (newQuizBtn) newQuizBtn.addEventListener("click", () => QuizController.startNewQuiz());
});
