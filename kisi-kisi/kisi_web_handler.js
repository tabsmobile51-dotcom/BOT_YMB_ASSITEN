/**
 * ROUTE HANDLER: /kisi-kisi
 * Cara pakai di server utama (index.js / server.js):
 * 
 *   const { handleKisiKisiWeb, handleKisiKisiApi } = require('./kisi_web_handler');
 *   if (pathname === '/kisi-kisi') return handleKisiKisiWeb(req, res);
 *   if (pathname.startsWith('/kisi-api/')) return handleKisiKisiApi(req, res, pathname);
 */

const fs = require('fs');
const path = require('path');
const { JADWAL_PELAJARAN, KISI_FILES_PATH } = require('./kisi_constants');

const PRAKTEK_JSON_PATH = '/app/auth_info/data_praktek.json';
const KISI_PENJELASAN_PATH = '/app/auth_info/kisi_penjelasan.json';
const DAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// ============================================================
// FIX: Normalisasi key SAMA PERSIS dengan ujian_handler.js
// Bot simpan: namaMapel.toLowerCase().trim()
// Web cari:   harus pakai logika yang sama
// ============================================================
function normalizeKey(s) {
    return String(s).toLowerCase().trim();
}

// Strip emoji/simbol di awal nama mapel (dari JADWAL_PELAJARAN)
// Contoh: "📚 Matematika" → "Matematika"
function stripPrefix(s) {
    return String(s).replace(/^[^\w]+\s*/, '').trim();
}

function getStoredPraktek() {
    try {
        if (fs.existsSync(PRAKTEK_JSON_PATH)) {
            return JSON.parse(fs.readFileSync(PRAKTEK_JSON_PATH, 'utf-8'));
        }
    } catch (e) {}
    return { 1: 'Tidak ada', 2: 'Tidak ada', 3: 'Tidak ada', 4: 'Tidak ada', 5: 'Tidak ada' };
}

// Baca penjelasan dari JSON yang ditulis oleh bot WhatsApp
function getKisiPenjelasan() {
    try {
        if (fs.existsSync(KISI_PENJELASAN_PATH)) {
            return JSON.parse(fs.readFileSync(KISI_PENJELASAN_PATH, 'utf-8'));
        }
    } catch (e) {}
    return {};
}

function getKisiFiles() {
    try {
        if (!fs.existsSync(KISI_FILES_PATH)) return [];
        return fs.readdirSync(KISI_FILES_PATH).filter(f => f.match(/\.(jpg|jpeg|png|pdf)$/i));
    } catch (e) { return []; }
}

function getFilesForMapel(mapelName, allFiles) {
    const safe = mapelName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return allFiles.filter(f => f.toLowerCase().includes(safe));
}

// ============================================================
// FIX: Cari penjelasan dengan normalisasi yang benar
// Urutan: exact match → partial match (kedua arah)
// ============================================================
function findPenjelasan(penjelasanData, namaParam) {
    // namaParam = nama mapel dari frontend, sudah di-strip prefix emoji
    const key = normalizeKey(namaParam);
    const entries = Object.entries(penjelasanData);

    // 1. Exact match
    const exact = entries.find(([k]) => normalizeKey(k) === key);
    if (exact) return exact[1];

    // 2. Partial match — key ada di dalam nama tersimpan, atau sebaliknya
    const partial = entries.find(([k]) => {
        const nk = normalizeKey(k);
        return nk.includes(key) || key.includes(nk);
    });
    if (partial) return partial[1];

    return null;
}

// --- API ENDPOINT ---
async function handleKisiKisiApi(req, res, pathname) {
    const urlObj = new URL(req.url, 'http://localhost');
    const domain = process.env.MY_DOMAIN || 'http://localhost';

    // GET /kisi-api/mapel?nama=Matematika — list file
    if (pathname === '/kisi-api/mapel') {
        const nama = urlObj.searchParams.get('nama') || '';
        const allFiles = getKisiFiles();
        const files = getFilesForMapel(nama, allFiles);

        const result = files.map(f => ({
            name: f,
            url: `${domain}/kisi_ujian/${f}`,
            type: f.match(/\.pdf$/i) ? 'pdf' : 'image',
            time: (() => {
                try { return fs.statSync(path.join(KISI_FILES_PATH, f)).mtimeMs; } catch(e) { return 0; }
            })()
        })).sort((a, b) => b.time - a.time);

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(result));
        return;
    }

    // GET /kisi-api/penjelasan?nama=Matematika — ambil penjelasan teks dari JSON
    if (pathname === '/kisi-api/penjelasan') {
        const nama = urlObj.searchParams.get('nama') || '';
        const penjelasanData = getKisiPenjelasan();

        // FIX: pakai findPenjelasan yang normalisasinya sinkron dengan bot
        const data = findPenjelasan(penjelasanData, nama);

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(data !== undefined ? data : null));
        return;
    }

    res.writeHead(404);
    res.end('Not found');
}

