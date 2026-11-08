// Shared portal chrome: top bar, icon rail, Personal/Student menus, icons, search and small helpers.
// Loaded with `defer`, so it runs before DOMContentLoaded and the agent always sees the full page.
(() => {
  const ICONS = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h4.5v-6h4v6h4.5V9"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-4 3.4-6.3 7.5-6.3s7.5 2.3 7.5 6.3z"/>',
    book: '<path d="M2.5 5.5c2.8-1.6 6.3-1.6 9.5.6 3.2-2.2 6.7-2.2 9.5-.6v13.4c-2.8-1.5-6.3-1.5-9.5.6-3.2-2.1-6.7-2.1-9.5-.6z"/><path d="M12 6.1v13.4"/>',
    building: '<rect x="4" y="3.5" width="11" height="17" rx="1"/><path d="M15 9h4.5v11.5H15M7.5 7.5h1M11 7.5h1M7.5 11h1M11 11h1M7.5 14.5h1M11 14.5h1M8.5 20.5V18h2v2.5"/>',
    inventory: '<path d="M8.5 4h7l1.5 3h3v13.5H4V7h3z"/><circle cx="12.5" cy="13.5" r="3"/><path d="m14.7 15.7 2.6 2.6"/>',
    dots: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
    kebab: '<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
    bookmark: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.6 2.3 2.7-.7.7 2.7 2.7.7-.7 2.7 2.2 1.5-2.2 1.5.7 2.7-2.7.7-.7 2.7-2.7-.7L12 21.2l-1.6-2.3-2.7.7-.7-2.7-2.7-.7.7-2.7L2.8 12l2.2-1.5-.7-2.7 2.7-.7.7-2.7 2.7.7z"/>',
    chat: '<path d="M12 3.5c4.9 0 8.5 3.5 8.5 8s-3.6 8-8.5 8c-1.3 0-2.5-.2-3.6-.7L4 20l1.1-3.9A7.7 7.7 0 0 1 3.5 11.5c0-4.5 3.6-8 8.5-8z"/>',
    bell: '<path d="M6 16.5v-5.5a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
    inbox: '<path d="M3.5 13.5 6 5.5h12l2.5 8V19h-17z"/><path d="M3.5 13.5h5l1 2h5l1-2h5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    "arrow-left": '<path d="M20 12H4.5M10.5 6l-6 6 6 6"/>',
    "chevron-right": '<path d="m9 5 7 7-7 7"/>',
    "chevron-down": '<path d="m5 9 7 7 7-7"/>',
    flag: '<path d="M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11"/>',
    "check-circle": '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.1 1.1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.1-1.1"/>',
    cards: '<rect x="3" y="8" width="13.5" height="11.5" rx="1.5"/><path d="M7 8V5h14v11h-4.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4.5h6V7M3 12.5h18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    wallet: '<path d="M4 7.5h15.5v12H4z"/><path d="M4 7.5 15 4v3.5M15.5 13.5h4"/>',
    cap: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.5c3 2.2 8 2.2 11 0v-4.5M21.5 9.5v5"/>',
    receipt: '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
    star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.3"/><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3"/>',
    plane: '<path d="M3 13.5 21 6l-4.5 13-4-5.5z"/><path d="m12.5 13.5 8.5-7.5"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="m3.5 6.5 1.2 1.2 2-2.2M3.5 12l1.2 1.2 2-2.2M3.5 17.5l1.2 1.2 2-2.2"/>',
  };
  const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  const PERSONAL = [
    ["Career", "jobs.html"],
    ["Personal Information", "personal-info.html"],
    ["Benefits and Pay", "pay.html"],
    ["Expenses Hub", "expenses.html"],
    ["Time", "time.html"],
    ["Absence", "absence.html"],
    ["Performance", "performance.html"],
    ["Onboarding", "onboarding.html"],
    ["Payroll", "payroll.html"],
  ];
  const STUDENT = [
    ["Academics", "academics.html"],
    ["Finances", "finances.html"],
  ];
  // Pages the search box can jump to.
  const PAGES = [["Home", "index.html"], ["Grades", "grades.html"], ["Courses", "academics.html#courses"],
    ["Calendar", "academics.html#calendar"], ["Jobs", "jobs.html"], ["Payslips", "payroll.html#payslips"],
    ...PERSONAL, ...STUDENT];

  const body = document.body;
  const section = body.dataset.section || "";
  const isHome = body.dataset.page === "home";

  const menu = (title, items) =>
    `<div class="flyout" hidden><h3 class="flyout-title">${title}</h3>` +
    items.map(([name, href]) => `<a href="${href}">${name}</a>`).join("") + "</div>";
  const note = (title, text) => `<div class="flyout" hidden><h3 class="flyout-title">${title}</h3><p>${text}</p></div>`;
  const railButton = (key, label, ic, flyout) =>
    `<div class="rail-group"><button type="button" class="rail-item${section === key ? " active" : ""}" data-flyout>` +
    `<span class="rail-icon">${icon(ic)}</span><span class="rail-label">${label}</span></button>${flyout}</div>`;

  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = `
    <div class="demo-stripe">Demo portal · Demo University is fictional · all data is fake</div>
    <div class="topbar">
      <a class="logo" href="index.html" aria-label="Demo University home">
        <svg viewBox="0 0 28 32" aria-hidden="true">
          <path d="M2 2h24v14c0 8-6 12.5-12 14C8 28.5 2 24 2 16z" fill="#862633"/>
          <path d="M5 5h18v11c0 6.2-4.6 9.8-9 11-4.4-1.2-9-4.8-9-11z" fill="none" stroke="#e7b84a" stroke-width="1.4"/>
          <path d="M10 9.5h3.6c3 0 5 2 5 5.2s-2 5.3-5 5.3H10zm2.2 2v6.5h1.3c1.8 0 2.9-1.2 2.9-3.3s-1.1-3.2-2.9-3.2z" fill="#fff"/>
        </svg>
        <span class="wordmark"><b>Demo University</b><small>STUDENT PORTAL</small></span>
      </a>
      <div class="top-search">${isHome ? "" : `<form class="search" role="search" data-search>${icon("search")}<input type="search" placeholder="Search" aria-label="Search"></form>`}</div>
      <div class="top-actions">
        <button type="button" class="icon-btn" aria-label="Messages" data-demo>${icon("chat")}</button>
        <button type="button" class="icon-btn" aria-label="Notifications" data-demo>${icon("bell")}<span class="count">6</span></button>
        <button type="button" class="icon-btn" aria-label="Inbox" data-demo>${icon("inbox")}</button>
        <button type="button" class="avatar" aria-label="Alex Rivera profile" data-demo>AR</button>
      </div>
    </div>`;

  const rail = document.createElement("nav");
  rail.className = "rail";
  rail.setAttribute("aria-label", "Main menu");
  rail.innerHTML =
    `<div class="rail-group"><a class="rail-item${section === "home" ? " active" : ""}" href="index.html">` +
    `<span class="rail-icon">${icon("home")}</span><span class="rail-label">Home</span></a></div>` +
    railButton("personal", "Personal", "user", menu("Personal", PERSONAL)) +
    railButton("student", "Student", "book", menu("Student", STUDENT)) +
    railButton("organization", "Organization", "building", note("Organization", "Not part of the demo portal.")) +
    railButton("inventory", "Inventory", "inventory", note("Inventory", "Not part of the demo portal.")) +
    railButton("more", "More", "dots", note("More", "Not part of the demo portal.")) +
    '<div class="rail-spacer"></div>' +
    railButton("saved", "Saved", "bookmark", note("Saved", "Nothing saved yet.")) +
    railButton("settings", "", "gear", note("Settings", "Not part of the demo portal."));
  rail.querySelector(".rail-group:last-child .rail-item").setAttribute("aria-label", "Settings");

  const shell = document.createElement("div");
  shell.className = "shell";
  const main = document.querySelector("main");
  shell.append(rail);
  if (main) shell.append(main);
  body.prepend(header, shell);

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.hidden = true;
  body.append(toast);
  let toastTimer;
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 2600);
  };

  // Icons placed in page markup as <i data-icon="name"></i>.
  document.querySelectorAll("i[data-icon]").forEach((el) => (el.outerHTML = icon(el.dataset.icon)));

  // Rail menus: click to open, click elsewhere or Escape to close.
  const closeAll = () => {
    document.querySelectorAll(".flyout").forEach((f) => (f.hidden = true));
    document.querySelectorAll(".rail-item.open").forEach((b) => b.classList.remove("open"));
  };
  document.querySelectorAll("[data-flyout]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const flyout = btn.nextElementSibling;
      const wasOpen = !flyout.hidden;
      closeAll();
      if (!wasOpen) {
        flyout.hidden = false;
        btn.classList.add("open");
      }
    });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".flyout")) closeAll();
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeAll());

  // Show/hide toggles ("More (5)", "Actions To Do").
  document.querySelectorAll("[data-toggle]").forEach((btn) => {
    const original = btn.textContent;
    btn.addEventListener("click", () => {
      const target = btn.nextElementSibling;
      target.hidden = !target.hidden;
      btn.setAttribute("aria-expanded", String(!target.hidden));
      if (btn.classList.contains("more")) btn.textContent = target.hidden ? original : "Show less";
    });
  });

  // Links and buttons that are part of the look but have nothing behind them.
  document.querySelectorAll("[data-demo]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showToast(el.dataset.demo || "This isn't part of the demo portal.");
    }),
  );

  // Simple forms on the demo pages: show a confirmation, send nothing.
  document.querySelectorAll("form[data-confirm]").forEach((form) =>
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const out = form.querySelector(".status");
      if (out) out.textContent = form.dataset.confirm;
    }),
  );

  // Search: jump to the first page whose name matches.
  document.querySelectorAll("form[data-search]").forEach((form) =>
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = form.querySelector("input").value.trim().toLowerCase();
      if (!q) return;
      const hit = PAGES.find(([name]) => name.toLowerCase().includes(q) || q.includes(name.toLowerCase()));
      if (hit) location.href = hit[1];
      else showToast(`No results for "${q}" in the demo portal.`);
    }),
  );

  // Today's date on the home page, e.g. "Sunday, November 8th".
  document.querySelectorAll("[data-today]").forEach((el) => {
    const d = new Date();
    const n = d.getDate();
    const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    const month = d.toLocaleDateString("en-US", { month: "long" });
    el.textContent = `${weekday}, ${month} ${n}${suffix}`;
  });
})();
