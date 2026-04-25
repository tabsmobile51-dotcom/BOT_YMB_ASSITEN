const { QUIZ_BANK } = require('./quiz');
const { JADWAL_PELAJARAN: JADWAL_STATIS, MOTIVASI_SEKOLAH } = require('./constants');
const db = require('./data');
const fs = require('fs');
const axios = require('axios');

const ID_GRUP_TUJUAN = '120363403625197368@g.us';
const KUIS_PATH = '/app/auth_info/kuis.json';
const LAST_SENT_PATH = '/app/auth_info/last_sent.json';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getWIBDate() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

/**
 * FIX: Hitung tanggal Senin–Jumat minggu aktif ATAU minggu depan.
 * Jika hari ini Sabtu/Minggu → ambil minggu depan.
 * Selalu kembalikan 5 tanggal (Senin=index 0 … Jumat=index 4).
 */
function getWeekDates() {
    const now = getWIBDate();
    const dayOfWeek = now.getDay(); // 0=Minggu, 6=Sabtu

    const monday = new Date(now);
    if (dayOfWeek === 6) {
        monday.setDate(now.getDate() + 2);       // Sabtu → Senin depan
    } else if (dayOfWeek === 0) {
        monday.setDate(now.getDate() + 1);       // Minggu → Senin depan
    } else {
        monday.setDate(now.getDate() - (dayOfWeek - 1)); // Senin–Jumat → Senin minggu ini
    }

    const dates = [];
    for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
    }
    return { dates, periode: `${dates[0]} - ${dates[4]}` };
}

// ─── PERSISTENSI LAST SENT ────────────────────────────────────────────────────

function readLastSent() {
    try {
        if (fs.existsSync(LAST_SENT_PATH)) {
            return JSON.parse(fs.readFileSync(LAST_SENT_PATH, 'utf-8'));
        }
    } catch (e) {
        console.error("Gagal baca last_sent.json:", e.message);
    }
    return {};
}

function writeLastSent(data) {
    try {
        fs.writeFileSync(LAST_SENT_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Gagal tulis last_sent.json:", e.message);
    }
}

// ─── CEK TANGGAL MERAH ────────────────────────────────────────────────────────

async function isTanggalMerah() {
    try {
        const now = getWIBDate();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const tglSekarang = `${yyyy}-${mm}-${dd}`;
        const response = await axios.get(`https://dayoffapi.vercel.app/api?year=${yyyy}`);
        const libur = response.data.find(h => h.holiday_date === tglSekarang);
        return !!libur;
    } catch (error) {
        console.error("Gagal cek tanggal merah:", error.message);
        return false; // Default: anggap bukan libur agar scheduler tetap jalan
    }
}

/**
 * FIX: Hanya kirim tepat di menit 0 untuk mencegah race condition double-send.
 * Interval 35 detik → dalam 1 menit ada ~1-2 tick; hanya menit=0 yang lolos.
 */
function isJamKirim(jam, menit, targetJam) {
    return jam === targetJam && menit === 0;
}

// ─── SAFE FILE HELPERS ────────────────────────────────────────────────────────

function safeReadJSON(path) {
    try {
        if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path, 'utf-8'));
    } catch (e) {
        console.error(`Gagal baca ${path}:`, e.message);
    }
    return null;
}

function safeDeleteFile(path) {
    try {
        if (fs.existsSync(path)) fs.unlinkSync(path);
    } catch (e) {
        console.error(`Gagal hapus ${path}:`, e.message);
    }
}

/**
 * FIX: Muat ulang modul constants tanpa delete require.cache yang bisa gagal.
 * Gunakan fs.readFileSync + eval-free approach → re-require dengan path absolut + timestamp trick.
 * Cara paling aman: pakai path absolut dan hapus cache key yang tepat.
 */
function reloadConstants() {
    try {
        const resolvedPath = require.resolve('./constants');
        delete require.cache[resolvedPath];
        return require('./constants');
    } catch (e) {
        console.error("Gagal reload constants, pakai cache lama:", e.message);
        return require('./constants'); // fallback ke cache lama
    }
}

// ─── SAHUR ────────────────────────────────────────────────────────────────────

