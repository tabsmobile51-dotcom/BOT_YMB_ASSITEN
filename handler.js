const { askAI } = require('./ai_handler');
const { handleUserCommands } = require('./features/userHandler');
const { handleAdminCommands } = require('./features/adminHandler');
// --- IMPORT KISI-KISI HANDLER ---
const { handleUjianCommands } = require('./kisi-kisi/ujian_handler');
const fs = require('fs');

// Daftar ID Admin
const ADMIN_RAW = ['6289531549103', '171425214255294', '6285158738155', '241849843351688', '254326740103190', '8474121494667']; 

// Hitung jarak Levenshtein antara dua string
function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[a.length][b.length];
}

// Semua command valid (Hanya menambah perintah baru ke daftar tanpa menghapus yang lama)
const ALL_VALID_COMMANDS = [
    'cekbot', 'p', 'tes', 'list_pr', 'pr', 'tugas_lama', 'deadline', 'dl',
    'bantuan', 'menu', 'help', 'start', 'jadwal', 'jwl', 'lapor', 'lapor_pr',
    'update', 'update_list_pr', 'hapus', 'info', 'reset-bot', 'cek_db', 'jadwal_baru', 'update_deadline',
    'kisi-kisi', 'cek_kisi-kisi', 'info_kisi-kisi', 'update_kisi-kisi', 'kisi-kisi_full',
    'praktek', 'update_praktek', 'hapus_praktek', 'hapus_kisi-kisi', 'menu_praktek', 'menu_ujian', 'bantuan_ujian_praktek'
];

function getClosestCommand(cmd) {
    let bestMatch = null;
    let bestScore = Infinity;

    for (const valid of ALL_VALID_COMMANDS) {
        const dist = levenshtein(cmd, valid);
        // Threshold: max 3 karakter beda, atau 40% panjang command
        const threshold = Math.max(2, Math.floor(valid.length * 0.4));
        if (dist < bestScore && dist <= threshold) {
            bestScore = dist;
            bestMatch = valid;
        }
    }

    return bestMatch;
}

