/* ============================================================
   Theme — sáng/tối/theo máy, màu chủ đạo, ảnh nền từ thiết bị
   ============================================================ */
(function (global) {
  const root = document.documentElement;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function applyTheme(s) {
    const dark = s.theme === "dark" || (s.theme === "system" && mq.matches);
    root.dataset.theme = dark ? "dark" : "light";
    root.style.setProperty("--accent", s.accent);
    root.style.setProperty("--on-accent", luminance(s.accent) > 0.6 ? "#111" : "#fff");
    root.style.setProperty("--bg-dim", String(s.bgDim / 100));
    root.style.setProperty("--bg-blur", s.bgBlur + "px");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#0e0f12" : s.accent;
  }

  async function loadBackground() {
    try {
      const blob = await Store.kvGet("bg");
      const el = document.getElementById("bg");
      if (blob) {
        const url = URL.createObjectURL(blob);
        el.style.backgroundImage = `url(${url})`;
        document.body.classList.add("has-bg");
      } else {
        el.style.backgroundImage = "";
        document.body.classList.remove("has-bg");
      }
    } catch (e) { console.warn("bg", e); }
  }

  // Thu nhỏ ảnh về tối đa 1600px để nhẹ và nhanh
  function shrink(file) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const max = 1600; const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => res(b || file), "image/jpeg", 0.86);
      };
      img.onerror = () => res(file);
      img.src = URL.createObjectURL(file);
    });
  }

  async function setBackground(file) {
    const blob = await shrink(file);
    await Store.kvSet("bg", blob);
    await loadBackground();
  }
  async function clearBackground() {
    await Store.kvDel("bg");
    await loadBackground();
  }

  mq.addEventListener("change", () => applyTheme(Store.settings()));

  global.Theme = { applyTheme, loadBackground, setBackground, clearBackground };
})(window);
