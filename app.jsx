const { useEffect, useMemo, useState } = React;

const HABITS = [
  ["Sleep 7-8 hrs", "Recovery"],
  ["Hot Water AM", "Recovery"],
  ["Nuts AM", "Health"],
  ["Workout / Run", "Health"],
  ["10K Steps", "Health"],
  ["2L Water", "Health"],
  ["Protein", "Health"],
  ["Sandhya Vandanam", "Spirit"],
  ["100% Attendance", "College"],
  ["College Work Done", "College"],
  ["DSA Topic", "Career"],
  ["Placement Prep", "Career"],
  ["Breakfast", "Nutrition"],
  ["Lunch", "Nutrition"],
  ["Dinner", "Nutrition"],
  ["No Junk Food", "Nutrition"],
  ["Hot Water PM", "Recovery"],
  ["Skin Care", "Wellness"],
  ["Watch 1 TV Episode", "Wellness"],
  ["Sleep By 10:30 PM", "Recovery"],
  ["No Fap", "Discipline"],
  ["Female Interaction", "Social"],
  ["Documenting", "Creation"],
].map(([name, category]) => ({ id: slug(name), name, category }));

const NAV = [
  ["dashboard", "Dashboard", "dashboard"],
  ["today", "Today", "check"],
  ["habits", "Habits", "grid"],
  ["coach", "Coach", "spark"],
  ["review", "Review", "chart"],
  ["rewards", "Rewards", "gift"],
];

const REWARDS = [
  ["MVP", "24+", "Big splurge day. You earned the win."],
  ["ALL-STAR", "20-23", "New gear, book, or favorite restaurant."],
  ["STARTER", "16-19", "Movie night and a guilt-free treat."],
  ["ROOKIE", "11-15", "No reward yet. Push for Starter."],
  ["WARMING UP", "6-10", "Back to fundamentals. Keep showing up."],
  ["RESET DAY", "< 6", "One honest note, then reset tomorrow."],
];

