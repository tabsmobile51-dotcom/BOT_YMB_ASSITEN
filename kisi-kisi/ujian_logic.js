const { JADWAL_PELAJARAN, MOTIVASI_SEKOLAH, ADMIN_RAW } = require('./kisi_constants');

function isAdmin(sender) {
    const phone = sender.split('@')[0];
    return ADMIN_RAW.includes(phone);
}

async function buatTeksKisi(hariOverride = null) {
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

