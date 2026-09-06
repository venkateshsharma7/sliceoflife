const habits = [
  ["Sleep 7-8 hrs", "Sleep & Morning"],
  ["Hot Water AM", "Sleep & Morning"],
  ["Nuts AM", "Health"],
  ["Workout / Run", "Health"],
  ["10K Steps", "Health"],
  ["2L Water", "Health"],
  ["Protein", "Health"],
  ["Sandhya Vandanam", "Spirit & College"],
  ["100% Attendance", "Spirit & College"],
  ["College Work Done", "Spirit & College"],
  ["DSA Topic", "DSA"],
  ["Placement Prep", "Placement"],
  ["Breakfast", "Nutrition"],
  ["Lunch", "Nutrition"],
  ["Dinner", "Nutrition"],
  ["No Junk Food", "Nutrition"],
  ["Hot Water PM", "Wellness"],
  ["Skin Care", "Wellness"],
  ["Watch 1 TV Episode", "Wellness"],
  ["Sleep By 10:30 PM", "Wellness"],
  ["No Fap", "Discipline & Social"],
  ["Female Interaction", "Discipline & Social"],
  ["Documenting", "Content"],
].map(([name, category]) => ({ id: slug(name), name, category }));

const rewards = [
  ["MVP", "24+", "Big splurge day. You earned the win."],
  ["ALL-STAR", "20-23", "New gear, book, or favorite restaurant."],
  ["STARTER", "16-19", "Movie night and a guilt-free treat."],
  ["ROOKIE", "11-15", "No reward yet. Push for Starter."],
  ["WARMING UP", "6-10", "Back to fundamentals. Keep showing up."],
  ["RESET DAY", "< 6", "One honest note, then reset tomorrow."],
];

const state = {
  view: "dashboard",
  selectedDate: isoDate(new Date(2026, 8, 7)),
  data: loadData(),
  aiMessages: [
    {
      role: "ai",
      text: "I am ready to coach from your tracker. Log today, then ask for a plan, warning, or weekly reset.",
    },
  ],
  config: { hasGeminiKey: false, model: "gemini-2.5-flash" },
  habitFilter: "All",
};

bootstrap();

async function bootstrap() {
  try {
    const res = await fetch("/api/config");
    state.config = await res.json();
  } catch {}
  render();
}

function loadData() {
  const saved = localStorage.getItem("slice-life-ai:v1");
  if (saved) return JSON.parse(saved);

  const start = new Date(2026, 8, 7);
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return {
      date: isoDate(date),
      statuses: Object.fromEntries(habits.map((h) => [h.id, ""])),
      screenTime: "",
      spend: 0,
      notes: "",
    };
  });

  return { days };
}

function saveData() {
  localStorage.setItem("slice-life-ai:v1", JSON.stringify(state.data));
}

function render() {
  document.querySelector("#app").innerHTML = `
    <div class="app">
      ${sidebar()}
      <main class="main">
        ${topbar()}
        ${view()}
      </main>
    </div>
    <div id="toast-root"></div>
  `;
  bind();
}

