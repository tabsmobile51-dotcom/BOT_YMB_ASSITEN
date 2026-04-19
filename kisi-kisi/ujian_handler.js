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

// Path file JSON penjelasan kisi-kisi per mapel
const KISI_PENJELASAN_PATH = '/app/auth_info/kisi_penjelasan.json';

// Baca data penjelasan dari JSON
function getPenjelasanData() {
    try {
        if (fs.existsSync(KISI_PENJELASAN_PATH)) {
            return JSON.parse(fs.readFileSync(KISI_PENJELASAN_PATH, 'utf-8'));
        }
    } catch (e) { console.error('Error baca penjelasan JSON:', e); }
    return {};
}

// Simpan data penjelasan ke JSON
function savePenjelasanData(data) {
    try {
        fs.writeFileSync(KISI_PENJELASAN_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (e) { console.error('Error simpan penjelasan JSON:', e); return false; }
}

async function handleUjianCommands(sock, msg, body, from, sender, reply, KISI_FILES_PATH, MY_DOMAIN) {
    const bodyParts = body.split(' ');
    const command = bodyParts[0].toLowerCase();
    const isUserAdmin = isAdmin(sender);

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
                            `➝ Kirim info ke grup + simpan penjelasan di web\n` +
                            `    (bisa lampir foto/PDF sekaligus)\n\n` +
                            `📥 *!update_kisi-kisi [hari] [mapel]* atau\n` +
                            `    *!update_kisi-kisi [hari] [mapel] | [penjelasan]*\n` +
                            `➝ Simpan file foto/PDF per mapel\n` +
                            `    Penjelasan opsional setelah tanda " | "\n\n` +
                            `🆙 *!update_praktek [hari] [mapel] [ket]*\n` +
                            `➝ Update jadwal praktek (Bebas/Custom)\n\n` +
                            `🗑️ *!hapus_praktek [hari]*\n` +
                            `➝ Hapus jadwal praktek hari tertentu\n\n` +
                            `🧹 *!hapus_kisi [mapel]*\n` +
                            `➝ Hapus file + penjelasan mapel tertentu\n`;
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
            let savedFileName = null;

            if (isImage || isDoc) {
                try {
                    const targetMsg = (quotedMsg?.imageMessage || quotedMsg?.documentMessage)
                        ? { message: quotedMsg, key: msg.key }
                        : msg;

                    const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
                    if (!buffer || buffer.length === 0) throw new Error("Buffer kosong");

                    const ext = isImage ? '.jpg' : '.pdf';
                    savedFileName = `info_${hariInput}_${Date.now()}${ext}`;
                    fs.writeFileSync(path.join(KISI_FILES_PATH, savedFileName), buffer);
                    mediaSection = `\n\n🔗 *Link File:* ${MY_DOMAIN}/kisi_ujian/${savedFileName}`;
                } catch (err) {
                    console.error("Error download media info_kisi-kisi:", err);
                    mediaSection = "";
                }
            }

            const teksInfo = bodyParts.slice(2).join(' ').trim();
            if (!teksInfo && !mediaSection) return reply("⚠️ Masukkan pesan info atau lampirkan file!");

            try {
                const penjelasanData = getPenjelasanData();
                const key = `info_${hariInput}`;
                if (!penjelasanData[key]) penjelasanData[key] = {};

                if (teksInfo) {
                    penjelasanData[key].teks = teksInfo;
                }
                penjelasanData[key].updatedAt = new Date().toISOString();

                if (savedFileName) {
                    if (!penjelasanData[key].files) penjelasanData[key].files = [];
                    penjelasanData[key].files.push({
                        name: savedFileName,
                        url: `${MY_DOMAIN}/kisi_ujian/${savedFileName}`,
                        type: savedFileName.endsWith('.pdf') ? 'pdf' : 'image',
                        addedAt: new Date().toISOString()
                    });
                }

                savePenjelasanData(penjelasanData);
            } catch (e) {
                console.error('Error simpan penjelasan info_kisi-kisi:', e);
            }

            const pesanKeGrup = `📢 *PENGUMUMAN KISI-KISI (${hariInput.toUpperCase()})* 📢\n\n${teksInfo}${mediaSection}\n\n━━━━━━━━━━━━━━━━━━━━\n_Gunakan !kisi-kisi untuk rekap lengkap._`;
            await sock.sendMessage(ID_GRUP_TUJUAN, { text: pesanKeGrup });

            let konfirmasi = `✅ Info kisi-kisi hari *${hariInput}* telah dikirim ke grup.`;
            if (teksInfo) konfirmasi += `\n📝 Penjelasan tersimpan di web.`;
            if (savedFileName) konfirmasi += `\n📎 File tersimpan: ${savedFileName}`;
            await reply(konfirmasi);
            break;
        }

        // 2. UPDATE KISI-KISI PER MAPEL (MODIFIKASI: File Opsional jika ada penjelasan)
        case '!update_kisi-kisi': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");

            const hariInput = bodyParts[1]?.toLowerCase();
            if (!daftarHariWajib.includes(hariInput)) {
                return reply(`⚠️ Hari tidak valid!\nFormat:\n*!update_kisi-kisi [hari] [mapel]*\natau\n*!update_kisi-kisi [hari] [mapel] | [penjelasan]*`);
            }

            const sisaBody = bodyParts.slice(2).join(' ').trim();
            if (!sisaBody) return reply("⚠️ Sebutkan nama mapel setelah hari!");

            const pipeIdx = sisaBody.indexOf(' | ');
            const namaMapel = pipeIdx !== -1 ? sisaBody.slice(0, pipeIdx).trim() : sisaBody.trim();
            const penjelasanTeks = pipeIdx !== -1 ? sisaBody.slice(pipeIdx + 3).trim() : '';

            if (!namaMapel) return reply("⚠️ Nama mapel tidak boleh kosong!");

            const quotedMsg2 = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const isImage = !!(msg.message?.imageMessage || quotedMsg2?.imageMessage);
            const isDoc = !!(msg.message?.documentMessage || quotedMsg2?.documentMessage);

            // Validasi: Harus ada salah satu (Media atau Teks Penjelasan)
            if (!isImage && !isDoc && !penjelasanTeks) {
                return reply("⚠️ Lampirkan file (Gambar/PDF) atau tambahkan penjelasan teks setelah tanda ' | '!");
            }

            try {
                let fileName = null;
                // Proses download file hanya jika user melampirkan media
                if (isImage || isDoc) {
                    const targetMsg2 = (quotedMsg2?.imageMessage || quotedMsg2?.documentMessage)
                        ? { message: quotedMsg2, key: msg.key }
                        : msg;

                    const buffer = await downloadMediaMessage(targetMsg2, 'buffer', {});
                    if (buffer && buffer.length > 0) {
                        const ext = isImage ? '.jpg' : '.pdf';
                        const safeMapel = namaMapel.replace(/[^a-zA-Z0-9]/g, '_');
                        fileName = `kisi_${hariInput}_${safeMapel}_${Date.now()}${ext}`;
                        fs.writeFileSync(path.join(KISI_FILES_PATH, fileName), buffer);
                    }
                }

                // Proses Simpan ke JSON Penjelasan
                const penjelasanData = getPenjelasanData();
                const key = namaMapel.toLowerCase().trim();
                if (!penjelasanData[key]) penjelasanData[key] = {};

                // Update data teks, hari, dan timestamp
                if (penjelasanTeks) {
                    penjelasanData[key].teks = penjelasanTeks;
                }
                penjelasanData[key].hari = hariInput;
                penjelasanData[key].updatedAt = new Date().toISOString();

                // Simpan info file ke list jika berhasil didownload
                if (fileName) {
                    if (!penjelasanData[key].files) penjelasanData[key].files = [];
                    penjelasanData[key].files.push({
                        name: fileName,
                        url: `${MY_DOMAIN}/kisi_ujian/${fileName}`,
                        type: fileName.endsWith('.pdf') ? 'pdf' : 'image',
                        addedAt: new Date().toISOString()
                    });
                }

                savePenjelasanData(penjelasanData);

                let replyTeks = `✅ *Data Tersimpan!*\n📅 Hari: *${hariInput}*\n📚 Mapel: *${namaMapel}*`;
                if (fileName) replyTeks += `\n📄 File: ${fileName}`;
                if (penjelasanTeks) replyTeks += `\n📝 Penjelasan: "${penjelasanTeks}"`;
                
                await reply(replyTeks);

            } catch (err) {
                console.error("Error update_kisi-kisi:", err);
                reply("❌ Gagal menyimpan data.");
            }
            break;
        }

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

        case '!update_praktek': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");
            if (bodyParts.length < 4) return reply("⚠️ Format: *!update_praktek [hari] [mapel] [penjelasan]*");

            const hari = bodyParts[1];
            const mapel = bodyParts[2];
            const penjelasan = bodyParts.slice(3).join(' ');

            const sukses = await updatePraktekData(hari.trim(), mapel.trim(), penjelasan.trim());
            if (sukses) {
                await reply(`✅ *Berhasil Update Praktek!*\nHari: ${hari}\nMapel: ${mapel}`);
            } else {
                await reply("❌ Gagal menyimpan data praktek.");
            }
            break;
        }

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

                // Hapus file fisik
                targetFiles.forEach(file => fs.unlinkSync(path.join(KISI_FILES_PATH, file)));

                // FIX: Hapus juga data di kisi_penjelasan.json
                // Sinkron dengan cara bot simpan key: namaMapel.toLowerCase().trim()
                try {
                    const penjelasanData = getPenjelasanData();
                    const keyHapus = namaMapelHapus.toLowerCase().trim();
                    const safeMapelHapus = namaMapelHapus.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                    let terhapusJson = 0;

                    // Hapus key yang exact match atau partial match (sama logika file)
                    for (const k of Object.keys(penjelasanData)) {
                        const kNorm = k.toLowerCase().trim();
                        const kSafe = k.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                        if (
                            kNorm === keyHapus ||
                            kNorm.includes(keyHapus) ||
                            keyHapus.includes(kNorm) ||
                            kSafe.includes(safeMapelHapus) ||
                            safeMapelHapus.includes(kSafe)
                        ) {
                            delete penjelasanData[k];
                            terhapusJson++;
                        }
                    }

                    if (terhapusJson > 0) savePenjelasanData(penjelasanData);

                    await reply(
                        `✅ Berhasil menghapus ${targetFiles.length} file` +
                        (terhapusJson > 0 ? ` + ${terhapusJson} data penjelasan` : '') +
                        ` untuk mapel *${namaMapelHapus || 'semua'}*.`
                    );
                } catch (jsonErr) {
                    console.error("Error hapus JSON penjelasan:", jsonErr);
                    // File fisik sudah terhapus, lapor partial success
                    await reply(`✅ Berhasil menghapus ${targetFiles.length} file, tapi gagal hapus data penjelasan.`);
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
