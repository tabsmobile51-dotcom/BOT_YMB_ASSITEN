const { QUIZ_BANK } = require('./quiz'); 
const { JADWAL_PELAJARAN: JADWAL_STATIS, MOTIVASI_SEKOLAH } = require('./constants');
const db = require('./data');
const fs = require('fs'); 
const axios = require('axios'); // Ditambahkan untuk hit API tanggal merah

const ID_GRUP_TUJUAN = '120363403625197368@g.us'; 
const KUIS_PATH = '/app/auth_info/kuis.json'; // Path volume agar sync

function getWIBDate() {
    return new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
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
        const diffToMonday = 1 - dayOfWeek;
        monday.setDate(now.getDate() + diffToMonday);
    }
    const dates = [];
    for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
    }
    const periode = `${dates[0]} - ${dates[4]}`;
    return { dates, periode };
}

// --- FITUR BARU: CEK TANGGAL MERAH ---
// (Fungsi ini dibiarkan ada agar fungsi lain tidak error, tapi di Quiz sudah tidak dipakai)
async function isTanggalMerah() {
    try {
        const now = getWIBDate();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const tglSekarang = `${yyyy}-${mm}-${dd}`;

        const response = await axios.get(`https://dayoffapi.vercel.app/api?year=${yyyy}`);
        const holidays = response.data;

        const libur = holidays.find(h => h.holiday_date === tglSekarang);
        return !!libur; 
    } catch (error) {
        console.error("Gagal cek tanggal merah:", error.message);
        return false; 
    }
}

// --- FUNGSI SAHUR (VERSI TEKS SAJA) ---
async function initSahurScheduler(sock, botConfig) {
    console.log("✅ Scheduler Sahur Aktif (04:00 WIB)");
    let lastSentSahur = "";

    const PESAN_SAHUR_LIST = [
        `🌙 *REMINDER SAHUR* 🕌\n━━━━━━━━━━━━━━━━━━━━\n\nSelamat makan sahur semuanya! Jangan lupa niat puasa dan perbanyak minum air putih ya.\n\n_🕒 Waktu: 04:00 WIB (Sebelum Subuh)_\n\n━━━━━━━━━━━━━━━━━━━━\n*Semoga puasanya lancar!* ✨`,
        `🌙 *SAHUR.. SAHURRR!* 🕌\n━━━━━━━━━━━━━━━━━━━━\n\nAyo bangun, waktunya mengisi energi untuk ibadah hari ini. Jangan lupa niatnya ya!\n\n_🕒 Waktu: 04:00 WIB_\n\n━━━━━━━━━━━━━━━━━━━━\n*Semangat puasanya!* 💪`,
        `🌙 *BERKAH SAHUR* 🕌\n━━━━━━━━━━━━━━━━━━━━\n\n"Bersahurlah kalian, karena pada sahur itu ada keberkahan." (HR. Bukhari & Muslim). Selamat makan sahur!\n\n_🕒 Waktu: 04:00 WIB_\n\n━━━━━━━━━━━━━━━━━━━━\n*Semoga berkah dan kuat sampai Maghrib!* 😇`,
        `🌙 *REMINDER SAHUR* 🕌\n━━━━━━━━━━━━━━━━━━━━\n\nMasih ada waktu buat makan dan minum. Yuk, disegerakan sahurnya sebelum imsak tiba!\n\n_🕒 Waktu: 04:00 WIB_\n\n━━━━━━━━━━━━━━━━━━━━\n*Happy Fasting everyone!* ✨`
    ];

    setInterval(async () => {
        if (!botConfig || botConfig.sahur === false) return;

        const now = getWIBDate();
        const jam = now.getHours();
        const menit = now.getMinutes();
        const tglID = `${now.getDate()}-${now.getMonth()}`;
        
        if (jam === 4 && menit === 0 && lastSentSahur !== tglID) {
            try {
                const pesanRandom = PESAN_SAHUR_LIST[Math.floor(Math.random() * PESAN_SAHUR_LIST.length)];
                await sock.sendMessage(ID_GRUP_TUJUAN, { text: pesanRandom });
                lastSentSahur = tglID;
            } catch (err) { 
                console.error("Sahur Error:", err); 
            }
        }
    }, 35000);
}

