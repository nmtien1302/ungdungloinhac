/* ============================================================
   Lời Nhắc — app logic
   ============================================================ */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const todayISO = () => NLP.iso(new Date());
  const pad = n => String(n).padStart(2, "0");
  const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const DOW_LONG = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

  const state = {
    tasks: Store.load(),
    settings: Store.settings(),
    view: "list",
    list: "today",
    calDate: todayISO(),
    weekStart: null,
    search: "",
    editing: null,
    snoozing: null,
    placing: null, // untimed task being placed onto timeline (touch)
    timers: [],
  };
  if (!localStorage.getItem("loinhac.seeded")) {
    if (!state.tasks.length) state.tasks = Store.seed();
    localStorage.setItem("loinhac.seeded", "1");
    Store.save(state.tasks);
  }

  // ------------------------------------------------------------ helpers
  function persist() { Store.save(state.tasks); render(); scheduleNotifications(); }
  function fmtDate(isoStr, withDow = true) {
    if (!isoStr) return "";
    const d = new Date(isoStr + "T00:00:00");
    const t = todayISO();
    if (isoStr === t) return "Hôm nay";
    if (isoStr === NLP.iso(NLP.addDays(new Date(), 1))) return "Ngày mai";
    if (isoStr === NLP.iso(NLP.addDays(new Date(), -1))) return "Hôm qua";
    const base = `${d.getDate()}/${d.getMonth() + 1}`;
    return withDow ? `${DOW_LONG[d.getDay()]}, ${base}` : base;
  }
  function taskDT(t) {
    if (!t.date) return null;
    const d = new Date(t.date + "T00:00:00");
    if (t.time) { const [h, m] = t.time.split(":").map(Number); d.setHours(h, m); }
    else d.setHours(23, 59);
    return d;
  }
  function isLate(t) { return !t.done && t.date && taskDT(t) < new Date(); }
  function progress(t) {
    if (!t.subtasks || !t.subtasks.length) return null;
    return t.subtasks.filter(s => s.done).length / t.subtasks.length;
  }
  function toast(msg, undo) {
    const el = $("#toast");
    el.innerHTML = "";
    el.append(msg);
    if (undo) { const b = document.createElement("button"); b.textContent = "Hoàn tác"; b.onclick = () => { undo(); hide(); }; el.append(b); }
    el.hidden = false;
    clearTimeout(toast._t);
    const hide = () => { el.hidden = true; };
    toast._t = setTimeout(hide, undo ? 5000 : 2500);
  }
  function sortTasks(a, b) {
    const da = taskDT(a), db = taskDT(b);
    if (da && db) return da - db || (a.time ? -1 : 1);
    if (da) return -1; if (db) return 1;
    return a.createdAt - b.createdAt;
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ------------------------------------------------------------ render root
  function render() {
    renderHeader();
    if (state.view === "list") renderList(); else renderCalendar();
  }

  function renderHeader() {
    const t = $("#pageTitle"), s = $("#pageSub");
    const now = new Date();
    if (state.view === "calendar") {
      const cd = new Date(state.calDate + "T00:00:00");
      const rel = fmtDate(state.calDate);
      t.textContent = /^(Hôm nay|Ngày mai|Hôm qua)$/.test(rel) ? rel : DOW_LONG[cd.getDay()];
      s.textContent = `${cd.getDate()}/${cd.getMonth() + 1}/${cd.getFullYear()}`;
    } else {
      const names = { today: "Hôm nay", upcoming: "Sắp tới", all: "Tất cả", done: "Đã xong" };
      t.textContent = names[state.list];
      const open = state.tasks.filter(x => !x.done && x.date === todayISO()).length;
      s.textContent = state.list === "today"
        ? `${DOW_LONG[now.getDay()]}, ${now.getDate()}/${now.getMonth() + 1} · ${open ? open + " việc chưa xong" : "Không còn việc nào"}`
        : "";
    }
    $(".seg").dataset.active = state.view;
    $$(".seg-btn[data-view]").forEach(b => { const on = b.dataset.view === state.view; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on); });
    $$(".view").forEach(v => v.classList.toggle("is-active", v.dataset.view === state.view));
  }

  // ------------------------------------------------------------ list view
  function visibleTasks() {
    const t = todayISO();
    let list = state.tasks.slice();
    const q = state.search.trim().toLowerCase();
    if (q) return list.filter(x => [x.title, x.place, x.note].join(" ").toLowerCase().includes(q)).sort(sortTasks);
    switch (state.list) {
      case "today": list = list.filter(x => !x.done && x.date && x.date <= t); break;
      case "upcoming": list = list.filter(x => !x.done && (!x.date || x.date > t)); break;
      case "all": list = list.filter(x => !x.done); break;
      case "done": list = list.filter(x => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)); return list;
    }
    return list.sort(sortTasks);
  }

  function groupTasks(list) {
    const t = todayISO();
    const groups = new Map();
    const push = (k, x) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); };
    for (const x of list) {
      if (state.list === "done") push("Đã hoàn thành", x);
      else if (state.search) push("Kết quả", x);
      else if (state.list === "today") {
        if (x.date < t) push("Quá hạn", x);
        else if (!x.time) push("Trong ngày", x);
        else { const h = +x.time.slice(0, 2); push(h < 12 ? "Sáng" : h < 18 ? "Chiều" : "Tối", x); }
      } else if (!x.date) push("Chưa có ngày", x);
      else push(fmtDate(x.date), x);
    }
    return groups;
  }

  function renderList() {
    renderBrief();
    const wrap = $("#taskGroups");
    const list = visibleTasks();
    wrap.innerHTML = "";
    if (!list.length) {
      const msgs = {
        today: ["Hôm nay rảnh", "Gõ một câu ở ô bên dưới để thêm việc, ví dụ “Gọi mẹ tối nay”."],
        upcoming: ["Chưa có việc sắp tới", "Việc có ngày sau hôm nay hoặc chưa có ngày sẽ nằm ở đây."],
        all: ["Trống trơn", "Mọi việc chưa xong sẽ hiện ở đây."],
        done: ["Chưa hoàn thành việc nào", "Vuốt một việc sang phải để đánh dấu xong."],
      };
      const [b, p] = state.search ? ["Không tìm thấy", "Thử từ khoá khác."] : msgs[state.list];
      wrap.innerHTML = `<div class="empty"><b>${b}</b>${p}</div>`;
      return;
    }
    for (const [name, items] of groupTasks(list)) {
      const h = document.createElement("div"); h.className = "group-title"; h.textContent = name; wrap.append(h);
      const ul = document.createElement("ul"); ul.className = "task-list";
      items.forEach(x => ul.append(taskRow(x)));
      wrap.append(ul);
    }
  }

  function taskRow(t) {
    const li = document.createElement("li");
    li.className = `task kind-${t.kind}${t.done ? " is-done" : ""}`;
    li.dataset.id = t.id;
    const p = progress(t);
    const acts = NLP.detectActions(t.note);
    const meta = [];
    if (state.list !== "today" || isLate(t)) { if (t.date) meta.push(isLate(t) && !t.done ? `<span class="late">${fmtDate(t.date, false)}${t.time ? " " + t.time : ""} · quá hạn</span>` : fmtDate(t.date, false)); }
    if (t.place) meta.push(esc(t.place));
    if (t.duration) meta.push(t.duration + " phút");
    if (t.subtasks && t.subtasks.length) meta.push(`${t.subtasks.filter(s => s.done).length}/${t.subtasks.length} bước`);
    li.innerHTML = `
      <div class="task-under"><span class="u-done">Xong</span><span class="u-snooze">Để sau</span></div>
      <div class="task-card">
        <button class="check" aria-label="${t.done ? "Bỏ đánh dấu" : "Hoàn thành"}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>
        <div class="task-main">
          <div class="task-title">${esc(t.title)}</div>
          ${meta.length ? `<div class="task-meta">${meta.join(" · ")}</div>` : ""}
          ${p !== null ? `<div class="task-progress"><i style="width:${Math.round(p * 100)}%"></i></div>` : ""}
          ${acts.length ? `<div class="task-quick">${acts.map(a => `<a href="${esc(a.href)}" target="_blank" rel="noopener">${esc(a.label)}</a>`).join("")}</div>` : ""}
        </div>
        <div class="task-time">${t.time ? t.time : ""}</div>
      </div>`;
    const card = $(".task-card", li);
    $(".check", li).addEventListener("click", e => { e.stopPropagation(); toggleDone(t.id); });
    card.addEventListener("click", e => { if (e.target.closest("a")) return; openTask(t.id); });
    attachSwipe(li, card, () => toggleDone(t.id), () => openSnooze(t.id));
    return li;
  }

  // Vuốt phải = xong, vuốt trái = hoãn
  function attachSwipe(li, card, onRight, onLeft) {
    let x0 = 0, y0 = 0, dx = 0, active = false, locked = null;
    card.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; active = true; locked = null;
    });
    card.addEventListener("pointermove", e => {
      if (!active) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (locked === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) locked = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (locked !== "x") return;
      dx = Math.max(-140, Math.min(140, mx));
      li.classList.add("is-swiping");
      card.style.transform = `translateX(${dx}px)`;
      card.setPointerCapture(e.pointerId);
    });
    const end = () => {
      if (!active) return; active = false;
      li.classList.remove("is-swiping");
      card.style.transform = "";
      if (dx > 90) onRight(); else if (dx < -90) onLeft();
      if (Math.abs(dx) > 8) { card.dataset.swiped = "1"; setTimeout(() => delete card.dataset.swiped, 50); }
      dx = 0;
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
    card.addEventListener("click", e => { if (card.dataset.swiped) { e.stopImmediatePropagation(); } }, true);
  }

  function toggleDone(id) {
    const t = state.tasks.find(x => x.id === id); if (!t) return;
    t.done = !t.done; t.doneAt = t.done ? Date.now() : null;
    persist();
    if (t.done) toast("Đã xong: " + t.title, () => { t.done = false; t.doneAt = null; persist(); });
  }

  // ------------------------------------------------------------ briefing
  function renderBrief() {
    const el = $("#brief");
    const h = new Date().getHours();
    const t = todayISO();
    const open = state.tasks.filter(x => !x.done && x.date === t).sort(sortTasks);
    const late = state.tasks.filter(x => !x.done && x.date && x.date < t);
    const dismissed = sessionStorage.getItem("brief.dismissed") === t;
    if (state.list !== "today" || state.search || dismissed) { el.hidden = true; return; }
    el.hidden = false;
    if (h < 12 && state.settings.morningOn) {
      const top = open.slice(0, 3).map(x => `<b>${esc(x.title)}</b>${x.time ? " lúc " + x.time : ""}`);
      el.innerHTML = `<h3>Chào buổi sáng</h3><p>${open.length ? `Hôm nay có ${open.length} việc${late.length ? `, ${late.length} việc quá hạn` : ""}. Quan trọng nhất: ${top.join(", ")}.` : "Hôm nay chưa có việc nào. Thêm một việc để bắt đầu."}</p>
        <div class="brief-actions">${open.some(x => !x.time && x.duration) ? `<button class="btn" data-act="autoschedule">Xếp giờ cho việc chưa có giờ</button>` : ""}<button class="btn" data-act="dismiss">Ẩn</button></div>`;
    } else if (h >= 18 && state.settings.eveningOn) {
      const left = open.length + late.length;
      el.innerHTML = `<h3>Xem lại cuối ngày</h3><p>${left ? `Còn ${left} việc chưa xong. Dời sang ngày mai bằng một chạm?` : "Đã xong hết việc hôm nay. Nghỉ ngơi thôi."}</p>
        <div class="brief-actions">${left ? `<button class="btn" data-act="rollover">Dời sang mai</button>` : ""}<button class="btn" data-act="dismiss">Ẩn</button></div>`;
    } else { el.hidden = true; return; }
    $$("[data-act]", el).forEach(b => b.onclick = () => {
      if (b.dataset.act === "dismiss") { sessionStorage.setItem("brief.dismissed", t); renderBrief(); }
      if (b.dataset.act === "rollover") rollover();
      if (b.dataset.act === "autoschedule") autoSchedule();
    });
  }
  function rollover() {
    const t = todayISO(), tm = NLP.iso(NLP.addDays(new Date(), 1));
    const moved = state.tasks.filter(x => !x.done && x.date && x.date <= t);
    const prev = moved.map(x => [x, x.date]);
    moved.forEach(x => x.date = tm);
    persist();
    toast(`Đã dời ${moved.length} việc sang mai`, () => { prev.forEach(([x, d]) => x.date = d); persist(); });
  }

  // ------------------------------------------------------------ smart scheduling
  function busyBlocks(dateISO, exceptId) {
    return state.tasks.filter(x => x.date === dateISO && x.time && !x.done && x.id !== exceptId).map(x => {
      const [h, m] = x.time.split(":").map(Number); const s = h * 60 + m;
      return [s, s + (x.duration || 30), x];
    }).sort((a, b) => a[0] - b[0]);
  }
  function findSlot(dateISO, minutes, exceptId) {
    const [ws, we] = [state.settings.workStart, state.settings.workEnd].map(s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; });
    const now = new Date();
    let cursor = ws;
    if (dateISO === todayISO()) cursor = Math.max(ws, Math.ceil((now.getHours() * 60 + now.getMinutes() + 10) / 15) * 15);
    for (const [s, e] of busyBlocks(dateISO, exceptId)) {
      if (s - cursor >= minutes) break;
      cursor = Math.max(cursor, e + 10);
    }
    if (cursor + minutes > we) return null;
    return pad(Math.floor(cursor / 60)) + ":" + pad(cursor % 60);
  }
  function autoSchedule() {
    const t = todayISO();
    let n = 0;
    state.tasks.filter(x => !x.done && x.date === t && !x.time && x.duration).forEach(x => {
      const slot = findSlot(t, x.duration, x.id);
      if (slot) { x.time = slot; x.ai = { ...(x.ai || {}), suggestedSlot: slot }; n++; }
    });
    persist();
    toast(n ? `Đã xếp giờ cho ${n} việc dựa trên khoảng trống hôm nay` : "Không còn khoảng trống phù hợp trong giờ làm việc");
  }
  function conflictsFor(t) {
    if (!t.date || !t.time) return [];
    const [h, m] = t.time.split(":").map(Number); const s = h * 60 + m, e = s + (t.duration || 30);
    return busyBlocks(t.date, t.id).filter(([bs, be]) => bs < e && be > s).map(b => b[2]);
  }
  function warnConflict(t) {
    const c = conflictsFor(t);
    if (!c.length) return;
    const alt = findSlot(t.date, t.duration || 30, t.id);
    toast(`Trùng giờ với “${c[0].title}”${alt ? `. Gợi ý dời sang ${alt}` : ""}`, alt ? () => { t.time = alt; persist(); } : null);
    if (alt) $("#toast button").textContent = "Dời sang " + alt;
  }

  // ------------------------------------------------------------ calendar view
  function weekOf(isoStr) {
    const d = new Date(isoStr + "T00:00:00");
    const mon = NLP.addDays(d, -((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => NLP.iso(NLP.addDays(mon, i)));
  }
  function renderCalendar() {
    const days = weekOf(state.calDate);
    const d0 = new Date(days[0] + "T00:00:00"), d6 = new Date(days[6] + "T00:00:00");
    $("#calMonth").textContent = d0.getMonth() === d6.getMonth() ? `Tháng ${d0.getMonth() + 1}, ${d0.getFullYear()}` : `Th${d0.getMonth() + 1} – Th${d6.getMonth() + 1} ${d6.getFullYear()}`;
    const wk = $("#week"); wk.innerHTML = "";
    days.forEach(iso => {
      const d = new Date(iso + "T00:00:00");
      const b = document.createElement("button");
      b.className = "day" + (iso === todayISO() ? " is-today" : "") + (iso === state.calDate ? " is-sel" : "") + (state.tasks.some(x => x.date === iso && !x.done) ? " has" : "");
      b.innerHTML = `<small>${DOW[d.getDay()]}</small><b>${d.getDate()}</b><i class="dot"></i>`;
      b.onclick = () => { state.calDate = iso; render(); };
      wk.append(b);
    });

    // untimed tray
    const un = $("#untimed"); un.innerHTML = "";
    const untimed = state.tasks.filter(x => x.date === state.calDate && !x.time && !x.done);
    if (untimed.length) {
      un.innerHTML = `<div class="u-title">Việc trong ngày — kéo vào khung giờ để xếp lịch</div>`;
      untimed.forEach(x => {
        const el = document.createElement("div"); el.className = "u-item" + (state.placing === x.id ? " dragging" : ""); el.draggable = true;
        el.innerHTML = `<span class="check"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></span><span>${esc(x.title)}</span>`;
        el.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", x.id); state.placing = x.id; });
        el.addEventListener("dragend", () => { state.placing = null; });
        el.addEventListener("click", () => { state.placing = state.placing === x.id ? null : x.id; renderCalendar(); if (state.placing) toast("Chạm vào một khung giờ để xếp lịch"); });
        un.append(el);
      });
    }

    // timeline
    const H0 = 6, H1 = 23, PX = 56;
    const hours = $("#hours"), slots = $("#slots");
    if (!hours.childElementCount) {
      for (let h = H0; h <= H1; h++) {
        const e = document.createElement("div"); e.className = "hour"; e.textContent = pad(h) + ":00"; hours.append(e);
        const s = document.createElement("div"); s.className = "slot"; s.dataset.h = h; slots.append(s);
        s.addEventListener("dragover", ev => { ev.preventDefault(); s.classList.add("over"); });
        s.addEventListener("dragleave", () => s.classList.remove("over"));
        s.addEventListener("drop", ev => { ev.preventDefault(); s.classList.remove("over"); place(ev.dataTransfer.getData("text/plain"), h, ev); });
        s.addEventListener("click", ev => { if (state.placing) place(state.placing, h, ev); else quickCreateAt(h, ev); });
      }
    }
    $$(".ev", slots).forEach(e => e.remove());
    const dayTasks = state.tasks.filter(x => x.date === state.calDate && x.time);
    dayTasks.forEach(x => {
      const [h, m] = x.time.split(":").map(Number);
      const top = ((h - H0) * 60 + m) / 60 * PX;
      const height = Math.max(26, (x.duration || 30) / 60 * PX - 3);
      const el = document.createElement("div");
      el.className = "ev" + (x.kind === "todo" ? " todo" : "") + (x.done ? " is-done" : "") + (conflictsFor(x).length ? " conflict" : "");
      el.style.top = top + "px"; el.style.height = height + "px";
      el.innerHTML = `${esc(x.title)}<small>${x.time}${x.duration ? " · " + x.duration + "p" : ""}${x.place ? " · " + esc(x.place) : ""}</small>`;
      el.onclick = e => { e.stopPropagation(); openTask(x.id); };
      slots.append(el);
    });
    const nl = $("#nowLine");
    if (state.calDate === todayISO()) {
      const n = new Date(); const mins = (n.getHours() - H0) * 60 + n.getMinutes();
      nl.hidden = mins < 0; nl.style.top = (mins / 60 * PX) + "px";
      if (!renderCalendar._scrolled) { renderCalendar._scrolled = true; setTimeout(() => $("#viewCal").scrollTo({ top: Math.max(0, $("#timeline").offsetTop + mins / 60 * PX - 380) }), 50); }
    } else nl.hidden = true;
  }
  function minuteFromEvent(ev, h) {
    const r = ev.currentTarget.getBoundingClientRect();
    const frac = Math.min(.99, Math.max(0, (ev.clientY - r.top) / r.height));
    return Math.round(frac * 60 / 15) * 15;
  }
  function place(id, h, ev) {
    const t = state.tasks.find(x => x.id === id); if (!t) return;
    t.time = pad(h) + ":" + pad(minuteFromEvent(ev, h));
    t.duration = t.duration || 30;
    state.placing = null;
    persist(); warnConflict(t);
  }
  function quickCreateAt(h, ev) {
    const time = pad(h) + ":" + pad(minuteFromEvent(ev, h));
    openTask(null, { date: state.calDate, time, kind: "event", duration: 60 });
  }

  // ------------------------------------------------------------ quick add
  const qi = $("#quickInput"), qp = $("#quickPreview");
  function previewQuick() {
    const v = qi.value.trim();
    if (!v) { qp.hidden = true; return; }
    const p = NLP.parse(v);
    const bits = [`<b>${esc(p.title || "…")}</b>`];
    if (p.dateISO) bits.push(fmtDate(p.dateISO));
    if (p.time) bits.push(p.time);
    if (p.duration) bits.push(p.duration + " phút");
    if (p.place) bits.push("tại " + esc(p.place));
    bits.push(p.kind === "event" ? "sự kiện" : "việc cần làm");
    qp.innerHTML = bits.join("<span style='opacity:.5'> · </span>");
    qp.hidden = false;
  }
  qi.addEventListener("input", previewQuick);
  qi.addEventListener("keydown", e => { if (e.key === "Enter") addQuick(); if (e.key === "Escape") { qi.value = ""; previewQuick(); qi.blur(); } });
  $("#btnQuickAdd").addEventListener("click", addQuick);
  function addQuick(text) {
    const v = (typeof text === "string" ? text : qi.value).trim(); if (!v) { qi.focus(); return; }
    const parsed = v.length > 60 && /[,;\n]| và | rồi | sau đó /.test(v) ? NLP.parseMany(v) : [NLP.parse(v)];
    const created = parsed.map(p => createTask(p));
    qi.value = ""; previewQuick();
    if (created.length === 1) {
      const t = created[0];
      if (state.view === "calendar" && t.date) state.calDate = t.date;
      persist(); warnConflict(t);
      toast(`Đã thêm “${t.title}”${t.date ? " — " + fmtDate(t.date) + (t.time ? " " + t.time : "") : ""}`, () => { state.tasks = state.tasks.filter(x => x.id !== t.id); persist(); });
    } else { persist(); toast(`Đã tách thành ${created.length} việc`); }
  }
  function createTask(p) {
    const t = {
      id: Store.uid(), title: p.title, kind: p.kind || "todo", date: p.dateISO || p.date || null, time: p.time || null,
      duration: p.duration || (p.kind === "event" ? 60 : null), place: p.place || "", note: p.note || "",
      done: false, subtasks: [], createdAt: Date.now(),
    };
    state.tasks.push(t);
    return t;
  }

  // Voice
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("#btnVoice");
  if (!SR) mic.title = "Trình duyệt này không hỗ trợ nhận giọng nói";
  mic.addEventListener("click", () => {
    if (!SR) { toast("Trình duyệt này chưa hỗ trợ nhập bằng giọng nói"); return; }
    if (mic.rec) { mic.rec.stop(); return; }
    const rec = new SR(); rec.lang = "vi-VN"; rec.interimResults = true; rec.continuous = true;
    let final = "";
    rec.onresult = e => { let interim = ""; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) final += e.results[i][0].transcript + " "; else interim += e.results[i][0].transcript; } qi.value = final + interim; previewQuick(); };
    rec.onend = () => { mic.classList.remove("listening"); mic.rec = null; if (final.trim()) addQuick(final.trim()); };
    rec.onerror = () => { mic.classList.remove("listening"); mic.rec = null; toast("Không nghe được, thử lại nhé"); };
    rec.start(); mic.rec = rec; mic.classList.add("listening");
    toast("Đang nghe… nói nhiều việc cách nhau bằng “và” hoặc “rồi”");
  });

  // ------------------------------------------------------------ task sheet
  const sheet = $("#sheetTask");
  function openTask(id, preset) {
    state.editing = id ? state.tasks.find(x => x.id === id) : { id: null, title: "", kind: "todo", date: todayISO(), time: null, duration: null, place: "", note: "", done: false, subtasks: [], ...(preset || {}) };
    const t = state.editing;
    $("#tTitle").value = t.title; $("#tDate").value = t.date || ""; $("#tTime").value = t.time || "";
    $("#tDur").value = t.duration || ""; $("#tKind").value = t.kind; $("#tPlace").value = t.place || ""; $("#tNote").value = t.note || "";
    $("#btnDone").textContent = t.done ? "Mở lại" : "Hoàn thành";
    $("#btnDelete").hidden = !t.id; $("#btnDone").hidden = !t.id;
    renderActions(); renderSubs();
    sheet.hidden = false;
    if (!t.id) setTimeout(() => $("#tTitle").focus(), 100);
  }
  function renderActions() {
    const a = NLP.detectActions($("#tNote").value);
    $("#tActions").innerHTML = a.map(x => `<a href="${esc(x.href)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join("");
  }
  $("#tNote").addEventListener("input", renderActions);
  function renderSubs() {
    const ul = $("#tSubs"); ul.innerHTML = "";
    (state.editing.subtasks || []).forEach((s, i) => {
      const li = document.createElement("li"); li.className = "sub-item" + (s.done ? " done" : "");
      li.innerHTML = `<button class="check" aria-label="Xong"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button><span>${esc(s.title)}</span>${s.due ? `<small>${fmtDate(s.due, false)}</small>` : ""}<button class="x" aria-label="Xoá">×</button>`;
      $(".check", li).onclick = () => { s.done = !s.done; renderSubs(); };
      $(".x", li).onclick = () => { state.editing.subtasks.splice(i, 1); renderSubs(); };
      ul.append(li);
    });
  }
  $("#subForm").addEventListener("submit", e => {
    e.preventDefault(); const v = $("#subInput").value.trim(); if (!v) return;
    state.editing.subtasks.push({ title: v, due: null, done: false }); $("#subInput").value = ""; renderSubs();
  });
  $("#btnBreakdown").addEventListener("click", () => {
    const title = $("#tTitle").value.trim(); if (!title) { toast("Nhập tên việc trước đã"); return; }
    const steps = NLP.breakdown(title, $("#tDate").value || null);
    state.editing.subtasks = steps; state.editing.ai = { ...(state.editing.ai || {}), breakdownSource: "rule" };
    renderSubs(); toast(`Đã tách thành ${steps.length} bước — sửa tuỳ ý`);
  });
  function readSheet() {
    const t = state.editing;
    t.title = $("#tTitle").value.trim(); t.date = $("#tDate").value || null; t.time = $("#tTime").value || null;
    t.duration = +$("#tDur").value || null; t.kind = $("#tKind").value; t.place = $("#tPlace").value.trim(); t.note = $("#tNote").value.trim();
    return t;
  }
  $("#btnSave").addEventListener("click", () => {
    const t = readSheet();
    if (!t.title) { $("#tTitle").focus(); return; }
    if (!t.id) { t.id = Store.uid(); t.createdAt = Date.now(); state.tasks.push(t); }
    closeSheets(); persist(); warnConflict(t);
  });
  $("#btnDone").addEventListener("click", () => { const t = readSheet(); closeSheets(); toggleDone(t.id); });
  $("#btnDelete").addEventListener("click", () => {
    const t = state.editing; const idx = state.tasks.indexOf(t);
    state.tasks.splice(idx, 1); closeSheets(); persist();
    toast("Đã xoá", () => { state.tasks.splice(idx, 0, t); persist(); });
  });

  // ------------------------------------------------------------ snooze
  function openSnooze(id) { state.snoozing = id; $("#sheetSnooze").hidden = false; }
  $$("#sheetSnooze [data-snooze]").forEach(b => b.addEventListener("click", () => {
    const t = state.tasks.find(x => x.id === state.snoozing); if (!t) return;
    const prev = { date: t.date, time: t.time };
    const now = new Date(); let d;
    const base = (t.time && t.date) ? taskDT(t) : now;
    switch (b.dataset.snooze) {
      case "15m": d = new Date(Math.max(base, now) .valueOf() + 15 * 60000); break;
      case "1h": d = new Date(Math.max(base, now).valueOf() + 60 * 60000); break;
      case "tonight": d = new Date(); d.setHours(21, 0, 0, 0); if (d < now) d = NLP.addDays(d, 1); break;
      case "tomorrow": d = NLP.addDays(now, 1); d.setHours(8, 0, 0, 0); break;
      case "nextweek": d = NLP.addDays(now, 7); d.setHours(9, 0, 0, 0); break;
      case "pick": closeSheets(); openTask(t.id); setTimeout(() => $("#tDate").showPicker?.(), 200); return;
    }
    t.date = NLP.iso(d); t.time = pad(d.getHours()) + ":" + pad(d.getMinutes());
    closeSheets(); persist();
    toast(`Nhắc lại ${fmtDate(t.date)} lúc ${t.time}`, () => { Object.assign(t, prev); persist(); });
  }));

  // ------------------------------------------------------------ settings
  const S = state.settings;
  function syncSettingsUI() {
    $$("#themeSeg .seg-btn").forEach(b => b.classList.toggle("is-active", b.dataset.theme === S.theme));
    $$("#swatches .swatch[data-color]").forEach(b => b.classList.toggle("is-active", b.dataset.color.toLowerCase() === S.accent.toLowerCase()));
    $("#colorInput").value = S.accent;
    $("#bgDim").value = S.bgDim; $("#bgDimVal").textContent = S.bgDim + "%";
    $("#bgBlur").value = S.bgBlur; $("#bgBlurVal").textContent = S.bgBlur + "px";
    $("#morningOn").checked = S.morningOn; $("#morningTime").value = S.morningTime;
    $("#eveningOn").checked = S.eveningOn; $("#eveningTime").value = S.eveningTime;
    $("#btnNotify").textContent = Notification?.permission === "granted" ? "Thông báo đã bật" : "Bật thông báo trên thiết bị này";
  }
  function setS(patch) { Object.assign(S, patch); Store.saveSettings(S); Theme.applyTheme(S); syncSettingsUI(); }
  $$("#themeSeg .seg-btn").forEach(b => b.onclick = () => setS({ theme: b.dataset.theme }));
  $$("#swatches .swatch[data-color]").forEach(b => b.onclick = () => setS({ accent: b.dataset.color }));
  $("#colorInput").addEventListener("input", e => setS({ accent: e.target.value }));
  $("#bgDim").addEventListener("input", e => setS({ bgDim: +e.target.value }));
  $("#bgBlur").addEventListener("input", e => setS({ bgBlur: +e.target.value }));
  $("#bgFile").addEventListener("change", async e => { const f = e.target.files[0]; if (!f) return; await Theme.setBackground(f); toast("Đã đổi hình nền"); e.target.value = ""; });
  $("#bgClear").addEventListener("click", async () => { await Theme.clearBackground(); toast("Đã bỏ hình nền"); });
  $("#morningOn").onchange = e => setS({ morningOn: e.target.checked });
  $("#eveningOn").onchange = e => setS({ eveningOn: e.target.checked });
  $("#morningTime").onchange = e => { setS({ morningTime: e.target.value }); scheduleNotifications(); };
  $("#eveningTime").onchange = e => { setS({ eveningTime: e.target.value }); scheduleNotifications(); };
  $("#btnNotify").addEventListener("click", async () => {
    if (!("Notification" in window)) { toast("Trình duyệt này không hỗ trợ thông báo"); return; }
    const p = await Notification.requestPermission();
    syncSettingsUI(); scheduleNotifications();
    toast(p === "granted" ? "Đã bật thông báo" : "Thông báo bị chặn trong cài đặt trình duyệt");
  });
  $("#btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ tasks: state.tasks, settings: S }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `loinhac-${todayISO()}.json`; a.click();
  });
  $("#importFile").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (Array.isArray(data.tasks)) { state.tasks = data.tasks; if (data.settings) setS(data.settings); persist(); toast(`Đã nhập ${data.tasks.length} việc`); }
    } catch { toast("File không đúng định dạng"); }
    e.target.value = "";
  });
  $("#btnWipe").addEventListener("click", () => {
    const old = state.tasks; state.tasks = []; persist(); closeSheets();
    toast("Đã xoá toàn bộ", () => { state.tasks = old; persist(); });
  });

  // ------------------------------------------------------------ notifications
  function notify(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") { toast(title + (body ? " — " + body : "")); return; }
    try { new Notification(title, { body, icon: "icons/icon.svg", tag: title }); } catch { toast(title + " — " + body); }
  }
  function scheduleNotifications() {
    state.timers.forEach(clearTimeout); state.timers = [];
    const now = Date.now();
    const at = (ms, fn) => { if (ms - now > 0 && ms - now < 36e5 * 24) state.timers.push(setTimeout(fn, ms - now)); };
    state.tasks.filter(t => !t.done && t.date && t.time).forEach(t => {
      const when = taskDT(t).valueOf();
      at(when, () => notify(t.title, (t.time + (t.place ? " · " + t.place : ""))));
      if (t.kind === "event") at(when - 10 * 60000, () => notify("10 phút nữa: " + t.title, t.place || ""));
    });
    const daily = (hhmm, on, fn) => { if (!on) return; const [h, m] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d.valueOf() < now) d.setDate(d.getDate() + 1); at(d.valueOf(), fn); };
    daily(S.morningTime, S.morningOn, () => {
      const open = state.tasks.filter(x => !x.done && x.date === todayISO()).sort(sortTasks);
      notify("Chào buổi sáng", open.length ? `Hôm nay có ${open.length} việc. Đầu tiên: ${open[0].title}` : "Hôm nay chưa có việc nào");
    });
    daily(S.eveningTime, S.eveningOn, () => {
      const left = state.tasks.filter(x => !x.done && x.date && x.date <= todayISO()).length;
      notify("Xem lại cuối ngày", left ? `Còn ${left} việc chưa xong. Mở app để dời sang mai.` : "Đã xong hết. Ngủ ngon!");
    });
  }

  // ------------------------------------------------------------ navigation & misc
  $$(".seg-btn[data-view]").forEach(b => b.onclick = () => { state.view = b.dataset.view; render(); });
  $$("#chips .chip").forEach(b => b.onclick = () => { state.list = b.dataset.list; $$("#chips .chip").forEach(c => c.classList.toggle("is-active", c === b)); render(); });
  $("#btnSearch").onclick = () => { const r = $("#searchRow"); r.hidden = !r.hidden; if (!r.hidden) $("#searchInput").focus(); else { state.search = ""; $("#searchInput").value = ""; render(); } };
  $("#searchInput").addEventListener("input", e => { state.search = e.target.value; render(); });
  $("#btnSettings").onclick = () => { syncSettingsUI(); $("#sheetSettings").hidden = false; };
  $("#calPrev").onclick = () => { state.calDate = NLP.iso(NLP.addDays(new Date(state.calDate + "T00:00:00"), -7)); render(); };
  $("#calNext").onclick = () => { state.calDate = NLP.iso(NLP.addDays(new Date(state.calDate + "T00:00:00"), 7)); render(); };
  $("#calMonth").onclick = () => { state.calDate = todayISO(); render(); };
  function closeSheets() { $$(".sheet").forEach(s => s.hidden = true); }
  $$(".sheet [data-close]").forEach(b => b.onclick = closeSheets);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheets(); });

  // Vuốt ngang trên vùng nội dung để đổi Danh sách <-> Lịch
  (function () {
    const v = $("#views"); let x0 = null, y0 = null;
    v.addEventListener("touchstart", e => { if (e.target.closest(".task-card,.u-item,.ev")) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    v.addEventListener("touchend", e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 50) { state.view = dx < 0 ? "calendar" : "list"; render(); }
      x0 = null;
    }, { passive: true });
  })();

  // Service worker (chỉ chạy khi mở qua http/https)
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});

  // ------------------------------------------------------------ boot
  Theme.applyTheme(S); Theme.loadBackground();
  render(); scheduleNotifications();
  setInterval(() => { if (state.view === "calendar") renderCalendar(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { render(); scheduleNotifications(); } });
})();
