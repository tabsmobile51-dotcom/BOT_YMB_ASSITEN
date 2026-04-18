

const ADMIN_RAW = ['6289531549103'];

const KONTAK_KELUARGA = {
    ibu: '6285175148046', 
    ayah: '6289660171934',
    adik: '6285161364810' // Nomor Faisal
};

// Daftar Kode Rahasia yang banyak dan bervariasi
const LIST_KODE = [
    '!bantuan_zaki',      // Perintah resmi
    'zaki butuh bantuan', // Kalimat natural
    'zaki kecelakaan',
    'panggil keluarga zaki',
    'zaki pingsan',
    'zaki dalam bahaya',
    '101213',             // Kode angka
    '000999',             // Kode angka tambahan
    'emergency zaki',
    'tolong zaki',
    'info keluarga zaki',
    'zaki sakit parah',
    'zaki kenapa',
    'posisi zaki'
];

async function handleEmergency(sock, msg, body) {
    await sock.readMessages([msg.key]);
    if (!body) return false;
    
    const sender = msg.key.remoteJid;
    const cleanInput = body.toLowerCase().trim();

    // Cek apakah input mengandung salah satu dari LIST_KODE
    const isTriggered = LIST_KODE.some(kode => cleanInput.includes(kode));

    if (isTriggered) {
        // Tampilan informasi kontak yang rapi dan mudah dibaca
        const teksTampilkan = 
            `⚠️ *PROTUKOL DARURAT AKTIF* ⚠️\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Jika terjadi sesuatu pada pemilik akun ini, \n` +
            `mohon segera hubungi keluarga terdekat:\n\n` +
            `👨 *AYAH:* \n${KONTAK_KELUARGA.ayah}\n` +
            `👉 wa.me/${KONTAK_KELUARGA.ayah}\n\n` +
            `🧕 *IBU:* \n${KONTAK_KELUARGA.ibu}\n` +
            `👉 wa.me/${KONTAK_KELUARGA.ibu}\n\n` +
            `👦 *ADIK (FAISAL):* \n${KONTAK_KELUARGA.adik}\n` +
            `👉 wa.me/${KONTAK_KELUARGA.adik}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `*Catatan:* Mohon segera berikan informasi lokasi atau kondisi saat ini kepada keluarga. Terima kasih.`;

        // Kirim ke pengirim pesan
        await sock.sendMessage(sender, { text: teksTampilkan });

        // Notifikasi ke Admin agar kalian tahu ada yang mengakses info ini
        const pushName = msg.pushName || 'Seseorang';
        for (const adminId of ADMIN_RAW) {
            const jid = adminId.includes('@') ? adminId : `${adminId}@s.whatsapp.net`;
            await sock.sendMessage(jid, { 
                text: `📢 *Laporan:* ${pushName} (${sender.split('@')[0]}) baru saja memicu kode bantuan Zaki.` 
            });
        }

        return true;
    }
    
    return false;
}

module.exports = { handleEmergency };
  