// --- FUNGSI QUIZ (DIUPDATE: TANPA CEK API TANGGAL MERAH + PROTEKSI CRASH) ---
async function initQuizScheduler(sock, botConfig) {
    console.log("✅ Scheduler Polling Aktif (Menyesuaikan Hari & Jam)");
    let lastSentDate = ""; 
    setInterval(async () => {
        if (!botConfig || botConfig.quiz === false) return;

        const now = getWIBDate();
        const jam = now.getHours();
        const menit = now.getMinutes();
        const hariAngka = now.getDay(); 
        const tglID = `${now.getDate()}-${now.getMonth()}-${now.getFullYear()}`;

        // Hanya berjalan di hari sekolah (Senin - Jumat)
        if (hariAngka < 1 || hariAngka > 5) return;

        // Tentukan jam kirim
        let jamKirim = 13; // Selasa - Kamis jam 13:00
        if (hariAngka === 1) jamKirim = 14; // Senin jam 14:00
        if (hariAngka === 5) jamKirim = 11; // Jumat jam 11:00

        if (jam === jamKirim && menit === 0 && lastSentDate !== tglID) {
            try {
                // Membaca objek QUIZ_BANK menggunakan string key
                const kuisHariIni = QUIZ_BANK[hariAngka.toString()];
                
                // Pengaman: pastikan array kuis ada dan tidak kosong
                if (kuisHariIni && kuisHariIni.length > 0) {
                    const randomQuiz = kuisHariIni[Math.floor(Math.random() * kuisHariIni.length)];
                    
                    // Pengaman: pastikan properti question dan options ada agar tidak undefined
                    if (randomQuiz && randomQuiz.question && randomQuiz.options) {
                        const sentMsg = await sock.sendMessage(ID_GRUP_TUJUAN, {
                            poll: { name: `🕒 *PULANG SEKOLAH CHECK*\n${randomQuiz.question}`, values: randomQuiz.options, selectableCount: 1 }
                        });
                        
                        let kuisAktif = {
                            msgId: sentMsg.key.id,
                            data: randomQuiz,
                            votes: {},
                            targetJam: jamKirim + 2, // Feedback menyusul 2 jam setelah kuis dikirim
                            tglID: tglID
                        };

                        fs.writeFileSync(KUIS_PATH, JSON.stringify(kuisAktif, null, 2));
                        lastSentDate = tglID; 
                    }
                }
            } catch (err) { console.error("Quiz Error:", err); }
        }
    }, 35000);
}

