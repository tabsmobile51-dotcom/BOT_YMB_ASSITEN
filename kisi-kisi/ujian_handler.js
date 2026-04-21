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
// HELPER: Nama hari Indonesia → index (0=Minggu)
// ─────────────────────────────────────────
function hariToIndex(hari) {
    const map = {
        minggu: 0, senin: 1, selasa: 2, rabu: 3,
        kamis: 4, jumat: 5, sabtu: 6
    };
    return map[hari?.toLowerCase()] ?? -1;
}

// ─────────────────────────────────────────
// HELPER: Dapatkan nama hari sekarang (Indonesia)
// ─────────────────────────────────────────
function getNamaHariIni() {
    const hariList = ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'];
    return hariList[new Date().getDay()];
}

// ─────────────────────────────────────────
// HELPER: Render satu entri mapel ke teks WA
// Penjelasan tampil langsung, file jadi link web
// ─────────────────────────────────────────
function renderEntriMapel(namaMapel, data, MY_DOMAIN) {
    let baris = `📚 *${namaMapel.toUpperCase()}*`;

    // Tampilkan teks penjelasan langsung di chat
    if (data.teks && data.teks.trim()) {
        baris += `\n   📝 ${data.teks.trim()}`;
    }

    // Tampilkan file sebagai link ke web
    if (Array.isArray(data.files) && data.files.length > 0) {
        data.files.forEach((f, i) => {
            const icon = f.type === 'pdf' ? '📄' : '🖼️';
            const label = data.files.length > 1 ? ` (${i + 1})` : '';
            baris += `\n   ${icon} File${label}: ${f.url}`;
        });
    }

    return baris;
}

// ─────────────────────────────────────────
// HELPER: Render rekap satu hari dari JSON
// Returns: string teks atau null jika kosong
// ─────────────────────────────────────────
function renderRekapHari(hari, penjelasanData, MY_DOMAIN) {
    const entries = [];

    for (const [key, val] of Object.entries(penjelasanData)) {
        // Skip entri info_ (pengumuman)
        if (key.startsWith('info_')) continue;

        const hariData = val.hari?.toLowerCase().trim();
        if (hariData !== hari) continue;

        // Hanya masukkan jika ada konten (teks atau file)
        const punyaTeks  = val.teks && val.teks.trim().length > 0;
        const punyaFile  = Array.isArray(val.files) && val.files.length > 0;
        if (!punyaTeks && !punyaFile) continue;

        entries.push(renderEntriMapel(key, val, MY_DOMAIN));
    }

    return entries.length > 0 ? entries.join('\n\n') : null;
}

