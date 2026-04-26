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

const ai = new GoogleGenAI({ apiKey: "AIzaSyABFSBgYam0k85Klg5eO3woNX0-X3UYwXU" });

// ─────────────────────────────────────────────────────────────
// HELPER TIMEZONE JAKARTA
// ─────────────────────────────────────────────────────────────

// Selalu kembalikan Date sekarang dalam konteks WIB
function getNowJakarta() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

function getNamaHari(date) {
    // date harus sudah di-convert ke WIB sebelum masuk sini
    return ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'][date.getDay()];
}

function getTanggalFormatted(date) {
    // Format langsung dari date yang sudah WIB
    return date.toLocaleDateString('id-ID', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
        timeZone: 'Asia/Jakarta'
    });
}

function getWeekDates() {
    const now = getNowJakarta();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);

    if (dayOfWeek === 6) monday.setDate(now.getDate() + 2);      // Sabtu → Senin depan
    else if (dayOfWeek === 0) monday.setDate(now.getDate() + 1); // Minggu → Senin depan
    else monday.setDate(now.getDate() - (dayOfWeek - 1));        // Weekday → Senin minggu ini

    const dates = [];
    for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
    }
    return dates;
}

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
// CACHE KONTEKS (hanya untuk data PR/jadwal dari DB)
// Tanggal/hari TIDAK dicache — selalu real-time
// ─────────────────────────────────────────────────────────────
let cachedPRJadwal  = null;
let cacheTimestamp  = 0;
const CACHE_TTL_MS  = 5 * 60 * 1000;

function buildContextData() {
    const now = Date.now();

    // ── Tanggal & hari selalu dihitung ulang, TIDAK ikut cache ──
    const nowJkt  = getNowJakarta();

    // Besok dalam WIB
    const besokJkt = getNowJakarta();
    besokJkt.setDate(besokJkt.getDate() + 1);

    const hariIni = getNamaHari(nowJkt);
    const besok   = getNamaHari(besokJkt);
    const tanggal = getTanggalFormatted(nowJkt);

    // ── PR & Jadwal boleh dicache ──
    if (!cachedPRJadwal || (now - cacheTimestamp) >= CACHE_TTL_MS) {
        const currentData = db.getAll() || {};
        const dates = getWeekDates();

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

        cachedPRJadwal = jadwalTeks + prTeks + deadlineTeks;
        cacheTimestamp = now;
    }

    return { konteks: cachedPRJadwal, hariIni, besok, tanggal };
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
        return "Sabar dulu ya, jangan terlalu cepet ngetiknya 😅";
    }

    try {
        // Selalu build fresh — tanggal/hari real-time, PR/jadwal dari cache
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
