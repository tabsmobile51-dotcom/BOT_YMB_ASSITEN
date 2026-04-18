const { buatTeksKisi } = require('./ujian_logic');
const { ID_GRUP_TUJUAN } = require('./kisi_constants');

// Nama fungsi diubah menjadi initUjianScheduler agar sesuai dengan pemanggilan di index.js
async function initUjianScheduler(sock, ID_PRIBADI, botConfig) {
    console.log("✅ Scheduler Kisi-Kisi Aktif");

    setInterval(async () => {
        // Cek apakah fitur diaktifkan di botConfig (Dashboard)
        if (botConfig && !botConfig.kisiUjian) return;

        const now = new Date();
        const jam = now.getHours();
        const menit = now.getMinutes();

        // Kirim ke Grup Tujuan jam 17:00 WIB
        if (jam === 17 && menit === 0) {
            const teks = await buatTeksKisi();
            await sock.sendMessage(ID_GRUP_TUJUAN, { text: teks });
        }

        // Kirim ke Pribadi jam 20:00 WIB
        if (jam === 20 && menit === 0) {
            const teks = await buatTeksKisi();
            await sock.sendMessage(ID_PRIBADI, { text: "🔔 *PENGINGAT UJIAN*\n\n" + teks });
        }
    }, 60000);
}

// Nama ekspor disamakan dengan nama fungsi di atas
module.exports = { initUjianScheduler };
