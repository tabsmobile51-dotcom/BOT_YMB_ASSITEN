const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "ISI_API_KEY_KAMU_DISINI";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Path data dari volume (samain sama path di bot kamu)
const VOLUME_PATH = '/app/auth_info';
const PR_PATH     = path.join(VOLUME_PATH, 'pr.json');
const DEADLINE_PATH = path.join(VOLUME_PATH, 'deadline.json');

// Import struktur jadwal & nama mapel
const { MAPEL_CONFIG, STRUKTUR_JADWAL, LABELS } = require('./pelajaran');

// ─────────────────────────────────────────────────────────────
// HELPER — Baca JSON dengan aman
// ─────────────────────────────────────────────────────────────
function readJson(filePath) {
    try {
        if (!fs.existsSync(filePath)) return {};
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

// ─────────────────────────────────────────────────────────────
// HELPER — Ambil nama hari ini & besok dalam bahasa Indonesia
// ─────────────────────────────────────────────────────────────
function getNamaHari(date = new Date()) {
    const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    return HARI[date.getDay()];
}

function getTanggalFormatted(date = new Date()) {
    return date.toLocaleDateString('id-ID', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
}

// ─────────────────────────────────────────────────────────────
// BUILDER — Buat ringkasan data PR & jadwal jadi teks konteks
// ─────────────────────────────────────────────────────────────
function buildContextData() {
    const prData       = readJson(PR_PATH);
    const deadlineData = readJson(DEADLINE_PATH);

    const hariIni   = getNamaHari();
    const besok     = getNamaHari(new Date(Date.now() + 86400000));
    const tanggal   = getTanggalFormatted();

    // ── Jadwal per hari ──
    let jadwalTeks = "📅 JADWAL PELAJARAN PER HARI:\n";
    for (const [hari, mapelList] of Object.entries(STRUKTUR_JADWAL)) {
        const namaMapel = mapelList.map(k => MAPEL_CONFIG[k] || k).join(', ');
        jadwalTeks += `• ${hari.charAt(0).toUpperCase() + hari.slice(1)}: ${namaMapel}\n`;
    }

    // ── Data PR per hari ──
    let prTeks = "\n📝 DATA PR / TUGAS PER HARI:\n";
    const hariUrut = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
    for (const hari of hariUrut) {
        const tugasList = prData[hari];
        if (!tugasList || Object.keys(tugasList).length === 0) {
            prTeks += `• ${hari.charAt(0).toUpperCase() + hari.slice(1)}: Kosong\n`;
            continue;
        }
        prTeks += `• ${hari.charAt(0).toUpperCase() + hari.slice(1)}:\n`;
        for (const [mapelKey, tugas] of Object.entries(tugasList)) {
            const namaMapel = MAPEL_CONFIG[mapelKey] || mapelKey;
            const labelKey  = tugas.label?.toLowerCase() || '';
            const labelTeks = LABELS[labelKey] || tugas.label || '';
            const deadlineTeks = tugas.deadline ? `(Deadline: ${tugas.deadline})` : '';
            const linkTeks = tugas.fileUrl ? `[ada file: ${tugas.fileUrl}]` : '';
            prTeks += `  - ${namaMapel}: ${tugas.tugas} ${labelTeks} ${deadlineTeks} ${linkTeks}\n`;
        }
    }

    // ── Deadline khusus ──
    let deadlineTeks = "\n⏰ DEADLINE KHUSUS:\n";
    if (!deadlineData || Object.keys(deadlineData).length === 0) {
        deadlineTeks += "Tidak ada deadline khusus.\n";
    } else {
        for (const [tugas, tgl] of Object.entries(deadlineData)) {
            deadlineTeks += `• ${tugas}: ${tgl}\n`;
        }
    }

    return {
        konteks: jadwalTeks + prTeks + deadlineTeks,
        hariIni,
        besok,
        tanggal
    };
}

// ─────────────────────────────────────────────────────────────
// RIWAYAT PERCAKAPAN per user (in-memory, reset saat bot restart)
// ─────────────────────────────────────────────────────────────
const chatHistories = new Map(); // key: nomor WA, value: array history

function getHistory(userId) {
    if (!chatHistories.has(userId)) {
        chatHistories.set(userId, []);
    }
    return chatHistories.get(userId);
}

function addToHistory(userId, role, text) {
    const history = getHistory(userId);
    history.push({ role, parts: [{ text }] });
    // Batasi history 20 pesan terakhir agar tidak membengkak
    if (history.length > 20) history.splice(0, history.length - 20);
}

// ─────────────────────────────────────────────────────────────
// MAIN — Fungsi askAI yang dipanggil dari handler.js
// ─────────────────────────────────────────────────────────────
async function askAI(userMessage, userId = 'default') {
    try {
        const { konteks, hariIni, besok, tanggal } = buildContextData();

        const systemPrompt = `Kamu adalah asisten bot WhatsApp kelas yang bernama SYTEAM-BOT. 
Kamu ramah, santai, dan ngobrol kayak teman sekelas — pakai bahasa gaul Indonesia yang natural, tidak kaku.
Kamu HARUS menjawab berdasarkan data nyata berikut ini. Jangan mengarang data.

📌 INFO WAKTU SEKARANG:
• Hari ini  : ${hariIni.charAt(0).toUpperCase() + hariIni.slice(1)}, ${tanggal}
• Besok     : ${besok.charAt(0).toUpperCase() + besok.slice(1)}

${konteks}

ATURAN PENTING:
1. Kalau ditanya PR/tugas hari tertentu, jawab berdasarkan data di atas.
2. Kalau data kosong untuk hari itu, bilang "kosong / tidak ada tugas".
3. Kalau ada deadline, sebutkan deadline-nya.
4. Kalau ada link file, kasih tau ada filenya.
5. Jawaban singkat, padat, santai — tidak perlu panjang-panjang kecuali diminta.
6. Kalau ditanya hal di luar jadwal/PR (misal matematika, sains, dll), boleh jawab seperti biasa.`;

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-lite",
            systemInstruction: systemPrompt,
        });

        // Ambil history percakapan user ini
        const history = getHistory(userId);

        const chat = model.startChat({ history });

        const result = await chat.sendMessage(userMessage);
        const responseText = result.response.text();

        // Simpan ke history
        addToHistory(userId, 'user', userMessage);
        addToHistory(userId, 'model', responseText);

        return responseText;

    } catch (err) {
        console.error("❌ Gemini AI Error:", err.message);
        return "Aduh, lagi ada gangguan nih. Coba lagi bentar ya! 🙏";
    }
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────
module.exports = { askAI };
