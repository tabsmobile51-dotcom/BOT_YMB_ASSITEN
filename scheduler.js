const { QUIZ_BANK } = require('./quiz'); 
const { JADWAL_PELAJARAN: JADWAL_STATIS, MOTIVASI_SEKOLAH } = require('./constants');
const db = require('./data');
const fs = require('fs'); 
const axios = require('axios');

const ID_GRUP_TUJUAN = '120363403625197368@g.us'; 
const KUIS_PATH = '/app/auth_info/kuis.json';
const LAST_SENT_PATH = '/app/auth_info/last_sent.json'; // FIX: persisten antar restart

function getWIBDate() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

function getWeekDates() {
    const now = getWIBDate();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    if (dayOfWeek === 6) {
        monday.setDate(now.getDate() + 2);
    } else if (dayOfWeek === 0) {
        monday.setDate(now.getDate() + 1);
    } else {
        monday.setDate(now.getDate() + (1 - dayOfWeek));
    }
    const dates = [];
    for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
    }
    return { dates, periode: `${dates[0]} - ${dates[4]}` };
}

// FIX: Simpan dan baca lastSent dari file agar persisten saat bot restart
function readLastSent() {
    try {
        if (fs.existsSync(LAST_SENT_PATH)) {
            return JSON.parse(fs.readFileSync(LAST_SENT_PATH, 'utf-8'));
        }
    } catch (e) { /* abaikan jika gagal baca */ }
    return {};
}

function writeLastSent(data) {
    try {
        fs.writeFileSync(LAST_SENT_PATH, JSON.stringify(data, null, 2));
    } catch (e) { console.error("Gagal tulis last_sent.json:", e.message); }
}

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
        return false;
    }
}

// FIX: Gunakan toleransi menit <= 1 agar tidak terlewat jika interval sedikit terlambat
function isJamKirim(jam, menit, targetJam) {
    return jam === targetJam && menit <= 1;
}

// --- SAHUR ---
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

        if (isJamKirim(now.getHours(), now.getMinutes(), 4) && lastSent[tglID] !== true) {
            try {
                const pesanRandom = PESAN_SAHUR_LIST[Math.floor(Math.random() * PESAN_SAHUR_LIST.length)];
                await sock.sendMessage(ID_GRUP_TUJUAN, { text: pesanRandom });
                writeLastSent({ ...lastSent, [tglID]: true });
            } catch (err) { console.error("Sahur Error:", err); }
        }
    }, 35000);
}

// --- QUIZ ---
async function initQuizScheduler(sock, botConfig) {
    console.log("✅ Scheduler Polling Aktif (Menyesuaikan Hari & Jam)");

    setInterval(async () => {
        if (!botConfig || botConfig.quiz === false) return;
        const now = getWIBDate();
        const jam = now.getHours();
        const menit = now.getMinutes();
        const hariAngka = now.getDay();
        const tglID = `quiz-${now.getDate()}-${now.getMonth()}-${now.getFullYear()}`;
        const lastSent = readLastSent();

        if (hariAngka < 1 || hariAngka > 5) return;

        let jamKirim = 13;
        if (hariAngka === 1) jamKirim = 14;
        if (hariAngka === 5) jamKirim = 11;

        if (isJamKirim(jam, menit, jamKirim) && lastSent[tglID] !== true) {
            try {
                const kuisHariIni = QUIZ_BANK[hariAngka.toString()];
                if (kuisHariIni && kuisHariIni.length > 0) {
                    const randomQuiz = kuisHariIni[Math.floor(Math.random() * kuisHariIni.length)];
                    if (randomQuiz && randomQuiz.question && randomQuiz.options) {
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
                    }
                }
            } catch (err) { console.error("Quiz Error:", err); }
        }
    }, 35000);
}

