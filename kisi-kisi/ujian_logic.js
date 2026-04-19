const { JADWAL_PELAJARAN, JADWAL_PRAKTEK, MOTIVASI_SEKOLAH, ADMIN_RAW, KISI_FILES_PATH } = require('./kisi_constants');
const fs = require('fs');
const path = require('path');

// MENGGUNAKAN PATH ABSOLUT SESUAI STRUKTUR SERVER KAMU (/app/auth_info)
const PRAKTEK_JSON_PATH = '/app/auth_info/data_praktek.json';

// Fungsi ambil data dari JSON atau default
function getStoredPraktek() {
    try {
        if (fs.existsSync(PRAKTEK_JSON_PATH)) {
            const fileData = fs.readFileSync(PRAKTEK_JSON_PATH, 'utf-8');
            return JSON.parse(fileData);
        }
    } catch (e) {
        console.error("Gagal baca database praktek:", e);
    }
    return JADWAL_PRAKTEK;
}

function isAdmin(sender) {
    const phone = sender.split('@')[0];
    return ADMIN_RAW.includes(phone);
}

// FUNGSI LAMA (TETAP ADA)
async function buatTeksKisi(hariOverride = null) {
    if (!fs.existsSync(KISI_FILES_PATH) || fs.readdirSync(KISI_FILES_PATH).length === 0) {
        return "ℹ️ *INFO KISI-KISI*\n\nBelum ada file materi (Gambar/PDF) yang diunggah ke database ujian oleh pengurus. Silakan cek lagi nanti setelah admin melakukan *!update_kisi-kisi*.";
    }

    const now = new Date();
    // FIX: gunakan hariOverride === null bukan !hariOverride agar hari 0 (Minggu) tetap benar
    let hari = hariOverride !== null ? hariOverride : now.getDay();
    
    if (hariOverride === null && now.getHours() >= 16) hari += 1;
    if (hari > 5 || hari === 0) hari = 1;

    const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const mapelList = JADWAL_PELAJARAN[hari] ? JADWAL_PELAJARAN[hari].split('\n') : ["Tidak ada jadwal"];
    const motivasi = MOTIVASI_SEKOLAH[Math.floor(Math.random() * MOTIVASI_SEKOLAH.length)];

    let teks = `📑 *PUSAT KISI-KISI UJIAN* 📑\n`;
    teks += `📅 *Persiapan: ${dayLabels[hari].toUpperCase()}*\n`;
    teks += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    mapelList.forEach(mapel => {
        teks += `${mapel}\n`;
        teks += `└─ 🔗 *Materi:* ${process.env.MY_DOMAIN || 'http://localhost'}/kisi_ujian/\n\n`;
    });

    teks += `━━━━━━━━━━━━━━━━━━━━\n`;
    teks += `💡 _"${motivasi}"_\n\n`;
    teks += `*Tetap semangat dan fokus!* 😇`;

    return teks;
}

// --- FUNGSI BARU: KISI-KISI FULL ---
async function buatTeksKisiFull() {
    if (!fs.existsSync(KISI_FILES_PATH) || fs.readdirSync(KISI_FILES_PATH).length === 0) {
        return "ℹ️ *INFO KISI-KISI*\n\nBelum ada file materi di database. !kisi-kisi_full belum bisa ditampilkan.";
    }

    const dayLabels = ['', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT'];
    let teks = `📚 *REKAP FULL KISI-KISI UJIAN* 📚\n`;
    teks += `_Senin s/d Jumat_\n`;
    teks += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (let i = 1; i <= 5; i++) {
        const mapelList = JADWAL_PELAJARAN[i] ? JADWAL_PELAJARAN[i].split('\n') : [];
        if (mapelList.length > 0) {
            teks += `📅 *${dayLabels[i]}*\n`;
            mapelList.forEach(mapel => {
                teks += `  ○ ${mapel}\n`;
            });
            teks += `\n`;
        }
    }

    teks += `━━━━━━━━━━━━━━━━━━━━\n`;
    teks += `🔗 *Download Semua Materi:* \n`;
    teks += `${process.env.MY_DOMAIN || 'http://localhost'}/kisi_ujian/\n\n`;
    teks += `*Pelajari semua materi di atas untuk hasil maksimal!* 🔥`;

    return teks;
}

// --- FUNGSI UPDATE PRAKTEK (PERMANEN) ---
async function updatePraktekData(hari, mapel, penjelasan) {
    try {
        const hariMap = { 'senin': 1, 'selasa': 2, 'rabu': 3, 'kamis': 4, 'jumat': 5 };
        const hariNum = hariMap[hari.toLowerCase()];
        
        if (!hariNum) return false;

        // Pastikan folder auth_info ada
        const dir = path.dirname(PRAKTEK_JSON_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        let data = getStoredPraktek();
        data[hariNum] = `${mapel}: ${penjelasan}`;
        
        fs.writeFileSync(PRAKTEK_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error("Gagal update data praktek:", err);
        return false;
    }
}

// --- FUNGSI BUAT TEKS PRAKTEK ---
async function buatTeksPraktek(hariOverride = null) {
    try {
        const now = new Date();
        // FIX: gunakan hariOverride === null bukan !hariOverride agar hari 0 (Minggu) tetap benar
        let hari = hariOverride !== null ? hariOverride : now.getDay();
        
        if (hariOverride === null && now.getHours() >= 12) hari += 1;
        if (hari > 5 || hari === 0) hari = 1;

        const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const dataPraktek = getStoredPraktek();
        const praktekList = dataPraktek[hari];

        // FIX: return string kosong bukan null, agar .trim() di handler tidak crash
        if (!praktekList || praktekList.includes("Tidak ada")) {
            return "";
        }

        const kataSemangat = [
            "Lakukan yang terbaik, hasil tidak akan mengkhianati usaha! 💪",
            "Percaya diri adalah kunci kesuksesan praktek hari ini! ✨",
            "Tetap tenang dan fokus, kamu pasti bisa melewatinya! 🔥",
            "Jangan grogi, tunjukkan kemampuan terbaikmu! 🚀",
            "Semangat ujian prakteknya, semoga lancar dan sukses! 😇"
        ];
        const semangatRandom = kataSemangat[Math.floor(Math.random() * kataSemangat.length)];

        let teks = `🛠️ *JADWAL UJIAN PRAKTEK* 🛠️\n`;
        teks += `📅 *Persiapan: ${dayLabels[hari].toUpperCase()}*\n`;
        teks += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        teks += `${praktekList}\n\n`;
        teks += `━━━━━━━━━━━━━━━━━━━━\n`;
        teks += `💡 _${semangatRandom}_`;

        return teks;
    } catch (err) {
        console.error("Error di buatTeksPraktek:", err);
        // FIX: return string kosong bukan null saat error
        return "";
    }
}

module.exports = { 
    buatTeksKisi, 
    buatTeksKisiFull, 
    buatTeksPraktek, 
    updatePraktekData, 
    isAdmin, 
    getStoredPraktek 
};
