const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "ISI_API_KEY_OPENROUTER_DISINI";

// Model gratis yang tersedia di OpenRouter (tidak perlu bayar)
const AI_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

const VOLUME_PATH   = '/app/auth_info';
const PR_PATH       = path.join(VOLUME_PATH, 'pr.json');
const DEADLINE_PATH = path.join(VOLUME_PATH, 'deadline.json');

const { MAPEL_CONFIG, STRUKTUR_JADWAL, LABELS } = require('./pelajaran');

// ─────────────────────────────────────────────────────────────
// RATE LIMITER — maks 1 request per 3 detik per user
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
// CACHE KONTEKS — rebuild tiap 5 menit
// ─────────────────────────────────────────────────────────────
let cachedContext  = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function readJson(filePath) {
    try {
        if (!fs.existsSync(filePath)) return {};
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { return {}; }
}

function getNamaHari(date = new Date()) {
    return ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'][date.getDay()];
}

function getTanggalFormatted(date = new Date()) {
    return date.toLocaleDateString('id-ID', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
}

function buildContextData() {
    const now = Date.now();
    if (cachedContext && (now - cacheTimestamp) < CACHE_TTL_MS) return cachedContext;

    const prData       = readJson(PR_PATH);
    const deadlineData = readJson(DEADLINE_PATH);
    const hariIni      = getNamaHari();
    const besok        = getNamaHari(new Date(now + 86400000));
    const tanggal      = getTanggalFormatted();

    // Jadwal ringkas
    let jadwalTeks = "JADWAL:\n";
    for (const [hari, mapelList] of Object.entries(STRUKTUR_JADWAL)) {
        jadwalTeks += `${hari}: ${mapelList.map(k => MAPEL_CONFIG[k] || k).join(', ')}\n`;
    }

    // PR ringkas
    let prTeks = "PR/TUGAS:\n";
    const hariUrut = ['senin','selasa','rabu','kamis','jumat'];
    for (const hari of hariUrut) {
        const tugasList = prData[hari];
        if (!tugasList || Object.keys(tugasList).length === 0) {
            prTeks += `${hari}: kosong\n`;
            continue;
        }
        for (const [mapelKey, tugas] of Object.entries(tugasList)) {
            const nama     = MAPEL_CONFIG[mapelKey] || mapelKey;
            const deadline = tugas.deadline ? ` (deadline: ${tugas.deadline})` : '';
            const file     = tugas.fileUrl ? ' [ada file]' : '';
            prTeks += `${hari} - ${nama}: ${tugas.tugas}${deadline}${file}\n`;
        }
    }

    // Deadline khusus
    let deadlineTeks = "DEADLINE KHUSUS:\n";
    const dl = Object.entries(deadlineData);
    deadlineTeks += dl.length === 0
        ? "tidak ada\n"
        : dl.map(([t, tgl]) => `${t}: ${tgl}`).join('\n') + '\n';

    cachedContext  = { konteks: jadwalTeks + prTeks + deadlineTeks, hariIni, besok, tanggal };
    cacheTimestamp = now;
    return cachedContext;
}

// ─────────────────────────────────────────────────────────────
// RIWAYAT CHAT per user — maks 10 pesan
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

        // Susun messages: system + history + pesan baru
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

        // Simpan ke history
        addToHistory(userId, 'user', userMessage);
        addToHistory(userId, 'assistant', reply);

        return reply;

    } catch (err) {
        console.error("❌ OpenRouter AI Error:", err.response?.data || err.message);

        if (err.response?.status === 429) {
            return "Lagi rame nih, coba lagi sebentar ya! ⏳";
        }
        if (err.code === 'ECONNABORTED') {
            return "Koneksi timeout, coba lagi ya! 🙏";
        }
        return "Aduh, lagi ada gangguan nih. Coba lagi bentar ya! 🙏";
    }
}

module.exports = { askAI };