// --- FUNGSI SMART FEEDBACK (DIUPDATE: ANTI ERROR 0 SUARA & HANDLE HASIL SERI) ---
async function initSmartFeedbackScheduler(sock, botConfig) {
    console.log("✅ Scheduler Smart Feedback Aktif");
    let lastProcessedId = "";
    setInterval(async () => {
        if (!botConfig || botConfig.smartFeedback === false) return;

        let kuisAktif = {};
        if (fs.existsSync(KUIS_PATH)) {
            try {
                kuisAktif = JSON.parse(fs.readFileSync(KUIS_PATH, 'utf-8'));
            } catch (e) { return; }
        } else { return; }

        const now = getWIBDate();
        const jamSekarang = now.getHours();
        const tglSekarang = `${now.getDate()}-${now.getMonth()}-${now.getFullYear()}`;
        
        if (kuisAktif.msgId && kuisAktif.data && kuisAktif.targetJam === jamSekarang && kuisAktif.tglID === tglSekarang) {
            if (lastProcessedId === kuisAktif.msgId) return;
            
            try {
                const votesArray = Object.values(kuisAktif.votes || {});
                let maxVotes = 0;
                let topIdxs = []; // Menggunakan array untuk menampung jika ada hasil seri

                if (votesArray.length > 0) {
                    const counts = {};
                    votesArray.forEach(v => { 
                        if (Array.isArray(v)) {
                            v.forEach(opt => { counts[opt] = (counts[opt] || 0) + 1; });
                        }
                    });
                    
                    // Mencari suara terbanyak
                    if (kuisAktif.data && kuisAktif.data.options) {
                        for (let i = 0; i < kuisAktif.data.options.length; i++) {
                            let currentCount = counts[i] || 0;
                            if (currentCount > maxVotes) { 
                                maxVotes = currentCount; 
                                topIdxs = [i]; // Reset list pemenang dengan yang tertinggi
                            } else if (currentCount === maxVotes && currentCount > 0) {
                                topIdxs.push(i); // Tambahkan ke list jika jumlah suaranya sama kuat
                            }
                        }
                    }
                }

                // Logika Pengiriman Pesan
                if (maxVotes === 0) {
                    // JIKA TIDAK ADA YANG MEMILIH SAMA SEKALI
                    console.log("Belum ada yang mengisi polling. Bot tidak mengirimkan feedback.");
                    
                } else if (topIdxs.length > 1) {
                    // JIKA HASILNYA SERI
                    const teksSeri = `⚔️ *HASIL SERI!* \nWah, pendapat kalian seimbang nih antara beberapa pilihan. Kompak banget kelas 9G! \n\n━━━━━━━━━━━━━━━━━━━━\n_Respon otomatis jam ${jamSekarang}:00_`;
                    await sock.sendMessage(ID_GRUP_TUJUAN, { text: teksSeri });
                    
                    lastProcessedId = kuisAktif.msgId;
                    if (fs.existsSync(KUIS_PATH)) fs.unlinkSync(KUIS_PATH);
                    
                } else {
                    // JIKA ADA PEMENANG TUNGGAL (SEPERTI BIASA)
                    const topIdx = topIdxs[0];
                    const teksOpsi = (kuisAktif.data.options && kuisAktif.data.options[topIdx]) || "Pilihan Kosong";
                    const teksFeedback = (kuisAktif.data.feedbacks && kuisAktif.data.feedbacks[topIdx]) || "Terima kasih sudah memilih!";

                    const teksHasil = `📊 *HASIL PILIHAN TERBANYAK KELAS*\nPilihan: *${teksOpsi}* (${maxVotes} suara)\n━━━━━━━━━━━━━━━━━━━━\n\n${teksFeedback}\n\n━━━━━━━━━━━━━━━━━━━━\n_Respon otomatis jam ${jamSekarang}:00_`;
                    await sock.sendMessage(ID_GRUP_TUJUAN, { text: teksHasil });
                    
                    lastProcessedId = kuisAktif.msgId;
                    if (fs.existsSync(KUIS_PATH)) fs.unlinkSync(KUIS_PATH);
                }
            } catch (err) { console.error("Feedback Error:", err); }
        }
    }, 35000);
}

// --- FUNGSI JADWAL BESOK ---
async function initJadwalBesokScheduler(sock, botConfig) {
    console.log("✅ Scheduler Jadwal Besok Aktif (17:00 WIB)");
    let lastSentJadwal = "";
    setInterval(async () => {
        if (!botConfig || botConfig.jadwalBesok === false) return;

        const now = getWIBDate();
        const jam = now.getHours();
        const menit = now.getMinutes();
        const tglID = `${now.getDate()}-${now.getMonth()}`;
        if (jam === 17 && menit === 0 && lastSentJadwal !== tglID) {
            await sendJadwalBesokManual(sock);
            lastSentJadwal = tglID;
        }
    }, 35000); 
}

