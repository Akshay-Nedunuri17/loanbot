/* ============================================================
   LoanBot — Smart Financial Advisor Engine
   Features:
   - Structured guided flow (Income → Job → EMI → Expenses → Loan)
   - Progress step tracking
   - Edit user messages (re-process answer)
   - Edit any field via summary bar
   - Preferred loan amount with feasibility check
   - Full eligibility + bento dashboard with comparison
   ============================================================ */

(() => {
  "use strict";

  /* ─────────────── DOM REFS ─────────────── */
  const chatBody      = document.getElementById("chat-body");
  const dashboardRoot = document.getElementById("dashboard-root");
  const userInput     = document.getElementById("user-input");
  const sendBtn       = document.getElementById("send-btn");
  const resetBtn      = document.getElementById("reset-btn");
  const chipsRow      = document.getElementById("chips-row");
  const summaryBar    = document.getElementById("summary-bar");
  const loanAmtBar    = document.getElementById("loan-amount-bar");
  const loanAmtInput  = document.getElementById("loan-amount-input");
  const loanTypeSel   = document.getElementById("loan-type-select");
  const loanConfirm   = document.getElementById("loan-confirm-btn");
  const modalOverlay  = document.getElementById("modal-overlay");
  const modalTitle    = document.getElementById("modal-title");
  const modalInput    = document.getElementById("modal-input");
  const modalHint     = document.getElementById("modal-hint");
  const modalSave     = document.getElementById("modal-save");
  const modalCancel   = document.getElementById("modal-cancel");
  const modalClose    = document.getElementById("modal-close");

  /* ─────────────── CONVERSATION FLOW ─────────────── */
  const FLOW_STEPS = [
    {
      key: "income",
      stepId: "step-income",
      question: "Let's start with the basics — what's your monthly income (take-home)? You can say something like \"₹45,000\" or \"40k\" — whatever feels natural.",
      chips: ["₹20,000/month", "₹40,000/month", "₹70,000/month", "₹1 Lakh/month"],
      hint: "Enter your monthly take-home salary",
    },
    {
      key: "jobType",
      stepId: "step-job",
      question: "Got it! Now, what's your current work situation?\n\n💼 Are you a salaried employee, running your own business, freelancing, or something else?",
      chips: ["Salaried (full-time)", "Self-employed / Business", "Freelancer / Consultant", "Student", "Retired"],
      hint: "Your employment type affects interest rates",
    },
    {
      key: "existingEmis",
      stepId: "step-emi",
      question: "Understood. Do you currently have any EMIs running — like a car loan, credit card dues, or any other active loan?\n\nIf yes, roughly how much per month? If none, just say \"No EMI\".",
      chips: ["No EMI", "₹5,000/month", "₹10,000/month", "₹20,000/month"],
      hint: "Total of all current monthly loan payments",
    },
    {
      key: "expenses",
      stepId: "step-expense",
      question: "Almost there! What are your approximate monthly expenses — rent, groceries, utilities, etc.? This helps me figure out how much you can comfortably spare for a new EMI.",
      chips: ["₹10,000/month", "₹20,000/month", "₹30,000/month", "₹50,000/month"],
      hint: "Rent + food + bills + other fixed costs",
    },
    {
      key: "loanConfig",
      stepId: "step-loan",
      question: "Excellent! Now the important part — how much are you looking to borrow, and what type of loan do you need?\n\nUse the panel below to enter your preferred amount and select the loan type 👇",
      chips: [],
      hint: "Preferred loan amount and type",
    },
  ];

  /* ─────────────── STATE ─────────────── */
  let state = {
    income:        null,
    jobType:       null,
    existingEmis:  null,
    expenses:      null,
    loanAmount:    null,
    loanType:      null,
    currentStep:   0,
    flowComplete:  false,
    resultShown:   false,
  };

  /* ─────────────── STORAGE ─────────────── */
  const STORAGE_KEY = "loanbot_state";
  function saveState()   { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.flowComplete) return false; 
      state = { ...state, ...parsed };
      return true;
    } catch(e) { return false; }
  }

  /* ─────────────── INTEREST RATE TABLE ─────────────── */
  const RATES = {
    personal:  { salaried: 10.5, "self-employed": 12.5, freelancer: 14, student: 16, retired: 13, default: 13 },
    home:      { salaried: 8.5,  "self-employed": 9.5,  freelancer: 11, student: 12, retired: 9,  default: 9.5 },
    vehicle:   { salaried: 9.0,  "self-employed": 10.5, freelancer: 12, student: 13, retired: 10, default: 10.5 },
    business:  { salaried: 11.5, "self-employed": 11.5, freelancer: 14, student: 16, retired: 13, default: 13 },
    education: { salaried: 8.0,  "self-employed": 9.0,  freelancer: 10, student: 7.5, retired: 9, default: 8.5 },
  };

  const TENURE = { personal: 60, home: 240, vehicle: 72, business: 84, education: 120 };

  /* ─────────────── UTILITIES ─────────────── */
  function fmt(n) {
    if (!n && n !== 0) return "—";
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}K`;
    return `₹${Math.round(n)}`;
  }

  function nowTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function calcEMI(principal, annualRate, months) {
    const r = annualRate / 100 / 12;
    if (r === 0) return principal / months;
    return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  }

  function scrollBottom() {
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
  }

  function capitalise(s) {
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ─────────────── NLU ─────────────── */
  function parseIncome(text) {
    const t = text.toLowerCase().trim();
    const patterns = [
      /₹?\s*(\d+\.?\d*)\s*(lakh|lac|l)\b/i,
      /₹?\s*(\d+\.?\d*)\s*k\b/i,
      /₹?\s*(\d[\d,]*)/,
    ];
    for (const p of patterns) {
      const m = t.match(p);
      if (m) {
        let val = parseFloat(m[1].replace(/,/g, ""));
        const unit = (m[2] || "").toLowerCase();
        if (unit === "lakh" || unit === "lac" || unit === "l") val *= 100000;
        else if (unit === "k") val *= 1000;
        if (!unit && val < 1000) val *= 1000;
        if (/annual|yearly|per year|p\.a/i.test(t)) val /= 12;
        return val > 0 ? Math.round(val) : null;
      }
    }
    return null;
  }

  function parseJobType(text) {
    const t = text.toLowerCase();
    if (/salar|full.?time|employed|office|corporate|company|job/i.test(t)) return "salaried";
    if (/self.?employ|business|entrepreneur|shop|proprietor|own/i.test(t)) return "self-employed";
    if (/freelanc|consult|contract|gig/i.test(t)) return "freelancer";
    if (/student|college|university|studying/i.test(t)) return "student";
    if (/retire|pension|senior/i.test(t)) return "retired";
    return null;
  }

  function parseAmount(text) {
    const t = text.toLowerCase().trim();
    if (/no|zero|nil|none|debt.?free/i.test(t)) return 0;
    return parseIncome(t);
  }

  /* ─────────────── PROGRESS ─────────────── */
  function updateProgressSteps() {
    const stepIds = ["step-income", "step-job", "step-emi", "step-expense", "step-loan"];
    stepIds.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove("active", "done");
      if (i < state.currentStep)       el.classList.add("done");
      else if (i === state.currentStep) el.classList.add("active");
    });
    document.querySelectorAll(".step-connector").forEach((el, i) => {
      el.classList.toggle("done", i < state.currentStep);
    });
  }

  /* ─────────────── SUMMARY BAR ─────────────── */
  function updateSummaryBar() {
    document.getElementById("sv-income").textContent = state.income != null ? fmt(state.income) + "/mo" : "—";
    document.getElementById("sv-type").textContent   = state.jobType ? capitalise(state.jobType) : "—";
    document.getElementById("sv-emi").textContent    = state.existingEmis != null ? fmt(state.existingEmis) : "—";
    document.getElementById("sv-exp").textContent    = state.expenses != null ? fmt(state.expenses) : "—";
    document.getElementById("sv-amt").textContent    = state.loanAmount != null ? fmt(state.loanAmount) : "—";

    const hasAny = state.income || state.jobType || state.existingEmis != null || state.expenses;
    summaryBar.style.display = hasAny ? "flex" : "none";
  }

  /* ─────────────── MESSAGES ─────────────── */
  function addDateDivider() {
    const d = document.createElement("div");
    d.className = "date-divider";
    d.textContent = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    chatBody.appendChild(d);
  }

  function addBotMessage(text, delay = 0) {
    return new Promise(resolve => {
      setTimeout(() => {
        const wrapper = document.createElement("div");
        wrapper.className = "msg-wrapper bot-side";
        const avatar = document.createElement("div");
        avatar.className = "msg-avatar";
        avatar.textContent = "💼";
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        const textSpan = document.createElement("span");
        textSpan.textContent = text;
        const footer = document.createElement("div");
        footer.className = "bubble-footer";
        const time = document.createElement("span");
        time.className = "bubble-time";
        time.textContent = nowTime();
        footer.appendChild(time);
        bubble.appendChild(textSpan);
        bubble.appendChild(footer);
        wrapper.appendChild(avatar);
        wrapper.appendChild(bubble);
        chatBody.appendChild(wrapper);
        scrollBottom();
        resolve(wrapper);
      }, delay);
    });
  }

  function addUserMessage(text) {
    const wrapper = document.createElement("div");
    wrapper.className = "msg-wrapper user-side";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    wrapper.dataset.text = text;
    const footer = document.createElement("div");
    footer.className = "bubble-footer";
    const editBtn = document.createElement("button");
    editBtn.className = "msg-edit-btn";
    editBtn.textContent = "✏️ Edit";
    editBtn.addEventListener("click", () => {
      userInput.value = wrapper.dataset.text;
      userInput.focus();
      userInput.dispatchEvent(new Event("input"));
      const stepIndex = parseInt(wrapper.dataset.stepIndex ?? "-1");
      if (stepIndex >= 0) rollbackToStep(stepIndex, wrapper);
    });
    const time = document.createElement("span");
    time.className = "bubble-time";
    time.textContent = nowTime();
    footer.appendChild(editBtn);
    footer.appendChild(time);
    bubble.appendChild(textSpan);
    bubble.appendChild(footer);
    wrapper.appendChild(bubble);
    chatBody.appendChild(wrapper);
    scrollBottom();
    return wrapper;
  }

  function showTyping() {
    const wrapper = document.createElement("div");
    wrapper.className = "msg-wrapper bot-side";
    wrapper.id = "typing-wrapper";
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = "💼";
    const bubble = document.createElement("div");
    bubble.className = "typing-bubble";
    bubble.innerHTML = `<div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div>`;
    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    chatBody.appendChild(wrapper);
    scrollBottom();
    return wrapper;
  }

  function removeTyping() { document.getElementById("typing-wrapper")?.remove(); }

  function rollbackToStep(stepIndex, fromWrapper) {
    let el = fromWrapper;
    while (el) {
      const next = el.nextElementSibling;
      el.remove();
      el = next;
    }
    const keys = ["income", "jobType", "existingEmis", "expenses", "loanConfig"];
    for (let i = stepIndex; i < keys.length; i++) {
        if (keys[i] === "loanConfig") { state.loanAmount = null; state.loanType = null; }
        else state[keys[i]] = null;
    }
    state.currentStep = stepIndex;
    state.flowComplete = false;
    state.resultShown = false;
    dashboardRoot.style.display = "none";
    chatBody.style.display = "block";
    loanAmtBar.style.display = "none";
    updateProgressSteps();
    updateSummaryBar();
  }

  function showChips(chips) {
    chipsRow.innerHTML = "";
    if (!chips || chips.length === 0) {
      chipsRow.style.display = "none";
      return;
    }
    chips.forEach(label => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.textContent = label;
      btn.addEventListener("click", () => { userInput.value = label; handleSend(); });
      chipsRow.appendChild(btn);
    });
    chipsRow.style.display = "flex";
  }

  /* ─────────────── ELIGIBILITY ENGINE ─────────────── */
  function computeEligibility() {
    const income = state.income || 0, emis = state.existingEmis || 0, expenses = state.expenses || 0;
    const loanType = state.loanType || "personal", jobType = state.jobType || "salaried";
    const rate = (RATES[loanType] || RATES.personal)[jobType] || 13, tenureMonths = TENURE[loanType] || 60, r = rate / 100 / 12;
    const disposable = income - expenses - emis;
    const maxNewEmi = Math.min(income * 0.40, Math.max(0, disposable * 0.70));
    let eligibleAmount = 0;
    if (maxNewEmi > 0 && r > 0) eligibleAmount = Math.round((maxNewEmi * (Math.pow(1 + r, tenureMonths) - 1)) / (r * Math.pow(1 + r, tenureMonths)));
    const caps = { personal: 2500000, home: 60000000, vehicle: 2000000, business: 7500000, education: 3000000 };
    eligibleAmount = Math.min(eligibleAmount, caps[loanType] || 2500000);
    const dti = income > 0 ? parseFloat(((emis / income) * 100).toFixed(1)) : 0;
    const emiEligible = maxNewEmi > 0 ? Math.round(calcEMI(eligibleAmount, rate, tenureMonths)) : 0;
    let prefAnalysis = null;
    let totalDti = dti;

    if (state.loanAmount) {
      const prefEmi = Math.round(calcEMI(state.loanAmount, rate, tenureMonths)), ratio = state.loanAmount / (eligibleAmount || 1);
      let feasibility = ratio > 1.1 ? "infeasible" : ratio > 0.85 ? "stretch" : "feasible";
      totalDti = income > 0 ? parseFloat((((emis + prefEmi) / income) * 100).toFixed(1)) : 0;
      prefAnalysis = { prefEmi, ratio, feasibility };
    }
    
    let tag = (eligibleAmount >= 200000 && totalDti < 45 && disposable > 5000) ? "high" : (eligibleAmount < 50000 || totalDti > 60 || disposable < 0 || jobType === "student") ? "low" : "medium";
    return { eligibleAmount, dti, totalDti, emiEligible, rate, tenureMonths, tag, maxNewEmi, disposable, prefAnalysis };
  }

  function buildTips() {
    const tips = [], dti = state.income > 0 ? (state.existingEmis / state.income) * 100 : 0, disp = (state.income || 0) - (state.expenses || 0) - (state.existingEmis || 0);
    if (dti > 40) tips.push("Pay off current debt to increase limit.");
    if (disp < 5000) tips.push("Reduce monthly expenses for higher EMI capacity.");
    if (state.jobType === "freelancer") tips.push("Consistent ITR history helps in better rates.");
    if (state.income < 25000) tips.push("Add a co-applicant to boost eligibility.");
    if (tips.length < 2) tips.push("Aim for a 750+ CIBIL score for prime rates.");
    return tips.slice(0, 3);
  }

  /* ─────────────── BENTO DASHBOARD ─────────────── */
  function renderDashboard() {
    state.resultShown = true;
    const res = computeEligibility();
    const { eligibleAmount, dti, totalDti, emiEligible, rate, tenureMonths, tag, maxNewEmi, disposable, prefAnalysis } = res;
    
    chatBody.style.display = "none";
    dashboardRoot.style.display = "grid";
    summaryBar.style.display = "none";
    
    const tenureYrs = tenureMonths / 12, optionB = Math.round(eligibleAmount * 0.65);
    
    // Status Logic
    const feasibility = prefAnalysis ? prefAnalysis.feasibility : "feasible";
    let statusLabel = "APPROVED";
    let statusColor = "var(--accent-emerald)";
    let heroTitle = `Eligible for <span style="color:var(--accent-cyan)">${fmt(eligibleAmount)}</span>`;

    if (eligibleAmount <= 0) {
      statusLabel = "NOT ELIGIBLE";
      statusColor = "var(--accent-rose)";
      heroTitle = `<span style="color:var(--accent-rose)">Assessment: INELIGIBLE</span>`;
    } else if (feasibility === "infeasible") {
      statusLabel = "INELIGIBLE FOR REQUEST";
      statusColor = "var(--accent-rose)";
    } else if (feasibility === "stretch") {
      statusLabel = "POTENTIAL STRETCH";
      statusColor = "var(--accent-amber)";
    }

    dashboardRoot.innerHTML = `
      <div class="bento-card bento-hero col-8" style="background: radial-gradient(circle at top left, ${statusColor}15, transparent 70%);">
        <div class="hero-tag" style="background:${statusColor}22; color:${statusColor}">${statusLabel}</div>
        <h1 class="hero-main">${heroTitle}</h1>
        <p class="hero-sub">${eligibleAmount <= 0 ? "Based on your financial data, we cannot recommend a loan at this time." : `Based on disposable income of ${fmt(disposable)}/mo. Position: ${tag.toUpperCase()}.`}</p>
        <div class="fin-bento-grid" style="grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 16px;">
          <div class="fin-bento-item"><span class="fin-bento-label">Max Limit</span><span class="fin-bento-val">${fmt(eligibleAmount)}</span></div>
          <div class="fin-bento-item" style="border-color:${feasibility === "infeasible" ? "var(--accent-rose)" : "var(--border)"}">
            <span class="fin-bento-label">Requested</span>
            <span class="fin-bento-val" style="color:${feasibility === "infeasible" ? "var(--accent-rose)" : "var(--accent-cyan)"}">${fmt(state.loanAmount)}</span>
          </div>
          <div class="fin-bento-item"><span class="fin-bento-label">EMI (Proposed)</span><span class="fin-bento-val" style="color:var(--accent-cyan)">${fmt(prefAnalysis ? prefAnalysis.prefEmi : 0)}/mo</span></div>
          <div class="fin-bento-item"><span class="fin-bento-label">Rate & Tenure</span><span class="fin-bento-val">${rate}% @ ${tenureYrs}y</span></div>
        </div>
      </div>
      <div class="bento-card col-4">
        <div class="bento-load-title"><h2 class="bento-title">Total EMI Load</h2><span class="bento-load-val" style="color:${totalDti > 50 ? "var(--accent-rose)" : "var(--accent-cyan)"}">${totalDti || 0}%</span></div>
        <div class="bento-bar-outer"><div class="bento-bar-inner" style="width: ${Math.min(totalDti || 0, 100)}%; background:${totalDti > 50 ? "var(--accent-rose)" : "var(--grad-cyan)"}"></div></div>
        <p class="hero-sub" style="margin-top: 15px; font-size: 0.8rem;">${totalDti < 45 ? "Healthy balance." : "High ratio."} Includes current EMIs.</p>
      </div>
      <div class="bento-card col-4">
        <h2 class="bento-title">Your Profile</h2>
        <div class="fin-bento-grid" style="grid-template-columns: 1fr; gap: 8px;">
          <div class="fin-bento-item"><span class="fin-bento-label">Income</span><span class="fin-bento-val">${fmt(state.income)}</span></div>
          <div class="fin-bento-item"><span class="fin-bento-label">Job</span><span class="fin-bento-val">${capitalise(state.jobType)}</span></div>
        </div>
      </div>
      <div class="bento-card col-8">
        <h2 class="bento-title">Loan Scenarios</h2>
        <div class="bento-scenario-list">
          <div class="bento-scenario"><span class="bento-sc-name">Scenario A — Max Borrowing</span><span class="bento-sc-val">${fmt(eligibleAmount)}</span></div>
          <div class="bento-scenario"><span class="bento-sc-name">Scenario B — Safe Limit</span><span class="bento-sc-val">${fmt(optionB)}</span></div>
          <div class="bento-scenario" style="border-color:var(--accent-cyan); background:rgba(34,211,238,0.06);"><span class="bento-sc-name" style="color:var(--accent-cyan)">Requested Borrowing</span><span class="bento-sc-val" style="color:var(--accent-cyan)">${fmt(state.loanAmount)}</span></div>
        </div>
      </div>
      <div class="bento-card col-12">
        <h2 class="bento-title">Quick Tips</h2>
        <div class="fin-bento-grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
          <p class="hero-sub">💡 ${buildTips()[0] || "Maintain good credit."}</p>
          <p class="hero-sub">🚀 ${buildTips()[1] || "Increase your income."}</p>
        </div>
      </div>
    `;
    saveState();
  }

  /* ─────────────── FLOW ENGINE ─────────────── */
  async function askCurrentStep() {
    const step = FLOW_STEPS[state.currentStep];
    updateProgressSteps();
    await addBotMessage(step.question);
    showChips(step.chips);
    if (step.key === "loanConfig") {
      loanAmtBar.style.display = "block";
      userInput.disabled = true; sendBtn.disabled = true;
    } else {
      loanAmtBar.style.display = "none";
      userInput.disabled = false; sendBtn.disabled = false;
      userInput.focus();
    }
  }

  function processStepAnswer(stepIndex, text) {
    const step = FLOW_STEPS[stepIndex];
    let parsed = null, errorMsg = null;
    switch (step.key) {
      case "income": parsed = parseIncome(text); if (!parsed || parsed < 1000) errorMsg = "Please enter valid monthly income."; else state.income = parsed; break;
      case "jobType": parsed = parseJobType(text); if (!parsed) errorMsg = "Please pick a job category."; else state.jobType = parsed; break;
      case "existingEmis": parsed = parseAmount(text); if (parsed === null) errorMsg = "Tell me your EMI totals."; else state.existingEmis = parsed; break;
      case "expenses": parsed = parseAmount(text); if (!parsed && parsed !== 0) errorMsg = "Estimate your fixed expenses."; else state.expenses = parsed; break;
    }
    return errorMsg;
  }

  async function handleSend() {
    const text = userInput.value.trim();
    if (!text || sendBtn.disabled) return;
    userInput.value = ""; userInput.style.height = "auto"; chipsRow.style.display = "none";
    const userMsgEl = addUserMessage(text);
    userMsgEl.dataset.stepIndex = state.currentStep;
    sendBtn.disabled = true;

    if (state.flowComplete) {
      const typing = showTyping(); await delay(1000); removeTyping();
      await addBotMessage("I'm specialized in loan eligibility! You can edit details in the summary bar above to re-calculate.");
      sendBtn.disabled = false; userInput.focus(); return;
    }

    let skippedSteps = 0;
    const err = processStepAnswer(state.currentStep, text);
    if (err) { await addBotMessage(err); showChips(FLOW_STEPS[state.currentStep].chips); sendBtn.disabled = false; userInput.focus(); return; }

    const typing = showTyping(); await delay(800); removeTyping();
    state.currentStep += 1;
    updateSummaryBar();
    saveState();

    if (state.currentStep >= FLOW_STEPS.length) { sendBtn.disabled = false; return; }
    await askCurrentStep();
    sendBtn.disabled = false;
  }

  loanConfirm.addEventListener("click", async () => {
    const rawAmt = parseFloat(loanAmtInput.value), lType = loanTypeSel.value;
    if (!rawAmt || rawAmt < 10000) { loanAmtInput.style.borderColor = "#ff4444"; return; }
    state.loanAmount = rawAmt; state.loanType = lType; state.flowComplete = true;
    loanAmtBar.style.display = "none";
    addUserMessage(`Preferred: ${fmt(rawAmt)} | ${lType}`);
    state.currentStep = FLOW_STEPS.length;
    updateProgressSteps(); updateSummaryBar();
    showTyping(); await delay(1200); removeTyping();
    await addBotMessage("Calculation complete! Here's your dashboard...");
    await delay(500);
    renderDashboard();
  });

  const editMeta = {
    income: { title: "Edit Monthly Income", parse: parseIncome },
    jobType: { title: "Edit Job Type", parse: parseJobType },
    emis: { title: "Edit Existing EMIs", parse: parseAmount },
    expenses: { title: "Edit Monthly Expenses", parse: parseAmount },
    loanAmount: { title: "Edit Preferred Loan Amount", parse: val => parseFloat(val) || null },
  };
  let currentEditField = null;

  summaryBar.querySelectorAll(".s-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentEditField = btn.dataset.field; const meta = editMeta[currentEditField];
      modalTitle.textContent = meta.title; modalInput.value = ""; modalOverlay.style.display = "flex";
      setTimeout(() => modalInput.focus(), 100);
    });
  });

  function closeModal() { modalOverlay.style.display = "none"; currentEditField = null; }
  modalClose.addEventListener("click", closeModal); modalCancel.addEventListener("click", closeModal);
  modalSave.addEventListener("click", async () => {
    const raw = modalInput.value.trim(), meta = editMeta[currentEditField];
    const parsed = meta.parse(raw);
    if (parsed === null) return;
    if (currentEditField === "emis") state.existingEmis = parsed;
    else if (currentEditField === "loanAmount") state.loanAmount = parsed;
    else state[currentEditField] = parsed;
    closeModal(); updateSummaryBar();
    if (state.flowComplete) renderDashboard();
  });

  resetBtn.addEventListener("click", () => { if (confirm("Start fresh?")) { localStorage.removeItem(STORAGE_KEY); window.location.reload(); } });
  userInput.addEventListener("input", () => { userInput.style.height = "auto"; userInput.style.height = Math.min(userInput.scrollHeight, 110) + "px"; });
  sendBtn.addEventListener("click", handleSend);
  userInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } });

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function init() {
    const resumed = loadState(); updateProgressSteps(); updateSummaryBar();
    addDateDivider();
    if (resumed) { await addBotMessage("Resumed! Let's continue."); await delay(400); askCurrentStep(); }
    else { await addBotMessage("Hi! I'm LoanBot. I'll help you find your loan eligibility in 1 minute."); await delay(600); askCurrentStep(); }
  }
  init();
})();