function sidebar() {
  const items = [
    ["dashboard", "DB", "Dashboard"],
    ["checkin", "IN", "Today Check-in"],
    ["habits", "HB", "Habit Matrix"],
    ["ai", "AI", "AI Coach"],
    ["weekly", "WK", "Weekly Review"],
    ["rewards", "RW", "Rewards"],
  ];

  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="mark">SL</div>
        <div>
          <h1>Slice of Life AI</h1>
          <p>Daily scoreboard for study, health, discipline, and focus.</p>
        </div>
      </div>
      <nav class="nav">
        ${items
          .map(
            ([id, glyph, label]) => `
              <button data-view="${id}" class="${state.view === id ? "active" : ""}" title="${label}">
                <span class="glyph">${glyph}</span><span>${label}</span>
              </button>
            `,
          )
          .join("")}
      </nav>
      <div class="utility">
        <button data-action="export"><span class="glyph">EX</span><span>Export Data</span></button>
        <button data-action="import"><span class="glyph">IM</span><span>Import Data</span></button>
        <input id="import-file" type="file" accept="application/json" hidden />
      </div>
    </aside>
  `;
}

function topbar() {
  const day = getDay(state.selectedDate);
  const summary = summarize();
  return `
    <header class="topbar">
      <div>
        <h2>${titleForView()}</h2>
        <p>${formatDate(state.selectedDate)} - ${rank(scoreDay(day))} - ${summary.completedToday}/${habits.length} habits complete</p>
      </div>
      <div class="actions">
        <input class="secondary" type="date" id="date-picker" value="${state.selectedDate}" />
        <button class="primary" data-action="ask-plan">Ask AI Plan</button>
      </div>
    </header>
  `;
}

function view() {
  if (state.view === "checkin") return checkinView();
  if (state.view === "habits") return habitsView();
  if (state.view === "ai") return aiView();
  if (state.view === "weekly") return weeklyView();
  if (state.view === "rewards") return rewardsView();
  return dashboardView();
}

function dashboardView() {
  const summary = summarize();
  return `
    <section class="grid metrics">
      ${metric("Best Day", summary.bestScore.toFixed(1), "Peak single-day score")}
      ${metric("Avg Score", summary.avgScore.toFixed(1), `${rank(summary.avgScore)} monthly pace`)}
      ${metric("Total Spend", `Rs ${summary.totalSpend}`, "Budget target under Rs 3000")}
      ${metric("Workouts", summary.workouts, "Training days")}
      ${metric("Screen Avg", `${summary.avgScreen.toFixed(1)}h`, "Lower is stronger")}
    </section>
    <section class="grid dashboard-layout">
      <div class="panel">
        <div class="panel-title">
          <h3>Performance Curve</h3>
          <span class="small">30 day season</span>
        </div>
        <div class="ring-wrap">
          <div class="ring" style="--pct:${Math.min(100, (summary.avgScore / 26) * 100)}">
            <div><strong>${Math.round((summary.avgScore / 26) * 100)}</strong><span>%</span></div>
          </div>
          ${sparkline(summary.scoreSeries)}
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">
          <h3>Weakest Links</h3>
          <span class="small">fix these first</span>
        </div>
        ${habitBars(summary.habitRates.slice(-8))}
      </div>
      <div class="panel">
        <div class="panel-title">
          <h3>Today Command Center</h3>
          <span class="rank">${rank(scoreDay(getDay(state.selectedDate)))}</span>
        </div>
        ${todaySnapshot()}
      </div>
      <div class="panel">
        <div class="panel-title">
          <h3>AI Status</h3>
          <span class="small">${state.config.hasGeminiKey ? state.config.model : "Gemini key missing"}</span>
        </div>
        <p class="small">Current coaching is grounded in your local tracker data: scores, missed habits, screen time, spend, and field notes.</p>
        <button class="primary" data-action="ask-review">Generate Review</button>
      </div>
    </section>
  `;
}

function checkinView() {
  const day = getDay(state.selectedDate);
  return `
    <section class="grid checkin">
      <div class="panel">
        <div class="panel-title">
          <h3>Daily Habits</h3>
          <span class="small">Done, partial, or missed</span>
        </div>
        <div class="habit-grid">
          ${habits.map((habit) => habitCard(habit, day)).join("")}
        </div>
      </div>
      <aside class="panel score-card">
        <span class="small">Today's score</span>
        <div class="big">${scoreDay(day).toFixed(1)}</div>
        <span class="rank">${rank(scoreDay(day))}</span>
        <div class="field">
          <label for="screen-time">Screen time hours</label>
          <input id="screen-time" type="number" min="0" max="24" step="0.5" value="${day.screenTime}" />
        </div>
        <div class="field">
          <label for="spend">Spend Rs</label>
          <input id="spend" type="number" min="0" step="1" value="${day.spend}" />
        </div>
        <div class="field">
          <label for="notes">Field notes</label>
          <textarea id="notes" placeholder="One honest line from today">${escapeHtml(day.notes)}</textarea>
        </div>
        <button class="primary" data-action="complete-focus">Auto-fill Focus Day</button>
      </aside>
    </section>
  `;
}

function habitsView() {
  const categories = ["All", ...new Set(habits.map((h) => h.category))];
  const summary = summarize();
  const rows = summary.habitRates.filter((r) => state.habitFilter === "All" || r.category === state.habitFilter);
  return `
    <section class="panel">
      <div class="panel-title">
        <h3>Habit Matrix</h3>
        <select id="habit-filter">
          ${categories.map((c) => `<option ${c === state.habitFilter ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </div>
      ${habitBars(rows)}
    </section>
  `;
}

function aiView() {
  return `
    <section class="grid ai-layout">
      <div class="panel">
        <div class="panel-title">
          <h3>Coach Controls</h3>
          <span class="small">${state.config.hasGeminiKey ? "Gemini connected" : "Add .env to connect Gemini"}</span>
        </div>
        <div class="grid">
          <button class="primary" data-action="ask-plan">Today's Plan</button>
          <button class="secondary" data-action="ask-review">Weekly Review</button>
          <button class="secondary" data-action="ask-warning">Find My Biggest Risk</button>
          <button class="secondary" data-action="ask-reward">Reward Recommendation</button>
        </div>
        <p class="small">The AI prompt includes only your tracker summary and recent logs. Secrets from your environment are never sent as tracker content.</p>
      </div>
      <div class="panel">
        <div class="panel-title">
          <h3>AI Coach</h3>
          <span class="small">${state.config.model}</span>
        </div>
        <div class="chat-box">
          ${state.aiMessages.map((m) => `<div class="message ${m.role}">${escapeHtml(m.text)}</div>`).join("")}
        </div>
        <div class="chat-input">
          <input id="chat-text" class="secondary" placeholder="Ask about sleep, DSA, screen time, food, budget, or discipline..." />
          <button class="primary" data-action="send-chat">Send</button>
        </div>
      </div>
    </section>
  `;
}

function weeklyView() {
  const rows = summarize().habitRates;
  return `
    <section class="panel">
      <div class="panel-title">
        <h3>Weekly Breakdown</h3>
        <span class="small">Weeks 1-4 from the 30-day season</span>
      </div>
      <table class="table">
        <thead><tr><th>Habit</th><th>Wk 1</th><th>Wk 2</th><th>Wk 3</th><th>Wk 4</th><th>Trend</th><th>Analysis</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
                <td><strong>${r.name}</strong><br><span class="small">${r.category}</span></td>
                ${r.weeks.map((w) => `<td>${w}/7</td>`).join("")}
                <td>${r.weeks[3] > r.weeks[0] ? "Up" : r.weeks[3] < r.weeks[0] ? "Down" : "Steady"}</td>
                <td>${analysis(r.rate)}</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function rewardsView() {
  return `
    <section class="grid rewards">
      ${rewards
        .map(
          ([tier, score, detail]) => `<div class="reward">
            <strong>${tier} - ${score}</strong>
            <p class="small">${detail}</p>
          </div>`,
        )
        .join("")}
    </section>
  `;
}

function habitCard(habit, day) {
  const value = day.statuses[habit.id] || "";
  const options = [
    ["done", "Done"],
    ["partial", "Partial"],
    ["missed", "Missed"],
  ];
  return `
    <article class="habit-card">
      <div class="habit-head">
        <strong>${habit.name}</strong>
        <span class="category">${habit.category}</span>
      </div>
      <div class="segmented">
        ${options
          .map(
            ([status, label]) => `<button data-habit="${habit.id}" data-status="${status}" class="${value === status ? status : ""}" title="${label}">${label}</button>`,
          )
          .join("")}
      </div>
      <span class="small">${habitHint(habit.category)}</span>
    </article>
  `;
}

function metric(label, value, delta) {
  return `<article class="metric"><div class="label">${label}</div><div class="value">${value}</div><div class="delta">${delta}</div></article>`;
}

function habitBars(rows) {
  if (!rows.length) return `<div class="empty">No habits match this filter.</div>`;
  return rows
    .map(
      (r) => `<div class="bar-row">
        <strong>${r.name}</strong>
        <div class="bar"><span style="--w:${Math.round(r.rate * 100)}%"></span></div>
        <span>${Math.round(r.rate * 100)}%</span>
      </div>`,
    )
    .join("");
}

function sparkline(values) {
  const width = 640;
  const height = 180;
  const max = 26;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * width;
      const y = height - (Math.max(0, v) / max) * (height - 20) - 10;
      return `${x},${y}`;
    })
    .join(" ");
  return `
    <svg class="spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="Score trend">
      <defs>
        <linearGradient id="line" x1="0" x2="1">
          <stop offset="0%" stop-color="#1f8a5b"/>
          <stop offset="100%" stop-color="#286fb7"/>
        </linearGradient>
      </defs>
      <polyline points="${points}" fill="none" stroke="url(#line)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      ${values
        .map((v, i) => {
          const x = (i / Math.max(1, values.length - 1)) * width;
          const y = height - (Math.max(0, v) / max) * (height - 20) - 10;
          return `<circle cx="${x}" cy="${y}" r="4" fill="#17211d"/>`;
        })
        .join("")}
    </svg>
  `;
}

function todaySnapshot() {
  const day = getDay(state.selectedDate);
  const done = Object.values(day.statuses).filter((s) => s === "done").length;
  const missed = Object.values(day.statuses).filter((s) => s === "missed").length;
  const partial = Object.values(day.statuses).filter((s) => s === "partial").length;
  return `
    ${habitBars([
      { name: "Done", rate: done / habits.length },
      { name: "Partial", rate: partial / habits.length },
      { name: "Missed", rate: missed / habits.length },
      { name: "Screen Bonus", rate: (screenScore(day.screenTime) + 2) / 4 },
    ])}
  `;
}

function bind() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  document.querySelector("#date-picker")?.addEventListener("change", (event) => {
    state.selectedDate = event.target.value;
    ensureDay(state.selectedDate);
    render();
  });

  document.querySelectorAll("[data-habit]").forEach((button) => {
    button.addEventListener("click", () => {
      const day = getDay(state.selectedDate);
      day.statuses[button.dataset.habit] =
        day.statuses[button.dataset.habit] === button.dataset.status ? "" : button.dataset.status;
      saveData();
      render();
    });
  });

  document.querySelector("#screen-time")?.addEventListener("input", (event) => {
    getDay(state.selectedDate).screenTime = event.target.value;
    saveData();
    render();
  });

  document.querySelector("#spend")?.addEventListener("input", (event) => {
    getDay(state.selectedDate).spend = Number(event.target.value || 0);
    saveData();
  });

  document.querySelector("#notes")?.addEventListener("input", (event) => {
    getDay(state.selectedDate).notes = event.target.value;
    saveData();
  });

  document.querySelector("#habit-filter")?.addEventListener("change", (event) => {
    state.habitFilter = event.target.value;
    render();
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => action(button.dataset.action));
  });

  document.querySelector("#import-file")?.addEventListener("change", importData);
}

async function action(name) {
  if (name === "export") return exportData();
  if (name === "import") return document.querySelector("#import-file").click();
  if (name === "complete-focus") return completeFocusDay();
  if (name === "send-chat") return askAi(document.querySelector("#chat-text")?.value || "");
  if (name === "ask-plan") return askAi("Build my exact plan for the next 24 hours.");
  if (name === "ask-review") return askAi("Give me a weekly review and the one habit to fix first.");
  if (name === "ask-warning") return askAi("Find the biggest risk in my current pattern.");
  if (name === "ask-reward") return askAi("Based on my scores, recommend a reward or restraint protocol.");
}

function completeFocusDay() {
  const day = getDay(state.selectedDate);
  const focus = new Set(["dsa-topic", "placement-prep", "college-work-done", "2l-water", "documenting"]);
  habits.forEach((h) => {
    if (!day.statuses[h.id]) day.statuses[h.id] = focus.has(h.id) ? "done" : "partial";
  });
  day.notes ||= "Focus day: studies, hydration, documenting, and no zeroes.";
  saveData();
  render();
  toast("Focus day filled.");
}

async function askAi(message) {
  if (!message.trim()) return;
  state.view = "ai";
  state.aiMessages.push({ role: "user", text: message });
  state.aiMessages.push({ role: "ai", text: "Thinking through your tracker..." });
  render();

  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        summary: summarize(),
        recentDays: state.data.days.slice(-10),
      }),
    });
    const data = await res.json();
    state.aiMessages[state.aiMessages.length - 1] = {
      role: "ai",
      text: data.text || data.error || "No response.",
    };
  } catch {
    state.aiMessages[state.aiMessages.length - 1] = {
      role: "ai",
      text: "The local Gemini bridge could not be reached. Make sure the app is running through npm start.",
    };
  }
  render();
}

function summarize() {
  const dayScores = state.data.days.map(scoreDay);
  const avgScore = average(dayScores);
  const habitRates = habits
    .map((habit) => {
      const done = state.data.days.filter((d) => d.statuses[habit.id] === "done").length;
      const weeks = [0, 1, 2, 3].map((week) =>
        state.data.days
          .slice(week * 7, week * 7 + 7)
          .filter((d) => d.statuses[habit.id] === "done").length,
      );
      return {
        name: habit.name,
        category: habit.category,
        done,
        rate: done / state.data.days.length,
        weeks,
      };
    })
    .sort((a, b) => b.rate - a.rate);

  const today = getDay(state.selectedDate);
  return {
    bestScore: Math.max(...dayScores),
    avgScore,
    totalSpend: state.data.days.reduce((sum, d) => sum + Number(d.spend || 0), 0),
    workouts: countDone("workout-run"),
    sleep: countDone("sleep-7-8-hrs"),
    dsaDays: countDone("dsa-topic"),
    documenting: countDone("documenting"),
    avgScreen: average(state.data.days.map((d) => Number(d.screenTime || 0)).filter(Boolean)),
    completedToday: Object.values(today.statuses).filter((s) => s === "done").length,
    scoreSeries: dayScores,
    habitRates,
  };
}

function scoreDay(day) {
  const values = Object.values(day.statuses);
  const done = values.filter((s) => s === "done").length;
  const partial = values.filter((s) => s === "partial").length * 0.5;
  const missedPenalty = values.filter((s) => s === "missed").length * -0.5;
  const spendBonus = Number(day.spend || 0) < 100 ? 1 : 0;
  return done + partial + missedPenalty + spendBonus + screenScore(day.screenTime);
}

function screenScore(hours) {
  const value = Number(hours);
  if (!value) return 0;
  if (value <= 2) return 2;
  if (value <= 4) return 1;
  if (value <= 6) return 0;
  if (value <= 8) return -1;
  return -2;
}

function rank(score) {
  if (score >= 24) return "MVP";
  if (score >= 20) return "ALL-STAR";
  if (score >= 16) return "STARTER";
  if (score >= 11) return "ROOKIE";
  if (score >= 6) return "WARMING UP";
  return "RESET DAY";
}

function analysis(rate) {
  if (rate >= 0.85) return "Strong habit. Protect the trigger and keep stacking wins.";
  if (rate >= 0.55) return "Inconsistent. Make the start easier and attach it to a fixed time.";
  return "Rebuild from minimum viable action today.";
}

function habitHint(category) {
  const hints = {
    Health: "Energy first. Make it visible and repeatable.",
    Nutrition: "Clean fuel compounds quietly.",
    Wellness: "Evening cues decide tomorrow.",
    DSA: "One topic, two problems, no drama.",
    Placement: "Pick one area and go deep.",
  };
  return hints[category] || "Small win, logged honestly.";
}

function countDone(id) {
  return state.data.days.filter((d) => d.statuses[id] === "done").length;
}

function getDay(date) {
  ensureDay(date);
  return state.data.days.find((d) => d.date === date);
}

function ensureDay(date) {
  if (state.data.days.some((d) => d.date === date)) return;
  state.data.days.push({
    date,
    statuses: Object.fromEntries(habits.map((h) => [h.id, ""])),
    screenTime: "",
    spend: 0,
    notes: "",
  });
  state.data.days.sort((a, b) => a.date.localeCompare(b.date));
  saveData();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "slice-life-ai-data.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.data = JSON.parse(await file.text());
  saveData();
  render();
  toast("Data imported.");
}

function toast(text) {
  const root = document.querySelector("#toast-root");
  root.innerHTML = `<div class="toast">${text}</div>`;
  setTimeout(() => (root.innerHTML = ""), 2200);
}

function titleForView() {
  return {
    dashboard: "Dashboard",
    checkin: "Today Check-in",
    habits: "Habit Matrix",
    ai: "AI Coach",
    weekly: "Weekly Review",
    rewards: "Reward Protocol",
  }[state.view];
}

function average(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return 0;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}
