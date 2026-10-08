/* ============================================================
   Store — lưu dữ liệu trên thiết bị (localStorage) + IndexedDB cho ảnh nền
   Schema Task:
   { id, title, kind: 'todo'|'event', date: 'YYYY-MM-DD'|null, time: 'HH:MM'|null,
     duration: minutes|null, place, note, done, doneAt, createdAt, snoozedUntil,
     subtasks: [{title, due, done}], ai: { breakdownSource, suggestedSlot } }
   ============================================================ */
(function (global) {
  const KEY = "loinhac.tasks.v1";
  const SET = "loinhac.settings.v1";

  const defaults = {
    theme: "system",
    accent: "#2b63ff",
    bgDim: 60,
    bgBlur: 0,
    morningOn: true, morningTime: "07:30",
    eveningOn: true, eveningTime: "21:00",
    lastMorning: null, lastEvening: null,
    workStart: "08:00", workEnd: "18:00",
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  }
  function save(tasks) { localStorage.setItem(KEY, JSON.stringify(tasks)); }
  function settings() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(SET)) || {}); } catch { return { ...defaults }; }
  }
  function saveSettings(s) { localStorage.setItem(SET, JSON.stringify(s)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---- IndexedDB cho ảnh nền (ảnh có thể > 5MB, không để trong localStorage)
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("loinhac", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function kvSet(k, v) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function kvGet(k) {
    const db = await idb();
    return new Promise((res, rej) => {
      const r = db.transaction("kv").objectStore("kv").get(k);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function kvDel(k) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").delete(k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }

  function seed() {
    const t = NLP.iso(new Date());
    const tm = NLP.iso(NLP.addDays(new Date(), 1));
    return [
      { id: uid(), title: "Uống nước và đi bộ 10 phút", kind: "todo", date: t, time: null, duration: null, place: "", note: "", done: false, subtasks: [], createdAt: Date.now() },
      { id: uid(), title: "Họp nhóm tuần", kind: "event", date: t, time: "09:30", duration: 45, place: "Phòng 201", note: "https://meet.google.com/abc-defg-hij", done: false, subtasks: [], createdAt: Date.now() },
      { id: uid(), title: "Chuẩn bị ra mắt sản phẩm A", kind: "todo", date: tm, time: null, duration: null, place: "", note: "Bấm “Chia nhỏ việc này” để tách thành các bước", done: false, subtasks: [], createdAt: Date.now() },
      { id: uid(), title: "Gọi lại cho khách", kind: "todo", date: t, time: "15:00", duration: 15, place: "", note: "0901234567", done: false, subtasks: [], createdAt: Date.now() },
    ];
  }

  global.Store = { load, save, settings, saveSettings, uid, kvSet, kvGet, kvDel, seed, defaults };
})(window);
