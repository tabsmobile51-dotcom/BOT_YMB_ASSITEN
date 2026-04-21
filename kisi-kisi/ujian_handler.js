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

// ─────────────────────────────────────────
// HELPER: Baca data penjelasan dari JSON
// ─────────────────────────────────────────
function getPenjelasanData() {
    try {
        if (fs.existsSync(KISI_PENJELASAN_PATH)) {
            return JSON.parse(fs.readFileSync(KISI_PENJELASAN_PATH, 'utf-8'));
        }
    } catch (e) {
        console.error('Error baca penjelasan JSON:', e);
    }
    return {};
}

// ─────────────────────────────────────────
// HELPER: Simpan data penjelasan ke JSON
// ─────────────────────────────────────────
function savePenjelasanData(data) {
    try {
        fs.writeFileSync(KISI_PENJELASAN_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('Error simpan penjelasan JSON:', e);
        return false;
    }
}

// ─────────────────────────────────────────
// HELPER: Download media (pesan langsung atau quoted)
// Returns: buffer | null
// ─────────────────────────────────────────
async function downloadMedia(msg) {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        const fromQuoted = !!(quotedMsg?.imageMessage || quotedMsg?.documentMessage);
        const targetMsg  = fromQuoted ? { message: quotedMsg, key: msg.key } : msg;

        const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
        if (!buffer || buffer.length === 0) return null;
        return buffer;
    } catch (err) {
        console.error('Error downloadMedia:', err);
        return null;
    }
}

// ─────────────────────────────────────────
// HELPER: Deteksi apakah ada file terlampir
// ─────────────────────────────────────────
function detectMedia(msg) {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isImage   = !!(msg.message?.imageMessage || quotedMsg?.imageMessage);
    const isDoc     = !!(msg.message?.documentMessage || quotedMsg?.documentMessage);
    return { isImage, isDoc, hasMedia: isImage || isDoc };
}