function buildHtml(domain) {
    const now = new Date();
    const todayDay = now.getDay();
    const hariAktif = (todayDay >= 1 && todayDay <= 5) ? todayDay : 1;
    const dataPraktek = getStoredPraktek();
    const kisiFiles = getKisiFiles();
    const totalMapel = Object.values(JADWAL_PELAJARAN).reduce((a, b) => a + b.split('\n').filter(Boolean).length, 0);
    const lastUpdate = kisiFiles.length > 0
        ? new Date(Math.max(...kisiFiles.map(f => {
            try { return fs.statSync(path.join(KISI_FILES_PATH, f)).mtimeMs; } catch(e) { return 0; }
          }))).toLocaleString('id-ID')
        : 'Belum ada update';

    const jadwalData = {};
    for (let d = 1; d <= 5; d++) {
        const mapelList = (JADWAL_PELAJARAN[d] || '').split('\n').filter(Boolean);
        const praktek = dataPraktek[d] || 'Tidak ada';
        jadwalData[d] = {
            mapel: mapelList.map(m => {
                // FIX: strip prefix dulu baru cari file, sama seperti yang dikirim ke API
                const namaBersih = stripPrefix(m);
                const filesForThis = getFilesForMapel(namaBersih, kisiFiles);
                return { nama: m, namaBersih, fileCount: filesForThis.length };
            }),
            praktek,
            adaPraktek: !praktek.toLowerCase().includes('tidak ada')
        };
    }

    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pusat Kisi-Kisi Ujian</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'Plus Jakarta Sans',sans-serif;background:#080b14;color:#e2e8f0;min-height:100vh;padding:2rem 1rem;overflow-x:hidden}
.container{max-width:920px;margin:0 auto}

.header{text-align:center;margin-bottom:2.5rem;padding-top:.5rem}
.header-badge{display:inline-block;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);color:#a5b4fc;font-size:11px;font-weight:700;letter-spacing:.1em;padding:5px 16px;border-radius:999px;margin-bottom:1rem;text-transform:uppercase}
.header h1{font-size:clamp(1.75rem,5vw,2.75rem);font-weight:800;line-height:1.15;margin-bottom:.6rem;color:#f1f5f9}
.header h1 span{background:linear-gradient(135deg,#818cf8,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header p{color:#64748b;font-size:.9rem}

.stats-bar{display:flex;gap:10px;margin-bottom:2rem;flex-wrap:wrap}
.stat-card{flex:1;min-width:130px;background:#111827;border:1px solid #1e2d45;border-radius:14px;padding:.875rem 1.1rem}
.stat-label{font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.35rem}
.stat-value{font-size:1.35rem;font-weight:800}
.stat-value.purple{color:#a5b4fc}
.stat-value.green{color:#4ade80}
.stat-value.amber{color:#fbbf24}

.live-pill{display:inline-flex;align-items:center;gap:7px;background:#111827;border:1px solid #1e2d45;border-radius:999px;padding:5px 14px;font-size:11px;color:#475569;margin-bottom:1.75rem}
.live-dot{width:6px;height:6px;border-radius:50%;background:#4ade80;flex-shrink:0;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

.day-tabs{display:flex;gap:8px;margin-bottom:1.5rem;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.day-tabs::-webkit-scrollbar{display:none}
.day-tab{flex-shrink:0;padding:8px 18px;border-radius:999px;border:1px solid #1e2d45;background:#111827;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:.04em}
.day-tab.active{background:#6366f1;border-color:#6366f1;color:#fff}
.day-tab:hover:not(.active){border-color:#6366f1;color:#a5b4fc}

.day-card{background:#111827;border:1px solid #1e2d45;border-radius:18px;padding:1.4rem;margin-bottom:.9rem;transition:border-color .2s;animation:fadeUp .3s ease both}
.day-card.highlight{border-color:rgba(99,102,241,.35)}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.day-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.1rem;flex-wrap:wrap;gap:.5rem}
.day-title{display:flex;align-items:center;gap:9px}
.day-dot{width:7px;height:7px;border-radius:50%;background:#1e2d45;flex-shrink:0}
.day-dot.on{background:#6366f1;box-shadow:0 0 10px #6366f166}
.day-title h2{font-size:.9rem;font-weight:800;color:#f1f5f9;letter-spacing:.06em}
.today-badge{font-size:10px;font-weight:700;background:rgba(99,102,241,.18);color:#a5b4fc;padding:3px 10px;border-radius:999px;border:1px solid rgba(99,102,241,.28)}
.praktek-badge{font-size:10px;font-weight:700;background:rgba(251,191,36,.1);color:#fbbf24;padding:3px 10px;border-radius:999px;border:1px solid rgba(251,191,36,.2)}

.mapel-list{display:flex;flex-direction:column;gap:8px}
.mapel-item{display:flex;align-items:center;justify-content:space-between;background:#080b14;border:1px solid #1a2535;border-radius:11px;padding:.65rem 1rem;gap:.75rem;cursor:pointer;transition:all .2s;user-select:none}
.mapel-item:hover{border-color:#6366f1;background:#0f1322}
.mapel-item:hover .mapel-name{color:#a5b4fc}
.mapel-left{display:flex;align-items:center;gap:10px}
.mapel-icon{width:30px;height:30px;border-radius:8px;background:#1a2535;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.mapel-name{font-size:.875rem;color:#cbd5e1;font-weight:600;transition:color .2s}
.mapel-right{display:flex;align-items:center;gap:7px;flex-shrink:0}
.file-count{font-size:10px;font-weight:700;padding:3px 9px;border-radius:999px}
.file-count.ada{background:rgba(74,222,128,.1);color:#4ade80;border:1px solid rgba(74,222,128,.2)}
.file-count.kosong{background:rgba(100,116,139,.08);color:#475569;border:1px solid rgba(100,116,139,.15)}
.arrow-icon{color:#475569;font-size:12px;transition:all .2s}
.mapel-item:hover .arrow-icon{color:#6366f1;transform:translateX(2px)}

.praktek-box{margin-top:.9rem;background:rgba(251,191,36,.04);border:1px solid rgba(251,191,36,.13);border-radius:11px;padding:.7rem 1rem;display:flex;gap:.7rem;align-items:flex-start}
.praktek-label{font-size:9px;font-weight:800;color:#fbbf24;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;margin-top:2px}
.praktek-detail{font-size:.85rem;color:#e2e8f0}

/* MODAL */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:9999;display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.modal-overlay.open{opacity:1;pointer-events:all}
@media(min-width:600px){.modal-overlay{align-items:center}}
.modal-sheet{background:#111827;border:1px solid #1e2d45;border-radius:24px 24px 0 0;width:100%;max-width:820px;max-height:92vh;overflow-y:auto;padding:1.5rem;transform:translateY(40px);transition:transform .3s cubic-bezier(.34,1.56,.64,1);scrollbar-width:thin;scrollbar-color:#1e2d45 transparent}
.modal-sheet::-webkit-scrollbar{width:4px}
.modal-sheet::-webkit-scrollbar-thumb{background:#1e2d45;border-radius:4px}
.modal-overlay.open .modal-sheet{transform:translateY(0)}
@media(min-width:600px){.modal-sheet{border-radius:20px;max-height:88vh}}
.modal-handle{width:36px;height:4px;background:#1e2d45;border-radius:2px;margin:0 auto 1.25rem}
.modal-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1.25rem}
.modal-mapel-name{font-size:1.25rem;font-weight:800;color:#f1f5f9;margin-bottom:.2rem}
.modal-mapel-sub{font-size:.8rem;color:#64748b}
.modal-close{width:32px;height:32px;border-radius:50%;border:1px solid #1e2d45;background:#080b14;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;transition:all .2s}
.modal-close:hover{border-color:#6366f1;color:#a5b4fc}

/* MODAL TABS */
.modal-tabs{display:flex;gap:6px;margin-bottom:1.25rem;border-bottom:1px solid #1e2d45;padding-bottom:.75rem}
.modal-tab{padding:6px 14px;border-radius:8px;border:1px solid #1e2d45;background:transparent;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;font-family:inherit}
.modal-tab.active{background:#6366f1;border-color:#6366f1;color:#fff}
.modal-tab:hover:not(.active){border-color:#6366f1;color:#a5b4fc}
.modal-panel{display:none}
.modal-panel.show{display:block}

/* PENJELASAN */
.pjl-box{background:#080b14;border:1px solid #1a2535;border-radius:13px;padding:1.1rem 1.2rem;margin-bottom:.75rem}
.pjl-title{font-size:.75rem;font-weight:800;color:#a5b4fc;text-transform:uppercase;letter-spacing:.07em;margin-bottom:.6rem;display:flex;align-items:center;gap:.4rem}
.pjl-title::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:#6366f1}
.pjl-text{font-size:.9rem;color:#cbd5e1;line-height:1.7;white-space:pre-wrap}
.pjl-updated{font-size:.72rem;color:#334155;margin-top:.6rem}
.pjl-tip{background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.18);border-radius:10px;padding:.65rem .9rem;margin-top:.75rem;font-size:.82rem;color:#a5b4fc;line-height:1.5}
.pjl-tip code{background:rgba(0,0,0,.3);padding:1px 5px;border-radius:4px;font-size:.78rem}
.pjl-tip-amber{background:rgba(251,191,36,.06);border-color:rgba(251,191,36,.18);color:#fbbf24}
.pjl-empty{text-align:center;padding:2rem 1rem;color:#475569;font-size:.875rem}
.pjl-empty-icon{font-size:2rem;margin-bottom:.5rem}

/* FILE MATERI */
.modal-loading{text-align:center;padding:3rem 1rem;color:#475569;font-size:.9rem}
.modal-loading .spin{display:inline-block;width:28px;height:28px;border:2px solid #1e2d45;border-top-color:#6366f1;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:.75rem}
@keyframes spin{to{transform:rotate(360deg)}}
.modal-empty{text-align:center;padding:2.5rem 1rem}
.modal-empty-icon{font-size:2.5rem;margin-bottom:.75rem}
.modal-empty-title{font-size:.95rem;font-weight:700;color:#475569;margin-bottom:.3rem}
.modal-empty-sub{font-size:.8rem;color:#334155}

.file-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
.file-card{background:#080b14;border:1px solid #1a2535;border-radius:13px;overflow:hidden;transition:border-color .2s,transform .2s;display:block;cursor:pointer}
.file-card:hover{border-color:#6366f1;transform:translateY(-2px)}
.file-preview-wrap{width:100%;height:150px;background:#0d1220;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
.file-preview-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
.file-card:hover .file-preview-img{transform:scale(1.04)}
.img-placeholder{display:none;flex-direction:column;align-items:center;justify-content:center;gap:.4rem;width:100%;height:100%;background:#0d1220}
.img-placeholder-icon{font-size:2rem;opacity:.4}
.img-placeholder-txt{font-size:10px;color:#334155}
.file-preview-pdf{width:100%;height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d1220;gap:.5rem;transition:background .2s}
.file-card:hover .file-preview-pdf{background:#111827}
.pdf-icon{font-size:2.2rem}
.pdf-label{font-size:11px;font-weight:700;color:#f87171;letter-spacing:.05em}
.file-info{padding:.6rem .75rem .3rem}
.file-name{font-size:.72rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.file-time{font-size:.68rem;color:#334155;margin-top:.18rem}
.open-btn{display:flex;align-items:center;justify-content:center;gap:.4rem;margin:.5rem .6rem .65rem;padding:.45rem;border-radius:8px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.22);color:#a5b4fc;font-size:.75rem;font-weight:700;text-decoration:none;transition:all .2s}
.file-card:hover .open-btn{background:rgba(99,102,241,.22)}

/* LIGHTBOX */
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s;flex-direction:column;padding:1rem;backdrop-filter:blur(8px)}
.lightbox.open{opacity:1;pointer-events:all}
.lightbox img{max-width:100%;max-height:calc(100vh - 120px);object-fit:contain;border-radius:12px}
.lightbox-bar{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap;justify-content:center}
.lightbox-btn{display:flex;align-items:center;gap:.4rem;padding:8px 18px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#e2e8f0;font-size:.8rem;font-weight:700;cursor:pointer;text-decoration:none;font-family:inherit;transition:all .15s}
.lightbox-btn:hover{background:rgba(255,255,255,.15)}
.lightbox-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#e2e8f0;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;transition:all .15s}
.lightbox-close:hover{background:rgba(255,255,255,.2)}
.lightbox-caption{font-size:.75rem;color:#64748b;margin-top:.5rem;text-align:center;max-width:400px}

.footer{text-align:center;margin-top:2.5rem;color:#1e2d45;font-size:.75rem;padding-bottom:1rem}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <div class="header-badge">Pusat Belajar</div>
        <h1>Kisi-Kisi <span>Ujian</span></h1>
        <p>Klik pelajaran untuk lihat file materi dan penjelasan kisi-kisi</p>
    </div>

    <div class="stats-bar">
        <div class="stat-card">
            <div class="stat-label">Total Pelajaran</div>
            <div class="stat-value purple">${totalMapel}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">File Materi</div>
            <div class="stat-value green">${kisiFiles.length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Hari Ini</div>
            <div class="stat-value amber">${DAY_LABELS[now.getDay()] || '-'}</div>
        </div>
    </div>

    <div class="live-pill">
        <span class="live-dot"></span>
        Update terakhir: ${lastUpdate}
    </div>

    <div class="day-tabs" id="tabs"></div>
    <div id="cards-container"></div>

    <div class="footer">Dikelola bot WhatsApp &mdash; <code>!update_kisi-kisi [hari] [mapel] | [penjelasan]</code></div>
</div>

<!-- MODAL -->
<div class="modal-overlay" id="modal" onclick="closeModalOnBg(event)">
    <div class="modal-sheet" id="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
            <div>
                <div class="modal-mapel-name" id="modal-mapel-name">-</div>
                <div class="modal-mapel-sub" id="modal-mapel-sub">Memuat...</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-tabs">
            <button class="modal-tab active" onclick="switchTab('files',this)">📁 File Materi</button>
            <button class="modal-tab" onclick="switchTab('info',this)">📋 Kisi-Kisi</button>
        </div>
        <div class="modal-panel show" id="panel-files">
            <div class="modal-loading"><div class="spin"></div><br>Memuat file...</div>
        </div>
        <div class="modal-panel" id="panel-info">
            <div class="pjl-empty"><div class="pjl-empty-icon">📋</div>Pilih mata pelajaran untuk lihat kisi-kisi.</div>
        </div>
    </div>
</div>

<!-- LIGHTBOX -->
<div class="lightbox" id="lightbox" onclick="closeLightboxOnBg(event)">
    <button class="lightbox-close" onclick="closeLightbox()">✕</button>
    <img id="lightbox-img" src="" alt="Preview"/>
    <div class="lightbox-caption" id="lightbox-caption"></div>
    <div class="lightbox-bar">
        <a id="lightbox-dl" href="#" target="_blank" class="lightbox-btn">↗ Buka di tab baru</a>
        <button class="lightbox-btn" onclick="closeLightbox()">✕ Tutup</button>
    </div>
</div>

<script>
// FIX: jadwalData sekarang menyertakan namaBersih per mapel
const JADWAL = ${JSON.stringify(jadwalData)};
const DAY_NAMES = ['','SENIN','SELASA','RABU','KAMIS','JUMAT'];
let activeDay = ${hariAktif};

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- RENDER KARTU ----
function renderCards(days) {
    return days.map(d => {
        const data = JADWAL[d];
        if (!data) return '';
        const isAct = d === ${hariAktif};
        const mapelHtml = data.mapel.map(m => {
            const hasFile = m.fileCount > 0;
            return \`<div class="mapel-item" onclick="openMapel('\${escHtml(m.nama)}', '\${escHtml(m.namaBersih)}', \${d})">
                <div class="mapel-left">
                    <div class="mapel-icon">\${m.nama.match(/^(\\S+)/)?.[1] || '📖'}</div>
                    <span class="mapel-name">\${escHtml(m.namaBersih)}</span>
                </div>
                <div class="mapel-right">
                    <span class="file-count \${hasFile?'ada':'kosong'}">\${hasFile ? m.fileCount+' file' : 'Belum ada'}</span>
                    <span class="arrow-icon">›</span>
                </div>
            </div>\`;
        }).join('');
        const praktekHtml = data.adaPraktek
            ? \`<div class="praktek-box"><span class="praktek-label">Praktek</span><span class="praktek-detail">\${escHtml(data.praktek)}</span></div>\`
            : '';
        return \`<div class="day-card \${isAct?'highlight':''}">
            <div class="day-header">
                <div class="day-title">
                    <span class="day-dot \${isAct?'on':''}"></span>
                    <h2>\${DAY_NAMES[d]}</h2>
                    \${isAct?'<span class="today-badge">Hari Ini</span>':''}
                </div>
                \${data.adaPraktek?'<span class="praktek-badge">Ujian Praktek</span>':''}
            </div>
            <div class="mapel-list">\${mapelHtml}</div>
            \${praktekHtml}
        </div>\`;
    }).join('');
}

function buildTabs() {
    const el = document.getElementById('tabs');
    el.innerHTML = [1,2,3,4,5].map(d =>
        \`<button class="day-tab \${d===activeDay?'active':''}" onclick="switchDay(\${d})">\${DAY_NAMES[d]}</button>\`
    ).join('') + \`<button class="day-tab \${activeDay===0?'active':''}" onclick="switchDay(0)">SEMUA</button>\`;
}

function switchDay(d) {
    activeDay = d;
    buildTabs();
    document.getElementById('cards-container').innerHTML = renderCards(d===0 ? [1,2,3,4,5] : [d]);
}

// ---- MODAL TABS ----
function switchTab(tab, btn) {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-panel').forEach(p => p.classList.remove('show'));
    btn.classList.add('active');
    document.getElementById('panel-' + tab).classList.add('show');
}

// ---- BUKA MODAL ----
// FIX: terima namaBersih secara eksplisit — sudah di-strip prefix di server
async function openMapel(namaLengkap, namaBersih, hari) {
    const modal = document.getElementById('modal');
    const namaEl = document.getElementById('modal-mapel-name');
    const subEl = document.getElementById('modal-mapel-sub');
    const panelFiles = document.getElementById('panel-files');
    const panelInfo = document.getElementById('panel-info');

    namaEl.textContent = namaLengkap;
    subEl.textContent = 'Memuat data...';
    panelFiles.innerHTML = '<div class="modal-loading"><div class="spin"></div><br>Mengambil file...</div>';
    panelInfo.innerHTML = '<div class="modal-loading"><div class="spin"></div><br>Mengambil penjelasan...</div>';

    // Reset ke tab file
    document.querySelectorAll('.modal-tab').forEach((t,i) => t.classList.toggle('active', i===0));
    document.querySelectorAll('.modal-panel').forEach((p,i) => p.classList.toggle('show', i===0));

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // FIX: kirim namaBersih ke API (sudah strip emoji/prefix), bukan namaLengkap
    const [filesRes, pjlRes] = await Promise.allSettled([
        fetch('/kisi-api/mapel?nama=' + encodeURIComponent(namaBersih)).then(r => r.json()),
        fetch('/kisi-api/penjelasan?nama=' + encodeURIComponent(namaBersih)).then(r => r.json())
    ]);

    // ---- Render File ----
    try {
        const files = filesRes.status === 'fulfilled' ? filesRes.value : [];
        subEl.textContent = files.length > 0 ? \`\${files.length} file tersedia\` : 'Belum ada file materi';

        if (!Array.isArray(files) || files.length === 0) {
            panelFiles.innerHTML = \`<div class="modal-empty">
                <div class="modal-empty-icon">📭</div>
                <div class="modal-empty-title">Belum ada file materi</div>
                <div class="modal-empty-sub">Admin belum upload file untuk mapel ini.<br>
                Gunakan <code>!update_kisi-kisi [hari] \${escHtml(namaBersih)}</code> di WhatsApp.</div>
            </div>\`;
        } else {
            const cards = files.map(f => {
                const waktu = f.time ? new Date(f.time).toLocaleString('id-ID') : '-';
                const sn = escHtml(f.name), su = escHtml(f.url);
                if (f.type === 'image') {
                    return \`<div class="file-card" onclick="openLightbox('\${su}','\${sn}')">
                        <div class="file-preview-wrap">
                            <img class="file-preview-img" src="\${su}" alt="\${sn}" loading="lazy"
                                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" crossorigin="anonymous"/>
                            <div class="img-placeholder">
                                <div class="img-placeholder-icon">🖼️</div>
                                <div class="img-placeholder-txt">Gagal muat gambar</div>
                            </div>
                        </div>
                        <div class="file-info">
                            <div class="file-name" title="\${sn}">\${sn}</div>
                            <div class="file-time">\${waktu}</div>
                        </div>
                        <div class="open-btn">🔍 Lihat Gambar</div>
                    </div>\`;
                } else {
                    return \`<div class="file-card" onclick="openPdf('\${su}')">
                        <div class="file-preview-pdf">
                            <div class="pdf-icon">📄</div>
                            <div class="pdf-label">PDF</div>
                        </div>
                        <div class="file-info">
                            <div class="file-name" title="\${sn}">\${sn}</div>
                            <div class="file-time">\${waktu}</div>
                        </div>
                        <div class="open-btn">↗ Buka PDF</div>
                    </div>\`;
                }
            }).join('');
            panelFiles.innerHTML = \`<div class="file-grid">\${cards}</div>\`;
        }
    } catch(e) {
        panelFiles.innerHTML = \`<div class="modal-empty">
            <div class="modal-empty-icon">⚠️</div>
            <div class="modal-empty-title">Gagal mengambil file</div>
            <div class="modal-empty-sub">Periksa koneksi dan coba lagi.</div>
        </div>\`;
    }

    // ---- Render Penjelasan ----
    try {
        const pjl = pjlRes.status === 'fulfilled' ? pjlRes.value : null;
        renderPenjelasan(pjl, namaBersih, panelInfo);
    } catch(e) {
        panelInfo.innerHTML = '<div class="pjl-empty">Gagal memuat penjelasan.</div>';
    }
}

// FIX: bedakan 3 kondisi:
//   null           → belum pernah ada data (API tidak nemu key)
//   data tapi !teks → data ada tapi teks kosong/null (misal baru ada file saja, belum ada teks)
//   data.teks ada  → tampil normal
function renderPenjelasan(data, mapelName, container) {
    let html = '';

    if (data && data.teks) {
        // Ada penjelasan dari admin via WhatsApp
        const updatedAt = data.updatedAt
            ? 'Diupdate: ' + new Date(data.updatedAt).toLocaleString('id-ID')
            : '';
        html += \`<div class="pjl-box">
            <div class="pjl-title">Penjelasan Kisi-Kisi</div>
            <div class="pjl-text">\${escHtml(data.teks)}</div>
            \${updatedAt ? \`<div class="pjl-updated">\${updatedAt}</div>\` : ''}
        </div>\`;

        // Jika ada file yang disimpan bersama penjelasan
        if (data.files && data.files.length > 0) {
            html += \`<div class="pjl-box">
                <div class="pjl-title">File Terlampir (\${data.files.length})</div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-top:.3rem">\`;
            data.files.forEach(f => {
                const icon = f.type === 'pdf' ? '📄' : '🖼️';
                const label = f.type === 'pdf' ? 'Buka PDF ↗' : 'Lihat Gambar ↗';
                const action = f.type === 'pdf'
                    ? \`openPdf('\${escHtml(f.url)}')\`
                    : \`openLightbox('\${escHtml(f.url)}','\${escHtml(f.name)}')\`;
                html += \`<div onclick="\${action}" style="display:flex;align-items:center;gap:.6rem;background:#111827;border:1px solid #1e2d45;border-radius:9px;padding:.55rem .8rem;cursor:pointer;transition:border-color .2s" onmouseover="this.style.borderColor='#6366f1'" onmouseout="this.style.borderColor='#1e2d45'">
                    <span style="font-size:1.2rem">\${icon}</span>
                    <span style="font-size:.8rem;color:#94a3b8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${escHtml(f.name)}</span>
                    <span style="font-size:.75rem;color:#6366f1;font-weight:700;flex-shrink:0">\${label}</span>
                </div>\`;
            });
            html += \`</div></div>\`;
        }
    } else if (data && !data.teks) {
        // FIX: data ada (misal hanya punya .files atau .hari) tapi belum ada teks penjelasan
        // Ini yang dulu salah tampil sebagai "belum ada" padahal sebetulnya data sudah ada
        html += \`<div class="pjl-box">
            <div class="pjl-title">Penjelasan Kisi-Kisi</div>
            <div class="pjl-empty" style="padding:1rem 0">
                <div class="pjl-empty-icon">📋</div>
                Belum ada teks penjelasan untuk <strong>\${escHtml(mapelName)}</strong>.<br>
                <span style="font-size:.8rem">File materi tersedia di tab File Materi.</span>
            </div>
        </div>\`;

        // Tetap tampilkan file terlampir jika ada
        if (data.files && data.files.length > 0) {
            html += \`<div class="pjl-box">
                <div class="pjl-title">File Terlampir (\${data.files.length})</div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-top:.3rem">\`;
            data.files.forEach(f => {
                const icon = f.type === 'pdf' ? '📄' : '🖼️';
                const label = f.type === 'pdf' ? 'Buka PDF ↗' : 'Lihat Gambar ↗';
                const action = f.type === 'pdf'
                    ? \`openPdf('\${escHtml(f.url)}')\`
                    : \`openLightbox('\${escHtml(f.url)}','\${escHtml(f.name)}')\`;
                html += \`<div onclick="\${action}" style="display:flex;align-items:center;gap:.6rem;background:#111827;border:1px solid #1e2d45;border-radius:9px;padding:.55rem .8rem;cursor:pointer;transition:border-color .2s" onmouseover="this.style.borderColor='#6366f1'" onmouseout="this.style.borderColor='#1e2d45'">
                    <span style="font-size:1.2rem">\${icon}</span>
                    <span style="font-size:.8rem;color:#94a3b8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${escHtml(f.name)}</span>
                    <span style="font-size:.75rem;color:#6366f1;font-weight:700;flex-shrink:0">\${label}</span>
                </div>\`;
            });
            html += \`</div></div>\`;
        }
    } else {
        // null = belum pernah ada data sama sekali
        html += \`<div class="pjl-box">
            <div class="pjl-title">Penjelasan Kisi-Kisi</div>
            <div class="pjl-empty" style="padding:1rem 0">
                <div class="pjl-empty-icon">📋</div>
                Admin belum menambahkan penjelasan untuk <strong>\${escHtml(mapelName)}</strong>.
            </div>
        </div>\`;
    }

    // Tip cara update — selalu tampil
    html += \`<div class="pjl-tip pjl-tip-amber" style="margin-top:.75rem">
        📲 Untuk tambah/update penjelasan, admin kirim:<br>
        <code>!update_kisi-kisi [hari] \${escHtml(mapelName)} | [penjelasan kisi-kisi]</code><br>
        (sertakan foto/PDF sekaligus jika ada)
    </div>\`;

    container.innerHTML = html;
}

// ---- PDF & LIGHTBOX ----
function openPdf(url) {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) {
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
}

function openLightbox(url, name) {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    document.getElementById('lightbox-dl').href = url;
    document.getElementById('lightbox-caption').textContent = name;
    img.src = ''; img.alt = name; img.src = url;
    lb.classList.add('open');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    document.getElementById('lightbox-img').src = '';
}

function closeLightboxOnBg(e) {
    if (e.target === document.getElementById('lightbox')) closeLightbox();
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
    document.body.style.overflow = '';
}

function closeModalOnBg(e) {
    if (e.target === document.getElementById('modal')) closeModal();
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (document.getElementById('lightbox').classList.contains('open')) closeLightbox();
        else closeModal();
    }
});

buildTabs();
switchDay(activeDay);
setInterval(() => location.reload(), 60000);
</script>
</body>
</html>`;
}

async function handleKisiKisiWeb(req, res) {
    try {
        const domain = process.env.MY_DOMAIN || 'http://localhost';
        const html = buildHtml(domain);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    } catch (err) {
        console.error('Error halaman kisi-kisi:', err);
        res.writeHead(500);
        res.end('Internal Server Error');
    }
}

module.exports = { handleKisiKisiWeb, handleKisiKisiApi };
