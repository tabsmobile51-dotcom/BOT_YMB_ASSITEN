const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────────────────────────
const OPENROUTER_API_KEY = "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";
const AI_MODEL = "inclusionai/ling-2.6-1t:free";
const VOLUME_PATH   = '/app/auth_info';
const PR_PATH       = path.join(VOLUME_PATH, 'pr.json');
const DEADLINE_PATH = path.join(VOLUME_PATH, 'deadline.json');
const RATE_CONFIG_PATH = path.join(VOLUME_PATH, 'rate_config.json');
const USAGE_STATS_PATH = path.join(VOLUME_PATH, 'usage_stats.json');

const { MAPEL_CONFIG, STRUKTUR_JADWAL, LABELS } = require('./pelajaran');
const db = require('./data');

// ─────────────────────────────────────────────────────────────
// RATE LIMIT CONFIG (bisa diubah admin)
// ─────────────────────────────────────────────────────────────
const DEFAULT_RATE_CONFIG = {
  globalLimitMs: 3000,          // Jeda minimum antar pesan (ms)
  maxRequestsPerHour: 30,       // Maks request per user per jam
  maxRequestsPerDay: 300,       // Maks request per user per hari
  adminNumbers: ["6289531549103"],             // Nomor admin (misal: ["628123456789"])
  bannedUsers: [],              // User yang diblokir
  vipUsers: [],                 // VIP = limit 2x lipat
  globalPause: false,           // Pause semua AI sementara
};

function loadRateConfig() {
  try {
    if (fs.existsSync(RATE_CONFIG_PATH)) {
      return { ...DEFAULT_RATE_CONFIG, ...JSON.parse(fs.readFileSync(RATE_CONFIG_PATH, 'utf8')) };
    }
  } catch (e) { console.error("Gagal load rate config:", e.message); }
  return { ...DEFAULT_RATE_CONFIG };
}

function saveRateConfig(config) {
  try {
    fs.mkdirSync(VOLUME_PATH, { recursive: true });
    fs.writeFileSync(RATE_CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) { console.error("Gagal save rate config:", e.message); }
}

// ─────────────────────────────────────────────────────────────
// USAGE STATS (untuk riset & monitoring)
// ─────────────────────────────────────────────────────────────
function loadUsageStats() {
  try {
    if (fs.existsSync(USAGE_STATS_PATH)) {
      return JSON.parse(fs.readFileSync(USAGE_STATS_PATH, 'utf8'));
    }
  } catch (e) { console.error("Gagal load usage stats:", e.message); }
  return { users: {}, daily: {}, hourly: {}, totalRequests: 0, lastReset: new Date().toISOString() };
}

function saveUsageStats(stats) {
  try {
    fs.mkdirSync(VOLUME_PATH, { recursive: true });
    fs.writeFileSync(USAGE_STATS_PATH, JSON.stringify(stats, null, 2));
  } catch (e) { console.error("Gagal save usage stats:", e.message); }
}

function recordUsage(userId) {
  const stats = loadUsageStats();
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);         // "2025-01-15"
  const hourKey = `${dateKey}-${now.getHours()}`;          // "2025-01-15-14"

  // Per user
  if (!stats.users[userId]) stats.users[userId] = { total: 0, today: 0, thisHour: 0, lastSeen: null };
  stats.users[userId].total++;
  stats.users[userId].today++;
  stats.users[userId].thisHour++;
  stats.users[userId].lastSeen = now.toISOString();

  // Per hari
  stats.daily[dateKey] = (stats.daily[dateKey] || 0) + 1;

  // Per jam
  stats.hourly[hourKey] = (stats.hourly[hourKey] || 0) + 1;

  // Total
  stats.totalRequests++;

  saveUsageStats(stats);
}

// ─────────────────────────────────────────────────────────────
// RATE LIMITER (ditingkatkan)
// ─────────────────────────────────────────────────────────────
const lastRequestTime = new Map();
const requestCountHour = new Map(); // { userId: { count, windowStart } }
const requestCountDay  = new Map(); // { userId: { count, dayStart } }

