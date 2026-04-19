const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { 
    buatTeksKisi, 
    buatTeksKisiFull, 
    isAdmin, 
    buatTeksPraktek, 
    updatePraktekData, 
    getStoredPraktek 
} = require('./ujian_logic');
const { ID_GRUP_TUJUAN, LIST_HARI } = require('./kisi_constants');

/**
 * HANDLER KHUSUS PERINTAH UJIAN & PRAKTEK
 * Lokasi: /kisi-kisi/ujian_handler.js
 */

async function handleUjianCommands(sock, msg, body, from, sender, reply, KISI_FILES_PATH, MY_DOMAIN) {
    const bodyParts = body.split(' ');
    const command = bodyParts[0].toLowerCase();
    const isUserAdmin = isAdmin(sender);

    // Daftar hari wajib untuk validasi kisi-kisi & info
    const daftarHariWajib = LIST_HARI || ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

    switch (command) {
        case '!menu_praktek':
        case '!menu_ujian':
        case '!bantuan_ujian_praktek': {
            let helpTeks = `📚 *MENU UJIAN & PRAKTEK* 📚\n` +
                           `━━━━━━━━━━━━━━━━━━━━\n\n` +
                           `📖 *!kisi-kisi* \n➝ Rekap harian hari ini\n` +
                           `📂 *!kisi-kisi_full* \n➝ Semua materi seminggu\n` +
                           `🛠️ *!praktek* \n➝ Jadwal ujian praktek\n\n`;

            if (isUserAdmin) {
                helpTeks += `🛠️ *TOOLS ADMIN*\n` +
                            `━━━━━━━━━━━━━━━━━━━━\n` +
                            `📝 *!info_kisi-kisi [hari] [pesan]*\n` +
                            `➝ Kirim info ke grup (Wajib hari valid)\n\n` +
                            `📥 *!update_kisi-kisi [hari] [mapel]*\n` +
                            `➝ Simpan file per mapel (Wajib hari valid)\n\n` +
                            `🆙 *!update_praktek [hari] [mapel] [ket]*\n` +
                            `➝ Update jadwal praktek (Bebas/Custom)\n\n` +
                            `🗑️ *!hapus_praktek [hari]*\n` +
                            `➝ Hapus jadwal praktek hari tertentu\n\n` +
                            `🧹 *!hapus_kisi [mapel]*\n` +
                            `➝ Hapus file mapel tertentu\n`;
            }

            helpTeks += `\n━━━━━━━━━━━━━━━━━━━━`;
            await sock.sendMessage(from, { text: helpTeks }, { quoted: msg });
            break;
        }

        // 1. INFO & KIRIM KE GRUP (Wajib validasi hari)
        case '!info_kisi-kisi': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");

            const hariInput = bodyParts[1]?.toLowerCase();
            if (!daftarHariWajib.includes(hariInput)) {
                return reply(`⚠️ Hari tidak valid!\nFormat: *!info_kisi-kisi [hari] [pesan]*\nContoh: !info_kisi-kisi senin Besok bawa alat tulis.`);
            }

            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const isImage = !!(msg.message?.imageMessage || quotedMsg?.imageMessage);
            const isDoc = !!(msg.message?.documentMessage || quotedMsg?.documentMessage);
            let mediaSection = "";

            if (isImage || isDoc) {
                try {
                    const targetMsg = (quotedMsg?.imageMessage || quotedMsg?.documentMessage)
                        ? { message: quotedMsg, key: msg.key }
                        : msg;

                    const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
                    if (!buffer || buffer.length === 0) throw new Error("Buffer kosong");

                    const ext = isImage ? '.jpg' : '.pdf';
                    const fileName = `info_${hariInput}_${Date.now()}${ext}`;
                    fs.writeFileSync(path.join(KISI_FILES_PATH, fileName), buffer);
                    mediaSection = `\n\n🔗 *Link File:* ${MY_DOMAIN}/kisi_ujian/${fileName}`;
                } catch (err) {
                    console.error("Error download media info_kisi-kisi:", err);
                    mediaSection = "";
                }
            }

            const teksInfo = bodyParts.slice(2).join(' ');
            if (!teksInfo && !mediaSection) return reply("⚠️ Masukkan pesan info!");

            const pesanKeGrup = `📢 *PENGUMUMAN KISI-KISI (${hariInput.toUpperCase()})* 📢\n\n${teksInfo}${mediaSection}\n\n━━━━━━━━━━━━━━━━━━━━\n_Gunakan !kisi-kisi untuk rekap lengkap._`;
            await sock.sendMessage(ID_GRUP_TUJUAN, { text: pesanKeGrup });
            await reply(`✅ Info kisi-kisi hari *${hariInput}* telah dikirim.`);
            break;
        }

        // 2. UPDATE KISI-KISI PER MAPEL (Wajib validasi hari)
        case '!update_kisi-kisi': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");

            const hariInput = bodyParts[1]?.toLowerCase();
            if (!daftarHariWajib.includes(hariInput)) {
                return reply(`⚠️ Hari tidak valid!\nContoh: *!update_kisi-kisi senin Matematika*`);
            }

            const namaMapel = bodyParts.slice(2).join(' ').trim();
            if (!namaMapel) return reply("⚠️ Sebutkan nama mapel setelah hari!");

            const quotedMsg2 = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const isImage = !!(msg.message?.imageMessage || quotedMsg2?.imageMessage);
            const isDoc = !!(msg.message?.documentMessage || quotedMsg2?.documentMessage);

            if (!isImage && !isDoc) return reply("⚠️ Lampirkan atau reply file (Gambar/PDF)!");

            try {
                const targetMsg2 = (quotedMsg2?.imageMessage || quotedMsg2?.documentMessage)
                    ? { message: quotedMsg2, key: msg.key }
                    : msg;

                const buffer = await downloadMediaMessage(targetMsg2, 'buffer', {});
                if (!buffer || buffer.length === 0) throw new Error("Buffer kosong");

                const ext = isImage ? '.jpg' : '.pdf';
                const safeMapel = namaMapel.replace(/[^a-zA-Z0-9]/g, '_');
                const fileName = `kisi_${hariInput}_${safeMapel}_${Date.now()}${ext}`;

                fs.writeFileSync(path.join(KISI_FILES_PATH, fileName), buffer);
                await reply(`✅ *Data Tersimpan!*\n📅 Hari: *${hariInput}*\n📚 Mapel: *${namaMapel}*\n📄 File: ${fileName}`);
            } catch (err) {
                console.error("Error update_kisi-kisi:", err);
                reply("❌ Gagal menyimpan data.");
            }
            break;
        }

        // 3. CEK REKAP HARIAN
        case '!kisi-kisi':
        case '!cek_kisi-kisi': {
            try {
                const rekapTeks = await buatTeksKisi();
                if (!rekapTeks || rekapTeks.trim().length === 0) {
                    return reply("ℹ️ Belum ada data kisi-kisi untuk hari ini.");
                }
                const pesanFull = `📚 *REKAP MATERI KISI-KISI UJIAN* 📚\n\n` + 
                                  rekapTeks + 
                                  `\n\n⚠️ *Cek link folder di atas untuk melihat file materi.*`;
                await sock.sendMessage(from, { text: pesanFull });
            } catch (err) {
                console.error("Error kisi-kisi:", err);
                reply("❌ Gagal mengambil data kisi-kisi.");
            }
            break;
        }

        // 4. CEK REKAP FULL
        case '!kisi-kisi_full': {
            try {
                const rekapFull = await buatTeksKisiFull();
                if (!rekapFull || rekapFull.trim().length === 0) {
                    return reply("ℹ️ Belum ada data kisi-kisi minggu ini.");
                }
                await sock.sendMessage(from, { text: rekapFull });
            } catch (err) {
                console.error("Error kisi-kisi_full:", err);
                reply("❌ Gagal mengambil data kisi-kisi full.");
            }
            break;
        }

        // 5. CEK JADWAL PRAKTEK
        case '!praktek': {
            try {
                const teksPraktek = await buatTeksPraktek();
                if (!teksPraktek || teksPraktek.trim().length < 5) {
                    return reply("ℹ️ *INFO PRAKTEK*\n\nBelum ada jadwal ujian praktek yang tersedia saat ini.");
                }
                await sock.sendMessage(from, { text: teksPraktek }, { quoted: msg });
            } catch (err) {
                console.error("Error Praktek:", err);
                reply("❌ Gagal mengambil data praktek.");
            }
            break;
        }

        // 6. UPDATE JADWAL PRAKTEK (Bebas/Custom)
        case '!update_praktek': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");
            if (bodyParts.length < 4) return reply("⚠️ Format: *!update_praktek [hari] [mapel] [penjelasan]*");

            const hari = bodyParts[1];
            const mapel = bodyParts[2];
            const penjelasan = bodyParts.slice(3).join(' ');

            // Disini tidak pakai validasi hari agar user bebas isi hari apapun
            const sukses = await updatePraktekData(hari.trim(), mapel.trim(), penjelasan.trim());
            if (sukses) {
                await reply(`✅ *Berhasil Update Praktek!*\nHari: ${hari}\nMapel: ${mapel}`);
            } else {
                await reply("❌ Gagal menyimpan data praktek.");
            }
            break;
        }

        // 7. HAPUS JADWAL PRAKTEK
        case '!hapus_praktek': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");
            const hariInput = bodyParts[1]?.trim();
            if (!hariInput) return reply("⚠️ Sebutkan harinya! Contoh: *!hapus_praktek senin*");

            const sukses = await updatePraktekData(hariInput, "Tidak ada", "jadwal praktek");
            if (sukses) {
                await reply(`✅ Jadwal praktek hari *${hariInput}* telah dihapus.`);
            } else {
                await reply("❌ Gagal menghapus.");
            }
            break;
        }

        // 8. HAPUS FILE KISI-KISI
        case '!hapus_kisi': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");
            try {
                if (!fs.existsSync(KISI_FILES_PATH)) {
                    return reply("⚠️ Folder kisi tidak ditemukan.");
                }

                const namaMapelHapus = bodyParts.slice(1).join(' ').trim();
                const allFiles = fs.readdirSync(KISI_FILES_PATH);

                let targetFiles;
                if (namaMapelHapus) {
                    const safeMapel = namaMapelHapus.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                    targetFiles = allFiles.filter(f => f.toLowerCase().includes(safeMapel));
                } else {
                    targetFiles = allFiles;
                }

                if (targetFiles.length === 0) return reply("ℹ️ Tidak ada file yang cocok.");

                targetFiles.forEach(file => fs.unlinkSync(path.join(KISI_FILES_PATH, file)));
                await reply(`✅ Berhasil menghapus ${targetFiles.length} file.`);
            } catch (err) {
                console.error("Error hapus_kisi:", err);
                reply("❌ Gagal menghapus file.");
            }
            break;
        }
    }
}

module.exports = { handleUjianCommands };