async function initSahurScheduler(sock, botConfig) {
    console.log("✅ Scheduler Sahur Aktif (04:00 WIB)");

    const PESAN_SAHUR_LIST = [
        `🌙 *REMINDER SAHUR* 🕌\n━━━━━━━━━━━━━━━━━━━━\n\nSelamat makan sahur semuanya! Jangan lupa niat puasa dan perbanyak minum air putih ya.\n\n_🕒 Waktu: 04:00 WIB (Sebelum Subuh)_\n\n━━━━━━━━━━━━━━━━━━━━\n*Semoga puasanya lancar!* ✨`,
        `🌙 *SAHUR.. SAHURRR!* 🕌\n━━━━━━━━━━━━━━━━━━━━\n\nAyo bangun, waktunya mengisi energi untuk ibadah hari ini. Jangan lupa niatnya ya!\n\n_🕒 Waktu: 04:00 WIB_\n\n━━━━━━━━━━━━━━━━━━━━\n*Semangat puasanya!* 💪`,
        `🌙 *BERKAH SAHUR* 🕌\n━━━━━━━━━━━━━━━━━━━━\n\n"Bersahurlah kalian, karena pada sahur itu ada keberkahan." (HR. Bukhari & Muslim). Selamat makan sahur!\n\n_🕒 Waktu: 04:00 WIB_\n\n━━━━━━━━━━━━━━━━━━━━\n*Semoga berkah dan kuat sampai Maghrib!* 😇`,
        `🌙 *REMINDER SAHUR* 🕌\n━━━━━━━━━━━━━━━━━━━━\n\nMasih ada waktu buat makan dan minum. Yuk, disegerakan sahurnya sebelum imsak tiba!\n\n_🕒 Waktu: 04:00 WIB_\n\n━━━━━━━━━━━━━━━━━━━━\n*Happy Fasting everyone!* ✨`
    ];

    setInterval(async () => {
        if (!botConfig || botConfig.sahur === false) return;

        const now = getWIBDate();
        const tglID = `sahur-${now.getDate()}-${now.getMonth()}`;
        const lastSent = readLastSent();

        if (!isJamKirim(now.getHours(), now.getMinutes(), 4)) return;
        if (lastSent[tglID] === true) return;

        try {
            const pesanRandom = PESAN_SAHUR_LIST[Math.floor(Math.random() * PESAN_SAHUR_LIST.length)];
            await sock.sendMessage(ID_GRUP_TUJUAN, { text: pesanRandom });
            writeLastSent({ ...lastSent, [tglID]: true });
        } catch (err) {
            console.error("Sahur Error:", err);
        }
    }, 35000);
}

// ─── QUIZ ─────────────────────────────────────────────────────────────────────

async function initQuizScheduler(sock, botConfig, getConnected) {
    console.log("✅ Scheduler Quiz Aktif (Menyesuaikan Hari & Jam)");

    setInterval(async () => {
        if (!botConfig || botConfig.quiz === false) return;
        if (getConnected && !getConnected()) return;

        const now = getWIBDate();
        const jam = now.getHours();
        const menit = now.getMinutes();
        const hariAngka = now.getDay();
        const tglID = `quiz-${now.getDate()}-${now.getMonth()}-${now.getFullYear()}`;
        const lastSent = readLastSent();

        // Hanya Senin–Jumat
        if (hariAngka < 1 || hariAngka > 5) return;

        // FIX: Jam kirim per hari
        const JAM_KIRIM = { 1: 14, 5: 11 };
        const jamKirim = JAM_KIRIM[hariAngka] ?? 13;

        if (!isJamKirim(jam, menit, jamKirim)) return;
        if (lastSent[tglID] === true) return;

        try {
            const kuisHariIni = QUIZ_BANK[hariAngka.toString()];
            if (!kuisHariIni || kuisHariIni.length === 0) return;

            const randomQuiz = kuisHariIni[Math.floor(Math.random() * kuisHariIni.length)];
            if (!randomQuiz?.question || !randomQuiz?.options) return;

            const sentMsg = await sock.sendMessage(ID_GRUP_TUJUAN, {
                poll: {
                    name: `🕒 *PULANG SEKOLAH CHECK*\n${randomQuiz.question}`,
                    values: randomQuiz.options,
                    selectableCount: 1
                }
            });

            const kuisAktif = {
                msgId: sentMsg.key.id,
                data: randomQuiz,
                votes: {},
                targetJam: jamKirim + 2,
                tglID: `${now.getDate()}-${now.getMonth()}-${now.getFullYear()}`
            };

            fs.writeFileSync(KUIS_PATH, JSON.stringify(kuisAktif, null, 2));
            writeLastSent({ ...lastSent, [tglID]: true });

        } catch (err) {
            if (err.message === 'Connection Closed') {
                console.error("Quiz: Koneksi putus, retry interval berikutnya");
                // Tidak tulis lastSent agar bisa retry
            } else {
                console.error("Quiz Error:", err);
            }
        }
    }, 35000);
}

