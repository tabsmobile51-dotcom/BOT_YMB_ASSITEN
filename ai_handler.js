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

const { MAPEL_CONFIG, STRUKTUR_JADWAL, LABELS } = require('./pelajaran');
const db = require('./data'); // Mengambil data dari db.js agar sinkron

// ─────────────────────────────────────────────────────────────
// RATE LIMITER
// ─────────────────────────────────────────────────────────────
const lastRequestTime = new Map();
const RATE_LIMIT_MS = 3000;

function isRateLimited(userId) {
    const now  = Date.now();
    const last = lastRequestTime.get(userId) || 0;
    if (now - last < RATE_LIMIT_MS) return true;
    lastRequestTime.set(userId, now);
    return false;
}

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

// Helper untuk tanggal mingguan agar sinkron dengan scheduler
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

    // Jadwal ringkas
    let jadwalTeks = "JADWAL:\n";
    for (const [hari, mapelList] of Object.entries(STRUKTUR_JADWAL)) {
        jadwalTeks += `${hari}: ${mapelList.map(k => MAPEL_CONFIG[k] || k).join(', ')}\n`;
    }

    // PR ringkas (Logika sinkron dengan scheduler manual)
    let prTeks = "PR/TUGAS:\n";
    const daysKey = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
    const dayLabels = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT'];

    for (let i = 0; i < 5; i++) {
        const hariKey = daysKey[i];
        const tugas = currentData[hariKey];
        const tgl = dates[i];

        if (!tugas || tugas === "" || tugas.includes("Belum ada tugas") || tugas.includes("Tidak ada PR")) {
            prTeks += `${dayLabels[i]} (${tgl}): kosong\n`;
        } else {
            // Bersihkan teks dari format berlebih agar AI mudah baca
            const cleanTugas = tugas.replace(/\n/g, " ").replace(/━━━━━━━━━━━━━━━━━━━━/g, "");
            prTeks += `${dayLabels[i]} (${tgl}): ${cleanTugas}\n`;
        }
    }

    // Deadline khusus
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
// MAIN
// ─────────────────────────────────────────────────────────────
async function askAI(userMessage, userId = 'default') {
    if (isRateLimited(userId)) {
        return "Sabar dulu ya, jangan terlalu cepet ngetiknya 😅";
    }

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

        return reply;

    } catch (err) {
        console.error("❌ OpenRouter AI Error:", err.response?.data || err.message);
        if (err.response?.status === 429) return "Lagi rame nih, coba lagi sebentar ya! ⏳";
        if (err.code === 'ECONNABORTED') return "Koneksi timeout, coba lagi ya! 🙏";
        return "Aduh, lagi ada gangguan nih. Coba lagi bentar ya! 🙏";
    }
}

module.exports = { askAI };