function App() {
  const [view, setView] = useState("dashboard");
  const [date, setDate] = useState("2026-09-07");
  const [data, setData] = useState(loadData);
  const [config, setConfig] = useState({ hasGeminiKey: null, hasMongo: null, model: "gemini-2.5-flash" });
  const [deviceSyncCode] = useState(getDeviceSyncCode);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Checking cloud backup...");
  const [filter, setFilter] = useState("All");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Log today and ask me for a plan, a warning, or a weekly reset. I will coach from your tracker data.",
    },
  ]);

  useEffect(() => {
    localStorage.setItem("slice-life-ai:react-v2", JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    let active = true;
    let retryTimer;

    async function loadConfig() {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) throw new Error("Configuration request failed.");
        const nextConfig = await response.json();
        if (active) setConfig(nextConfig);
      } catch {
        if (active) retryTimer = window.setTimeout(loadConfig, 5000);
      }
    }

    loadConfig();
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
    };
  }, []);

  useEffect(() => {
    if (config.hasMongo !== true) {
      setCloudReady(false);
      setSyncStatus(config.hasMongo === false ? "Cloud backup is unavailable." : "Checking cloud backup...");
      return;
    }

    let active = true;
    async function restoreCloudData() {
      setSyncStatus("Syncing your tracker...");
      try {
        const response = await fetch("/api/sync/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ syncCode: deviceSyncCode }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Cloud sync failed.");
        if (!active) return;
        if (payload.data) setData(payload.data);
        setCloudReady(true);
        setSyncStatus(payload.data ? `Synced ${formatSavedAt(payload.savedAt)}.` : "Auto-save is ready.");
      } catch (error) {
        if (active) setSyncStatus(error.message || "Cloud sync failed.");
      }
    }

    restoreCloudData();
    return () => {
      active = false;
    };
  }, [config.hasMongo, deviceSyncCode]);

  useEffect(() => {
    if (!cloudReady || config.hasMongo !== true) return;

    const saveTimer = window.setTimeout(async () => {
      setSyncStatus("Saving changes...");
      try {
        const response = await fetch("/api/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ syncCode: deviceSyncCode, data }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Cloud save failed.");
        setSyncStatus(`Saved ${formatSavedAt(payload.savedAt)}.`);
      } catch (error) {
        setSyncStatus(error.message || "Cloud save failed.");
      }
    }, 900);

    return () => window.clearTimeout(saveTimer);
  }, [cloudReady, config.hasMongo, data, deviceSyncCode]);

  const selectedDay = useMemo(() => ensureDay(data, date), [data, date]);
  const summary = useMemo(() => summarize(data, selectedDay), [data, selectedDay]);

  function chooseDate(nextDate) {
    setDate(nextDate);
    setData((current) => {
      if (current.days.some((day) => day.date === nextDate)) return current;
      return {
        days: [
          ...current.days,
          {
            date: nextDate,
            statuses: Object.fromEntries(HABITS.map((habit) => [habit.id, ""])),
            screenTime: "",
            spend: 0,
            notes: "",
          },
        ].sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
  }

  function updateDay(patch) {
    setData((current) => ({
      days: current.days.map((day) => (day.date === date ? { ...day, ...patch } : day)),
    }));
  }

  function setHabit(id, status) {
    updateDay({
      statuses: {
        ...selectedDay.statuses,
        [id]: selectedDay.statuses[id] === status ? "" : status,
      },
    });
  }

  async function askCoach(prompt) {
    const text = prompt?.trim();
    if (!text) return;
    setView("coach");
    setMessages((items) => [
      ...items,
      { role: "user", text },
      { role: "assistant", text: "Reading the scoreboard..." },
    ]);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          summary,
          recentDays: data.days.slice(-10),
        }),
      });
      const payload = await res.json();
      setMessages((items) => [
        ...items.slice(0, -1),
        { role: "assistant", text: payload.text || payload.error || "No response." },
      ]);
    } catch {
      setMessages((items) => [
        ...items.slice(0, -1),
        { role: "assistant", text: "The local Gemini bridge is not reachable. Start the app with npm.cmd start." },
      ]);
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
    setData(JSON.parse(await file.text()));
  }

  return (
    <div className="min-h-screen text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1500px] grid-cols-1 lg:grid-cols-[268px_1fr]">
        <aside className="app-sidebar border-line/90 bg-paper/80 p-4 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:border-r">
          <div className="mb-7 flex items-center gap-3 rounded-lg border border-line bg-white/70 p-3">
            <img
              src="./assets/sliceoflife-icon.png"
              alt="Slice of Life mark"
              className="h-11 w-11 rounded-md object-cover"
            />
            <div>
              <h1 className="text-lg font-black tracking-normal">Slice of Life</h1>
              <p className="text-xs font-medium text-stone-500">Personal operating system</p>
            </div>
          </div>

          <nav className="app-nav grid grid-cols-2 gap-2 lg:grid-cols-1">
            {NAV.map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex h-11 items-center gap-3 rounded-md px-3 text-left text-sm font-bold transition ${
                  view === id ? "bg-ink text-white shadow-sm" : "text-stone-700 hover:bg-white"
                }`}
              >
                <span
                  className={`grid h-7 w-7 place-items-center rounded-md text-xs font-black ${
                    view === id ? "bg-white/15 text-white" : "bg-stone-100 text-stone-700"
                  }`}
                >
                  <NavIcon name={icon} />
                </span>
                {label}
              </button>
            ))}
          </nav>

          <div className="app-gemini mt-7 rounded-lg border border-line bg-white/75 p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-black uppercase text-stone-500">Gemini</span>
              <span className={`h-2.5 w-2.5 rounded-full ${config.hasGeminiKey ? "bg-moss" : "bg-amber"}`} />
            </div>
            <p className="text-xs leading-5 text-stone-600">
              {config.hasGeminiKey === null
                ? "Checking AI connection..."
                : config.hasGeminiKey
                  ? `Connected to ${config.model}`
                  : "Add .env to activate AI coaching."}
            </p>
          </div>

          <div className="app-data-actions mt-3 grid gap-2">
            <button onClick={exportData} className="h-10 rounded-md border border-line bg-white text-sm font-bold">
              Export JSON
            </button>
            <label className="grid h-10 cursor-pointer place-items-center rounded-md border border-line bg-white text-sm font-bold">
              Import JSON
              <input hidden type="file" accept="application/json" onChange={importData} />
            </label>
          </div>
          <div className="app-sync mt-7 rounded-lg border border-line bg-white/75 p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-black uppercase text-stone-500">Auto-save</span>
              <span className={`h-2.5 w-2.5 rounded-full ${cloudReady ? "bg-moss" : "bg-amber"}`} />
            </div>
            <p className="text-xs leading-5 text-stone-600">{syncStatus}</p>
          </div>
        </aside>

        <main className="min-w-0 p-4 sm:p-6 lg:p-8">
          <Header view={view} date={date} setDate={chooseDate} selectedDay={selectedDay} summary={summary} askCoach={askCoach} />
          {view === "dashboard" && <Dashboard summary={summary} selectedDay={selectedDay} askCoach={askCoach} />}
          {view === "today" && <Today selectedDay={selectedDay} setHabit={setHabit} updateDay={updateDay} />}
          {view === "habits" && <Habits summary={summary} filter={filter} setFilter={setFilter} />}
          {view === "coach" && <Coach messages={messages} askCoach={askCoach} config={config} />}
          {view === "review" && <Review rows={summary.habitRates} />}
          {view === "rewards" && <Rewards avg={summary.avgScore} />}
        </main>
      </div>
    </div>
  );
}

function Header({ view, date, setDate, selectedDay, summary, askCoach }) {
  const titles = {
    dashboard: "Dashboard",
    today: "Today check-in",
    habits: "Habit system",
    coach: "AI coach",
    review: "Weekly review",
    rewards: "Reward protocol",
  };

  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
      <div className="mobile-brand hidden items-center gap-2">
        <img src="./assets/sliceoflife-icon.png" alt="" className="h-7 w-7 rounded-md object-cover" />
        <span className="text-sm font-black tracking-tight">Slice of Life</span>
      </div>
      <div>
        <p className="mb-2 text-xs font-black uppercase text-stone-500">Season starts Sep 7, 2026</p>
        <h2 className="text-4xl font-black tracking-normal text-ink md:text-5xl">{titles[view]}</h2>
        <p className="mt-2 text-sm text-stone-600">
          {formatDate(date)} - {rank(scoreDay(selectedDay))} - {summary.completedToday}/{HABITS.length} complete
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="h-11 rounded-md border border-line bg-white px-3 text-sm font-bold"
        />
        <button
          onClick={() => askCoach("Build my exact plan for the next 24 hours.")}
          className="h-11 rounded-md bg-ink px-4 text-sm font-black text-white"
        >
          Ask AI Plan
        </button>
      </div>
    </header>
  );
}

function NavIcon({ name }) {
  const paths = {
    dashboard: "M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-3H4v3Zm10-12h6V4h-6v4Z",
    check: "m5 12 4 4L19 6",
    grid: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",
    spark: "m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm6 14 .8 2.2L21 20l-2.2.8L18 23l-.8-2.2L15 20l2.2-.8L18 17Z",
    chart: "M4 19V5m0 14h16M8 16v-4m4 4V8m4 8v-7",
    gift: "M20 12v8H4v-8m-1-4h18v4H3V8Zm9 0v12M12 8H8.5a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8Zm0 0h3.5a2.5 2.5 0 1 0 0-5C13 3 12 8 12 8Z",
  };
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function Dashboard({ summary, selectedDay, askCoach }) {
  const weak = summary.habitRates.slice(-6);

  return (
    <div className="dashboard-view grid gap-4">
      <section className="app-metrics grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Best day" value={summary.bestScore.toFixed(1)} detail="Highest daily score" />
        <Metric label="Average" value={summary.avgScore.toFixed(1)} detail={`${rank(summary.avgScore)} pace`} />
        <Metric label="Spend" value={`Rs ${summary.totalSpend}`} detail="Budget awareness" />
        <Metric label="Workouts" value={summary.workouts} detail="Training days" />
        <Metric label="Screen avg" value={`${summary.avgScreen.toFixed(1)}h`} detail="Lower is better" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Performance curve" action="30-day season">
          <div className="grid gap-5 lg:grid-cols-[220px_1fr] lg:items-center">
            <ScoreDial value={summary.avgScore} />
            <Spark values={summary.scoreSeries} />
          </div>
        </Panel>

        <Panel title="Today's posture" action={rank(scoreDay(selectedDay))}>
          <div className="space-y-3">
            <Progress label="Done" value={summary.completedToday / HABITS.length} />
            <Progress label="Screen bonus" value={(screenScore(selectedDay.screenTime) + 2) / 4} />
            <Progress label="Budget bonus" value={Number(selectedDay.spend || 0) < 100 ? 1 : 0} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Weakest links" action="highest leverage">
          <div className="space-y-3">{weak.map((item) => <Progress key={item.name} label={item.name} value={item.rate} />)}</div>
        </Panel>
        <Panel title="Coach brief" action="Gemini-ready">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              "Give me a strict study reset.",
              "What habit is silently hurting me?",
              "Make a low-screen evening plan.",
            ].map((prompt) => (
              <button
                key={prompt}
                onClick={() => askCoach(prompt)}
                className="rounded-md border border-line bg-fog p-4 text-left text-sm font-bold leading-5 hover:bg-white"
              >
                {prompt}
              </button>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Today({ selectedDay, setHabit, updateDay }) {
  return (
      <section className="today-view grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel title="Daily board" action="23 habits">
        <div className="habit-board grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {HABITS.map((habit) => (
            <article key={habit.id} className="rounded-lg border border-line bg-white p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black leading-5">{habit.name}</h3>
                  <p className="mt-1 text-xs font-bold uppercase text-stone-500">{habit.category}</p>
                </div>
                <span className="rounded-md bg-fog px-2 py-1 text-xs font-black">{selectedDay.statuses[habit.id] || "-"}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["done", "Done"],
                  ["partial", "Half"],
                  ["missed", "Miss"],
                ].map(([status, label]) => (
                  <button
                    key={status}
                    onClick={() => setHabit(habit.id, status)}
                    className={`h-9 rounded-md border text-xs font-black ${
                      selectedDay.statuses[habit.id] === status
                        ? status === "done"
                          ? "border-moss bg-moss text-white"
                          : status === "partial"
                            ? "border-amber bg-amber text-white"
                            : "border-clay bg-clay text-white"
                        : "border-line bg-fog text-stone-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Scorecard" action={rank(scoreDay(selectedDay))}>
        <div className="mb-5">
          <div className="text-7xl font-black">{scoreDay(selectedDay).toFixed(1)}</div>
          <p className="mt-1 text-sm font-medium text-stone-600">Max practical score is about 26.</p>
        </div>
        <div className="space-y-4">
          <Field label="Screen time hours">
            <input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={selectedDay.screenTime}
              onChange={(event) => updateDay({ screenTime: event.target.value })}
              className="h-11 w-full rounded-md border border-line bg-white px-3"
            />
          </Field>
          <Field label="Spend Rs">
            <input
              type="number"
              min="0"
              value={selectedDay.spend}
              onChange={(event) => updateDay({ spend: Number(event.target.value || 0) })}
              className="h-11 w-full rounded-md border border-line bg-white px-3"
            />
          </Field>
          <Field label="Field notes">
            <textarea
              value={selectedDay.notes}
              onChange={(event) => updateDay({ notes: event.target.value })}
              placeholder="One honest line from today"
              className="min-h-32 w-full resize-y rounded-md border border-line bg-white p-3"
            />
          </Field>
        </div>
      </Panel>
    </section>
  );
}

function Habits({ summary, filter, setFilter }) {
  const categories = ["All", ...new Set(HABITS.map((h) => h.category))];
  const rows = summary.habitRates.filter((item) => filter === "All" || item.category === filter);

  return (
    <Panel title="Habit completion rates" action="sortable by performance">
      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={`h-9 rounded-md px-3 text-xs font-black ${
              filter === category ? "bg-ink text-white" : "border border-line bg-white text-stone-700"
            }`}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="habit-rate-grid grid gap-3 xl:grid-cols-2">
        {rows.map((item) => (
          <div key={item.name} className="rounded-lg border border-line bg-white p-3">
            <div className="mb-2 flex justify-between gap-4">
              <div>
                <strong>{item.name}</strong>
                <p className="text-xs font-bold uppercase text-stone-500">{item.category}</p>
              </div>
              <span className="font-black">{Math.round(item.rate * 100)}%</span>
            </div>
            <Progress label="30-day rate" value={item.rate} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Coach({ messages, askCoach, config }) {
  const [draft, setDraft] = useState("");

  function submit() {
    askCoach(draft);
    setDraft("");
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Panel title="Coach modes" action={config.hasGeminiKey === null ? "checking" : config.hasGeminiKey ? config.model : "offline"}>
        <div className="grid gap-2">
          {[
            "Build my exact plan for the next 24 hours.",
            "Find the biggest risk in my current pattern.",
            "Give me a weekly review and the one habit to fix first.",
            "Recommend a reward or restraint protocol.",
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => askCoach(prompt)}
              className="rounded-md border border-line bg-white p-3 text-left text-sm font-bold leading-5 hover:bg-fog"
            >
              {prompt}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Conversation" action="grounded in tracker data">
        <div className="mb-3 max-h-[56vh] min-h-[360px] space-y-3 overflow-auto rounded-lg border border-line bg-fog p-3">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`max-w-[88%] whitespace-pre-wrap rounded-lg p-3 text-sm leading-6 ${
                message.role === "user" ? "ml-auto bg-ink text-white" : "border border-line bg-white"
              }`}
            >
              {message.text}
            </div>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            placeholder="Ask about DSA, sleep, screen time, food, spend, or discipline..."
            className="h-12 rounded-md border border-line bg-white px-3"
          />
          <button onClick={submit} className="h-12 rounded-md bg-ink px-5 text-sm font-black text-white">
            Send
          </button>
        </div>
      </Panel>
    </section>
  );
}

function Review({ rows }) {
  return (
    <Panel title="Weekly breakdown" action="weeks 1-4">
      <div className="review-table-wrap max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[840px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-stone-500">
              <th className="py-3">Habit</th>
              <th>Wk 1</th>
              <th>Wk 2</th>
              <th>Wk 3</th>
              <th>Wk 4</th>
              <th>Trend</th>
              <th>Analysis</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-line">
                <td className="py-3">
                  <strong>{row.name}</strong>
                  <p className="text-xs text-stone-500">{row.category}</p>
                </td>
                {row.weeks.map((week, index) => (
                  <td key={index} className="font-bold">
                    {week}/7
                  </td>
                ))}
                <td className="font-bold">{row.weeks[3] > row.weeks[0] ? "Up" : row.weeks[3] < row.weeks[0] ? "Down" : "Stable"}</td>
                <td className="max-w-sm text-stone-600">{analysis(row.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Rewards({ avg }) {
  return (
    <div className="rewards-view grid gap-4">
      <Panel title="Current unlock" action={rank(avg)}>
        <div className="text-5xl font-black">{avg.toFixed(1)}</div>
        <p className="mt-2 text-sm text-stone-600">Monthly average score controls the reward. The app keeps rewards earned, not impulsive.</p>
      </Panel>
      <section className="rewards-grid grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {REWARDS.map(([tier, score, detail]) => (
          <article key={tier} className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <div className="mb-2 flex justify-between">
              <strong className="text-lg">{tier}</strong>
              <span className="rounded-md bg-fog px-2 py-1 text-xs font-black">{score}</span>
            </div>
            <p className="text-sm leading-6 text-stone-600">{detail}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="rounded-lg border border-line bg-paper/90 p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-lg font-black">{title}</h3>
        <span className="rounded-md bg-fog px-2.5 py-1 text-xs font-black uppercase text-stone-500">{action}</span>
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, detail }) {
  return (
    <article className="rounded-lg border border-line bg-paper p-4 shadow-sm">
      <p className="text-xs font-black uppercase text-stone-500">{label}</p>
      <div className="mt-3 text-3xl font-black">{value}</div>
      <p className="mt-1 text-xs font-medium text-stone-500">{detail}</p>
    </article>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-black uppercase text-stone-500">{label}</span>
      {children}
    </label>
  );
}

function Progress({ label, value }) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span className="font-bold">{label}</span>
        <span className="font-black">{percent}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-moss" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ScoreDial({ value }) {
  const percent = Math.max(0, Math.min(100, Math.round((value / 26) * 100)));
  return (
    <div className="mx-auto grid h-48 w-48 place-items-center rounded-full bg-[conic-gradient(#46624a_var(--p),#e5e0d7_0)]" style={{ "--p": `${percent}%` }}>
      <div className="grid h-32 w-32 place-items-center rounded-full bg-paper text-center">
        <div>
          <div className="text-4xl font-black">{percent}%</div>
          <p className="text-xs font-bold uppercase text-stone-500">Season pace</p>
        </div>
      </div>
    </div>
  );
}

function Spark({ values }) {
  const width = 720;
  const height = 220;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - (Math.max(0, value) / 26) * (height - 24) - 12;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
      <line x1="0" y1="176" x2={width} y2="176" stroke="#e4e0d6" />
      <line x1="0" y1="96" x2={width} y2="96" stroke="#e4e0d6" />
      <polyline points={points} fill="none" stroke="#315f72" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - (Math.max(0, value) / 26) * (height - 24) - 12;
        return <circle key={index} cx={x} cy={y} r="4" fill="#151917" />;
      })}
    </svg>
  );
}

function loadData() {
  const saved = localStorage.getItem("slice-life-ai:react-v2") || localStorage.getItem("slice-life-ai:v1");
  if (saved) return JSON.parse(saved);
  const start = new Date(2026, 8, 7);
  return {
    days: Array.from({ length: 30 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        date: isoDate(date),
        statuses: Object.fromEntries(HABITS.map((habit) => [habit.id, ""])),
        screenTime: "",
        spend: 0,
        notes: "",
      };
    }),
  };
}

function ensureDay(data, date) {
  const found = data.days.find((day) => day.date === date);
  if (found) return found;
  const day = {
    date,
    statuses: Object.fromEntries(HABITS.map((habit) => [habit.id, ""])),
    screenTime: "",
    spend: 0,
    notes: "",
  };
  data.days.push(day);
  data.days.sort((a, b) => a.date.localeCompare(b.date));
  return day;
}

function summarize(data, selectedDay) {
  const scores = data.days.map(scoreDay);
  const habitRates = HABITS.map((habit) => {
    const done = data.days.filter((day) => day.statuses[habit.id] === "done").length;
    const weeks = [0, 1, 2, 3].map((week) =>
      data.days.slice(week * 7, week * 7 + 7).filter((day) => day.statuses[habit.id] === "done").length,
    );
    return {
      ...habit,
      done,
      weeks,
      rate: done / data.days.length,
    };
  }).sort((a, b) => b.rate - a.rate);

  return {
    bestScore: Math.max(...scores),
    avgScore: average(scores),
    totalSpend: data.days.reduce((sum, day) => sum + Number(day.spend || 0), 0),
    workouts: countDone(data, "workout-run"),
    avgScreen: average(data.days.map((day) => Number(day.screenTime || 0)).filter(Boolean)),
    completedToday: Object.values(selectedDay.statuses).filter((status) => status === "done").length,
    scoreSeries: scores,
    habitRates,
  };
}

function scoreDay(day) {
  const values = Object.values(day.statuses || {});
  const done = values.filter((status) => status === "done").length;
  const partial = values.filter((status) => status === "partial").length * 0.5;
  const missed = values.filter((status) => status === "missed").length * -0.5;
  const spendBonus = Number(day.spend || 0) < 100 ? 1 : 0;
  return done + partial + missed + spendBonus + screenScore(day.screenTime);
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
  if (rate >= 0.85) return "Strong. Protect the trigger and keep the routine boringly repeatable.";
  if (rate >= 0.55) return "Usable, but not automatic yet. Attach it to a fixed time.";
  return "Needs a smaller starting version. Make the first step too easy to refuse.";
}

function countDone(data, id) {
  return data.days.filter((day) => day.statuses[id] === "done").length;
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatSavedAt(value) {
  if (!value) return "now";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function getDeviceSyncCode() {
  const existing = localStorage.getItem("slice-life-ai:device-sync-code") || localStorage.getItem("slice-life-ai:sync-code");
  if (existing && existing.length >= 12) return existing;
  const generated = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `slice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem("slice-life-ai:device-sync-code", generated);
  return generated;
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
