const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
// --- IMPORT FUNGSI LENGKAP ---
const { 
    buatTeksKisi, 
    buatTeksKisiFull, 
    isAdmin, 
    buatTeksPraktek, 
    updatePraktekData, 
    getStoredPraktek 
} = require('./ujian_logic');
const { ID_GRUP_TUJUAN } = require('./kisi_constants');

/**
 * HANDLER KHUSUS PERINTAH UJIAN
 * Lokasi: /kisi-kisi/ujian_handler.js
 */

async function handleUjianCommands(sock, msg, body, from, sender, reply, KISI_FILES_PATH, MY_DOMAIN) {
    const bodyParts = body.split(' ');
    const command = bodyParts[0].toLowerCase();

    switch (command) {
        // 1. INFO & KIRIM KE GRUP
        case '!info_kisi-kisi': {
            if (!isAdmin(sender)) return reply("🚫 Akses ditolak.");

            const isImage = msg.message?.imageMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            const isDoc = msg.message?.documentMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
            let mediaSection = "";

            if (isImage || isDoc) {
                try {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    const ext = isImage ? '.jpg' : '.pdf';
                    const fileName = `info_ujian_${Date.now()}${ext}`;
                    
                    fs.writeFileSync(path.join(KISI_FILES_PATH, fileName), buffer);
                    mediaSection = `\n\n🔗 *Link File:* ${MY_DOMAIN}/kisi_ujian/${fileName}`;
                } catch (err) {
                    console.error(err);
                }
            }

            const teksInfo = bodyParts.slice(1).join(' ');
            if (!teksInfo && !mediaSection) return reply("⚠️ Masukkan pesan info!");

            const pesanKeGrup = `📢 *PENGUMUMAN KISI-KISI UJIAN* 📢\n\n${teksInfo}${mediaSection}\n\n━━━━━━━━━━━━━━━━━━━━\n_Gunakan !cek_kisi-kisi untuk rekap lengkap._`;
            
            await sock.sendMessage(ID_GRUP_TUJUAN, { text: pesanKeGrup });
            await reply("✅ Info telah dikirim ke grup tujuan.");
            break;
        }

        // 2. UPDATE KE DATA KISI-KISI
        case '!update_kisi-kisi': {
            if (!isAdmin(sender)) return reply("🚫 Akses ditolak.");
            
            const isImage = msg.message?.imageMessage;
            const isDoc = msg.message?.documentMessage;

            if (!isImage && !isDoc) return reply("⚠️ Lampirkan file (Gambar/PDF)!");

            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                const ext = isImage ? '.jpg' : '.pdf';
                const fileName = `data_kisi_${Date.now()}${ext}`;
                
                fs.writeFileSync(path.join(KISI_FILES_PATH, fileName), buffer);
                await reply(`✅ *Data Tersimpan.*`);
            } catch (err) {
                reply("❌ Gagal menyimpan data.");
            }
            break;
        }

        // 3. CEK REKAP HARIAN
        case '!kisi-kisi':
        case '!cek_kisi-kisi': {
            const rekapTeks = await buatTeksKisi();
            const pesanFull = `📚 *REKAP MATERI KISI-KISI UJIAN* 📚\n\n` + 
                              rekapTeks + 
                              `\n\n⚠️ *Cek link folder di atas untuk melihat file materi.*`;

            await sock.sendMessage(from, { text: pesanFull });
            break;
        }

        // 4. CEK REKAP FULL (Senin - Jumat)
        case '!kisi-kisi_full': {
            const rekapFull = await buatTeksKisiFull();
            await sock.sendMessage(from, { text: rekapFull });
            break;
        }

        // --- FITUR BARU PRAKTEK ---

        // 5. CEK JADWAL PRAKTEK
        case '!praktek': {
            const teksPraktek = await buatTeksPraktek();
            if (!teksPraktek) {
                return reply("ℹ️ *INFO PRAKTEK*\n\nTidak ada jadwal ujian praktek untuk waktu dekat. Tetap semangat!");
            }
            await sock.sendMessage(from, { text: teksPraktek });
            break;
        }

        // 6. UPDATE JADWAL PRAKTEK (Admin Only)
        case '!update_praktek': {
            if (!isAdmin(sender)) return reply("🚫 Akses ditolak.");
            if (bodyParts.length < 4) return reply("⚠️ Format: *!update_praktek [hari] [mapel] [penjelasan]*\nContoh: !update_praktek senin Informatika Coding_Web");

            const hari = bodyParts[1];
            const mapel = bodyParts[2];
            const penjelasan = bodyParts.slice(3).join(' ');

            const sukses = await updatePraktekData(hari, mapel, penjelasan);
            if (sukses) {
                await reply(`✅ *Berhasil Update Praktek!*\nHari: ${hari}\nMapel: ${mapel}`);
            } else {
                await reply("❌ Gagal. Pastikan hari benar (senin-jumat).");
            }
            break;
        }

        // 7. HAPUS JADWAL PRAKTEK (Admin Only)
        case '!hapus_praktek': {
            if (!isAdmin(sender)) return reply("🚫 Akses ditolak.");
            const hariInput = bodyParts[1]?.toLowerCase();
            if (!hariInput) return reply("⚠️ Sebutkan harinya! Contoh: *!hapus_praktek senin*");

            const sukses = await updatePraktekData(hariInput, "Tidak ada", "jadwal praktek");
            if (sukses) {
                await reply(`✅ Jadwal praktek hari *${hariInput}* telah dihapus.`);
            } else {
                await reply("❌ Gagal. Hari tidak valid.");
            }
            break;
        }

        // 8. HAPUS SEMUA FILE KISI-KISI (Admin Only)
        case '!hapus_kisi': {
            if (!isAdmin(sender)) return reply("🚫 Akses ditolak.");
            try {
                const files = fs.readdirSync(KISI_FILES_PATH);
                files.forEach(file => fs.unlinkSync(path.join(KISI_FILES_PATH, file)));
                await reply(`✅ Berhasil menghapus ${files.length} file materi kisi-kisi.`);
            } catch (err) {
                reply("❌ Gagal menghapus file.");
            }
            break;
        }
    }
}

module.exports = { handleUjianCommands };