function isRateLimited(userId) {
  const config = loadRateConfig();
  const now = Date.now();

  // Cek banned
  if (config.bannedUsers.includes(userId)) return "banned";

  // Cek global pause
  if (config.globalPause) return "paused";

  // Admin bypass semua limit
  if (config.adminNumbers.includes(userId)) return false;

  // Multiplier untuk VIP
  const multiplier = config.vipUsers.includes(userId) ? 2 : 1;

  // Cek jeda minimum
  const last = lastRequestTime.get(userId) || 0;
  if (now - last < config.globalLimitMs) return "toofast";

  // Cek limit per jam
  const hourData = requestCountHour.get(userId) || { count: 0, windowStart: now };
  if (now - hourData.windowStart > 3600000) {
    requestCountHour.set(userId, { count: 1, windowStart: now });
  } else {
    if (hourData.count >= config.maxRequestsPerHour * multiplier) return "hourlimit";
    hourData.count++;
    requestCountHour.set(userId, hourData);
  }

  // Cek limit per hari
  const dayData = requestCountDay.get(userId) || { count: 0, dayStart: now };
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  if (now < dayStart.getTime() || !dayData.dayStart || new Date(dayData.dayStart).toDateString() !== new Date(now).toDateString()) {
    requestCountDay.set(userId, { count: 1, dayStart: now });
  } else {
    if (dayData.count >= config.maxRequestsPerDay * multiplier) return "daylimit";
    dayData.count++;
    requestCountDay.set(userId, dayData);
  }

  lastRequestTime.set(userId, now);
  return false;
}

// ─────────────────────────────────────────────────────────────
// RESET OTOMATIS JAM 00.00 (Midnight Reset)
// ─────────────────────────────────────────────────────────────
function scheduleAutoReset() {
  function msUntilMidnight() {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // Tengah malam berikutnya
    return midnight.getTime() - now.getTime();
  }

  function doReset() {
    console.log("🔄 Auto-reset AI usage stats jam 00.00 WIB...");

    // Reset counter in-memory
    requestCountDay.clear();
    requestCountHour.clear();
    lastRequestTime.clear();
    chatHistories.clear(); // Bersihkan juga riwayat chat

    // Reset stats harian per user (tapi simpan total)
    const stats = loadUsageStats();
    for (const uid in stats.users) {
      stats.users[uid].today = 0;
      stats.users[uid].thisHour = 0;
    }
    // Hapus data hourly & daily yang lebih dari 7 hari
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    for (const key in stats.hourly) {
      if (new Date(key.slice(0, 10)) < cutoff) delete stats.hourly[key];
    }
    for (const key in stats.daily) {
      if (new Date(key) < cutoff) delete stats.daily[key];
    }
    stats.lastReset = new Date().toISOString();
    saveUsageStats(stats);

    console.log("✅ Reset selesai!");

    // Jadwal ulang untuk keesokan harinya
    setTimeout(doReset, msUntilMidnight());
  }

  const delay = msUntilMidnight();
  console.log(`⏰ Auto-reset dijadwalkan ${Math.round(delay / 60000)} menit lagi (jam 00.00 WIB)`);
  setTimeout(doReset, delay);
}

// Jalankan scheduler saat modul dimuat
scheduleAutoReset();

// ─────────────────────────────────────────────────────────────
// CACHE KONTEKS
// ─────────────────────────────────────────────────────────────
let cachedContext  = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getNamaHari(date = new Date()) {
  return ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'][date.getDay()];
}
function getTanggalFormatted(date = new Date()) {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}
function getWeekDates() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  if (dayOfWeek === 6) monday.setDate(now.getDate() + 2);
  else if (dayOfWeek === 0) monday.setDate(now.getDate() + 1);
  else monday.setDate(now.getDate() - (dayOfWeek - 1));

  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
  }
  return dates;
}

