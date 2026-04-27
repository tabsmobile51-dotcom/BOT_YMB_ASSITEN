const { GoogleGenAI } = require("@google/genai");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────────────────────────
const AI_MODEL = "gemini-3-flash-preview";
const VOLUME_PATH   = '/app/auth_info';
const { MAPEL_CONFIG, STRUKTUR_JADWAL, LABELS } = require('./pelajaran');
const db = require('./data');

const ai = new GoogleGenAI({ apiKey: "AIzaSyDz9A2UTEVQULc7b4VBHE9q751Ak6hNgQU" });

// ─────────────────────────────────────────────────────────────
// RATE LIMITER (Reset Setiap Jam 00:00 + Fitur Riset Admin)
// ─────────────────────────────────────────────────────────────
const lastRequestTime = new Map();
const RATE_LIMIT_MS = 5000; 
let currentDayTracker = new Date().getDate();

function isRateLimited(userId) {
    const now = new Date();
    const today = now.getDate();

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

// FUNGSI KHUSUS ADMIN UNTUK RISET LIMIT
function resetLimit(userId) {
    if (lastRequestTime.has(userId)) {
        lastRequestTime.delete(userId);
        return true;
    }
    return false;
}

// ─────────────────────────────────────────────────────────────
// CACHE KONTEKS
// ─────────────────────────────────────────────────────────────
let cachedContext  = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

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

    // Selalu ambil data terbaru dari db
    const currentData = db.getAll() || {};

    if (cachedContext && (nowTs - cacheTimestamp) < CACHE_TTL_MS) return cachedContext;

    const dates = getWeekDates();
    const hariIni = getNamaHari(nowWIB);
    const besokDate = new Date(nowTs + 86400000);
    const besok = getNamaHari(besokDate);
    const tanggal = getTanggalFormatted(nowWIB);

    let jadwalTeks = "JADWAL PELAJARAN:\n";
    for (const [hari, mapelList] of Object.entries(STRUKTUR_JADWAL)) {
        jadwalTeks += `- ${hari.toUpperCase()}: ${mapelList.map(k => MAPEL_CONFIG[k] || k).join(', ')}\n`;
    }

    let prTeks = "\nLIST PR/TUGAS:\n";
    const daysKey   = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
    const dayLabels = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

    for (let i = 0; i < 5; i++) {
        const hariKey = daysKey[i];
        const tugas   = currentData[hariKey];
        const tgl     = dates[i];

        if (!tugas || tugas === "" || tugas.includes("Belum ada tugas") || tugas.includes("Tidak ada PR")) {
            prTeks += `• ${dayLabels[i]} (${tgl}): Aman, gak ada tugas.\n`;
        } else {
            const cleanTugas = tugas.replace(/\n/g, " ").replace(/━━━━━━━━━━━━━━━━━━━━/g, "").trim();
            prTeks += `• ${dayLabels[i]} (${tgl}): ${cleanTugas}\n`;
        }
    }

    let deadlineTeks = "\nDEADLINE PENTING:\n";
    deadlineTeks += currentData.deadline || "Gak ada deadline mendesak, santai aja.";

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
        return "Sabar ngab, jarinya cepet amat ngetiknya 😅. Tunggu bentar lagi ya!";
    }

    try {
        const { konteks, hariIni, besok, tanggal } = buildContextData();

        // System Prompt dibikin lebih gaul dan "tongkrongan"
        const systemPrompt =
`Lo adalah SYTEAM-BOT, asisten asik buat anak-anak kelas.
Gaya bicara: Gaul Jakarta, santai, pake istilah kayak 'ngab', 'gas', 'aman', 'mabar', 'gercep'. 
Jangan kaku kayak bot CS bank. Jangan pake 'Saya/Anda', pake 'Gue/Lo' atau 'Kalian' aja.

Info Waktu: Hari ini ${hariIni}, ${tanggal}. Besok itu hari ${besok}.
Data Kelas (PENTING: Jawab sesuai data ini, jangan ngaco!):
${konteks}

Kalo ditanya PR atau Jadwal tapi datanya kosong, bilang "Lagi kosong nih, aman buat mabar" atau sejenisnya. 
Kalo nanya di luar itu (curhat, nanya tugas umum), ladenin aja sesantai mungkin tapi tetep singkat.`;

        const history = getHistory(userId);

        const chat = ai.chats.create({
            model: AI_MODEL,
            config: {
                systemInstruction: systemPrompt,
                maxOutputTokens: 500,
                temperature: 0.8, // Sedikit lebih kreatif biar gak kaku
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
        return "Aduh, otak gue lagi nge-lag nih ngab. Coba tanya lagi bentar ya! 🙏";
    }
}

module.exports = { askAI, resetLimit };
