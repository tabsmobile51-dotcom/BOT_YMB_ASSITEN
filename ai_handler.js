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
const CACHE_TTL_MS = 2000; // Gue turunin ke 2 detik biar data di data.json langsung update ke AI

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

    // PENTING: Ambil data fresh dari db.getAll() sebelum cek cache
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
            prTeks += `• ${dayLabels[i]} (${tgl}): Kosong ngab.\n`;
        } else {
            const cleanTugas = tugas.toString().replace(/\n/g, " ").replace(/━━━━━━━━━━━━━━━━━━━━/g, "").trim();
            prTeks += `• ${dayLabels[i]} (${tgl}): ${cleanTugas}\n`;
        }
    }

    let deadlineTeks = "\nDEADLINE KHUSUS:\n";
    deadlineTeks += currentData.deadline || "Gak ada deadline, aman.";

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
        return "Sabar ngab, jangan spam 😅. Jeda 5 detik ya!";
    }

    try {
        const { konteks, hariIni, besok, tanggal } = buildContextData();

        const systemPrompt =
`Lo itu SYTEAM-BOT, asisten kelas paling gokil.
Gaya ngomong: Santai, pake Gue/Lo, bahasanya bahasa tongkrongan (ngab, gas, mabar, aman, gercep, spill). 
Kalo ada yang nanya PR/Jadwal, jawab yang lengkap tapi tetep asik, jangan kaku kayak surat undangan.

Waktu Sekarang: ${hariIni}, ${tanggal}. Besok itu ${besok}.
Data Real-time (Pake ini buat jawab PR/Jadwal):
${konteks}

Kalo datanya kosong, bilang "Aman ngab, gak ada beban hari ini" atau sejenisnya.
Kalo nanya di luar data sekolah, jawab aja sekenanya sesama temen tongkrongan.`;

        const history = getHistory(userId);

        const chat = ai.chats.create({
            model: AI_MODEL,
            config: {
                systemInstruction: systemPrompt,
                maxOutputTokens: 500,
                temperature: 0.85, 
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
        return "Aduh, otak gue lagi korslet ngab. Coba lagi bentar ya! 🙏";
    }
}

module.exports = { askAI, resetLimit };
