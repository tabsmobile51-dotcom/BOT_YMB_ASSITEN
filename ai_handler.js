const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────────────────────────
const OPENROUTER_API_KEY = "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";
const AI_MODEL           = "inclusionai/ling-2.6-1t:free";
const VOLUME_PATH        = '/app/auth_info';
const PR_PATH            = path.join(VOLUME_PATH, 'pr.json');
const DEADLINE_PATH      = path.join(VOLUME_PATH, 'deadline.json');
const RATE_CONFIG_PATH   = path.join(VOLUME_PATH, 'rate_config.json');
const USAGE_STATS_PATH   = path.join(VOLUME_PATH, 'usage_stats.json');

const { MAPEL_CONFIG, STRUKTUR_JADWAL, LABELS } = require('./pelajaran');
const db = require('./data');

// ─────────────────────────────────────────────────────────────
// HELPER: TANGGAL WIB (FIX UTAMA — semua pakai ini)
// ─────────────────────────────────────────────────────────────
/**
 * Mengembalikan objek Date yang sudah dikonversi ke WIB (Asia/Jakarta).
 * Gunakan fungsi ini SELALU saat butuh waktu lokal WIB.
 */
function getNowWIB() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

/**
 * Mengembalikan nama hari dalam bahasa Indonesia (lowercase).
 * @param {Date|null} dateWIB - Opsional, default = sekarang dalam WIB
 */
function getNamaHari(dateWIB = null) {
  const d = dateWIB || getNowWIB();
  return ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'][d.getDay()];
}

/**
 * Mengembalikan tanggal terformat panjang dalam bahasa Indonesia.
 * @param {Date|null} dateWIB - Opsional, default = sekarang dalam WIB
 */
function getTanggalFormatted(dateWIB = null) {
  const d = dateWIB || getNowWIB();
  return d.toLocaleDateString('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

/**
 * Mengembalikan array 5 tanggal (Senin–Jumat) minggu aktif dalam format DD/MM/YYYY.
 */
function getWeekDates() {
  const now = getNowWIB();
  const dayOfWeek = now.getDay(); // 0=Min, 1=Sen, ..., 6=Sab

  // Tentukan offset ke Senin terdekat (minggu ini atau depan jika Sabtu/Minggu)
  let offsetToMonday;
  if (dayOfWeek === 0) {
    offsetToMonday = 1; // Minggu → Senin besok
  } else if (dayOfWeek === 6) {
    offsetToMonday = 2; // Sabtu → Senin lusa
  } else {
    offsetToMonday = -(dayOfWeek - 1); // Senin–Jumat → mundur ke Senin
  }

  const monday = new Date(now);
  monday.setDate(now.getDate() + offsetToMonday);
  monday.setHours(0, 0, 0, 0);

  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    );
  }
  return dates;
}

// ─────────────────────────────────────────────────────────────
// RATE LIMIT CONFIG
// ─────────────────────────────────────────────────────────────
const DEFAULT_RATE_CONFIG = {
  globalLimitMs: 1000000,
  maxRequestsPerHour: 30,
  maxRequestsPerDay: 300,
  adminNumbers: ["6289531549103", "171425214255294"],
  bannedUsers: [],
  vipUsers: [],
  globalPause: false,
};

function loadRateConfig() {
  try {
    if (fs.existsSync(RATE_CONFIG_PATH)) {
      return { ...DEFAULT_RATE_CONFIG, ...JSON.parse(fs.readFileSync(RATE_CONFIG_PATH, 'utf8')) };
    }
  } catch (e) {
    console.error("Gagal load rate config:", e.message);
  }
  return { ...DEFAULT_RATE_CONFIG };
}