// ─── SMART FEEDBACK ───────────────────────────────────────────────────────────

async function initSmartFeedbackScheduler(sock, botConfig) {
    console.log("✅ Scheduler Smart Feedback Aktif");

    /**
     * FIX: Ganti lastProcessedId in-memory dengan lastSent persisten,
     * sehingga tidak double-kirim meski bot restart.
     */

    setInterval(async () => {
        if (!botConfig || botConfig.smartFeedback === false) return;

        const kuisAktif = safeReadJSON(KUIS_PATH);
        if (!kuisAktif?.msgId || !kuisAktif?.data) return;

        const now = getWIBDate();
        const tglSekarang = `${now.getDate()}-${now.getMonth()}-${now.getFullYear()}`;
        const feedbackID = `feedback-${kuisAktif.msgId}`;
        const lastSent = readLastSent();

        if (lastSent[feedbackID] === true) return;
        if (!isJamKirim(now.getHours(), now.getMinutes(), kuisAktif.targetJam)) return;
        if (kuisAktif.tglID !== tglSekarang) return;

        try {
            const votesArray = Object.values(kuisAktif.votes || {});

            // Hitung suara berdasarkan nama opsi (bukan index)
            const counts = {};
            votesArray.forEach(v => {
                const pilihan = Array.isArray(v) ? v : [v];
                pilihan.forEach(namaOpsi => {
                    counts[namaOpsi] = (counts[namaOpsi] || 0) + 1;
                });
            });

            let maxVotes = 0;
            let topNamaOpsi = [];

            for (const namaOpsi of (kuisAktif.data.options || [])) {
                const jumlah = counts[namaOpsi] || 0;
                if (jumlah > maxVotes) {
                    maxVotes = jumlah;
                    topNamaOpsi = [namaOpsi];
                } else if (jumlah === maxVotes && jumlah > 0) {
                    topNamaOpsi.push(namaOpsi);
                }
            }

            // Tandai sudah diproses SEBELUM kirim pesan untuk hindari double-send
            writeLastSent({ ...lastSent, [feedbackID]: true });
            safeDeleteFile(KUIS_PATH);

            if (maxVotes === 0) {
                console.log("Tidak ada yang mengisi polling.");
                return;
            }

            if (topNamaOpsi.length > 1) {
                const teksSeri = `⚔️ *HASIL SERI!*\nWah, pendapat kalian seimbang nih antara beberapa pilihan. Kompak banget kelas 9G!\n\n━━━━━━━━━━━━━━━━━━━━\n_Respon otomatis jam ${now.getHours()}:00_`;
                await sock.sendMessage(ID_GRUP_TUJUAN, { text: teksSeri });
            } else {
                const namaOpsiWinner = topNamaOpsi[0];
                const topIdx = kuisAktif.data.options.indexOf(namaOpsiWinner);
                const teksFeedback = (kuisAktif.data.feedbacks?.[topIdx]) || "Terima kasih sudah memilih!";

                const teksHasil = `📊 *HASIL PILIHAN TERBANYAK KELAS*\nPilihan: *${namaOpsiWinner}* (${maxVotes} suara)\n━━━━━━━━━━━━━━━━━━━━\n\n${teksFeedback}\n\n━━━━━━━━━━━━━━━━━━━━\n_Respon otomatis jam ${now.getHours()}:00_`;
                await sock.sendMessage(ID_GRUP_TUJUAN, { text: teksHasil });
            }

        } catch (err) {
            console.error("Feedback Error:", err);
        }
    }, 35000);
}

