const { JADWAL_PELAJARAN, MOTIVASI_SEKOLAH, ADMIN_RAW, KISI_FILES_PATH } = require('./kisi_constants');
const fs = require('fs'); // Tambahkan fs untuk cek folder

function isAdmin(sender) {
    const phone = sender.split('@')[0];
    return ADMIN_RAW.includes(phone);
}

async function buatTeksKisi(hariOverride = null) {
    // --- TAMBAHAN LOGIKA PENJELASAN JIKA DATA KOSONG ---
    if (!fs.existsSync(KISI_FILES_PATH) || fs.readdirSync(KISI_FILES_PATH).length === 0) {
        return "ℹ️ *INFO KISI-KISI*\n\nBelum ada file materi (Gambar/PDF) yang diunggah ke database ujian oleh pengurus. Silakan cek lagi nanti setelah admin melakukan *!update_kisi-kisi*.";
    }
    // --------------------------------------------------

    const now = new Date();
    let hari = hariOverride || now.getDay();
    
    // Jika lewat jam 16:00, otomatis cek untuk besok
    if (!hariOverride && now.getHours() >= 16) hari += 1;
    if (hari > 5 || hari === 0) hari = 1;

    const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const mapelList = JADWAL_PELAJARAN[hari] ? JADWAL_PELAJARAN[hari].split('\n') : ["Tidak ada jadwal"];
    const motivasi = MOTIVASI_SEKOLAH[Math.floor(Math.random() * MOTIVASI_SEKOLAH.length)];

    let teks = `📑 *PUSAT KISI-KISI UJIAN* 📑\n`;
    teks += `📅 *Persiapan: ${dayLabels[hari].toUpperCase()}*\n`;
    teks += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    mapelList.forEach(mapel => {
        teks += `${mapel}\n`;
        // Link diarahkan ke folder penyimpanan static kamu
        teks += `└─ 🔗 *Materi:* ${process.env.MY_DOMAIN || 'http://localhost'}/kisi_ujian/\n\n`;
    });

    teks += `━━━━━━━━━━━━━━━━━━━━\n`;
    teks += `💡 _"${motivasi}"_\n\n`;
    teks += `*Tetap semangat dan fokus!* 😇`;

    return teks;
}

module.exports = { buatTeksKisi, isAdmin };