// ─────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────
async function handleUjianCommands(sock, msg, body, from, sender, reply, KISI_FILES_PATH, MY_DOMAIN) {
    const bodyParts = body.split(' ');
    const command   = bodyParts[0].toLowerCase();
    const isUserAdmin = isAdmin(sender);

    const daftarHariWajib = LIST_HARI?.length
        ? LIST_HARI
        : ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

    switch (command) {

        // ══════════════════════════════════════
        // MENU BANTUAN
        // ══════════════════════════════════════
        case '!menu_praktek':
        case '!menu_ujian':
        case '!bantuan_ujian_praktek': {
            let helpTeks =
                `📚 *MENU UJIAN & PRAKTEK* 📚\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `📖 *!kisi-kisi*\n➝ Rekap harian hari ini\n\n` +
                `📂 *!kisi-kisi_full*\n➝ Semua materi seminggu\n\n` +
                `🛠️ *!praktek*\n➝ Jadwal ujian praktek\n\n`;

            if (isUserAdmin) {
                helpTeks +=
                    `🛠️ *TOOLS ADMIN*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `📝 *!info_kisi-kisi [hari] [pesan]*\n` +
                    `➝ Kirim info ke grup + simpan penjelasan di web\n` +
                    `    (bisa lampir foto/PDF sekaligus)\n\n` +
                    `📥 *!update_kisi-kisi [hari] [mapel]*\n` +
                    `    atau dengan penjelasan:\n` +
                    `    *!update_kisi-kisi [hari] [mapel] | [penjelasan]*\n` +
                    `➝ Bebas: bisa file saja, penjelasan saja, atau keduanya\n\n` +
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

        // ══════════════════════════════════════
        // 1. INFO & KIRIM KE GRUP
        // ══════════════════════════════════════
        case '!info_kisi-kisi': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");

            const hariInput = bodyParts[1]?.toLowerCase();
            if (!hariInput || !daftarHariWajib.includes(hariInput)) {
                return reply(
                    `⚠️ Hari tidak valid!\n` +
                    `Format: *!info_kisi-kisi [hari] [pesan]*\n` +
                    `Contoh: *!info_kisi-kisi senin Besok bawa alat tulis.*`
                );
            }

            const { hasMedia, isImage } = detectMedia(msg);
            let mediaSection  = "";
            let savedFileName = null;

            // Proses file jika ada
            if (hasMedia) {
                const buffer = await downloadMedia(msg);
                if (buffer) {
                    const ext     = isImage ? '.jpg' : '.pdf';
                    savedFileName = `info_${hariInput}_${Date.now()}${ext}`;
                    try {
                        fs.writeFileSync(path.join(KISI_FILES_PATH, savedFileName), buffer);
                        mediaSection = `\n\n🔗 *Link File:* ${MY_DOMAIN}/kisi_ujian/${savedFileName}`;
                    } catch (err) {
                        console.error("Error simpan file info_kisi-kisi:", err);
                        savedFileName = null;
                    }
                } else {
                    console.warn("Buffer kosong — file diabaikan.");
                }
            }

            const teksInfo = bodyParts.slice(2).join(' ').trim();
            if (!teksInfo && !mediaSection) {
                return reply("⚠️ Masukkan pesan info atau lampirkan file!");
            }

            // Simpan ke JSON
            try {
                const penjelasanData = getPenjelasanData();
                const key = `info_${hariInput}`;
                if (!penjelasanData[key]) penjelasanData[key] = {};

                if (teksInfo) penjelasanData[key].teks = teksInfo;
                penjelasanData[key].updatedAt = new Date().toISOString();

                if (savedFileName) {
                    if (!penjelasanData[key].files) penjelasanData[key].files = [];
                    penjelasanData[key].files.push({
                        name:    savedFileName,
                        url:     `${MY_DOMAIN}/kisi_ujian/${savedFileName}`,
                        type:    savedFileName.endsWith('.pdf') ? 'pdf' : 'image',
                        addedAt: new Date().toISOString()
                    });
                }

                savePenjelasanData(penjelasanData);
            } catch (e) {
                console.error('Error simpan penjelasan info_kisi-kisi:', e);
            }

            // Kirim ke grup
            const pesanKeGrup =
                `📢 *PENGUMUMAN KISI-KISI (${hariInput.toUpperCase()})* 📢\n\n` +
                `${teksInfo}${mediaSection}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `_Gunakan !kisi-kisi untuk rekap lengkap._`;
            await sock.sendMessage(ID_GRUP_TUJUAN, { text: pesanKeGrup });

            let konfirmasi = `✅ Info kisi-kisi hari *${hariInput}* telah dikirim ke grup.`;
            if (teksInfo)      konfirmasi += `\n📝 Penjelasan tersimpan di web.`;
            if (savedFileName) konfirmasi += `\n📎 File tersimpan: ${savedFileName}`;
            await reply(konfirmasi);
            break;
        }

        // ══════════════════════════════════════
        // 2. UPDATE KISI-KISI PER MAPEL
        //    BEBAS: file saja / teks saja / keduanya
        // ══════════════════════════════════════
        case '!update_kisi-kisi': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");

            const hariInput = bodyParts[1]?.toLowerCase();
            if (!hariInput || !daftarHariWajib.includes(hariInput)) {
                return reply(
                    `⚠️ Hari tidak valid!\n\n` +
                    `Format yang tersedia:\n` +
                    `• *!update_kisi-kisi [hari] [mapel]* (+ lampir file)\n` +
                    `• *!update_kisi-kisi [hari] [mapel] | [penjelasan]*\n` +
                    `• *!update_kisi-kisi [hari] [mapel] | [penjelasan]* (+ lampir file)\n\n` +
                    `Contoh:\n` +
                    `_!update_kisi-kisi senin matematika | Kerjakan hal. 5-10_`
                );
            }

            const sisaBody = bodyParts.slice(2).join(' ').trim();
            if (!sisaBody) {
                return reply(
                    `⚠️ Nama mapel wajib diisi!\n` +
                    `Contoh: *!update_kisi-kisi senin matematika*`
                );
            }

            // Parse mapel dan penjelasan (dipisah " | ")
            const pipeIdx      = sisaBody.indexOf(' | ');
            const namaMapel    = (pipeIdx !== -1 ? sisaBody.slice(0, pipeIdx) : sisaBody).trim();
            const penjelasanTeks = pipeIdx !== -1 ? sisaBody.slice(pipeIdx + 3).trim() : '';

            if (!namaMapel) {
                return reply("⚠️ Nama mapel tidak boleh kosong!");
            }

            const { hasMedia, isImage } = detectMedia(msg);

            // Minimal harus ada salah satu: file atau penjelasan
            if (!hasMedia && !penjelasanTeks) {
                return reply(
                    `⚠️ Harus ada minimal salah satu:\n` +
                    `• Lampirkan file foto/PDF, *atau*\n` +
                    `• Tambahkan penjelasan setelah tanda *" | "*\n\n` +
                    `Contoh:\n` +
                    `_!update_kisi-kisi senin matematika | Kerjakan hal. 5-10_\n` +
                    `_(atau lampirkan foto/PDF tanpa penjelasan)_`
                );
            }

            try {
                let fileName = null;

                // Simpan file jika ada
                if (hasMedia) {
                    const buffer = await downloadMedia(msg);
                    if (buffer) {
                        const ext       = isImage ? '.jpg' : '.pdf';
                        const safeMapel = namaMapel.replace(/[^a-zA-Z0-9]/g, '_');
                        fileName        = `kisi_${hariInput}_${safeMapel}_${Date.now()}${ext}`;
                        fs.writeFileSync(path.join(KISI_FILES_PATH, fileName), buffer);
                    } else {
                        // Tidak gagalkan seluruh proses — lanjut simpan teks jika ada
                        console.warn("Buffer kosong pada update_kisi-kisi — file diabaikan.");
                        if (!penjelasanTeks) {
                            return reply("❌ Gagal membaca file yang dilampirkan dan tidak ada penjelasan. Coba lagi.");
                        }
                    }
                }

                // Simpan ke JSON
                const penjelasanData = getPenjelasanData();
                const key = namaMapel.toLowerCase().trim();
                if (!penjelasanData[key]) penjelasanData[key] = {};

                if (penjelasanTeks) penjelasanData[key].teks = penjelasanTeks;
                penjelasanData[key].hari      = hariInput;
                penjelasanData[key].updatedAt = new Date().toISOString();

                if (fileName) {
                    if (!penjelasanData[key].files) penjelasanData[key].files = [];
                    penjelasanData[key].files.push({
                        name:    fileName,
                        url:     `${MY_DOMAIN}/kisi_ujian/${fileName}`,
                        type:    fileName.endsWith('.pdf') ? 'pdf' : 'image',
                        addedAt: new Date().toISOString()
                    });
                }

                const berhasil = savePenjelasanData(penjelasanData);
                if (!berhasil) return reply("❌ Gagal menyimpan data ke JSON.");

                // Konfirmasi
                let replyTeks =
                    `✅ *Data Tersimpan!*\n` +
                    `📅 Hari   : *${hariInput}*\n` +
                    `📚 Mapel  : *${namaMapel}*`;
                if (fileName)      replyTeks += `\n📄 File      : ${fileName}`;
                if (penjelasanTeks) replyTeks += `\n📝 Penjelasan: "${penjelasanTeks}"`;

                await reply(replyTeks);

            } catch (err) {
                console.error("Error update_kisi-kisi:", err);
                reply("❌ Gagal menyimpan data.");
            }
            break;
        }

        // ══════════════════════════════════════
        // 3. REKAP HARIAN (hari ini)
        // ══════════════════════════════════════
        case '!kisi-kisi':
        case '!cek_kisi-kisi': {
            try {
                const rekapTeks = await buatTeksKisi();
                if (!rekapTeks || rekapTeks.trim().length === 0) {
                    return reply("ℹ️ Belum ada data kisi-kisi untuk hari ini.");
                }
                const pesanFull =
                    `📚 *REKAP MATERI KISI-KISI UJIAN* 📚\n\n` +
                    rekapTeks +
                    `\n\n⚠️ *Cek link folder di atas untuk melihat file materi.*`;
                await sock.sendMessage(from, { text: pesanFull }, { quoted: msg });
            } catch (err) {
                console.error("Error kisi-kisi:", err);
                reply("❌ Gagal mengambil data kisi-kisi.");
            }
            break;
        }

        // ══════════════════════════════════════
        // 4. REKAP SEMINGGU PENUH
        // ══════════════════════════════════════
        case '!kisi-kisi_full': {
            try {
                const rekapFull = await buatTeksKisiFull();
                if (!rekapFull || rekapFull.trim().length === 0) {
                    return reply("ℹ️ Belum ada data kisi-kisi minggu ini.");
                }
                await sock.sendMessage(from, { text: rekapFull }, { quoted: msg });
            } catch (err) {
                console.error("Error kisi-kisi_full:", err);
                reply("❌ Gagal mengambil data kisi-kisi full.");
            }
            break;
        }

        // ══════════════════════════════════════
        // 5. JADWAL PRAKTEK
        // ══════════════════════════════════════
        case '!praktek': {
            try {
                const teksPraktek = await buatTeksPraktek();
                if (!teksPraktek || teksPraktek.trim().length < 5) {
                    return reply(
                        `ℹ️ *INFO PRAKTEK*\n\n` +
                        `Belum ada jadwal ujian praktek yang tersedia saat ini.`
                    );
                }
                await sock.sendMessage(from, { text: teksPraktek }, { quoted: msg });
            } catch (err) {
                console.error("Error Praktek:", err);
                reply("❌ Gagal mengambil data praktek.");
            }
            break;
        }

        // ══════════════════════════════════════
        // 6. UPDATE PRAKTEK
        // ══════════════════════════════════════
        case '!update_praktek': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");
            if (bodyParts.length < 4) {
                return reply(
                    `⚠️ Format: *!update_praktek [hari] [mapel] [penjelasan]*\n` +
                    `Contoh: *!update_praktek senin matematika Bawa kalkulator*`
                );
            }

            const hari       = bodyParts[1].trim();
            const mapel      = bodyParts[2].trim();
            const penjelasan = bodyParts.slice(3).join(' ').trim();

            if (!penjelasan) {
                return reply("⚠️ Penjelasan/keterangan tidak boleh kosong!");
            }

            const sukses = await updatePraktekData(hari, mapel, penjelasan);
            if (sukses) {
                await reply(
                    `✅ *Berhasil Update Praktek!*\n` +
                    `📅 Hari  : ${hari}\n` +
                    `📚 Mapel : ${mapel}\n` +
                    `📝 Ket   : ${penjelasan}`
                );
            } else {
                await reply("❌ Gagal menyimpan data praktek.");
            }
            break;
        }

        // ══════════════════════════════════════
        // 7. HAPUS PRAKTEK
        // ══════════════════════════════════════
        case '!hapus_praktek': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");

            const hariInput = bodyParts[1]?.trim();
            if (!hariInput) {
                return reply("⚠️ Sebutkan harinya!\nContoh: *!hapus_praktek senin*");
            }

            const sukses = await updatePraktekData(hariInput, "Tidak ada", "Tidak ada jadwal praktek");
            if (sukses) {
                await reply(`✅ Jadwal praktek hari *${hariInput}* telah dihapus.`);
            } else {
                await reply("❌ Gagal menghapus.");
            }
            break;
        }

        // ══════════════════════════════════════
        // 8. HAPUS KISI (file + data JSON)
        // ══════════════════════════════════════
        case '!hapus_kisi': {
            if (!isUserAdmin) return reply("🚫 Akses ditolak.");
            try {
                const namaMapelHapus = bodyParts.slice(1).join(' ').trim();
                if (!namaMapelHapus) {
                    return reply("⚠️ Sebutkan nama mapel!\nContoh: *!hapus_kisi matematika*");
                }

                const keyHapus      = namaMapelHapus.toLowerCase().trim();
                const safeMapelHapus = keyHapus.replace(/[^a-zA-Z0-9]/g, '_');

                // 1. Hapus dari JSON
                const penjelasanData = getPenjelasanData();
                let terhapusJson = 0;

                for (const k of Object.keys(penjelasanData)) {
                    const kNorm = k.toLowerCase().trim();
                    const kSafe = k.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

                    if (kNorm === keyHapus || kSafe.includes(safeMapelHapus)) {
                        delete penjelasanData[k];
                        terhapusJson++;
                    }
                }
                if (terhapusJson > 0) savePenjelasanData(penjelasanData);

                // 2. Hapus file fisik
                let terhapusFile = 0;
                if (fs.existsSync(KISI_FILES_PATH)) {
                    const allFiles    = fs.readdirSync(KISI_FILES_PATH);
                    const targetFiles = allFiles.filter(f =>
                        f.toLowerCase().includes(safeMapelHapus)
                    );

                    for (const file of targetFiles) {
                        try {
                            fs.unlinkSync(path.join(KISI_FILES_PATH, file));
                            terhapusFile++;
                        } catch (e) {
                            console.error("Gagal hapus file:", file, e);
                        }
                    }
                }

                if (terhapusJson === 0 && terhapusFile === 0) {
                    return reply(
                        `ℹ️ Tidak ditemukan data atau file untuk mapel *${namaMapelHapus}*.`
                    );
                }

                await reply(
                    `✅ *Berhasil Dihapus!*\n` +
                    `📚 Mapel           : ${namaMapelHapus}\n` +
                    `📝 Data Penjelasan : ${terhapusJson} entri dihapus\n` +
                    `📁 File Fisik      : ${terhapusFile} file dihapus`
                );

            } catch (err) {
                console.error("Error hapus_kisi:", err);
                reply("❌ Gagal menghapus data kisi.");
            }
            break;
        }

        // ══════════════════════════════════════
        // DEFAULT: command tidak dikenal
        // ══════════════════════════════════════
        default:
            // Tidak perlu reply — biar handler lain yang tangani
            break;
    }
}

module.exports = { handleUjianCommands };
