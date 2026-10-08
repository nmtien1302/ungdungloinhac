/* ============================================================
   NLP — bóc tách tiếng Việt tự nhiên thành { title, date, time, place, kind, duration }
   Ví dụ: "Họp marketing thứ 6 tuần sau lúc 9h sáng tại phòng 201"
   ============================================================ */
(function (global) {
  const DAY_WORDS = {
    "chủ nhật": 0, "cn": 0, "chu nhat": 0,
    "thứ 2": 1, "thứ hai": 1, "t2": 1,
    "thứ 3": 2, "thứ ba": 2, "t3": 2,
    "thứ 4": 3, "thứ tư": 3, "t4": 3,
    "thứ 5": 4, "thứ năm": 4, "t5": 4,
    "thứ 6": 5, "thứ sáu": 5, "t6": 5,
    "thứ 7": 6, "thứ bảy": 6, "t7": 6,
  };
  const EVENT_WORDS = /\b(họp|meeting|gặp|hẹn|phỏng vấn|cuộc họp|lịch hẹn|khám|đi\s|bay|tiệc|sinh nhật|học|lớp|buổi|hội thảo|webinar|call|zoom)\b/i;

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  function parse(input, now) {
    now = now || new Date();
    let text = " " + input.trim().replace(/\s+/g, " ") + " ";
    const out = { title: "", date: null, time: null, place: null, kind: "todo", duration: null, dateText: null, timeText: null };
    const consumed = [];
    const eat = (re, fn) => {
      const m = text.match(re);
      if (!m) return false;
      fn(m);
      consumed.push(m[0].trim());
      text = text.replace(m[0], " ");
      return true;
    };

    // ---- duration: "trong 2 tiếng", "2h30 phút", "khoảng 45 phút"
    eat(/\s(?:trong|khoảng|kéo dài)\s(\d+(?:[.,]\d+)?)\s?(tiếng|giờ|h|phút|p)\b/i, (m) => {
      const n = parseFloat(m[1].replace(",", "."));
      out.duration = /ph|p$/.test(m[2]) ? Math.round(n) : Math.round(n * 60);
    });

    // ---- explicit dates: 15/10, 15/10/2026, ngày 15 tháng 10
    eat(/\s(?:ngày\s)?(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?(?=\s)/, (m) => {
      const d = new Date(now);
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
      d.setFullYear(y, +m[2] - 1, +m[1]);
      if (!m[3] && d < startOfDay(now)) d.setFullYear(y + 1);
      out.date = startOfDay(d); out.dateText = m[0].trim();
    }) ||
    eat(/\sngày\s(\d{1,2})\stháng\s(\d{1,2})(?:\snăm\s(\d{4}))?/i, (m) => {
      const d = new Date(now); d.setFullYear(m[3] ? +m[3] : now.getFullYear(), +m[2] - 1, +m[1]);
      if (!m[3] && d < startOfDay(now)) d.setFullYear(d.getFullYear() + 1);
      out.date = startOfDay(d); out.dateText = m[0].trim();
    }) ||
    eat(/\s(hôm nay|hnay|bữa nay)\s/i, () => { out.date = startOfDay(now); out.dateText = "hôm nay"; }) ||
    eat(/\s(ngày mai|mai|hôm sau)\s/i, () => { out.date = startOfDay(addDays(now, 1)); out.dateText = "ngày mai"; }) ||
    eat(/\s(ngày mốt|mốt|ngày kia)\s/i, () => { out.date = startOfDay(addDays(now, 2)); out.dateText = "ngày mốt"; }) ||
    eat(/(?<!thứ)\s(\d+)\sngày\s(nữa|sau)\s/i, (m) => { out.date = startOfDay(addDays(now, +m[1])); out.dateText = m[0].trim(); }) ||
    eat(/(?<!thứ)\s(\d+)\stuần\s(nữa|sau)\s/i, (m) => { out.date = startOfDay(addDays(now, 7 * +m[1])); out.dateText = m[0].trim(); }) ||
    eat(/\s(cuối tuần)\s/i, () => {
      const dow = now.getDay(); const diff = (6 - dow + 7) % 7 || 7;
      out.date = startOfDay(addDays(now, diff)); out.dateText = "cuối tuần";
    });

    // ---- weekday: "thứ 6", "thứ 6 tuần sau", "t2 tuần này"
    if (!out.date) {
      const keys = Object.keys(DAY_WORDS).sort((a, b) => b.length - a.length).map(k => k.replace(/\s/g, "\\s"));
      const re = new RegExp("\\s(" + keys.join("|") + ")(\\s(tuần sau|tuần tới|tuần này|sau|tới))?\\s", "i");
      eat(re, (m) => {
        const target = DAY_WORDS[m[1].toLowerCase().replace(/\s+/g, " ")];
        const dow = now.getDay();
        let diff = (target - dow + 7) % 7;
        const mod = (m[3] || "").toLowerCase();
        if (mod === "tuần sau" || mod === "tuần tới") {
          // next calendar week (Mon-Sun), Vietnamese usage
          const daysToNextMon = ((8 - dow) % 7) || 7;
          const nextMon = addDays(now, daysToNextMon);
          const off = (target + 6) % 7; // Mon=0 ... Sun=6
          out.date = startOfDay(addDays(nextMon, off));
        } else if (mod === "tuần này") {
          const thisMon = addDays(now, -((dow + 6) % 7));
          out.date = startOfDay(addDays(thisMon, (target + 6) % 7));
        } else {
          if (diff === 0 && !/sau|tới/.test(mod)) diff = 0; // today
          if (diff === 0 && /sau|tới/.test(mod)) diff = 7;
          out.date = startOfDay(addDays(now, diff));
        }
        out.dateText = m[0].trim();
      });
    }

    // ---- time: "lúc 9h sáng", "9h30", "14:00", "9 giờ tối", "sáng", "chiều", "tối"
    const tm = (h, mnt, part) => {
      part = (part || "").toLowerCase();
      if (/chiều|tối|đêm/.test(part) && h < 12) h += 12;
      if (/sáng/.test(part) && h === 12) h = 0;
      if (/trưa/.test(part) && h < 11) h += 12;
      out.time = pad(h) + ":" + pad(mnt);
    };
    eat(/\s(?:lúc|vào|từ)?\s?(\d{1,2})\s?(?:h|g|giờ|:)\s?(\d{2})?\s?(?:phút|p)?\s?(sáng|trưa|chiều|tối|đêm|am|pm)?(?=\s)/i, (m) => {
      let h = +m[1]; const mn = m[2] ? +m[2] : 0; let part = m[3] || "";
      if (/pm/i.test(part)) part = "chiều"; if (/am/i.test(part)) part = "sáng";
      tm(h, mn, part); out.timeText = m[0].trim();
    }) ||
    eat(/\s(?:buổi\s)?(sáng sớm|sáng|trưa|chiều|tối|đêm)(?:\snay|\smai)?\s/i, (m) => {
      const w = m[1].toLowerCase();
      const map = { "sáng sớm": [7, 0], "sáng": [9, 0], "trưa": [12, 0], "chiều": [15, 0], "tối": [20, 0], "đêm": [22, 0] };
      const [h, mn] = map[w]; tm(h, mn, "");
      if (!out.date && /nay/.test(m[0])) { out.date = startOfDay(now); out.dateText = m[0].trim(); }
      if (!out.date && /mai/.test(m[0])) { out.date = startOfDay(addDays(now, 1)); out.dateText = m[0].trim(); }
      out.timeText = m[0].trim();
    });

    // ---- place: "tại ...", "ở ...", "@ ..."
    eat(/\s(?:tại|ở|@)\s(.+?)(?=\s(?:lúc|vào|ngày|thứ|hôm|mai|$)|\s$)/i, (m) => { out.place = m[1].trim(); });

    out.title = text.replace(/\s(lúc|vào|từ|nhắc|nhắc tôi|nhớ)\s/gi, " ").replace(/\s+/g, " ").trim();
    out.title = out.title.replace(/^(nhắc|nhắc tôi|nhớ|remind me to)\s+/i, "");
    if (out.title) out.title = out.title[0].toUpperCase() + out.title.slice(1);
    if (EVENT_WORDS.test(out.title) && out.time) out.kind = "event";
    if (out.time && !out.date) out.date = startOfDay(now);
    if (out.date && out.time) {
      const [h, m] = out.time.split(":").map(Number);
      const dt = new Date(out.date); dt.setHours(h, m, 0, 0);
      if (!out.dateText && dt < now) out.date = startOfDay(addDays(out.date, 1)); // "9h sáng" đã qua -> ngày mai
    }
    if (out.date) out.dateISO = iso(out.date);
    return out;
  }

  // ---- Voice memo -> multiple tasks: tách theo "và", ",", "rồi", "sau đó", xuống dòng
  function parseMany(text, now) {
    const parts = text.split(/\n|[,;]| và | rồi | sau đó | xong | tiếp theo /i).map(s => s.trim()).filter(s => s.length > 2);
    return parts.map(p => parse(p, now)).filter(t => t.title);
  }

  // ---- Chia nhỏ việc lớn (rule-based, chạy offline)
  function breakdown(title, deadlineISO) {
    const t = title.toLowerCase();
    let steps;
    if (/ra mắt|launch|sản phẩm|campaign|chiến dịch/.test(t)) steps = ["Xác định mục tiêu và đối tượng", "Lập kế hoạch nội dung và ngân sách", "Chuẩn bị tài liệu, thiết kế", "Thử nghiệm nội bộ", "Thông báo đối tác / khách hàng", "Triển khai", "Tổng kết và rút kinh nghiệm"];
    else if (/báo cáo|report|luận văn|bài viết|essay|tiểu luận|bài báo/.test(t)) steps = ["Thu thập tài liệu và số liệu", "Lập dàn ý", "Viết bản nháp", "Rà soát, bổ sung dẫn chứng", "Chỉnh sửa định dạng", "Gửi / nộp"];
    else if (/thuyết trình|presentation|slide/.test(t)) steps = ["Chốt thông điệp chính", "Phác thảo cấu trúc slide", "Làm slide", "Tập nói thử", "Chuẩn bị Q&A"];
    else if (/sự kiện|event|tiệc|đám|cưới|sinh nhật/.test(t)) steps = ["Chốt ngày, địa điểm, ngân sách", "Danh sách khách mời", "Đặt dịch vụ (ăn uống, trang trí)", "Gửi thư mời", "Kiểm tra lại trước 1 ngày", "Tổ chức"];
    else if (/học|ôn|thi|exam|chứng chỉ/.test(t)) steps = ["Liệt kê nội dung cần ôn", "Chia lịch ôn theo tuần", "Ôn phần khó trước", "Làm đề thử", "Ôn lại phần sai", "Nghỉ ngơi trước ngày thi"];
    else if (/chuyển nhà|dọn|du lịch|đi chơi|trip/.test(t)) steps = ["Lên danh sách việc cần chuẩn bị", "Đặt chỗ / phương tiện", "Mua sắm đồ cần thiết", "Đóng gói", "Kiểm tra lần cuối"];
    else if (/hợp đồng|contract|dpa|chính sách|policy/.test(t)) steps = ["Thu thập yêu cầu và bối cảnh", "Soạn bản nháp", "Rà soát rủi ro pháp lý", "Gửi bên liên quan góp ý", "Chỉnh sửa theo góp ý", "Chốt và ký"];
    else steps = ["Làm rõ mục tiêu", "Liệt kê việc cần làm", "Làm phần quan trọng nhất", "Hoàn thiện các phần còn lại", "Kiểm tra lại", "Bàn giao / hoàn tất"];

    const n = steps.length;
    const end = deadlineISO ? new Date(deadlineISO + "T00:00:00") : addDays(new Date(), 14);
    const start = startOfDay(new Date());
    const span = Math.max(1, (end - start) / 86400000);
    return steps.map((s, i) => ({
      title: s,
      due: iso(addDays(start, Math.round(span * (i + 1) / n))),
      done: false
    }));
  }

  // ---- Nhận diện hành động nhanh trong nội dung
  function detectActions(text) {
    const acts = [];
    if (!text) return acts;
    (text.match(/https?:\/\/\S+/g) || []).forEach(u => {
      const label = /zoom\.us|meet\.google|teams\.microsoft/.test(u) ? "Vào phòng họp" : "Mở link";
      acts.push({ label, href: u });
    });
    (text.match(/(?:\+84|0)\d{9,10}\b/g) || []).forEach(p => acts.push({ label: "Gọi " + p, href: "tel:" + p }));
    (text.match(/\b[A-Z]{2,4}\d{9,14}\b|\b\d{11,14}\b/g) || []).forEach(c => acts.push({ label: "Theo dõi đơn " + c, href: "https://www.google.com/search?q=" + encodeURIComponent("tra cứu vận đơn " + c) }));
    (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).forEach(e => acts.push({ label: "Email " + e, href: "mailto:" + e }));
    return acts;
  }

  global.NLP = { parse, parseMany, breakdown, detectActions, iso, addDays, startOfDay };
})(window);
