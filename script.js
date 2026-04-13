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
  
  const OCCUPATION_DATA = {
    student: {
      financeLabel: "Allowance",
      financeQuestion: "Students usually don't have a fixed salary, but do you receive any monthly allowance or part-time income? (e.g. ₹5,000 or 'None')",
      detailLabel: "College/Degree",
      detailQuestion: "Great! Tell me about your education — what degree are you pursuing and at which college?",
      loanTypes: [
        { id: "education", label: "Education Loan" },
        { id: "personal", label: "Laptop/Gadget Loan" }
      ],
      chips: { finance: ["₹5,000", "₹10,000", "No income"], details: ["Final Year", "Post Graduation", "Engineering", "Arts"] }
    },
    farmer: {
      financeLabel: "Annual Income",
      financeQuestion: "Farmers power the nation! 🌾 What is your approximate annual household income from crops and dairy?",
      detailLabel: "Land holding",
      detailQuestion: "Understanding your land helps. How many acres do you cultivate, and is it owned or leased?",
      loanTypes: [
        { id: "crop", label: "Crop Loan (KCC)" },
        { id: "gold", label: "Gold Loan (Agri)" },
        { id: "education", label: "Dependent Education" }
      ],
      chips: { finance: ["₹2 Lakh/year", "₹5 Lakh/year", "₹8 Lakh/year"], details: ["Own Land - 2 Acres", "Own Land - 5+ Acres", "Leased Land"] }
    },
    salaried: {
      financeLabel: "Monthly Salary",
      financeQuestion: "What is your monthly take-home salary? (e.g. ₹45,000 or 60k)",
      detailLabel: "Company",
      detailQuestion: "Which organization do you work for, and what is your job role?",
      loanTypes: [
        { id: "personal", label: "Personal Loan" },
        { id: "home", label: "Home Loan" },
        { id: "vehicle", label: "Vehicle / Car Loan" }
      ],
      chips: { finance: ["₹30,000", "₹50,000", "₹80,000", "₹1.2 Lakh"], details: ["MNC Employee", "Private Sector", "Software Engineer", "Healthcare"] }
    },
    government: {
      financeLabel: "Monthly Salary",
      financeQuestion: "As a government employee, what is your net monthly take-home salary?",
      detailLabel: "Department",
      detailQuestion: "Which department or wing of the government do you serve in? (e.g. Railway, Banking, Education)",
      loanTypes: [
        { id: "personal", label: "Personal Loan (Govt Scheme)" },
        { id: "home", label: "Home Loan (Low Interest)" },
        { id: "vehicle", label: "Vehicle Loan" }
      ],
      chips: { finance: ["₹40,000", "₹60,000", "₹90,000", "₹1.5 Lakh+"], details: ["State Govt", "Central Govt", "PSU Employee", "Public Bank"] }
    },
    "self-employed": {
      financeLabel: "Annual Profit",
      financeQuestion: "What is your annual business profit or turnover as per your last ITR?",
      detailLabel: "Business Type",
      detailQuestion: "Tell me about your business. What do you deal in and how many years has it been active?",
      loanTypes: [
        { id: "business", label: "Business Expansion" },
        { id: "home", label: "Home Loan" },
        { id: "vehicle", label: "Commercial Vehicle" }
      ],
      chips: { finance: ["₹5 Lakh", "₹10 Lakh", "₹20 Lakh+"], details: ["Retail Shop", "Manufacturing", "Tech Services", "3+ Years Old"] }
    },
    freelancer: {
      financeLabel: "Monthly Avg",
      financeQuestion: "As a freelancer, what's your average monthly income over the last 6 months?",
      detailLabel: "Primary Skill",
      detailQuestion: "What's your core expertise or industry you primarily consult for?",
      loanTypes: [
        { id: "personal", label: "Personal Loan" },
        { id: "business", label: "Professional Equipment" },
        { id: "vehicle", label: "Vehicle Loan" }
      ],
      chips: { finance: ["₹40,000", "₹70,000", "₹1 Lakh+"], details: ["Design/Creative", "IT Consulting", "Content/Marketing"] }
    },
    other: {
      financeLabel: "Monthly Income",
      financeQuestion: "Understood. Roughly how much do you earn or receive every month?",
      detailLabel: "Source",
      detailQuestion: "Can you briefly describe your source of income or what you do?",
      loanTypes: [
        { id: "personal", label: "Personal Loan" },
        { id: "vehicle", label: "Vehicle Loan" }
      ],
      chips: { 
        finance: ["₹20,000", "₹40,000", "₹60,000"], 
        details: ["Retired / Pension", "Doctor / Medical", "Lawyer / CA", "Rental Income", "HouseWife / HomeMaker"] 
      }
    }
  };

  /* Common quick-select loan purposes shown as chips in the loan bar */
  const PURPOSE_CHIPS = [
    "🏠 Home Renovation", "💒 Wedding", "🏥 Medical",
    "✈️ Travel", "🚗 Car / Vehicle", "📚 Education",
    "💼 Business", "📦 Debt Consolidation", "🛠️ Other"
  ];

  /* ─────────────── DOM REFS ─────────────── */
  const chatBody      = document.getElementById("chat-body");
  const dashboardRoot = document.getElementById("dashboard-root");
  const userInput     = document.getElementById("user-input");
  const sendBtn       = document.getElementById("send-btn");
  const resetBtn      = document.getElementById("reset-btn");
  const chipsRow      = document.getElementById("chips-row");
  const summaryBar    = document.getElementById("summary-bar");
  const loanAmtBar     = document.getElementById("loan-amount-bar");
  const loanAmtInput   = document.getElementById("loan-amount-input");
  const loanPurposeInput  = document.getElementById("loan-purpose-input");
  const purposeChipsRow   = document.getElementById("purpose-chips-row");
  const loanConfirm       = document.getElementById("loan-confirm-btn");
  const modalOverlay   = document.getElementById("modal-overlay");
  const modalTitle     = document.getElementById("modal-title");
  const modalInput     = document.getElementById("modal-input");
  const modalHint      = document.getElementById("modal-hint");
  const modalSave      = document.getElementById("modal-save");
  const modalCancel    = document.getElementById("modal-cancel");
  const modalClose     = document.getElementById("modal-close");

  /* ─────────────── CONVERSATION FLOW ─────────────── */
  const FLOW_STEPS = [
    {
      key: "jobType",
      stepId: "step-job",
      question: "Let's start! What's your current occupation? This helps me load relevant loan types for you. 💼",
      chips: ["Salaried Private", "Govt Employee", "Self-employed", "Farmer", "Student", "Other"],
      hint: "Your occupation determines available loan types",
    },
    {
      key: "income",
      stepId: "step-finance",
      question: (s) => (OCCUPATION_DATA[s.jobType] || OCCUPATION_DATA.salaried).financeQuestion,
      chips: (s) => (OCCUPATION_DATA[s.jobType] || OCCUPATION_DATA.salaried).chips.finance,
      hint: (s) => (OCCUPATION_DATA[s.jobType] || OCCUPATION_DATA.salaried).financeLabel,
    },
    {
      key: "familyIncome",
      stepId: "step-finance",
      skip: (s) => !(s.jobType === "student" && s.income === 0),
      question: "No worries! Since you're a student, we can consider your family income. What is your father's or family's total monthly income?",
      chips: ["₹30,000", "₹50,000", "₹80,000", "₹1 Lakh"],
      hint: "Family monthly income",
    },
    {
      key: "jobDetails",
      stepId: "step-detail",
      question: (s) => (OCCUPATION_DATA[s.jobType] || OCCUPATION_DATA.salaried).detailQuestion,
      chips: (s) => (OCCUPATION_DATA[s.jobType] || OCCUPATION_DATA.salaried).chips.details,
      hint: (s) => (OCCUPATION_DATA[s.jobType] || OCCUPATION_DATA.salaried).detailLabel,
    },
    {
      key: "existingEmis",
      stepId: "step-commitments",
      question: "Do you have any current EMIs? (e.g. Car loan, personal loan). If none, just say \"No EMI\".",
      chips: ["No EMI", "₹5,000", "₹10,000", "₹20,000"],
      hint: "Monthly loan repayment burden",
    },
    {
      key: "expenses",
      stepId: "step-commitments",
      question: "What are your fixed monthly expenses? (Rent, food, etc.). This helps in assessing your surplus cash flow.",
      chips: ["₹10,000", "₹20,000", "₹30,000", "₹50,000"],
      hint: "Monthly living costs",
    },
    {
      key: "loanConfig",
      stepId: "step-loan",
      question: (s) => `Excellent! Based on your profile as a ${s.jobType.toUpperCase()}, I've unlocked specific options for you. 👇\n\nHow much do you need and for what purpose?`,
      chips: [],
      hint: "Select your preferred loan type and amount",
    },
  ];

  /* ─────────────── STATE ─────────────── */
  let state = {
    income:        null,
    jobType:       null,
    existingEmis:  null,
    expenses:      null,
    familyIncome:  null,
    jobDetails:    null,
    loanAmount:    null,
    loanType:      null,
    loanPurpose:   null,   // free-text custom purpose
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
    personal:  { salaried: 10.5, government: 9.5, "self-employed": 12.5, freelancer: 14, student: 16, retired: 13, farmer: 11.5, default: 13 },
    home:      { salaried: 8.5,  government: 8.1, "self-employed": 9.5,  freelancer: 11, student: 12, retired: 9,  farmer: 9.0,  default: 9.5 },
    vehicle:   { salaried: 9.0,  government: 8.5, "self-employed": 10.5, freelancer: 12, student: 13, retired: 10, farmer: 9.5,  default: 10.5 },
    business:  { salaried: 11.5, government: 10.5, "self-employed": 11.5, freelancer: 14, student: 16, retired: 13, farmer: 11.0, default: 13 },
    education: { salaried: 8.0,  government: 7.8, "self-employed": 9.0,  freelancer: 10, student: 7.5, retired: 9, farmer: 8.5,  default: 8.5 },
    crop:      { farmer: 7.0, default: 9.0 },
    gold:      { farmer: 8.5, "self-employed": 10.0, default: 9.5 }
  };

  const TENURE = { personal: 60, home: 240, vehicle: 72, business: 84, education: 120 };

  /**
   * Infer a rate-table key from the user's free-text loan purpose.
   * Falls back to "personal" if no keyword matches.
   */
  function inferLoanType(purpose) {
    const p = (purpose || "").toLowerCase();
    if (/home|house|flat|property|real.?estate|apartment/i.test(p))  return "home";
    if (/car|vehicle|bike|motor|auto|two.?wheel|four.?wheel/i.test(p)) return "vehicle";
    if (/business|shop|enterprise|startup|trade|manufactur/i.test(p)) return "business";
    if (/education|study|tuition|college|school|degree|course/i.test(p)) return "education";
    if (/farm|agri|crop|harvest|kisan/i.test(p)) return "crop";
    if (/gold/i.test(p)) return "gold";
    return "personal"; // wedding, medical, travel, etc. → personal
  }

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
    if (/salar|full.?time|employed|office|corporate|company|job|private/i.test(t)) return "salaried";
    if (/govt|government|public|civil|central|state/i.test(t)) return "government";
    if (/self.?employ|business|entrepreneur|shop|proprietor|own/i.test(t)) return "self-employed";
    if (/freelanc|consult|contract|gig/i.test(t)) return "freelancer";
    if (/student|college|university|studying/i.test(t)) return "student";
    if (/retire|pension|senior/i.test(t)) return "retired";
    if (/farm|agri|cultivator/i.test(t)) return "farmer";
    if (/other|else|etc/i.test(t)) return "other";
    return null;
  }

  function parseAmount(text) {
    const t = text.toLowerCase().trim();
    if (/no|zero|nil|none|debt.?free/i.test(t)) return 0;
    return parseIncome(t);
  }

  /* ─────────────── PROGRESS ─────────────── */
  function updateProgressSteps() {
    const stepIds = ["step-job", "step-finance", "step-detail", "step-commitments", "step-loan"];
    const flowIdToStepId = FLOW_STEPS.map(s => s.stepId);
    const uniqueStepIds = [...new Set(flowIdToStepId)];
    
    // Find current active dot by looking at the current step's stepId
    const currentStepId = FLOW_STEPS[state.currentStep]?.stepId;
    const activeIndex = uniqueStepIds.indexOf(currentStepId);

    uniqueStepIds.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove("active", "done");
      if (i < activeIndex)       el.classList.add("done");
      else if (i === activeIndex) el.classList.add("active");
    });
    document.querySelectorAll(".step-connector").forEach((el, i) => {
      el.classList.toggle("done", i < activeIndex);
    });
  }

  /* ─────────────── SUMMARY BAR ─────────────── */
  function updateSummaryBar() {
    const occ = OCCUPATION_DATA[state.jobType] || OCCUPATION_DATA.salaried;
    document.getElementById("sv-income").textContent = state.income != null ? fmt(state.income) : "—";
    document.getElementById("sv-type").textContent   = state.jobType ? summariseJob(state.jobType) : "—";
    document.getElementById("sv-emi").textContent    = state.existingEmis != null ? fmt(state.existingEmis) : "—";
    document.getElementById("sv-exp").textContent    = state.expenses != null ? fmt(state.expenses) : "—";
    document.getElementById("sv-amt").textContent    = state.loanAmount != null ? fmt(state.loanAmount) : "—";

    const hasAny = state.income || state.jobType || state.existingEmis != null || state.expenses;
    summaryBar.style.display = hasAny ? "flex" : "none";
  }

  function summariseJob(type) {
    if (type === "salaried") return "Salaried";
    if (type === "government") return "Govt";
    if (type === "self-employed") return "Self-Emp";
    return capitalise(type);
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
    const keys = ["jobType", "income", "familyIncome", "jobDetails", "existingEmis", "expenses", "loanConfig"];
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
    const jobType = state.jobType || "salaried";
    const occ = OCCUPATION_DATA[jobType];
    const isAnnual = (jobType === "farmer" || jobType === "self-employed");
    const incomeRaw = (state.jobType === "student" && state.income === 0) ? (state.familyIncome || 0) : (state.income || 0);
    const monthlyIncome = isAnnual ? incomeRaw / 12 : incomeRaw;
    
    const emis = state.existingEmis || 0, expenses = state.expenses || 0;
    const loanType = state.loanType || "personal";
    const rate = (RATES[loanType] || RATES.personal)[jobType] || (RATES[loanType] || RATES.personal).default;
    const tenureMonths = TENURE[loanType] || 60, r = rate / 100 / 12;
    
    const disposable = monthlyIncome - expenses - emis;
    const maxNewEmi = Math.min(monthlyIncome * 0.45, Math.max(0, disposable * 0.75));
    
    let eligibleAmount = 0;
    if (maxNewEmi > 0 && r > 0) eligibleAmount = Math.round((maxNewEmi * (Math.pow(1 + r, tenureMonths) - 1)) / (r * Math.pow(1 + r, tenureMonths)));
    
    const caps = { personal: 2500000, home: 60000000, vehicle: 2000000, business: 7500000, education: 3000000, crop: 500000, gold: 1000000 };
    eligibleAmount = Math.min(eligibleAmount, caps[loanType] || 2500000);
    
    const dti = monthlyIncome > 0 ? parseFloat(((emis / monthlyIncome) * 100).toFixed(1)) : 0;
    const emiEligible = maxNewEmi > 0 ? Math.round(calcEMI(eligibleAmount, rate, tenureMonths)) : 0;
    let prefAnalysis = null;
    let totalDti = dti;

    if (state.loanAmount) {
      const prefEmi = Math.round(calcEMI(state.loanAmount, rate, tenureMonths)), ratio = state.loanAmount / (eligibleAmount || 1);
      let feasibility = ratio > 1.1 ? "infeasible" : ratio > 0.85 ? "stretch" : "feasible";
      totalDti = monthlyIncome > 0 ? parseFloat((((emis + prefEmi) / monthlyIncome) * 100).toFixed(1)) : 0;
      prefAnalysis = { prefEmi, ratio, feasibility };
    }
    
    let tag = (eligibleAmount >= 200000 && totalDti < 45 && disposable > 5000) ? "high" : (eligibleAmount < 50000 || totalDti > 60 || disposable < 0 || jobType === "student") ? "low" : "medium";
    return { eligibleAmount, dti, totalDti, emiEligible, rate, tenureMonths, tag, maxNewEmi, disposable, prefAnalysis, monthlyIncome, emis, expenses };
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
    const { eligibleAmount, dti, totalDti, emiEligible, rate, tenureMonths, tag, maxNewEmi, disposable, prefAnalysis, monthlyIncome, emis, expenses } = res;
    
    chatBody.style.display = "none";
    dashboardRoot.style.display = "grid";
    summaryBar.style.display = "none";

    const tenureYrs = tenureMonths / 12;
    const optionB   = Math.round(eligibleAmount * 0.65);

    // Status Logic
    const feasibility = prefAnalysis ? prefAnalysis.feasibility : "feasible";
    let statusLabel = "APPROVED";
    let statusColor = "var(--accent-emerald)";
    let heroTitle   = `Eligible for <span style="color:var(--accent-cyan)">${fmt(eligibleAmount)}</span>`;

    if (eligibleAmount <= 0) {
      statusLabel = "NOT ELIGIBLE";
      statusColor = "var(--accent-rose)";
      heroTitle   = `<span style="color:var(--accent-rose)">Assessment: INELIGIBLE</span>`;
    } else if (feasibility === "infeasible") {
      statusLabel = "INELIGIBLE FOR REQUEST";
      statusColor = "var(--accent-rose)";
    } else if (feasibility === "stretch") {
      statusLabel = "POTENTIAL STRETCH";
      statusColor = "var(--accent-amber)";
    }

    // Interest breakdown for requested amount
    const reqPrincipal    = state.loanAmount || 0;
    const reqEmi          = prefAnalysis ? prefAnalysis.prefEmi : 0;
    const reqTotalPaid    = reqEmi * tenureMonths;
    const reqInterestPaid = Math.max(0, Math.round(reqTotalPaid - reqPrincipal));

    // Interest breakdown for eligible amount (max)
    const maxEmi          = emiEligible;
    const maxTotalPaid    = maxEmi * tenureMonths;
    const maxInterestPaid = Math.max(0, Math.round(maxTotalPaid - eligibleAmount));

    const purposeLabel    = state.loanPurpose || "Loan";

    dashboardRoot.innerHTML = `
      <!-- Hero card -->
      <div class="bento-card bento-hero col-8" style="background: radial-gradient(circle at top left, ${statusColor}15, transparent 70%);">
        <div class="hero-tag" style="background:${statusColor}22; color:${statusColor}">${statusLabel}</div>
        <h1 class="hero-main">${heroTitle}</h1>
        <p class="hero-sub" style="margin-bottom:6px;">
          <strong style="color:var(--accent-cyan)">Purpose:</strong> ${purposeLabel} &nbsp;|&nbsp;
          ${eligibleAmount <= 0 ? "Cannot recommend a loan at this time." : `Disposable: ${fmt(disposable)}/mo &bull; Position: <strong>${tag.toUpperCase()}</strong>`}
        </p>
        <div class="fin-bento-grid" style="grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 16px;">
          <div class="fin-bento-item"><span class="fin-bento-label">Max Eligible</span><span class="fin-bento-val">${fmt(eligibleAmount)}</span></div>
          <div class="fin-bento-item" style="border-color:${feasibility === "infeasible" ? "var(--accent-rose)" : "var(--border)"}">
            <span class="fin-bento-label">Your Request</span>
            <span class="fin-bento-val" style="color:${feasibility === "infeasible" ? "var(--accent-rose)" : "var(--accent-cyan)"}">${ fmt(state.loanAmount)}</span>
          </div>
          <div class="fin-bento-item"><span class="fin-bento-label">Monthly EMI</span><span class="fin-bento-val" style="color:var(--accent-cyan)">${fmt(reqEmi)}/mo</span></div>
          <div class="fin-bento-item"><span class="fin-bento-label">Rate &amp; Tenure</span><span class="fin-bento-val">${rate}% @ ${tenureYrs}y</span></div>
        </div>
      </div>

      <!-- EMI Load -->
      <div class="bento-card col-4">
        <div class="bento-load-title"><h2 class="bento-title">Total EMI Load</h2><span class="bento-load-val" style="color:${totalDti > 50 ? "var(--accent-rose)" : "var(--accent-cyan)"}">${ totalDti || 0}%</span></div>
        <div class="bento-bar-outer"><div class="bento-bar-inner" style="width: ${Math.min(totalDti || 0, 100)}%; background:${totalDti > 50 ? "var(--accent-rose)" : "var(--grad-cyan)"}"></div></div>
        <p class="hero-sub" style="margin-top: 15px; font-size: 0.8rem;">${totalDti < 45 ? "Healthy balance." : "High ratio."} Includes current EMIs.</p>
      </div>

      <!-- Interest Breakdown (requested) -->
      <div class="bento-card col-6">
        <h2 class="bento-title">&#x1F4B8; Interest Breakdown — Your Request</h2>
        <div class="fin-bento-grid" style="grid-template-columns: 1fr; gap: 10px;">
          <div class="fin-bento-item">
            <span class="fin-bento-label">Principal (Loan Amount)</span>
            <span class="fin-bento-val" style="color:var(--accent-cyan)">${fmt(reqPrincipal)}</span>
          </div>
          <div class="fin-bento-item">
            <span class="fin-bento-label">Total Interest Charged</span>
            <span class="fin-bento-val" style="color:var(--accent-amber)">${fmt(reqInterestPaid)}</span>
          </div>
          <div class="fin-bento-item" style="border-color:var(--accent-emerald);">
            <span class="fin-bento-label">Total Amount Repaid</span>
            <span class="fin-bento-val" style="color:var(--accent-emerald)">${fmt(Math.round(reqTotalPaid))}</span>
          </div>
        </div>
        <div style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-dim);margin-bottom:4px;"><span>Principal</span><span>Interest</span></div>
          <div style="display:flex;height:8px;border-radius:99px;overflow:hidden;">
            <div style="flex:${reqPrincipal};background:var(--grad-cyan);"></div>
            <div style="flex:${reqInterestPaid || 1};background:var(--grad-amber);"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-dim);margin-top:3px;"><span>${reqPrincipal > 0 ? Math.round(reqPrincipal * 100 / (reqPrincipal + reqInterestPaid)) : 0}%</span><span>${reqInterestPaid > 0 ? Math.round(reqInterestPaid * 100 / (reqPrincipal + reqInterestPaid)) : 0}%</span></div>
        </div>
      </div>

      <!-- Interest Breakdown (max eligible) -->
      <div class="bento-card col-6">
        <h2 class="bento-title">&#x1F4B0; Interest Breakdown — Max Eligible</h2>
        <div class="fin-bento-grid" style="grid-template-columns: 1fr; gap: 10px;">
          <div class="fin-bento-item">
            <span class="fin-bento-label">Principal (Max Eligible)</span>
            <span class="fin-bento-val" style="color:var(--accent-cyan)">${fmt(eligibleAmount)}</span>
          </div>
          <div class="fin-bento-item">
            <span class="fin-bento-label">Total Interest Charged</span>
            <span class="fin-bento-val" style="color:var(--accent-amber)">${fmt(maxInterestPaid)}</span>
          </div>
          <div class="fin-bento-item" style="border-color:var(--accent-emerald);">
            <span class="fin-bento-label">Total Amount Repaid</span>
            <span class="fin-bento-val" style="color:var(--accent-emerald)">${fmt(Math.round(maxTotalPaid))}</span>
          </div>
        </div>
        <div style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-dim);margin-bottom:4px;"><span>Principal</span><span>Interest</span></div>
          <div style="display:flex;height:8px;border-radius:99px;overflow:hidden;">
            <div style="flex:${eligibleAmount};background:var(--grad-cyan);"></div>
            <div style="flex:${maxInterestPaid || 1};background:var(--grad-amber);"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-dim);margin-top:3px;"><span>${eligibleAmount > 0 ? Math.round(eligibleAmount * 100 / (eligibleAmount + maxInterestPaid)) : 0}%</span><span>${maxInterestPaid > 0 ? Math.round(maxInterestPaid * 100 / (eligibleAmount + maxInterestPaid)) : 0}%</span></div>
        </div>
      </div>

      <!-- Profile -->
      <div class="bento-card col-4">
        <h2 class="bento-title">Your Profile</h2>
        <div class="fin-bento-grid" style="grid-template-columns: 1fr; gap: 8px;">
          <div class="fin-bento-item"><span class="fin-bento-label">Income</span><span class="fin-bento-val">${fmt(state.income)}</span></div>
          <div class="fin-bento-item"><span class="fin-bento-label">Job</span><span class="fin-bento-val">${capitalise(state.jobType)}</span></div>
          ${state.jobDetails ? `<div class="fin-bento-item"><span class="fin-bento-label">Detail</span><span class="fin-bento-val">${state.jobDetails}</span></div>` : ""}
        </div>
      </div>

      <!-- Loan Scenarios -->
      <div class="bento-card col-8">
        <h2 class="bento-title">Loan Scenarios</h2>
        <div class="bento-scenario-list">
          <div class="bento-scenario"><span class="bento-sc-name">Scenario A — Max Borrowing</span><span class="bento-sc-val">${fmt(eligibleAmount)}</span></div>
          <div class="bento-scenario"><span class="bento-sc-name">Scenario B — Safe Limit (65%)</span><span class="bento-sc-val">${fmt(optionB)}</span></div>
          <div class="bento-scenario" style="border-color:var(--accent-cyan); background:rgba(34,211,238,0.06);"><span class="bento-sc-name" style="color:var(--accent-cyan)">Your Request — ${purposeLabel}</span><span class="bento-sc-val" style="color:var(--accent-cyan)">${fmt(state.loanAmount)}</span></div>
        </div>
      </div>

      <!-- Monthly Cash Flow -->
      <div class="bento-card col-8">
        <h2 class="bento-title">&#x1F4CA; Monthly Cash Flow</h2>
        <div class="cf-stack-bar">
          <div class="cf-seg" style="flex:${expenses || 0.01};background:var(--grad-amber);" title="Expenses: ${fmt(expenses)}"></div>
          <div class="cf-seg" style="flex:${emis || 0.01};background:linear-gradient(135deg,#f43f5e,#991b1b);" title="Existing EMIs: ${fmt(emis)}"></div>
          <div class="cf-seg" style="flex:${reqEmi || 0.01};background:linear-gradient(135deg,#6366f1,#4338ca);" title="New EMI: ${fmt(reqEmi)}"></div>
          <div class="cf-seg" style="flex:${Math.max(0, disposable - reqEmi) || 0.01};background:var(--grad-cyan);" title="Surplus: ${fmt(Math.max(0, disposable - reqEmi))}"></div>
        </div>
        <div class="cf-legend">
          <span class="cf-dot" style="background:var(--grad-amber)"></span><span>Expenses ${fmt(expenses)}</span>
          <span class="cf-dot" style="background:#f43f5e"></span><span>Existing EMIs ${fmt(emis)}</span>
          <span class="cf-dot" style="background:#6366f1"></span><span>New EMI ${fmt(reqEmi)}</span>
          <span class="cf-dot" style="background:var(--accent-emerald)"></span><span>Surplus ${fmt(Math.max(0, disposable - reqEmi))}</span>
        </div>
        <div class="cf-rows">
          <div class="cf-row"><span class="cf-rl">&#x1F4B0; Monthly Income</span><span class="cf-rv income">${fmt(monthlyIncome)}</span></div>
          <div class="cf-row"><span class="cf-rl">&#x1F3E0; Expenses</span><span class="cf-rv expense">- ${fmt(expenses)}</span></div>
          <div class="cf-row"><span class="cf-rl">&#x1F504; Existing EMIs</span><span class="cf-rv emi">- ${fmt(emis)}</span></div>
          <div class="cf-row"><span class="cf-rl">&#x1F4CB; New EMI (${purposeLabel})</span><span class="cf-rv new-emi">- ${fmt(reqEmi)}</span></div>
          <div class="cf-row cf-row-total"><span class="cf-rl">&#x2705; Monthly Surplus</span><span class="cf-rv" style="color:${Math.max(0,disposable-reqEmi)>5000?'var(--accent-emerald)':'var(--accent-amber)'}">${fmt(Math.max(0, disposable - reqEmi))}</span></div>
        </div>
      </div>

      <!-- Quick Tips -->
      <div class="bento-card col-4">
        <h2 class="bento-title">&#x1F4A1; Quick Tips</h2>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <p class="hero-sub">&#x2022; ${buildTips()[0] || "Maintain good credit."}</p>
          <p class="hero-sub">&#x2022; ${buildTips()[1] || "Increase your income."}</p>
          <p class="hero-sub">&#x2022; ${buildTips()[2] || "File ITR consistently."}</p>
        </div>
      </div>

      <!-- Recalculate -->
      <div class="bento-card col-12" style="display:flex;align-items:center;justify-content:center;padding:18px;">
        <button id="dashboard-recalc-btn" class="dashboard-recalc-btn">&#x1F504; Adjust &amp; Recalculate</button>
      </div>
    `;
    saveState();

    // Wire up the Recalculate button rendered inside the dashboard
    document.getElementById("dashboard-recalc-btn")?.addEventListener("click", () => {
      dashboardRoot.style.display = "none";
      chatBody.style.display = "block";
      loanAmtBar.style.display = "block";
      loanAmtInput.value   = state.loanAmount || "";
      loanPurposeInput.value = state.loanPurpose || "";
      state.flowComplete = false;
      state.resultShown  = false;
      // Re-populate purpose chips
      const step = FLOW_STEPS[FLOW_STEPS.length - 1];
      if (step.key === "loanConfig") {
        purposeChipsRow.innerHTML = "";
        PURPOSE_CHIPS.forEach(label => {
          const chip = document.createElement("button");
          chip.className = "purpose-chip";
          chip.textContent = label;
          if (label.includes(state.loanPurpose || "___NONE___")) chip.classList.add("purpose-chip-active");
          chip.addEventListener("click", () => {
            loanPurposeInput.value = label.replace(/^[\p{Emoji}\s]+/u, "").trim();
            loanPurposeInput.style.borderColor = "";
            purposeChipsRow.querySelectorAll(".purpose-chip").forEach(c => c.classList.remove("purpose-chip-active"));
            chip.classList.add("purpose-chip-active");
            loanAmtInput.focus();
          });
          purposeChipsRow.appendChild(chip);
        });
      }
    });
  }

  /* ─────────────── FLOW ENGINE ─────────────── */
  async function askCurrentStep() {
    const step = FLOW_STEPS[state.currentStep];
    if (step.skip && step.skip(state)) {
      state.currentStep++;
      if (state.currentStep < FLOW_STEPS.length) return askCurrentStep();
      return;
    }
    updateProgressSteps();
    
    const qText = typeof step.question === "function" ? step.question(state) : step.question;
    const chips = typeof step.chips === "function" ? step.chips(state) : step.chips;

    await addBotMessage(qText);
    showChips(chips);
    
    if (step.key === "loanConfig") {
      loanAmtBar.style.display = "block";
      userInput.disabled = true; sendBtn.disabled = true;
      loanPurposeInput.value = "";
      loanAmtInput.value = "";
      // Populate purpose suggestion chips
      purposeChipsRow.innerHTML = "";
      PURPOSE_CHIPS.forEach(label => {
        const chip = document.createElement("button");
        chip.className = "purpose-chip";
        chip.textContent = label;
        chip.addEventListener("click", () => {
          loanPurposeInput.value = label.replace(/^[\p{Emoji}\s]+/u, "").trim();
          loanPurposeInput.style.borderColor = "";
          chip.classList.add("purpose-chip-active");
          purposeChipsRow.querySelectorAll(".purpose-chip").forEach(c => { if (c !== chip) c.classList.remove("purpose-chip-active"); });
          loanAmtInput.focus();
        });
        purposeChipsRow.appendChild(chip);
      });
    } else {
      loanAmtBar.style.display = "none";
      userInput.disabled = false; sendBtn.disabled = false;
      userInput.focus();
    }
  }

  // updateLoanTypeOptions() removed — user now types a custom purpose

  function processStepAnswer(stepIndex, text) {
    const step = FLOW_STEPS[stepIndex];
    let parsed = null, errorMsg = null;
    switch (step.key) {
      case "income": 
        parsed = parseAmount(text); 
        if (parsed === null) errorMsg = "Please enter a valid amount (e.g. ₹5,000 or 'None')."; 
        else state.income = parsed; 
        break;
      case "familyIncome":
        parsed = parseAmount(text);
        if (!parsed) errorMsg = "Please enter your family income details.";
        else state.familyIncome = parsed;
        break;
      case "jobType": parsed = parseJobType(text); if (!parsed) errorMsg = "Please pick a job category."; else state.jobType = parsed; break;
      case "jobDetails": state.jobDetails = text; break;
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
    if (err) { await addBotMessage(err); showChips(typeof FLOW_STEPS[state.currentStep].chips === "function" ? FLOW_STEPS[state.currentStep].chips(state) : FLOW_STEPS[state.currentStep].chips); sendBtn.disabled = false; userInput.focus(); return; }

    const typing = showTyping(); await delay(800); removeTyping();
    state.currentStep += 1;
    updateSummaryBar();
    saveState();

    if (state.currentStep >= FLOW_STEPS.length) { sendBtn.disabled = false; return; }
    await askCurrentStep();
    sendBtn.disabled = false;
  }

  loanConfirm.addEventListener("click", async () => {
    const rawAmt   = parseFloat(loanAmtInput.value);
    const purpose  = loanPurposeInput.value.trim();
    if (!rawAmt || rawAmt < 10000) { loanAmtInput.style.borderColor = "#ff4444"; loanAmtInput.focus(); return; }
    if (!purpose) { loanPurposeInput.style.borderColor = "#ff4444"; loanPurposeInput.focus(); return; }
    loanAmtInput.style.borderColor = "";
    loanPurposeInput.style.borderColor = "";
    state.loanAmount  = rawAmt;
    state.loanPurpose = purpose;
    state.loanType    = inferLoanType(purpose);   // derive rate key automatically
    state.flowComplete = true;
    loanAmtBar.style.display = "none";
    addUserMessage(`Amount: ${fmt(rawAmt)} | Purpose: ${purpose}`);
    state.currentStep = FLOW_STEPS.length;
    updateProgressSteps(); updateSummaryBar();
    showTyping(); await delay(1200); removeTyping();
    await addBotMessage("Calculation complete! Here's your personalised dashboard 🚀");
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
  // Enter key on loan amount / purpose inputs triggers confirm
  [loanAmtInput, loanPurposeInput].forEach(el => {
    el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); loanConfirm.click(); } });
  });

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function init() {
    const resumed = loadState(); updateProgressSteps(); updateSummaryBar();
    addDateDivider();
    if (resumed) { await addBotMessage("Resumed! Let's continue."); await delay(400); askCurrentStep(); }
    else { await addBotMessage("Hi! I'm LoanBot. I'll help you find your loan eligibility in 1 minute."); await delay(600); askCurrentStep(); }
  }
  init();
})();
