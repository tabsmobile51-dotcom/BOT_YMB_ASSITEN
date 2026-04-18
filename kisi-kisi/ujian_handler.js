const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { buatTeksKisi, isAdmin } = require('./ujian_logic');
const { ID_GRUP_TUJUAN } = require('./kisi_constants');

/**
 * HANDLER KHUSUS PERINTAH UJIAN
 * Lokasi: /kisi-kisi/ujian_handler.js
 */

async function handleUjianCommands(sock, msg, body, from, sender, reply, KISI_FILES_PATH, MY_DOMAIN) {
    const bodyParts = body.split(' ');
    const command = bodyParts[0].toLowerCase();

    switch (command) {
        // 1. INFO & KIRIM KE GRUP (Langsung broadcast ke grup tujuan)
        case '!info_kisi-kisi': {
            if (!isAdmin(sender)) return reply("🚫 Akses ditolak. Hanya admin yang bisa memberi info.");

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
            
            // Langsung kirim ke grup tujuan
            await sock.sendMessage(ID_GRUP_TUJUAN, { text: pesanKeGrup });
            await reply("✅ Info telah dikirim ke grup tujuan.");
            break;
        }

        // 2. UPDATE KE DATA (Simpan diam-diam ke folder database ujian)
        case '!update_kisi-kisi': {
            if (!isAdmin(sender)) return reply("🚫 Akses ditolak.");
            
            const isImage = msg.message?.imageMessage;
            const isDoc = msg.message?.documentMessage;

            if (!isImage && !isDoc) return reply("⚠️ Lampirkan file (Gambar/PDF) untuk disimpan ke database!");

            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                const ext = isImage ? '.jpg' : '.pdf';
                const fileName = `data_kisi_${Date.now()}${ext}`;
                
                fs.writeFileSync(path.join(KISI_FILES_PATH, fileName), buffer);
                await reply(`✅ *Data Tersimpan.*\nFile masuk ke database materi ujian tanpa mengirim pesan ke grup.`);
            } catch (err) {
                reply("❌ Gagal menyimpan data.");
            }
            break;
        }

        // 3. CEK REKAP FULL (Bisa dilihat siapa saja)
        case '!kisi-kisi':
        case '!cek_kisi-kisi': {
            const rekapTeks = await buatTeksKisi();
            const pesanFull = `📚 *REKAP MATERI KISI-KISI UJIAN* 📚\n\n` + 
                              rekapTeks + 
                              `\n\n⚠️ *Cek link folder di atas untuk melihat semua file materi yang sudah di-upload.*`;

            await sock.sendMessage(from, { text: pesanFull });
            break;
        }
    }
}

module.exports = { handleUjianCommands };