async function handleMessages(sock, m, botConfig, utils) {
    try {
        const msg = m.messages[0];
        if (!msg || !msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const pushName = msg.pushName || 'User';
        const from = msg.key.remoteJid; // Define 'from' for easier use
        const body = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.documentMessage?.caption ||
            ""
        ).trim();
        if (!body) return;
        await sock.readMessages([msg.key]);

        const textLower = body.toLowerCase();
        const isAdmin = ADMIN_RAW.some(admin => sender.includes(admin));
        const nonAdminMsg = "🚫 *AKSES DITOLAK*\n\nMaaf, fitur ini hanya bisa diakses oleh *Pengurus*. Kamu bisa gunakan fitur siswa seperti *!list_pr* atau *!bantuan* ya! 😊";

        // Logika AI — dicek SEBELUM filter !, tetap bisa jalan tanpa !
        if (textLower.includes('asisten')) {
            await sock.sendPresenceUpdate('composing', sender);
            const response = await askAI(body);
            return await sock.sendMessage(sender, { text: response }, { quoted: msg });
        }

        // ✅ Wajib pakai ! — abaikan semua pesan tanpa prefix
        if (!body.startsWith('!')) return;

        // Parsing Command
        const rawParts = body.split(' ');
        const cmd = rawParts[0].toLowerCase().replace('!', '');
        const args = rawParts.slice(1);

        // Path Konfigurasi Kisi-Kisi
        const KISI_FILES_PATH = '/app/auth_info/kisi_ujian';
        const MY_DOMAIN = process.env.MY_DOMAIN || 'http://localhost:8080';
        const reply = (teks) => sock.sendMessage(from, { text: teks }, { quoted: msg });

        // --- LOGIKA MENU BANTUAN (TETAP SAMA SEPERTI ASLINYA) ---
        if (['bantuan', 'menu', 'help', 'start'].includes(cmd)) {
            let menuTeks = 
                `✨ *MENU UTAMA SYTEAM-BOT* ✨\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Halo *${pushName}*! Berikut perintah kamu:\n\n` +
                `📝 *!pr* -> Lihat daftar PR\n` +
                `📆 *!jadwal* -> Lihat jadwal pelajaran\n` +
                `📚 *!kisi-kisi* -> Rekap materi ujian hari ini\n` +
                `📖 *!kisi-kisi_full* -> Rekap kisi-kisi semua hari\n` +
                `📢 *!lapor* -> Lapor ke Admin\n` +
                `⏳ *!deadline* -> PR belum dikumpul\n` +
                `⚡ *!p* -> Cek status bot\n`;

            if (isAdmin) {
                menuTeks += 
                    `\n🛠️ *PANDUAN PENGURUS (ADMIN)*\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ *!update [hari] [mapel] [tugas]*\n` +
                    `➝ Update PR & kirim ke grup\n\n` +

                    `📝 *!info_kisi-kisi [pesan]*\n` +
                    `➝ Kirim info ujian + file ke grup\n\n` +

                    `📥 *!update_kisi-kisi*\n` +
                    `➝ Simpan file kisi-kisi ke database\n\n` +

                    `📢 *!info [pesan]*\n` +
                    `➝ Kirim pengumuman ke grup\n\n` +

                    `⏳ *!update_deadline [tugas] | [YYYY-MM-DD]*\n` +
                    `➝ Tambah deadline otomatis\n\n` +

                    `❌ *!hapus [hari/deadline] [mapel/semua]*\n` +
                    `➝ Contoh: *!hapus deadline mtk* atau *!hapus senin semua*\n\n` +

                    `🔄 *!jadwal_baru*\n` +
                    `➝ Sinkron ulang semua data\n\n` +

                    `📂 *!cek_db*\n` +
                    `➝ Intip isi semua database\n\n` +

                    `⚙️ *!reset-bot*\n` +
                    `➝ Restart sistem bot\n`;
            }

            menuTeks += `\n━━━━━━━━━━━━━━━━━━━━\n_Semua perintah wajib diawali tanda (!)_`;
            return await sock.sendMessage(sender, { text: menuTeks });
        }

        // --- ROUTING COMMAND ---
        const userCmds = ['cekbot', 'p', 'tes', 'list_pr', 'pr', 'tugas_lama', 'deadline', 'dl', 'jadwal', 'jwl', 'lapor', 'lapor_pr'];
        const adminCmds = ['update', 'update_list_pr', 'hapus', 'info', 'reset-bot', 'cek_db', 'jadwal_baru', 'update_deadline'];
        const ujianCmds = ['kisi-kisi', 'cek_kisi-kisi', 'info_kisi-kisi', 'update_kisi-kisi', 'kisi-kisi_full', 'praktek', 'update_praktek', 'hapus_praktek', 'hapus_kisi-kisi', 'menu_praktek', 'menu_ujian', 'bantuan_ujian_praktek'];

        if (userCmds.includes(cmd)) {
            await handleUserCommands(sock, msg, '!' + cmd, args, utils);
        } else if (adminCmds.includes(cmd)) {
            if (!isAdmin) return await sock.sendMessage(sender, { text: nonAdminMsg });
            await handleAdminCommands(sock, msg, '!' + cmd, args, utils, body, nonAdminMsg);
        } else if (ujianCmds.includes(cmd)) {
            // Logic khusus kisi-kisi diarahkan ke handler barunya
            await handleUjianCommands(sock, msg, body, from, sender, reply, KISI_FILES_PATH, MY_DOMAIN);
        } else {
            // ✅ Typo detection pakai Levenshtein Distance
            const suggestion = getClosestCommand(cmd);
            if (suggestion) {
                return await sock.sendMessage(sender, { 
                    text: `🤔 *Perintah Tidak Dikenal!*\n━━━━━━━━━━━━━━━━━━━━\n` +
                          `Kamu ketik: *!${cmd}*\n` +
                          `Maksud kamu: *!${suggestion}* ?\n\n` +
                          `Ketik *!bantuan* untuk lihat semua perintah. 😊`
                });
            }
        }

    } catch (err) { 
        console.error("Error Main Handler:", err); 
    }
}

module.exports = { handleMessages };
