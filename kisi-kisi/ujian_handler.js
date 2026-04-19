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
 * HANDLER KHUSUS PERINTAH UJIAN & PRAKTEK
 * Lokasi: /kisi-kisi/ujian_handler.js
 */

async function handleUjianCommands(sock, msg, body, from, sender, reply, KISI_FILES_PATH, MY_DOMAIN) {
    const bodyParts = body.split(' ');
    const command = bodyParts[0].toLowerCase();
    const isUserAdmin = isAdmin(sender);

    switch (command) {
        // --- MENU BANTUAN (LOGIKA DISINI) ---
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
                            `📝 *!info_kisi-kisi [pesan]*\n` +
                            `➝ Kirim info ke grup + media\n\n` +
                            `📥 *!update_kisi-kisi*\n` +
                            `➝ Simpan file (Reply gambar/pdf)\n\n` +
                            `🆙 *!update_praktek [hari] [mapel] [ket]*\n` +
                            `➝ Update jadwal praktek\n\n` +
                            `🗑️ *!hapus_praktek [hari]*\n` +
                            `➝ Hapus jadwal praktek hari tertentu\n\n` +
                            `🧹 *!hapus_kisi*\n` +
                            `➝ Hapus semua file database kisi\n`;
            }

            helpTeks += `\n━━━━━━━━━━━━━━━━━━━━`;
            await sock.sendMessage(from, { text: helpTeks }, { quoted: msg });
            break;
        }

        // 1. INFO & KIRIM KE GRUP
        case '!info_kisi-kisi': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");

            // FIX: ambil quotedMessage dulu biar konsisten
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const isImage = !!(msg.message?.imageMessage || quotedMsg?.imageMessage);
            const isDoc = !!(msg.message?.documentMessage || quotedMsg?.documentMessage);
            let mediaSection = "";

            if (isImage || isDoc) {
                try {
                    // FIX: kalau media dari quoted, bungkus dulu jadi msg-like object
                    const targetMsg = (quotedMsg?.imageMessage || quotedMsg?.documentMessage)
                        ? { message: quotedMsg, key: msg.key }
                        : msg;

                    const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});

                    // FIX: pastikan buffer valid sebelum disimpan
                    if (!buffer || buffer.length === 0) throw new Error("Buffer kosong");

                    const ext = isImage ? '.jpg' : '.pdf';
                    const fileName = `info_ujian_${Date.now()}${ext}`;
                    
                    fs.writeFileSync(path.join(KISI_FILES_PATH, fileName), buffer);
                    mediaSection = `\n\n🔗 *Link File:* ${MY_DOMAIN}/kisi_ujian/${fileName}`;
                } catch (err) {
                    console.error("Error download media info_kisi-kisi:", err);
                    // FIX: tidak return, lanjut kirim teks saja kalau media gagal
                    mediaSection = "";
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
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");
            
            // FIX: cek juga quoted message untuk support reply ke gambar/pdf
            const quotedMsg2 = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const isImage = !!(msg.message?.imageMessage || quotedMsg2?.imageMessage);
            const isDoc = !!(msg.message?.documentMessage || quotedMsg2?.documentMessage);

            if (!isImage && !isDoc) return reply("⚠️ Lampirkan file (Gambar/PDF)!");

            try {
                // FIX: sama seperti di atas, handle quoted media
                const targetMsg2 = (quotedMsg2?.imageMessage || quotedMsg2?.documentMessage)
                    ? { message: quotedMsg2, key: msg.key }
                    : msg;

                const buffer = await downloadMediaMessage(targetMsg2, 'buffer', {});

                // FIX: validasi buffer
                if (!buffer || buffer.length === 0) throw new Error("Buffer kosong");

                const ext = isImage ? '.jpg' : '.pdf';
                const fileName = `data_kisi_${Date.now()}${ext}`;
                
                fs.writeFileSync(path.join(KISI_FILES_PATH, fileName), buffer);
                await reply(`✅ *Data Tersimpan.*`);
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

                // FIX: validasi hasil buatTeksKisi sebelum kirim
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

        // 4. CEK REKAP FULL (Senin - Jumat)
        case '!kisi-kisi_full': {
            try {
                const rekapFull = await buatTeksKisiFull();

                // FIX: validasi hasil sebelum kirim
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
                // Jika data kosong atau tidak ada jadwal
                if (!teksPraktek || teksPraktek.trim().length < 5) {
                    return reply("ℹ️ *INFO PRAKTEK*\n\nBelum ada jadwal ujian praktek yang tersedia saat ini. Tetap semangat belajar! ☕");
                }
                await sock.sendMessage(from, { text: teksPraktek }, { quoted: msg });
            } catch (err) {
                console.error("Error Praktek:", err);
                reply("❌ Gagal mengambil data praktek.");
            }
            break;
        }

        // 6. UPDATE JADWAL PRAKTEK (Admin Only)
        case '!update_praktek': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");
            if (bodyParts.length < 4) return reply("⚠️ Format: *!update_praktek [hari] [mapel] [penjelasan]*\nContoh: !update_praktek senin Informatika Coding_Web");

            const hari = bodyParts[1];
            const mapel = bodyParts[2];
            const penjelasan = bodyParts.slice(3).join(' ');

            // FIX: trim input agar tidak ada whitespace nyasar
            const sukses = await updatePraktekData(hari.trim().toLowerCase(), mapel.trim(), penjelasan.trim());
            if (sukses) {
                await reply(`✅ *Berhasil Update Praktek!*\nHari: ${hari}\nMapel: ${mapel}`);
            } else {
                await reply("❌ Gagal. Pastikan hari benar (senin-jumat).");
            }
            break;
        }

        // 7. HAPUS JADWAL PRAKTEK (Admin Only)
        case '!hapus_praktek': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");
            const hariInput = bodyParts[1]?.toLowerCase()?.trim(); // FIX: tambah trim()
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
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");
            try {
                // FIX: pastikan folder ada sebelum readdir
                if (!fs.existsSync(KISI_FILES_PATH)) {
                    return reply("⚠️ Folder kisi tidak ditemukan.");
                }

                const files = fs.readdirSync(KISI_FILES_PATH);

                // FIX: kalau folder kosong, kasih info
                if (files.length === 0) {
                    return reply("ℹ️ Tidak ada file yang perlu dihapus.");
                }

                let gagal = 0;
                files.forEach(file => {
                    try {
                        fs.unlinkSync(path.join(KISI_FILES_PATH, file));
                    } catch (e) {
                        console.error("Gagal hapus file:", file, e);
                        gagal++;
                    }
                });

                if (gagal > 0) {
                    await reply(`⚠️ ${files.length - gagal} file berhasil dihapus, ${gagal} file gagal dihapus.`);
                } else {
                    await reply(`✅ Berhasil menghapus ${files.length} file materi kisi-kisi.`);
                }
            } catch (err) {
                console.error("Error hapus_kisi:", err);
                reply("❌ Gagal menghapus file.");
            }
            break;
        }
    }
}

module.exports = { handleUjianCommands };