// ─── JADWAL BESOK ─────────────────────────────────────────────────────────────

async function initJadwalBesokScheduler(sock, botConfig) {
    console.log("✅ Scheduler Jadwal Besok Aktif (17:00 WIB)");

    setInterval(async () => {
        if (!botConfig || botConfig.jadwalBesok === false) return;

        const now = getWIBDate();
        const tglID = `jadwal-${now.getDate()}-${now.getMonth()}`;
        const lastSent = readLastSent();

        if (!isJamKirim(now.getHours(), now.getMinutes(), 17)) return;
        if (lastSent[tglID] === true) return;

        await sendJadwalBesokManual(sock);
        writeLastSent({ ...lastSent, [tglID]: true });
    }, 35000);
}

// ─── LIST PR MINGGUAN ─────────────────────────────────────────────────────────

async function initListPrMingguanScheduler(sock, botConfig) {
    console.log("✅ Scheduler List PR Mingguan Aktif (Sabtu 10:00 WIB)");

    setInterval(async () => {
        if (!botConfig || botConfig.prMingguan === false) return;

        const now = getWIBDate();
        const hariIni = now.getDay();
        const tglID = `pr-${now.getDate()}-${now.getMonth()}`;
        const lastSent = readLastSent();

        if (hariIni !== 6) return;
        if (!isJamKirim(now.getHours(), now.getMinutes(), 10)) return;
        if (lastSent[tglID] === true) return;

        try {
            const statusLibur = await isTanggalMerah();
            if (statusLibur) {
                console.log("[PR] Hari libur nasional. Bot tidak mengirim list PR.");
                writeLastSent({ ...lastSent, [tglID]: true });
                return;
            }

            const { dates, periode } = getWeekDates();
            const daysKey = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
            const dayLabels = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT'];
            const currentData = db.getAll() || {};

            let teksPesan = `📌 *DAFTAR LIST TUGAS PR* 📢\n🗓️ Periode: ${periode}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            for (let i = 0; i < 5; i++) {
                const hariKey = daysKey[i];
                teksPesan += `📅 *${dayLabels[i]}* (${dates[i]})\n`;
                const tugas = currentData[hariKey];
                if (!tugas || tugas === "" || tugas.includes("Belum ada tugas") || tugas.includes("Tidak ada PR")) {
                    teksPesan += `└─ ✅ _Tidak ada PR_\n\n`;
                } else {
                    const updatedTugas = tugas.replace(/⏰ Deadline: .*/g, `⏰ Deadline: ${dayLabels[i].charAt(0) + dayLabels[i].slice(1).toLowerCase()}, ${dates[i]}`);
                    teksPesan += `${updatedTugas}\n\n`;
                }
            }
            teksPesan += `━━━━━━━━━━━━━━━━━━━━\n⏳ *DAFTAR TUGAS BELUM DIKUMPULKAN:*\n${currentData.deadline || "Semua tugas sudah selesai."}\n\n⚠️ *Salah list tugas?*\nHubungi nomor: *089531549103*`;

            await sock.sendMessage(ID_GRUP_TUJUAN, { text: teksPesan });
            writeLastSent({ ...lastSent, [tglID]: true });

        } catch (err) {
            console.error("List PR Mingguan Error:", err);
        }
    }, 35000);
}

// ─── KIRIM JADWAL BESOK MANUAL ────────────────────────────────────────────────

async function sendJadwalBesokManual(sock, targetJid) {
    try {
        const now = getWIBDate();
        const hariIni = now.getDay(); // 0=Minggu … 6=Sabtu

        /**
         * FIX: Tidak kirim jika besok tidak ada sekolah.
         * Jumat malam (5) → Sabtu libur ✓ skip
         * Sabtu (6)       → Minggu libur ✓ skip
         * Semua hari lain (0-4) → besok sekolah
         */
        if (hariIni === 5 || hariIni === 6) return;

        /**
         * FIX: hariBesok dihitung konsisten dengan getWeekDates().
         * getWeekDates() selalu mulai dari Senin (index 0).
         * hariIni: 0(Minggu)=besok Senin → dates[0]
         *          1(Senin)=besok Selasa  → dates[1]
         *          2(Selasa)=besok Rabu   → dates[2]
         *          3(Rabu)=besok Kamis    → dates[3]
         *          4(Kamis)=besok Jumat   → dates[4]
         *
         * Rumus index dates: hariIni === 0 ? 0 : hariIni
         * (karena Minggu(0) → Senin = dates[0], Senin(1) → Selasa = dates[1], dst.)
         */
        const datesIndex = hariIni === 0 ? 0 : hariIni; // index ke array dates[]
        const hariBesok = hariIni === 0 ? 1 : hariIni + 1; // 1=Senin…5=Jumat (untuk JADWAL_PELAJARAN key)

        const { JADWAL_PELAJARAN, MOTIVASI_SEKOLAH } = reloadConstants();
        const { dates } = getWeekDates();

        const tglBesok = dates[datesIndex];
        if (!tglBesok) {
            console.error(`[Jadwal] Tanggal tidak ditemukan. hariIni=${hariIni}, datesIndex=${datesIndex}, dates=`, dates);
            return;
        }

        const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const daysKey   = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

        const jadwalBesok = JADWAL_PELAJARAN[hariBesok];
        if (!jadwalBesok) {
            console.error(`[Jadwal] JADWAL_PELAJARAN[${hariBesok}] tidak ditemukan.`);
            return;
        }

        const rawMapel = jadwalBesok.split('\n');
        const motivasi = MOTIVASI_SEKOLAH[Math.floor(Math.random() * MOTIVASI_SEKOLAH.length)];
        const currentData = db.getAll() || {};
        const dataPRBesok = currentData[daysKey[hariBesok]] || "";

        // Pesan PR besok
        let teksPR = `📌 *DAFTAR LIST TUGAS PR* 📢\n📅 Hari: ${dayLabels[hariBesok].toUpperCase()} (${tglBesok})\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        if (!dataPRBesok || dataPRBesok.includes("Belum ada tugas") || dataPRBesok.includes("Tidak ada PR")) {
            teksPR += `└─ ✅ _Tidak ada PR_\n\n`;
        } else {
            const updatedTugas = dataPRBesok.replace(
                /⏰ Deadline: .*/g,
                `⏰ Deadline: ${dayLabels[hariBesok].charAt(0) + dayLabels[hariBesok].slice(1).toLowerCase()}, ${tglBesok}`
            );
            teksPR += `${updatedTugas}\n\n`;
        }
        teksPR += `━━━━━━━━━━━━━━━━━━━━\n⚠️ *Salah list tugas?*\nHubungi nomor: *089531549103*`;

        await sock.sendMessage(targetJid || ID_GRUP_TUJUAN, { text: teksPR });
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Pesan jadwal + keterangan PR per mapel
        const jadwalFinal = rawMapel.map(mapel => {
            const emojiOnly = mapel.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u);
            let adaPR = false;
            if (dataPRBesok && !dataPRBesok.toLowerCase().includes("belum ada tugas") && emojiOnly) {
                adaPR = dataPRBesok.includes(emojiOnly[0]);
            }
            return `${mapel} ➝ ${adaPR ? "ada pr" : "gak ada pr"}`;
        }).join('\n');

        const formatPesan = `🚀 *PERSIAPAN JADWAL BESOK*\n📅 *${dayLabels[hariBesok].toUpperCase()}, ${tglBesok}*\n━━━━━━━━━━━━━━━━━━━━\n\n${jadwalFinal}\n\n━━━━━━━━━━━━━━━━━━━━\n💡 _"${motivasi}"_\n\n*Tetap semangat ya!* 😇`;
        await sock.sendMessage(targetJid || ID_GRUP_TUJUAN, { text: formatPesan });

    } catch (err) {
        console.error("Jadwal Manual Error:", err);
    }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
    initQuizScheduler,
    initSmartFeedbackScheduler,
    initJadwalBesokScheduler,
    initListPrMingguanScheduler,
    initSahurScheduler,
    getWeekDates,
    sendJadwalBesokManual
};