function saveRateConfig(config) {
  try {
    fs.mkdirSync(VOLUME_PATH, { recursive: true });
    fs.writeFileSync(RATE_CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error("Gagal save rate config:", e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// USAGE STATS
// ─────────────────────────────────────────────────────────────
function loadUsageStats() {
  try {
    if (fs.existsSync(USAGE_STATS_PATH)) {
      return JSON.parse(fs.readFileSync(USAGE_STATS_PATH, 'utf8'));
    }
  } catch (e) {
    console.error("Gagal load usage stats:", e.message);
  }
  return {
    users: {},
    daily: {},
    hourly: {},
    totalRequests: 0,
    lastReset: new Date().toISOString()
  };
}

function saveUsageStats(stats) {
  try {
    fs.mkdirSync(VOLUME_PATH, { recursive: true });
    fs.writeFileSync(USAGE_STATS_PATH, JSON.stringify(stats, null, 2));
  } catch (e) {
    console.error("Gagal save usage stats:", e.message);
  }
}

function recordUsage(userId) {
  const stats   = loadUsageStats();
  const nowWIB  = getNowWIB();
  const dateKey = nowWIB.toISOString().slice(0, 10);
  const hourKey = `${dateKey}-${nowWIB.getHours()}`;

  if (!stats.users[userId]) {
    stats.users[userId] = { total: 0, today: 0, thisHour: 0, lastSeen: null };
  }
  stats.users[userId].total++;
  stats.users[userId].today++;
  stats.users[userId].thisHour++;
  stats.users[userId].lastSeen = nowWIB.toISOString();

  stats.daily[dateKey]  = (stats.daily[dateKey]  || 0) + 1;
  stats.hourly[hourKey] = (stats.hourly[hourKey] || 0) + 1;
  stats.totalRequests++;

  saveUsageStats(stats);
}

// ─────────────────────────────────────────────────────────────
// RATE LIMITER
// ─────────────────────────────────────────────────────────────
const lastRequestTime  = new Map();
const requestCountHour = new Map();
const requestCountDay  = new Map();

function isRateLimited(userId) {
  const config = loadRateConfig();
  const now    = Date.now();

  if (config.bannedUsers.includes(userId))  return "banned";
  if (config.globalPause)                   return "paused";
  if (config.adminNumbers.includes(userId)) return false;

  const multiplier = config.vipUsers.includes(userId) ? 2 : 1;

  // Cek jeda minimum antar request
  const last = lastRequestTime.get(userId) || 0;
  if (now - last < config.globalLimitMs)    return "toofast";

  // Cek limit per jam
  const hourData = requestCountHour.get(userId) || { count: 0, windowStart: now };
  if (now - hourData.windowStart > 3600000) {
    // Window baru
    requestCountHour.set(userId, { count: 1, windowStart: now });
  } else {
    if (hourData.count >= config.maxRequestsPerHour * multiplier) return "hourlimit";
    hourData.count++;
    requestCountHour.set(userId, hourData);
  }

  // Cek limit per hari (berdasarkan tanggal WIB)
  const nowWIB  = getNowWIB();
  const dayData = requestCountDay.get(userId) || { count: 0, dayStart: nowWIB.toDateString() };
  if (dayData.dayStart !== nowWIB.toDateString()) {
    // Hari baru di WIB
    requestCountDay.set(userId, { count: 1, dayStart: nowWIB.toDateString() });
  } else {
    if (dayData.count >= config.maxRequestsPerDay * multiplier) return "daylimit";
    dayData.count++;
    requestCountDay.set(userId, dayData);
  }

  lastRequestTime.set(userId, now);
  return false;
}

// ─────────────────────────────────────────────────────────────
// RESET OTOMATIS JAM 00.00 WIB
// ─────────────────────────────────────────────────────────────
function msUntilMidnightWIB() {
  const nowWIB    = getNowWIB();
  const midnight  = new Date(nowWIB);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - nowWIB.getTime();
}

function scheduleAutoReset() {
  function doReset() {
    console.log("🔄 Auto-reset AI usage stats jam 00.00 WIB...");

    requestCountDay.clear();
    requestCountHour.clear();
    lastRequestTime.clear();
    chatHistories.clear();

    const stats = loadUsageStats();
    for (const uid in stats.users) {
      stats.users[uid].today    = 0;
      stats.users[uid].thisHour = 0;
    }

    // Hapus data hourly & daily lebih dari 7 hari lalu
    const cutoff = new Date(getNowWIB());
    cutoff.setDate(cutoff.getDate() - 7);

    for (const key in stats.hourly) {
      if (new Date(key.slice(0, 10)) < cutoff) delete stats.hourly[key];
    }
    for (const key in stats.daily) {
      if (new Date(key) < cutoff) delete stats.daily[key];
    }

    stats.lastReset = getNowWIB().toISOString();
    saveUsageStats(stats);
    console.log("✅ Reset selesai!");

    // Jadwal ulang untuk tengah malam berikutnya
    setTimeout(doReset, msUntilMidnightWIB());
  }

  const delay = msUntilMidnightWIB();
  console.log(`⏰ Auto-reset dijadwalkan ${Math.round(delay / 60000)} menit lagi (jam 00.00 WIB)`);
  setTimeout(doReset, delay);
}

scheduleAutoReset();

// ─────────────────────────────────────────────────────────────
// RESET PR OTOMATIS TIAP SABTU JAM 00.00 WIB
// ─────────────────────────────────────────────────────────────
function msUntilSabtuMidnightWIB() {
  const nowWIB       = getNowWIB();
  const day          = nowWIB.getDay();
  const daysUntilSat = day === 6 ? 7 : (6 - day);
  const nextSat      = new Date(nowWIB);
  nextSat.setDate(nowWIB.getDate() + daysUntilSat);
  nextSat.setHours(0, 0, 0, 0);
  return nextSat.getTime() - nowWIB.getTime();
}

function scheduleWeeklyPRReset() {
  function doWeeklyReset() {
    console.log("📅 Weekly reset PR & deadline jam 00.00 Sabtu WIB...");
    const berhasil = db.resetSemua();
    if (berhasil) {
      console.log("✅ PR & deadline berhasil di-reset ke default!");
    } else {
      console.log("❌ Gagal reset PR, cek error di data.js");
    }

    // Invalidate cache setelah reset
    cachedContext  = null;
    cacheTimestamp = 0;

    const delay = msUntilSabtuMidnightWIB();
    console.log(`📅 Weekly PR reset berikutnya dijadwalkan ${Math.round(delay / 3600000)} jam lagi`);
    setTimeout(doWeeklyReset, delay);
  }

  const delay = msUntilSabtuMidnightWIB();
  console.log(`📅 Weekly PR reset dijadwalkan ${Math.round(delay / 3600000)} jam lagi (Sabtu 00.00 WIB)`);
  setTimeout(doWeeklyReset, delay);
}

scheduleWeeklyPRReset();

// ─────────────────────────────────────────────────────────────
// CACHE KONTEKS
// ─────────────────────────────────────────────────────────────
let cachedContext  = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

function buildContextData() {
  const now = Date.now();
  if (cachedContext && (now - cacheTimestamp) < CACHE_TTL_MS) return cachedContext;

  const currentData = db.getAll() || {};

  // Semua waktu pakai WIB
  const nowWIB   = getNowWIB();
  const besokWIB = new Date(nowWIB);
  besokWIB.setDate(nowWIB.getDate() + 1);

  const hariIni = getNamaHari(nowWIB);
  const besok   = getNamaHari(besokWIB);
  const tanggal = getTanggalFormatted(nowWIB);
  const dates   = getWeekDates();

  // Jadwal
  let jadwalTeks = "JADWAL:\n";
  for (const [hari, mapelList] of Object.entries(STRUKTUR_JADWAL)) {
    jadwalTeks += `${hari}: ${mapelList.map(k => MAPEL_CONFIG[k] || k).join(', ')}\n`;
  }

  // PR per hari
  const daysKey       = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
  const dayLabels     = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT'];
  const dayLabelsSmall = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

  let prTeks = "PR/TUGAS:\n";
  for (let i = 0; i < 5; i++) {
    const tugas = currentData[daysKey[i]];
    if (!tugas || tugas === "" || tugas.includes("Belum ada tugas") || tugas.includes("Tidak ada PR")) {
      prTeks += `${dayLabels[i]} (${dates[i]}): kosong\n`;
    } else {
      const cleanTugas = tugas
        .replace(/\n/g, " ")
        .replace(/━━━━━━━━━━━━━━━━━━━━/g, "")
        .replace(
          /⏰ Deadline: \w+, \d{2}\/\d{2}\/\d{4}/g,
          `⏰ Deadline: ${dayLabelsSmall[i]}, ${dates[i]}`
        );
      prTeks += `${dayLabels[i]} (${dates[i]}): ${cleanTugas}\n`;
    }
  }

  // Deadline khusus — filter yang sudah lewat (berdasarkan WIB)
  let deadlineTeks = "DEADLINE KHUSUS:\n";
  try {
    const dlList = JSON.parse(currentData.deadline || "[]");
    const todayWIB = new Date(nowWIB);
    todayWIB.setHours(0, 0, 0, 0);

    const aktif = dlList.filter(item => new Date(item.deadline) >= todayWIB);
    if (aktif.length === 0) {
      deadlineTeks += "tidak ada\n";
    } else {
      aktif.forEach(item => {
        const tgl = new Date(item.deadline).toLocaleDateString('id-ID', {
          day: '2-digit', month: '2-digit', year: 'numeric'
        });
        deadlineTeks += `- ${item.task} (deadline: ${tgl})\n`;
      });
    }
  } catch {
    deadlineTeks += currentData.deadline || "tidak ada\n";
  }

  cachedContext  = { konteks: jadwalTeks + prTeks + deadlineTeks, hariIni, besok, tanggal };
  cacheTimestamp = now;
  return cachedContext;
}

// ─────────────────────────────────────────────────────────────
// RIWAYAT CHAT
// ─────────────────────────────────────────────────────────────
const chatHistories = new Map();

function getHistory(userId) {
  if (!chatHistories.has(userId)) chatHistories.set(userId, []);
  return chatHistories.get(userId);
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  // Simpan max 10 pesan terakhir (5 pasang user-assistant)
  if (history.length > 10) history.splice(0, history.length - 10);
}

// ─────────────────────────────────────────────────────────────
// ADMIN COMMANDS
// ─────────────────────────────────────────────────────────────
function handleAdminCommand(userId, message) {
  const config = loadRateConfig();
  if (!config.adminNumbers.includes(userId)) return null;

  const msg   = message.trim().toLowerCase();
  const parts = message.trim().split(" ");

  if (msg.startsWith("!ai-setlimit ")) {
    const val = parseInt(parts[1]);
    if (isNaN(val) || val < 500) return "❌ Bro minimal 500ms dong, masa mau secepet itu 💀";
    config.globalLimitMs = val;
    saveRateConfig(config);
    return `✅ Oke bos, jeda minimum gue ubah jadi ${val}ms sekarang`;
  }

  if (msg.startsWith("!ai-sethour ")) {
    const val = parseInt(parts[1]);
    if (isNaN(val) || val < 1) return "❌ Minimal 1 dong bro, masa 0 💀";
    config.maxRequestsPerHour = val;
    saveRateConfig(config);
    return `✅ Siap! Sekarang max per jam jadi ${val}x, gue catat ya`;
  }

  if (msg.startsWith("!ai-setday ")) {
    const val = parseInt(parts[1]);
    if (isNaN(val) || val < 1) return "❌ Woy minimal 1 bro 😭";
    config.maxRequestsPerDay = val;
    saveRateConfig(config);
    return `✅ Beres! Max per hari sekarang ${val}x, udah gue simpan`;
  }

  if (msg.startsWith("!ai-ban ")) {
    const target = parts[1];
    if (!target) return "❌ Kasih tau nomor siapa yang mau di-ban bro";
    if (!config.bannedUsers.includes(target)) config.bannedUsers.push(target);
    saveRateConfig(config);
    return `🚫 Oke, ${target} udah gue kick dari fitur AI. Bye bye 👋`;
  }

  if (msg.startsWith("!ai-unban ")) {
    const target = parts[1];
    if (!target) return "❌ Kasih tau nomor siapa yang mau di-unban bro";
    config.bannedUsers = config.bannedUsers.filter(u => u !== target);
    saveRateConfig(config);
    return `✅ ${target} udah gue maafin, boleh pake AI lagi nih`;
  }

  if (msg.startsWith("!ai-vip ")) {
    const target = parts[1];
    if (!target) return "❌ Kasih tau nomor siapa yang mau di-VIP bro";
    if (!config.vipUsers.includes(target)) config.vipUsers.push(target);
    saveRateConfig(config);
    return `⭐ Wih, ${target} sekarang jadi VIP! Limit lu 2x lipat dari yang biasa`;
  }

  if (msg.startsWith("!ai-unvip ")) {
    const target = parts[1];
    if (!target) return "❌ Kasih tau nomor siapa yang mau di-unvip bro";
    config.vipUsers = config.vipUsers.filter(u => u !== target);
    saveRateConfig(config);
    return `📉 Oke, ${target} udah gue turunin lagi ke user biasa`;
  }

  if (msg === "!ai-pause") {
    config.globalPause = true;
    saveRateConfig(config);
    return "⏸️ AI gue pause dulu ya, semua user kena. Kasih tau kalo mau nyala lagi!";
  }

  if (msg === "!ai-resume") {
    config.globalPause = false;
    saveRateConfig(config);
    return "▶️ Oke AI udah gue nyalain lagi, gaskeun!";
  }

  if (msg === "!ai-reset") {
    requestCountDay.clear();
    requestCountHour.clear();
    lastRequestTime.clear();
    chatHistories.clear();
    cachedContext  = null;
    cacheTimestamp = 0;
    return "🔄 Beres! Semua counter, history, sama cache udah gue bersiin dari nol";
  }

  if (msg === "!ai-stats") {
    const stats    = loadUsageStats();
    const nowWIB   = getNowWIB();
    const today    = nowWIB.toISOString().slice(0, 10);
    const todayCount = stats.daily[today] || 0;
    const topUsers = Object.entries(stats.users)
      .sort((a, b) => b[1].today - a[1].today)
      .slice(0, 5)
      .map(([uid, d], i) => `  ${i + 1}. ...${uid.slice(-4)}: ${d.today}x hari ini (total ${d.total}x)`)
      .join("\n");

    return `📊 *Laporan Pemakaian AI*
━━━━━━━━━━━━━━━━━━
🔥 Hari ini: ${todayCount} request
📈 Sepanjang masa: ${stats.totalRequests} request
🕛 Reset terakhir: ${new Date(stats.lastReset).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}

🏆 Top users hari ini:
${topUsers || "  Belum ada yang pake hari ini"}
━━━━━━━━━━━━━━━━━━`;
  }

  if (msg === "!ai-config") {
    return `⚙️ *Setting AI Sekarang*
━━━━━━━━━━━━━━━━━━
⏱ Jeda minimum : ${config.globalLimitMs}ms
📨 Max/jam       : ${config.maxRequestsPerHour}x
📅 Max/hari      : ${config.maxRequestsPerDay}x
🤖 Status AI     : ${config.globalPause ? "⏸️ LAGI PAUSE" : "▶️ AKTIF JALAN"}
⭐ VIP users     : ${config.vipUsers.length} orang
🚫 Banned users  : ${config.bannedUsers.length} orang
━━━━━━━━━━━━━━━━━━
📋 *Command lu:*
!ai-setlimit [ms] — ubah jeda
!ai-sethour [n] — max per jam
!ai-setday [n] — max per hari
!ai-ban/unban [no] — banned/bebasin
!ai-vip/unvip [no] — kasih/cabut VIP
!ai-pause/resume — matiin/nyalain
!ai-reset — reset semua
!ai-stats — lihat statistik`;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// MAIN FUNCTION
// ─────────────────────────────────────────────────────────────
async function askAI(userMessage, userId = 'default') {
  // Cek admin command dulu
  const adminReply = handleAdminCommand(userId, userMessage);
  if (adminReply !== null) return adminReply;

  // Cek rate limit
  const limited = isRateLimited(userId);
  const cfg     = loadRateConfig();

  if (limited === "banned")    return "🚫 Waduh, lu kena banned dari fitur AI nih. Coba hubungin admin deh";
  if (limited === "paused")    return "⏸️ Eh AI-nya lagi di-pause sama admin, tunggu bentar ya. Sabar!";
  if (limited === "toofast")   return "Chill bro, jangan ngebut ngetiknya 😅 tunggu sebentar dulu";
  if (limited === "hourlimit") return `⏳ Bro lu udah ${cfg.maxRequestsPerHour}x request sejam ini, kebanyakan! Tunggu sejam lagi ya 😬`;
  if (limited === "daylimit")  return `🛑 Wah lu udah abis jatah hariannya (${cfg.maxRequestsPerDay}x), tunggu reset jam 00.00 WIB ya bestie!`;

  try {
    const { konteks, hariIni, besok, tanggal } = buildContextData();

    const systemPrompt =
`Lu adalah bot WA kelas namanya SYTEAM-BOT. Gaya ngomong lu santai, gaul, kayak temen deket. Pake bahasa gue-lu, bukan saya-anda. Singkat aja, nggak usah panjang-panjang. Boleh pake singkatan kayak "udh", "gak", "emg", "blm", dll.
Hari ini: ${hariIni}, ${tanggal}. Besok: ${besok}.
Jawab HANYA berdasarkan data ini, jangan ngarang data PR atau jadwal:
${konteks}
Kalo data kosong bilang gak ada. Kalo pertanyaan di luar data (pelajaran umum, ngobrol, dll), jawab biasa aja kayak temen ngobrol.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...getHistory(userId),
      { role: "user", content: userMessage }
    ];

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: AI_MODEL,
        messages,
        max_tokens: 500,
        temperature: 0.8,
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://syteam-bot.railway.app",
          "X-Title": "SYTEAM-BOT"
        },
        timeout: 30000
      }
    );

    const reply = response.data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Respons AI kosong");

    addToHistory(userId, 'user', userMessage);
    addToHistory(userId, 'assistant', reply);
    recordUsage(userId);

    return reply;

  } catch (err) {
    console.error("❌ OpenRouter AI Error:", err.response?.data || err.message);
    if (err.response?.status === 429) return "Aduh lagi overload nih, coba lagi bentar ya! ⏳";
    if (err.code === 'ECONNABORTED')  return "Koneksinya timeout bro, coba lagi deh 🙏";
    return "Lagi ada error nih gengs, bentar ya gue benerin dulu 🙏";
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  askAI,
  handleAdminCommand,
  loadRateConfig,
  saveRateConfig,
  loadUsageStats,
  invalidateCache: () => {
    cachedContext  = null;
    cacheTimestamp = 0;
  }
};