function buildContextData() {
  const now = Date.now();
  if (cachedContext && (now - cacheTimestamp) < CACHE_TTL_MS) return cachedContext;

  const currentData = db.getAll() || {};
  const dates = getWeekDates();
  const hariIni = getNamaHari();
  const besok = getNamaHari(new Date(now + 86400000));
  const tanggal = getTanggalFormatted();

  let jadwalTeks = "JADWAL:\n";
  for (const [hari, mapelList] of Object.entries(STRUKTUR_JADWAL)) {
    jadwalTeks += `${hari}: ${mapelList.map(k => MAPEL_CONFIG[k] || k).join(', ')}\n`;
  }

  let prTeks = "PR/TUGAS:\n";
  const daysKey   = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
  const dayLabels = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT'];

  for (let i = 0; i < 5; i++) {
    const hariKey = daysKey[i];
    const tugas = currentData[hariKey];
    const tgl = dates[i];

    if (!tugas || tugas === "" || tugas.includes("Belum ada tugas") || tugas.includes("Tidak ada PR")) {
      prTeks += `${dayLabels[i]} (${tgl}): kosong\n`;
    } else {
      const cleanTugas = tugas.replace(/\n/g, " ").replace(/━━━━━━━━━━━━━━━━━━━━/g, "");
      prTeks += `${dayLabels[i]} (${tgl}): ${cleanTugas}\n`;
    }
  }

  let deadlineTeks = "DEADLINE KHUSUS:\n";
  deadlineTeks += currentData.deadline || "tidak ada\n";

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
  if (history.length > 10) history.splice(0, history.length - 10);
}

// ─────────────────────────────────────────────────────────────
// ADMIN COMMANDS
// ─────────────────────────────────────────────────────────────

/**
 * Cek apakah pesan adalah perintah admin AI
 * @param {string} userId - Nomor WA pengirim
 * @param {string} message - Pesan yang dikirim
 * @returns {string|null} - Balasan jika command valid, null jika bukan command
 */