// --- SMART FEEDBACK ---
async function initSmartFeedbackScheduler(sock, botConfig) {
    console.log("✅ Scheduler Smart Feedback Aktif");
    let lastProcessedId = "";

    setInterval(async () => {
        if (!botConfig || botConfig.smartFeedback === false) return;

        let kuisAktif = {};
        if (fs.existsSync(KUIS_PATH)) {
            try { kuisAktif = JSON.parse(fs.readFileSync(KUIS_PATH, 'utf-8')); }
            catch (e) { return; }
        } else { return; }

        const now = getWIBDate();
        const jamSekarang = now.getHours();
        const menitSekarang = now.getMinutes();
        const tglSekarang = `${now.getDate()}-${now.getMonth()}-${now.getFullYear()}`;

        if (
            kuisAktif.msgId &&
            kuisAktif.data &&
            isJamKirim(jamSekarang, menitSekarang, kuisAktif.targetJam) &&
            kuisAktif.tglID === tglSekarang &&
            lastProcessedId !== kuisAktif.msgId
        ) {
            try {
                const votesArray = Object.values(kuisAktif.votes || {});

                // FIX: Poll Baileys menyimpan nama opsi sebagai string, bukan index angka.
                // Hitung berdasarkan nama opsi, lalu cari index-nya di array options.
                const counts = {};
                if (votesArray.length > 0) {
                    votesArray.forEach(v => {
                        const pilihan = Array.isArray(v) ? v : [v];
                        pilihan.forEach(namaOpsi => {
                            counts[namaOpsi] = (counts[namaOpsi] || 0) + 1;
                        });
                    });
                }

                let maxVotes = 0;
                let topNamaOpsi = [];

                if (kuisAktif.data && kuisAktif.data.options) {
                    for (const namaOpsi of kuisAktif.data.options) {
                        const jumlah = counts[namaOpsi] || 0;
                        if (jumlah > maxVotes) {
                            maxVotes = jumlah;
                            topNamaOpsi = [namaOpsi];
                        } else if (jumlah === maxVotes && jumlah > 0) {
                            topNamaOpsi.push(namaOpsi);
                        }
                    }
                }

                lastProcessedId = kuisAktif.msgId;

                if (maxVotes === 0) {
                    // FIX: hapus file meskipun tidak ada yang voting, agar tidak terbaca lagi besok
                    console.log("Tidak ada yang mengisi polling. File kuis dihapus.");
                    if (fs.existsSync(KUIS_PATH)) fs.unlinkSync(KUIS_PATH);

                } else if (topNamaOpsi.length > 1) {
                    const teksSeri = `⚔️ *HASIL SERI!*\nWah, pendapat kalian seimbang nih antara beberapa pilihan. Kompak banget kelas 9G!\n\n━━━━━━━━━━━━━━━━━━━━\n_Respon otomatis jam ${jamSekarang}:00_`;
                    await sock.sendMessage(ID_GRUP_TUJUAN, { text: teksSeri });
                    if (fs.existsSync(KUIS_PATH)) fs.unlinkSync(KUIS_PATH);

                } else {
                    const namaOpsiWinner = topNamaOpsi[0];
                    // Cari index dari nama opsi untuk ambil feedback yang sesuai
                    const topIdx = kuisAktif.data.options.indexOf(namaOpsiWinner);
                    const teksFeedback = (kuisAktif.data.feedbacks && topIdx >= 0 && kuisAktif.data.feedbacks[topIdx])
                        || "Terima kasih sudah memilih!";

                    const teksHasil = `📊 *HASIL PILIHAN TERBANYAK KELAS*\nPilihan: *${namaOpsiWinner}* (${maxVotes} suara)\n━━━━━━━━━━━━━━━━━━━━\n\n${teksFeedback}\n\n━━━━━━━━━━━━━━━━━━━━\n_Respon otomatis jam ${jamSekarang}:00_`;
                    await sock.sendMessage(ID_GRUP_TUJUAN, { text: teksHasil });
                    if (fs.existsSync(KUIS_PATH)) fs.unlinkSync(KUIS_PATH);
                }
            } catch (err) { console.error("Feedback Error:", err); }
        }
    }, 35000);
}

// --- JADWAL BESOK ---
async function initJadwalBesokScheduler(sock, botConfig) {
    console.log("✅ Scheduler Jadwal Besok Aktif (17:00 WIB)");

    setInterval(async () => {
        if (!botConfig || botConfig.jadwalBesok === false) return;
        const now = getWIBDate();
        const tglID = `jadwal-${now.getDate()}-${now.getMonth()}`;
        const lastSent = readLastSent();

        if (isJamKirim(now.getHours(), now.getMinutes(), 17) && lastSent[tglID] !== true) {
            await sendJadwalBesokManual(sock);
            writeLastSent({ ...lastSent, [tglID]: true });
        }
    }, 35000);
}

