const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────────────────────────
const OPENROUTER_API_KEY = "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";
const AI_MODEL = "inclusionai/ling-2.6-1t:free";
const VOLUME_PATH      = '/app/auth_info';
const PR_PATH          = path.join(VOLUME_PATH, 'pr.json');
const DEADLINE_PATH    = path.join(VOLUME_PATH, 'deadline.json');
const RATE_CONFIG_PATH = path.join(VOLUME_PATH, 'rate_config.json');
const USAGE_STATS_PATH = path.join(VOLUME_PATH, 'usage_stats.json');

const { MAPEL_CONFIG, STRUKTUR_JADWAL, LABELS } = require('./pelajaran');
const db = require('./data');

// ─────────────────────────────────────────────────────────────
// RATE LIMIT CONFIG
// ─────────────────────────────────────────────────────────────
const DEFAULT_RATE_CONFIG = {
  globalLimitMs: 3000,
  maxRequestsPerHour: 30,
  maxRequestsPerDay: 300,
  adminNumbers: ["6289531549103"],
  bannedUsers: [],
  vipUsers: [],
  globalPause: false,
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
// USAGE STATS
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
  const dateKey = now.toISOString().slice(0, 10);
  const hourKey = `${dateKey}-${now.getHours()}`;

  if (!stats.users[userId]) stats.users[userId] = { total: 0, today: 0, thisHour: 0, lastSeen: null };
  stats.users[userId].total++;
  stats.users[userId].today++;
  stats.users[userId].thisHour++;
  stats.users[userId].lastSeen = now.toISOString();

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
  const now = Date.now();

  if (config.bannedUsers.includes(userId))  return "banned";
  if (config.globalPause)                   return "paused";
  if (config.adminNumbers.includes(userId)) return false;

  const multiplier = config.vipUsers.includes(userId) ? 2 : 1;

  const last = lastRequestTime.get(userId) || 0;
  if (now - last < config.globalLimitMs) return "toofast";

  const hourData = requestCountHour.get(userId) || { count: 0, windowStart: now };
  if (now - hourData.windowStart > 3600000) {
    requestCountHour.set(userId, { count: 1, windowStart: now });
  } else {
    if (hourData.count >= config.maxRequestsPerHour * multiplier) return "hourlimit";
    hourData.count++;
    requestCountHour.set(userId, hourData);
  }

  const dayData = requestCountDay.get(userId) || { count: 0, dayStart: now };
  if (!dayData.dayStart || new Date(dayData.dayStart).toDateString() !== new Date(now).toDateString()) {
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
// RESET OTOMATIS JAM 00.00
// ─────────────────────────────────────────────────────────────
function scheduleAutoReset() {
  function msUntilMidnight() {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

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
    setTimeout(doReset, msUntilMidnight());
  }

  const delay = msUntilMidnight();
  console.log(`⏰ Auto-reset dijadwalkan ${Math.round(delay / 60000)} menit lagi (jam 00.00 WIB)`);
  setTimeout(doReset, delay);
}

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
  if (dayOfWeek === 6)      monday.setDate(now.getDate() + 2);
  else if (dayOfWeek === 0) monday.setDate(now.getDate() + 1);
  else                      monday.setDate(now.getDate() - (dayOfWeek - 1));

  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);
  }
  return dates;
}

function buildContextData() {
  const now = Date.now();
  if (cachedContext && (now - cacheTimestamp) < CACHE_TTL_MS) return cachedContext;

  const currentData = db.getAll() || {};
  const dates   = getWeekDates();
  const hariIni = getNamaHari();
  const besok   = getNamaHari(new Date(now + 86400000));
  const tanggal = getTanggalFormatted();

  let jadwalTeks = "JADWAL:\n";
  for (const [hari, mapelList] of Object.entries(STRUKTUR_JADWAL)) {
    jadwalTeks += `${hari}: ${mapelList.map(k => MAPEL_CONFIG[k] || k).join(', ')}\n`;
  }

  let prTeks = "PR/TUGAS:\n";
  const daysKey   = ['senin','selasa','rabu','kamis','jumat'];
  const dayLabels = ['SENIN','SELASA','RABU','KAMIS','JUMAT'];

  for (let i = 0; i < 5; i++) {
    const tugas = currentData[daysKey[i]];
    if (!tugas || tugas === "" || tugas.includes("Belum ada tugas") || tugas.includes("Tidak ada PR")) {
      prTeks += `${dayLabels[i]} (${dates[i]}): kosong\n`;
    } else {
      const cleanTugas = tugas.replace(/\n/g," ").replace(/━━━━━━━━━━━━━━━━━━━━/g,"");
      prTeks += `${dayLabels[i]} (${dates[i]}): ${cleanTugas}\n`;
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
    if (!config.bannedUsers.includes(target)) config.bannedUsers.push(target);
    saveRateConfig(config);
    return `🚫 Oke, ${target} udah gue kick dari fitur AI. Bye bye 👋`;
  }

  if (msg.startsWith("!ai-unban ")) {
    const target = parts[1];
    config.bannedUsers = config.bannedUsers.filter(u => u !== target);
    saveRateConfig(config);
    return `✅ ${target} udah gue maafin, boleh pake AI lagi nih`;
  }

  if (msg.startsWith("!ai-vip ")) {
    const target = parts[1];
    if (!config.vipUsers.includes(target)) config.vipUsers.push(target);
    saveRateConfig(config);
    return `⭐ Wih, ${target} sekarang jadi VIP! Limit lu 2x lipat dari yang biasa`;
  }

  if (msg.startsWith("!ai-unvip ")) {
    const target = parts[1];
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
    return "🔄 Beres! Semua counter sama history udah gue bersiin dari nol";
  }

  if (msg === "!ai-stats") {
    const stats = loadUsageStats();
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = stats.daily[today] || 0;
    const topUsers = Object.entries(stats.users)
      .sort((a, b) => b[1].today - a[1].today)
      .slice(0, 5)
      .map(([uid, d], i) => `  ${i+1}. ...${uid.slice(-4)}: ${d.today}x hari ini (total ${d.total}x)`)
      .join("\n");

    return `📊 *Laporan Pemakaian AI*
━━━━━━━━━━━━━━━━━━
🔥 Hari ini: ${todayCount} request
📈 Sepanjang masa: ${stats.totalRequests} request
🕛 Reset terakhir: ${new Date(stats.lastReset).toLocaleString('id-ID')}

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
  const adminReply = handleAdminCommand(userId, userMessage);
  if (adminReply !== null) return adminReply;

  const limited = isRateLimited(userId);
  const cfg = loadRateConfig();

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

    const reply = response.data.choices[0]?.message?.content?.trim();
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
module.exports = { askAI, handleAdminCommand, loadRateConfig, saveRateConfig, loadUsageStats };