// ─────────────────────────────────────────
// HELPER: Render info pengumuman hari tertentu
// ─────────────────────────────────────────
function renderInfoHari(hari, penjelasanData, MY_DOMAIN) {
    const infoKey  = `info_${hari}`;
    const infoData = penjelasanData[infoKey];
    if (!infoData) return null;

    let baris = '';
    if (infoData.teks && infoData.teks.trim()) {
        baris += `📢 *INFO:* ${infoData.teks.trim()}`;
    }
    if (Array.isArray(infoData.files) && infoData.files.length > 0) {
        infoData.files.forEach(f => {
            const icon = f.type === 'pdf' ? '📄' : '🖼️';
            baris += `\n   ${icon} ${f.url}`;
        });
    }

    return baris.trim() || null;
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

            const pipeIdx        = sisaBody.indexOf(' | ');
            const namaMapel      = (pipeIdx !== -1 ? sisaBody.slice(0, pipeIdx) : sisaBody).trim();
            const penjelasanTeks = pipeIdx !== -1 ? sisaBody.slice(pipeIdx + 3).trim() : '';

            if (!namaMapel) {
                return reply("⚠️ Nama mapel tidak boleh kosong!");
            }

            const { hasMedia, isImage } = detectMedia(msg);

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

                if (hasMedia) {
                    const buffer = await downloadMedia(msg);
                    if (buffer) {
                        const ext       = isImage ? '.jpg' : '.pdf';
                        const safeMapel = namaMapel.replace(/[^a-zA-Z0-9]/g, '_');
                        fileName        = `kisi_${hariInput}_${safeMapel}_${Date.now()}${ext}`;
                        fs.writeFileSync(path.join(KISI_FILES_PATH, fileName), buffer);
                    } else {
                        console.warn("Buffer kosong pada update_kisi-kisi — file diabaikan.");
                        if (!penjelasanTeks) {
                            return reply("❌ Gagal membaca file yang dilampirkan dan tidak ada penjelasan. Coba lagi.");
                        }
                    }
                }

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

                let replyTeks =
                    `✅ *Data Tersimpan!*\n` +
                    `📅 Hari   : *${hariInput}*\n` +
                    `📚 Mapel  : *${namaMapel}*`;
                if (fileName)       replyTeks += `\n📄 File      : ${fileName}`;
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
        //    Cek JSON dulu → kalau ada tampilkan langsung
        //    Fallback ke buatTeksKisi() dari ujian_logic
        // ══════════════════════════════════════
        case '!kisi-kisi':
        case '!cek_kisi-kisi': {
            try {
                const hariIni        = getNamaHariIni();
                const penjelasanData = getPenjelasanData();

                // Render konten dari JSON (teks langsung di WA, file jadi link)
                const rekapMapel = renderRekapHari(hariIni, penjelasanData, MY_DOMAIN);
                const infoHari   = renderInfoHari(hariIni, penjelasanData, MY_DOMAIN);

                // Kalau JSON sudah punya data, pakai itu
                if (rekapMapel || infoHari) {
                    let pesan =
                        `📚 *REKAP KISI-KISI UJIAN*\n` +
                        `📅 Hari: *${hariIni.toUpperCase()}*\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n\n`;

                    if (infoHari) {
                        pesan += `${infoHari}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                    }

                    if (rekapMapel) {
                        pesan += rekapMapel;
                    } else {
                        pesan += `ℹ️ Belum ada materi mapel untuk hari ini.`;
                    }

                    pesan += `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
                             `⚠️ _File materi buka link di atas_`;

                    return await sock.sendMessage(from, { text: pesan }, { quoted: msg });
                }

                // Fallback ke fungsi buatTeksKisi dari ujian_logic
                const rekapTeks = await buatTeksKisi();
                if (!rekapTeks || rekapTeks.trim().length === 0) {
                    return reply(
                        `ℹ️ *KISI-KISI ${hariIni.toUpperCase()}*\n\n` +
                        `Belum ada data kisi-kisi untuk hari ini.\n` +
                        `Hubungi admin untuk update data.`
                    );
                }

                const pesanFull =
                    `📚 *REKAP MATERI KISI-KISI UJIAN* 📚\n\n` +
                    rekapTeks +
                    `\n\n⚠️ _Cek link folder di atas untuk melihat file materi._`;
                await sock.sendMessage(from, { text: pesanFull }, { quoted: msg });

            } catch (err) {
                console.error("Error kisi-kisi:", err);
                reply("❌ Gagal mengambil data kisi-kisi.");
            }
            break;
        }

        // ══════════════════════════════════════
        // 4. REKAP SEMINGGU PENUH
        //    Tampilkan semua hari yang ada datanya
        //    Teks langsung di WA, file jadi link web
        // ══════════════════════════════════════
        case '!kisi-kisi_full': {
            try {
                const penjelasanData = getPenjelasanData();
                const hariUrut       = ['senin','selasa','rabu','kamis','jumat','sabtu'];

                // Kumpulkan tiap hari yang punya data
                const bagianHari = [];

                for (const hari of hariUrut) {
                    const rekapMapel = renderRekapHari(hari, penjelasanData, MY_DOMAIN);
                    const infoHari   = renderInfoHari(hari, penjelasanData, MY_DOMAIN);

                    if (!rekapMapel && !infoHari) continue; // skip hari kosong

                    let bagian = `📅 *${hari.toUpperCase()}*\n${'─'.repeat(20)}`;

                    if (infoHari) {
                        bagian += `\n${infoHari}`;
                    }
                    if (rekapMapel) {
                        bagian += `\n\n${rekapMapel}`;
                    }

                    bagianHari.push(bagian);
                }

                // Kalau JSON sudah punya data
                if (bagianHari.length > 0) {
                    const pesan =
                        `📚 *REKAP KISI-KISI UJIAN — SEMINGGU* 📚\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n\n` +
                        bagianHari.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n') +
                        `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
                        `⚠️ _File materi buka link masing-masing di atas_`;

                    return await sock.sendMessage(from, { text: pesan }, { quoted: msg });
                }

                // Fallback ke buatTeksKisiFull dari ujian_logic
                const rekapFull = await buatTeksKisiFull();
                if (!rekapFull || rekapFull.trim().length === 0) {
                    return reply(
                        `ℹ️ *KISI-KISI MINGGU INI*\n\n` +
                        `Belum ada data kisi-kisi untuk minggu ini.\n` +
                        `Hubungi admin untuk update data.`
                    );
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
        //    Tampilkan semua hari yang ada jadwalnya
        //    Skip hari dengan ket "Tidak ada"
        // ══════════════════════════════════════
        case '!praktek': {
            try {
                // Coba ambil data praktek dari getStoredPraktek jika tersedia
                let praktekData = null;
                try {
                    praktekData = await getStoredPraktek();
                } catch (_) {
                    praktekData = null;
                }

                // Render dari data mentah jika tersedia
                if (praktekData && typeof praktekData === 'object') {
                    const hariUrut = ['senin','selasa','rabu','kamis','jumat','sabtu'];
                    const baris    = [];

                    for (const hari of hariUrut) {
                        // Data bisa berupa array of { mapel, ket } atau object
                        const entri = praktekData[hari];
                        if (!entri) continue;

                        // Normalisasi: bisa array atau object tunggal
                        const items = Array.isArray(entri) ? entri : [entri];

                        // Filter yang punya konten nyata
                        const itemValid = items.filter(item => {
                            const ket = (item.ket || item.keterangan || '').toLowerCase().trim();
                            const mapel = (item.mapel || '').toLowerCase().trim();
                            return (
                                ket &&
                                ket !== 'tidak ada' &&
                                ket !== 'tidak ada jadwal praktek' &&
                                mapel &&
                                mapel !== 'tidak ada'
                            );
                        });

                        if (itemValid.length === 0) continue;

                        let bagian = `📅 *${hari.toUpperCase()}*`;
                        for (const item of itemValid) {
                            bagian += `\n   📚 ${item.mapel}`;
                            const ket = item.ket || item.keterangan || '';
                            if (ket) bagian += `\n   📝 ${ket}`;
                        }

                        baris.push(bagian);
                    }

                    if (baris.length > 0) {
                        const pesan =
                            `🛠️ *JADWAL UJIAN PRAKTEK* 🛠️\n` +
                            `━━━━━━━━━━━━━━━━━━━━\n\n` +
                            baris.join('\n\n') +
                            `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
                            `_Hubungi admin jika ada perubahan jadwal._`;

                        return await sock.sendMessage(from, { text: pesan }, { quoted: msg });
                    }
                }

                // Fallback ke buatTeksPraktek dari ujian_logic
                const teksPraktek = await buatTeksPraktek();
                if (!teksPraktek || teksPraktek.trim().length < 5) {
                    return reply(
                        `ℹ️ *INFO PRAKTEK*\n\n` +
                        `Belum ada jadwal ujian praktek yang tersedia saat ini.\n` +
                        `Hubungi admin untuk update jadwal.`
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

                const keyHapus       = namaMapelHapus.toLowerCase().trim();
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
            break;
    }
}

module.exports = { handleUjianCommands };