// --- FUNGSI LIST PR MINGGUAN (DIUPDATE: CEK LIBUR) ---
async function initListPrMingguanScheduler(sock, botConfig) {
    console.log("✅ Scheduler List PR Mingguan Aktif (Sabtu 10:00 WIB)");
    let lastSentList = "";
    setInterval(async () => {
        if (!botConfig || botConfig.prMingguan === false) return;

        const now = getWIBDate();
        const hariIni = now.getDay();
        const jam = now.getHours();
        const menit = now.getMinutes();
        const tglID = `${now.getDate()}-${now.getMonth()}`;
        
        if (hariIni === 6 && jam === 10 && menit === 0 && lastSentList !== tglID) {
            try {
                // Cek tanggal merah
                const statusLibur = await isTanggalMerah();
                if (statusLibur) {
                    console.log(`[PR] Hari libur nasional. Bot tidak mengirim list PR.`);
                    lastSentList = tglID;
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
                    let tugas = currentData[hariKey];
                    if (!tugas || tugas === "" || tugas.includes("Belum ada tugas") || tugas.includes("Tidak ada PR")) {
                        teksPesan += `└─ ✅ _Tidak ada PR_\n\n`;
                    } else {
                        let updatedTugas = tugas.replace(/⏰ Deadline: .*/g, `⏰ Deadline: ${dayLabels[i].charAt(0) + dayLabels[i].slice(1).toLowerCase()}, ${dates[i]}`);
                        teksPesan += `${updatedTugas}\n\n`;
                    }
                }
                teksPesan += `━━━━━━━━━━━━━━━━━━━━\n⏳ *DAFTAR TUGAS BELUM DIKUMPULKAN:*\n${currentData.deadline || "Semua tugas sudah selesai."}\n\n⚠️ *Salah list tugas?*\nHubungi nomor: *089531549103*`;
                await sock.sendMessage(ID_GRUP_TUJUAN, { text: teksPesan });
                lastSentList = tglID;
            } catch (err) { console.error("List PR Mingguan Error:", err); }
        }
    }, 35000);
}

async function sendJadwalBesokManual(sock, targetJid) {
    try {
        const now = getWIBDate();
        const hariIni = now.getDay(); 
        if (hariIni === 5 || hariIni === 6) return;
        let hariBesok = (hariIni + 1) % 7;
        if (hariBesok === 0) hariBesok = 1;
        
        delete require.cache[require.resolve('./constants')];
        const { JADWAL_PELAJARAN, MOTIVASI_SEKOLAH } = require('./constants');

        const { dates } = getWeekDates();
        const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const daysKey = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
        
        const rawMapel = JADWAL_PELAJARAN[hariBesok].split('\n');
        const motivasi = MOTIVASI_SEKOLAH[Math.floor(Math.random() * MOTIVASI_SEKOLAH.length)];
        const currentData = db.getAll() || {};
        const dataPRBesok = (currentData[daysKey[hariBesok]] || "");
        const tglBesok = dates[hariBesok - 1];
        
        let teksPR = `📌 *DAFTAR LIST TUGAS PR* 📢\n📅 Hari: ${dayLabels[hariBesok].toUpperCase()} (${tglBesok})\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        if (!dataPRBesok || dataPRBesok === "" || dataPRBesok.includes("Belum ada tugas") || dataPRBesok.includes("Tidak ada PR")) {
            teksPR += `└─ ✅ _Tidak ada PR_\n\n`;
        } else {
            let updatedTugas = dataPRBesok.replace(/⏰ Deadline: .*/g, `⏰ Deadline: ${dayLabels[hariBesok].charAt(0) + dayLabels[hariBesok].slice(1).toLowerCase()}, ${tglBesok}`);
            teksPR += `${updatedTugas}\n\n`;
        }
        teksPR += `━━━━━━━━━━━━━━━━━━━━\n⚠️ *Salah list tugas?*\nHubungi nomor: *089531549103*`;
        await sock.sendMessage(targetJid || ID_GRUP_TUJUAN, { text: teksPR });
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const jadwalFinal = rawMapel.map(mapel => {
            const emojiOnly = mapel.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u);
            let adaPR = false;
            if (dataPRBesok !== "" && !dataPRBesok.includes("belum ada tugas") && emojiOnly) {
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
