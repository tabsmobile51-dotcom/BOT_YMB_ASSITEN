const { GoogleGenAI } = require("@google/genai");
const path = require("path");
// ─────────────────────────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────────────────────────
const AI_MODEL = "gemini-3-flash-preview";
const VOLUME_PATH   = '/app/auth_info';
const PR_PATH       = path.join(VOLUME_PATH, 'pr.json');
const DEADLINE_PATH = path.join(VOLUME_PATH, 'deadline.json');
const { MAPEL_CONFIG, STRUKTUR_JADWAL, LABELS } = require('./pelajaran');
const db = require('./data');
// Init Gemini (ambil API key dari env GEMINI_API_KEY)
const ai = new GoogleGenAI({ apiKey: "AIzaSyDz9A2UTEVQULc7b4VBHE9q751Ak6hNgQU" });
// ─────────────────────────────────────────────────────────────
// RATE LIMITER (Reset Setiap Jam 00:00)
// ─────────────────────────────────────────────────────────────
const lastRequestTime = new Map();
const RATE_LIMIT_MS = 5000; // Limit diperpanjang jadi 5 detik
let currentDayTracker = new Date().getDate();

function isRateLimited(userId) {
const now = new Date();
const today = now.getDate();

// Reset map jika sudah ganti hari (Jam 00:00)
if (today !== currentDayTracker) {
    lastRequestTime.clear();
    currentDayTracker = today;
}

const last = lastRequestTime.get(userId) || 0;
const currentTime = now.getTime();

if (currentTime - last < RATE_LIMIT_MS) return true;
lastRequestTime.set(userId, currentTime);
return false;
}
// ─────────────────────────────────────────────────────────────
// CACHE KONTEKS
// ─────────────────────────────────────────────────────────────
let cachedContext  = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Fungsi Helper Waktu WIB agar akurat
function getNowWIB() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

function getNamaHari(date) {
return ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'][date.getDay()];
}

function getTanggalFormatted(date) {
return date.toLocaleDateString('id-ID', {
weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
});
}

function getWeekDates() {
const now = getNowWIB();
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
const nowWIB = getNowWIB();
const nowTs = nowWIB.getTime();

if (cachedContext && (nowTs - cacheTimestamp) < CACHE_TTL_MS) return cachedContext;

const currentData = db.getAll() || {};
const dates = getWeekDates();
const hariIni = getNamaHari(nowWIB);
const besokDate = new Date(nowTs + 86400000);
const besok = getNamaHari(besokDate);
const tanggal = getTanggalFormatted(nowWIB);

let jadwalTeks = "JADWAL:\n";
for (const [hari, mapelList] of Object.entries(STRUKTUR_JADWAL)) {
    jadwalTeks += `${hari}: ${mapelList.map(k => MAPEL_CONFIG[k] || k).join(', ')}\n`;
}

let prTeks = "PR/TUGAS:\n";
const daysKey   = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
const dayLabels = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT'];

for (let i = 0; i < 5; i++) {
    const hariKey = daysKey[i];
    const tugas   = currentData[hariKey];
    const tgl     = dates[i];

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
cacheTimestamp = nowTs;
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
history.push({ role, parts: [{ text: content }] });
if (history.length > 10) history.splice(0, history.length - 10);
}
// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function askAI(userMessage, userId = 'default') {
if (isRateLimited(userId)) {
return "Sabar dulu ya, jangan terlalu cepet ngetiknya 😅. Tunggu sebentar lagi.";
}

try {
    const { konteks, hariIni, besok, tanggal } = buildContextData();

    const systemPrompt =
`Kamu asisten bot WA kelas bernama SYTEAM-BOT. Jawab santai, singkat, pakai bahasa gaul Indonesia. Jangan terlalu formal.
Hari ini: ${hariIni}, ${tanggal}. Besok: ${besok}.
Jawab HANYA berdasarkan data ini, jangan ngarang data PR atau jadwal:
${konteks}
Kalau data kosong bilang tidak ada. Kalau pertanyaan di luar data (pelajaran, umum, dll), jawab seperti biasa.`;

    const history = getHistory(userId);

    const chat = ai.chats.create({
        model: AI_MODEL,
        config: {
            systemInstruction: systemPrompt,
            maxOutputTokens: 500,
            temperature: 0.7,
        },
        history: history,
    });

    const response = await chat.sendMessage({
        message: userMessage,
    });

    const reply = response.text?.trim();
    if (!reply) throw new Error("Respons AI kosong");

    addToHistory(userId, 'user', userMessage);
    addToHistory(userId, 'model', reply); 

    return reply;

} catch (err) {
    console.error("❌ Gemini AI Error:", err.message || err);
    if (err.status === 429) return "Lagi rame nih, coba lagi sebentar ya! ⏳";
    if (err.code === 'ECONNABORTED') return "Koneksi timeout, coba lagi ya! 🙏";
    return "Aduh, lagi ada gangguan nih. Coba lagi bentar ya! 🙏";
}
}
module.exports = { askAI };