// --- LIST PR MINGGUAN ---
async function initListPrMingguanScheduler(sock, botConfig) {
    console.log("✅ Scheduler List PR Mingguan Aktif (Sabtu 10:00 WIB)");

    setInterval(async () => {
        if (!botConfig || botConfig.prMingguan === false) return;
        const now = getWIBDate();
        const hariIni = now.getDay();
        const tglID = `pr-${now.getDate()}-${now.getMonth()}`;
        const lastSent = readLastSent();

        if (hariIni === 6 && isJamKirim(now.getHours(), now.getMinutes(), 10) && lastSent[tglID] !== true) {
            try {
                const statusLibur = await isTanggalMerah();
                if (statusLibur) {
                    console.log(`[PR] Hari libur nasional. Bot tidak mengirim list PR.`);
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
            } catch (err) { console.error("List PR Mingguan Error:", err); }
        }
    }, 35000);
}

// --- KIRIM JADWAL BESOK MANUAL ---
async function sendJadwalBesokManual(sock, targetJid) {
    try {
        const now = getWIBDate();
        const hariIni = now.getDay();

        // Tidak kirim jika sudah Jumat malam atau Sabtu (tidak ada sekolah besok)
        if (hariIni === 5 || hariIni === 6) return;

        // FIX: Hitung hariBesok dengan aman
        const hariBesok = hariIni === 0 ? 1 : hariIni + 1; // Minggu -> Senin, selainnya +1

        delete require.cache[require.resolve('./constants')];
        const { JADWAL_PELAJARAN, MOTIVASI_SEKOLAH } = require('./constants');

        const { dates } = getWeekDates();
        const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const daysKey = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

        // FIX: hariBesok 1-5, dates[0-4] -> index yang benar adalah hariBesok - 1
        const tglBesok = dates[hariBesok - 1];
        if (!tglBesok) {
            console.error(`[Jadwal] tanggal untuk hariBesok=${hariBesok} tidak ditemukan di dates:`, dates);
            return;
        }

        const rawMapel = JADWAL_PELAJARAN[hariBesok].split('\n');
        const motivasi = MOTIVASI_SEKOLAH[Math.floor(Math.random() * MOTIVASI_SEKOLAH.length)];
        const currentData = db.getAll() || {};
        const dataPRBesok = currentData[daysKey[hariBesok]] || "";

        let teksPR = `📌 *DAFTAR LIST TUGAS PR* 📢\n📅 Hari: ${dayLabels[hariBesok].toUpperCase()} (${tglBesok})\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        if (!dataPRBesok || dataPRBesok.includes("Belum ada tugas") || dataPRBesok.includes("Tidak ada PR")) {
            teksPR += `└─ ✅ _Tidak ada PR_\n\n`;
        } else {
            const updatedTugas = dataPRBesok.replace(/⏰ Deadline: .*/g, `⏰ Deadline: ${dayLabels[hariBesok].charAt(0) + dayLabels[hariBesok].slice(1).toLowerCase()}, ${tglBesok}`);
            teksPR += `${updatedTugas}\n\n`;
        }
        teksPR += `━━━━━━━━━━━━━━━━━━━━\n⚠️ *Salah list tugas?*\nHubungi nomor: *089531549103*`;

        await sock.sendMessage(targetJid || ID_GRUP_TUJUAN, { text: teksPR });
        await new Promise(resolve => setTimeout(resolve, 5000));

        const jadwalFinal = rawMapel.map(mapel => {
            const emojiOnly = mapel.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u);
            let adaPR = false;
            if (dataPRBesok && !dataPRBesok.includes("belum ada tugas") && emojiOnly) {
                adaPR = dataPRBesok.includes(emojiOnly[0]);
            }
            return `${mapel} ➝ ${adaPR ? "ada pr" : "gak ada pr"}`;
        }).join('\n');

        const formatPesan = `🚀 *PERSIAPAN JADWAL BESOK*\n📅 *${dayLabels[hariBesok].toUpperCase()}, ${tglBesok}*\n━━━━━━━━━━━━━━━━━━━━\n\n${jadwalFinal}\n\n━━━━━━━━━━━━━━━━━━━━\n💡 _"${motivasi}"_\n\n*Tetap semangat ya!* 😇`;
        await sock.sendMessage(targetJid || ID_GRUP_TUJUAN, { text: formatPesan });
    } catch (err) { console.error("Jadwal Manual Error:", err); }
}

module.exports = {
    initQuizScheduler,
    initSmartFeedbackScheduler,
    initJadwalBesokScheduler,
    initListPrMingguanScheduler,
    initSahurScheduler,
    getWeekDates,
    sendJadwalBesokManual
};