function handleAdminCommand(userId, message) {
  const config = loadRateConfig();

  // Hanya admin yang bisa pakai command ini
  if (!config.adminNumbers.includes(userId)) return null;

  const msg = message.trim().toLowerCase();
  const parts = message.trim().split(" ");

  // !ai-setlimit [ms] → ubah jeda minimum
  if (msg.startsWith("!ai-setlimit ")) {
    const val = parseInt(parts[1]);
    if (isNaN(val) || val < 500) return "❌ Minimal 500ms ya bos";
    config.globalLimitMs = val;
    saveRateConfig(config);
    return `✅ Jeda minimum diubah ke ${val}ms`;
  }

  // !ai-sethour [n] → ubah max per jam
  if (msg.startsWith("!ai-sethour ")) {
    const val = parseInt(parts[1]);
    if (isNaN(val) || val < 1) return "❌ Minimal 1";
    config.maxRequestsPerHour = val;
    saveRateConfig(config);
    return `✅ Max per jam diubah ke ${val}x`;
  }

  // !ai-setday [n] → ubah max per hari
  if (msg.startsWith("!ai-setday ")) {
    const val = parseInt(parts[1]);
    if (isNaN(val) || val < 1) return "❌ Minimal 1";
    config.maxRequestsPerDay = val;
    saveRateConfig(config);
    return `✅ Max per hari diubah ke ${val}x`;
  }

  // !ai-ban [nomor] → ban user
  if (msg.startsWith("!ai-ban ")) {
    const target = parts[1];
    if (!config.bannedUsers.includes(target)) config.bannedUsers.push(target);
    saveRateConfig(config);
    return `🚫 ${target} dibanned dari AI`;
  }

  // !ai-unban [nomor] → unban user
  if (msg.startsWith("!ai-unban ")) {
    const target = parts[1];
    config.bannedUsers = config.bannedUsers.filter(u => u !== target);
    saveRateConfig(config);
    return `✅ ${target} di-unban`;
  }

  // !ai-vip [nomor] → jadikan VIP
  if (msg.startsWith("!ai-vip ")) {
    const target = parts[1];
    if (!config.vipUsers.includes(target)) config.vipUsers.push(target);
    saveRateConfig(config);
    return `⭐ ${target} dijadiin VIP (limit 2x)`;
  }

  // !ai-pause → pause semua AI
  if (msg === "!ai-pause") {
    config.globalPause = true;
    saveRateConfig(config);
    return "⏸️ AI di-pause untuk semua user";
  }

  // !ai-resume → resume AI
  if (msg === "!ai-resume") {
    config.globalPause = false;
    saveRateConfig(config);
    return "▶️ AI diaktifkan kembali";
  }

  // !ai-reset → reset semua counter sekarang
  if (msg === "!ai-reset") {
    requestCountDay.clear();
    requestCountHour.clear();
    lastRequestTime.clear();
    chatHistories.clear();
    return "🔄 Semua counter & history AI direset!";
  }

  // !ai-stats → lihat statistik pemakaian
  if (msg === "!ai-stats") {
    const stats = loadUsageStats();
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = stats.daily[today] || 0;
    const topUsers = Object.entries(stats.users)
      .sort((a, b) => b[1].today - a[1].today)
      .slice(0, 5)
      .map(([uid, d]) => `  ${uid.slice(-4)}: ${d.today} hari ini / ${d.total} total`)
      .join("\n");

    return `📊 *Statistik AI Hari Ini*
━━━━━━━━━━━━━━━━━━
Total request hari ini: ${todayCount}
Total semua waktu: ${stats.totalRequests}
Reset terakhir: ${new Date(stats.lastReset).toLocaleString('id-ID')}

Top user hari ini:
${topUsers || "  (belum ada data)"}
━━━━━━━━━━━━━━━━━━`;
  }

  // !ai-config → lihat konfigurasi sekarang
  if (msg === "!ai-config") {
    return `⚙️ *Konfigurasi Rate Limit AI*
━━━━━━━━━━━━━━━━━━
Jeda minimum : ${config.globalLimitMs}ms
Max/jam       : ${config.maxRequestsPerHour}x
Max/hari      : ${config.maxRequestsPerDay}x
Status AI     : ${config.globalPause ? "⏸️ PAUSE" : "▶️ AKTIF"}
VIP users     : ${config.vipUsers.length} user
Banned users  : ${config.bannedUsers.length} user
━━━━━━━━━━━━━━━━━━
*Perintah admin:*
!ai-setlimit [ms] | !ai-sethour [n] | !ai-setday [n]
!ai-ban/unban/vip [nomor] | !ai-pause/resume | !ai-reset | !ai-stats`;
  }

  return null; // Bukan command admin
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
  if (limited === "banned")   return "🚫 Kamu kena banned dari fitur AI. Hubungi admin ya.";
  if (limited === "paused")   return "⏸️ AI lagi di-pause sementara sama admin. Tunggu bentar ya!";
  if (limited === "toofast")  return "Sabar dulu ya, jangan terlalu cepet ngetiknya 😅";
  if (limited === "hourlimit") return `⏳ Kamu udah nyampe limit per jam (${loadRateConfig().maxRequestsPerHour}x). Tunggu sejam lagi ya!`;
  if (limited === "daylimit") return `🛑 Limit harian kamu habis (${loadRateConfig().maxRequestsPerDay}x). Reset jam 00.00 WIB!`;

  try {
    const { konteks, hariIni, besok, tanggal } = buildContextData();

    const systemPrompt =
`Kamu asisten bot WA kelas bernama SYTEAM-BOT. Jawab santai, singkat, pakai bahasa gaul Indonesia. Jangan terlalu formal.
Hari ini: ${hariIni}, ${tanggal}. Besok: ${besok}.
Jawab HANYA berdasarkan data ini, jangan ngarang data PR atau jadwal:
${konteks}
Kalau data kosong bilang tidak ada. Kalau pertanyaan di luar data (pelajaran, umum, dll), jawab seperti biasa.`;

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
        temperature: 0.7,
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

    const reply = response.data.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error("Respons AI kosong");

    addToHistory(userId, 'user', userMessage);
    addToHistory(userId, 'assistant', reply);

    // Catat usage
    recordUsage(userId);

    return reply;

  } catch (err) {
    console.error("❌ OpenRouter AI Error:", err.response?.data || err.message);
    if (err.response?.status === 429) return "Lagi rame nih, coba lagi sebentar ya! ⏳";
    if (err.code === 'ECONNABORTED') return "Koneksi timeout, coba lagi ya! 🙏";
    return "Aduh, lagi ada gangguan nih. Coba lagi bentar ya! 🙏";
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = { askAI, handleAdminCommand, loadRateConfig, saveRateConfig, loadUsageStats };
