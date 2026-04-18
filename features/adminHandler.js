const db = require('../data');
const { delay, downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require('fs');
const path = require('path');
const { MAPEL_CONFIG, STRUKTUR_JADWAL, LABELS } = require('../pelajaran');
const { JADWAL_PELAJARAN } = require('../constants');

const ID_GRUP_TUJUAN = '120363403625197368@g.us';
const MY_DOMAIN = 'ymbassiten-production.up.railway.app';
const PUBLIC_PATH = '/app/auth_info/public_files';
const SEP = '━━━━━━━━━━━━━━━━━━━━';

async function handleAdminCommands(sock, msg, cmd, args, utils, body, nonAdminMsg) {
    // TAMBAHKAN INI AGAR PESAN LANGSUNG CENTANG BIRU
    await sock.readMessages([msg.key]);

    const sender = msg.key.remoteJid;
    const { dates } = utils.getWeekDates();

    // AUTO CLEAN DEADLINE
    const autoCleanDeadline = () => {
        try {
            let raw = db.getAll().deadline;
            if (!raw) return;
            let list;
            try { list = JSON.parse(raw); } catch { return; }
            const now = new Date();
            const filtered = list.filter(item => new Date(item.deadline) >= now);
            db.updateTugas('deadline', JSON.stringify(filtered, null, 2));
        } catch (e) {}
    };

    autoCleanDeadline();

    const getSuggestion = (dayKey, input) => {
        const listMapel = STRUKTUR_JADWAL[dayKey] || [];
        return listMapel.find(m => input.toLowerCase().includes(m.toLowerCase().substring(0, 3)));
    };

    const getProcessedTask = (dayKey, input) => {
        const dayMap = { 'senin': 0, 'selasa': 1, 'rabu': 2, 'kamis': 3, 'jumat': 4 };
        const dayLabels = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
        let allData = db.getAll() || {};
        let currentData = String(allData[dayKey] || "");

        if (currentData.includes("Belum ada tugas")) currentData = "";
        let existingEntries = currentData.split(/\n(?=•)/g).filter(e => e.trim() !== "");
        if (!STRUKTUR_JADWAL[dayKey]) return "";

        let foundMatch = false;
        STRUKTUR_JADWAL[dayKey].forEach(mKey => {
            const emojiMapel = MAPEL_CONFIG[mKey];
            const mapelRegex = new RegExp(`\\b${mKey}\\b`, 'i');

            if (mapelRegex.test(input)) {
                foundMatch = true;
                let parts = input.split(mapelRegex);
                let desc = (parts[1] && parts[1].trim() !== "") ? parts[1].split(/label:/i)[0].split(new RegExp(SEP))[0].trim() : "";
                if (desc === "") return;

                let linkSection = "";
                if (input.includes(SEP)) {
                    const partsLink = input.split(SEP);
                    if (partsLink.length >= 2) linkSection = `\n${SEP}\n${partsLink[1].trim()}\n${SEP}`;
                }

                let labelsFound = [];
                for (let l in LABELS) {
                    if (new RegExp(`\\b${l}\\b`, 'i').test(input)) labelsFound.push(LABELS[l]);
                }
                if (labelsFound.length === 0) labelsFound.push(LABELS['biasa']);

                let finalLabel = labelsFound.join(' | ');
                let existingIndex = existingEntries.findIndex(e => e.includes(emojiMapel));

                if (existingIndex !== -1) {
                    let lines = existingEntries[existingIndex].split('\n');
                    let labelIdx = lines.findIndex(l => l.includes('--}'));
                    if (!existingEntries[existingIndex].includes(desc)) {
                        if (labelIdx !== -1) {
                            lines.splice(labelIdx, 0, `➝ ${desc}${linkSection}`);
                            existingEntries[existingIndex] = lines.join('\n');
                        }
                    }
                } else {
                    let newContent = `• ${emojiMapel}\n➝ ${desc}${linkSection}\n${SEP}\n--} ${finalLabel} |\n⏰ Deadline: ${dayLabels[dayMap[dayKey]]}, ${dates[dayMap[dayKey]]}`;
                    existingEntries.push(newContent);
                }
            }
        });
        return foundMatch ? existingEntries.join('\n\n').trim() : null;
    };

    const sendToGroupSafe = async (content) => {
        // Presence update dijalankan tanpa await agar tidak memblokir atau melempar error
        sock.sendPresenceUpdate('composing', ID_GRUP_TUJUAN).catch(() => {});
        // Delay singkat agar presence sempat ter-broadcast sebelum pesan dikirim
        await new Promise(resolve => setTimeout(resolve, 800));
        await sock.sendMessage(ID_GRUP_TUJUAN, content);
    };

    const bodyParts = body.trim().split(/\s+/);

    switch (cmd) {

        case '!jadwal_baru': {
            try {
                await sock.sendMessage(sender, { text: "⏳ *Sedang menyelaraskan jadwal dengan constants.js...*" });
                const dayKeys = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
                const currentDb = db.getAll() || {};
                const backupPR = [];

                dayKeys.forEach(h => {
                    if (currentDb[h] && !currentDb[h].includes("Belum ada tugas")) {
                        backupPR.push(...currentDb[h].split(/\n(?=•)/g));
                    }
                    db.updateTugas(h, "");
                });

                for (let i = 1; i <= 5; i++) {
                    const hKey = dayKeys[i - 1];
                    const cleanMapels = JADWAL_PELAJARAN[i].toLowerCase().split('\n').map(l => l.replace(/[^\w\s]/gi, '').trim());
                    STRUKTUR_JADWAL[hKey] = cleanMapels;
                }

                backupPR.forEach(entry => {
                    for (const h of dayKeys) {
                        if (STRUR_JADWAL[h].some(m => entry.toLowerCase().includes(m))) {
                            let old = db.getAll()[h] || "";
                            db.updateTugas(h, old ? old + "\n\n" + entry.trim() : entry.trim());
                            break;
                        }
                    }
                });

                await sock.sendMessage(sender, { text: "✅ *SISTEM REFRESHED!*\nJadwal dan PR telah disinkronkan." });
            } catch (e) {
                await sock.sendMessage(sender, { text: "❌ Error: " + e.message });
            }
            break;
        }

        case '!update':
        case '!update_list_pr': {
            let mediaSection = "";
            const isImageUpdate = msg.message?.imageMessage;
            const isDocUpdate = msg.message?.documentMessage;

            if (isImageUpdate || isDocUpdate) {
                try {
                    if (!fs.existsSync(PUBLIC_PATH)) fs.mkdirSync(PUBLIC_PATH, { recursive: true });
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    const ext = isImageUpdate ? '.jpg' : path.extname(isDocUpdate.fileName) || '.pdf';
                    const fileLabel = isImageUpdate ? "Gambar" : "PDF/File";
                    const fileName = `tugas_${Date.now()}${ext}`;
                    fs.writeFileSync(path.join(PUBLIC_PATH, fileName), buffer);
                    mediaSection = `\n${SEP}\n🔗 *Link Web File ${fileLabel}:*\n${MY_DOMAIN}/tugas/${fileName}\n${SEP}`;
                } catch (err) {
                    await sock.sendMessage(sender, { text: "⚠️ *Gagal membuat link file...*" });
                }
            }

            const daysUpdate = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
            const firstPart = bodyParts.slice(1, 4).join(' ').toLowerCase();
            let dIdx = daysUpdate.findIndex(d => firstPart.includes(d));

            if (dIdx === -1) {
                return await sock.sendMessage(sender, {
                    text: "❌ *HARI TIDAK DIKENALI*\n\nMohon sertakan nama hari (Senin-Jumat).\nContoh: *!update senin matematika hal 10*"
                });
            }

            const dayKeyUpdate = daysUpdate[dIdx];
            let res = getProcessedTask(dayKeyUpdate, body + mediaSection);

            if (res === null) {
                const saran = getSuggestion(dayKeyUpdate, body);
                let errorMsg = `❌ *MAPEL SALAH / TYPO*\n\nMapel hari *${dayKeyUpdate.toUpperCase()}* adalah:\n> ${STRUKTUR_JADWAL[dayKeyUpdate].join(', ')}`;
                if (saran) errorMsg += `\n\n_Mungkin maksud Anda:_ *${saran}*?`;
                return await sock.sendMessage(sender, { text: errorMsg });
            }

            db.updateTugas(dayKeyUpdate, res);
            if (cmd === '!update') {
                await sendToGroupSafe({ text: `📌 *Update PR Baru* 📢\n\n*\`📅 ${dayKeyUpdate.toUpperCase()}\`* ➝ ${dates[dIdx]}\n\n${res}` });
            }
            await sock.sendMessage(sender, { text: `✅ *Berhasil Update data ${dayKeyUpdate}!*` });
            break;
        }

          case '!info':
            const infoMsgText = body.slice(6).trim();
            const isImageInfo = msg.message.imageMessage;
            const isDocInfo = msg.message.documentMessage;

            if (isImageInfo || isDocInfo) {
                const bufferInfo = await downloadMediaMessage(msg, 'buffer', {});
                const type = isImageInfo ? 'image' : 'document';
                const options = { caption: `📢 *PENGUMUMAN*\n${SEP}\n\n${infoMsgText}\n\n${SEP}\n_— Pengurus_` };
                
                if (isDocInfo) {
                    options.fileName = isDocInfo.fileName;
                    options.mimetype = isDocInfo.mimetype;
                }

                await sock.sendMessage(ID_GRUP_TUJUAN, { [type]: bufferInfo, ...options });
                await sock.sendMessage(sender, { text: "✅ *Info media berhasil diteruskan ke grup!*" });
            } else if (infoMsgText) {
                await sendToGroupSafe({ text: `📢 *PENGUMUMAN*\n${SEP}\n\n${infoMsgText}\n\n${SEP}\n_— Pengurus_` });
                await sock.sendMessage(sender, { text: "✅ *Info teks berhasil dikirim!*" });
            } else {
                await sock.sendMessage(sender, { text: "⚠️ *Pesan info kosong!* Ketik: !info [pesan]" });
            }
            break;

        case '!hapus': {
            const targetHapus = bodyParts[1]?.toLowerCase();
            const targetMapel = bodyParts.slice(2).join(' ').toLowerCase().trim();

            if (!targetHapus) {
                return await sock.sendMessage(sender, { text: "⚠️ *Format: !hapus [hari/deadline] [mapel/semua]*" });
            }

            if (targetHapus === 'deadline') {
                try {
                    if (targetMapel === 'semua' || targetMapel === '') {
                        db.updateTugas('deadline', "[]");
                        return await sock.sendMessage(sender, { text: "✅ *DATABASE CLEANED*" });
                    }

                    let raw = db.getAll().deadline;
                    let list = JSON.parse(raw || "[]");
                    let filtered = list.filter(item => !item.task.toLowerCase().includes(targetMapel));
                    db.updateTugas('deadline', JSON.stringify(filtered, null, 2));
                    return await sock.sendMessage(sender, { text: `✅ Deadline *${targetMapel}* dihapus!` });
                } catch (e) {
                    db.updateTugas('deadline', "[]");
                    return await sock.sendMessage(sender, { text: "✅ Reset deadline!" });
                }
            }

            const hariValid = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
            if (hariValid.includes(targetHapus)) {
                if (targetMapel === 'semua' || targetMapel === '') {
                    db.updateTugas(targetHapus, "");
                    return await sock.sendMessage(sender, { text: `✅ *DATABASE CLEANED* ${targetHapus.toUpperCase()}!` });
                }

                const findM = STRUKTUR_JADWAL[targetHapus]?.find(m => new RegExp(`\\b${targetMapel}\\b`, 'i').test(m));
                if (!findM) return await sock.sendMessage(sender, { text: `❌ Mapel tidak ditemukan.` });

                const emojiMapel = MAPEL_CONFIG[findM];
                let currentData = db.getAll()[targetHapus] || "";
                let entries = currentData.split(/\n\n(?=•)/g).filter(e => e.trim() !== "");
                let filteredEntries = entries.filter(e => !e.includes(emojiMapel));

                db.updateTugas(targetHapus, filteredEntries.join('\n\n').trim());
                return await sock.sendMessage(sender, { text: `✅ Berhasil menghapus *${findM}*!` });
            }
            break;
        }

        case '!update_deadline': {
            const inputDL = body.slice(16).trim();
            if (inputDL.includes('|')) {
                const [task, dateStr] = inputDL.split('|').map(v => v.trim());
                const deadlineDate = new Date(dateStr);

                if (!isNaN(deadlineDate)) {
                    let data = db.getAll().deadline || "[]";
                    let list = [];
                    try { list = JSON.parse(data); } catch { list = []; }
                    list.push({ task, deadline: dateStr });
                    db.updateTugas('deadline', JSON.stringify(list, null, 2));
                    await sock.sendMessage(sender, { text: `✅ *Deadline ditambahkan!*` });
                    break;
                }
            }
            db.updateTugas('deadline', body.slice(16).trim());
            await sock.sendMessage(sender, { text: `✅ Daftar deadline diperbarui!` });
            break;
        }

        case '!cek_db': {
            const allDataDb = db.getAll() || {};
            let teksDb = `📂 *KONTROL DATABASE PR*\n${SEP}\n\n`;
            ['senin', 'selasa', 'rabu', 'kamis', 'jumat'].forEach(hari => {
                teksDb += `📌 *${hari.toUpperCase()}*:\n${allDataDb[hari] || "_Kosong_"}\n\n${SEP}\n`;
            });
            await sock.sendMessage(sender, { text: teksDb });
            break;
        }

        case '!reset-bot': {
            await sock.sendMessage(sender, { text: "⚠️ *Restarting bot...*" });
            if (fs.existsSync('./auth_info')) fs.rmSync('./auth_info', { recursive: true, force: true });
            process.exit(1);
            break;
        }
    }
}

module.exports = { handleAdminCommands };
        
