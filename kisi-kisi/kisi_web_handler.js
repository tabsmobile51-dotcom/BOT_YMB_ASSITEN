/**
 * ROUTE HANDLER: /kisi-kisi
 * Cara pakai di server utama (index.js / server.js):
 * 
 *   const { handleKisiKisiWeb } = require('./kisi_web_handler');
 *   if (pathname === '/kisi-kisi') return handleKisiKisiWeb(req, res);
 *   if (pathname.startsWith('/kisi-api/')) return handleKisiKisiApi(req, res, pathname);
 */

const fs = require('fs');
const path = require('path');
const { JADWAL_PELAJARAN, KISI_FILES_PATH } = require('./kisi_constants');

const PRAKTEK_JSON_PATH = '/app/auth_info/data_praktek.json';
const DAY_NAMES_FULL = ['', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT'];
const DAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function getStoredPraktek() {
    try {
        if (fs.existsSync(PRAKTEK_JSON_PATH)) {
            return JSON.parse(fs.readFileSync(PRAKTEK_JSON_PATH, 'utf-8'));
        }
    } catch (e) {}
    return { 1: 'Tidak ada', 2: 'Tidak ada', 3: 'Tidak ada', 4: 'Tidak ada', 5: 'Tidak ada' };
}

function getKisiFiles() {
    try {
        if (!fs.existsSync(KISI_FILES_PATH)) return [];
        return fs.readdirSync(KISI_FILES_PATH).filter(f => f.match(/\.(jpg|jpeg|png|pdf)$/i));
    } catch (e) { return []; }
}

// Cari file yang cocok dengan nama mapel
// Format file: kisi_[NamaMapel]_[timestamp].jpg/pdf
function getFilesForMapel(mapelName, allFiles) {
    const safe = mapelName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return allFiles.filter(f => f.toLowerCase().includes(safe));
}

// --- API ENDPOINT: /kisi-api/mapel?nama=Matematika ---
// Dipanggil JS di frontend saat klik mapel, return JSON list file
async function handleKisiKisiApi(req, res, pathname) {
    if (pathname === '/kisi-api/mapel') {
        const urlObj = new URL(req.url, 'http://localhost');
        const nama = urlObj.searchParams.get('nama') || '';
        const domain = process.env.MY_DOMAIN || 'http://localhost';
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

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(result));
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

    // Build data JSON untuk JS frontend
    const jadwalData = {};
    for (let d = 1; d <= 5; d++) {
        const mapelList = (JADWAL_PELAJARAN[d] || '').split('\n').filter(Boolean);
        const praktek = dataPraktek[d] || 'Tidak ada';
        jadwalData[d] = {
            mapel: mapelList.map(m => {
                const filesForThis = getFilesForMapel(m.replace(/^[^\w]+/, '').split(' ').slice(-1)[0], kisiFiles);
                return { nama: m, fileCount: filesForThis.length };
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

/* HEADER */
.header{text-align:center;margin-bottom:2.5rem;padding-top:.5rem}
.header-badge{display:inline-block;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);color:#a5b4fc;font-size:11px;font-weight:700;letter-spacing:.1em;padding:5px 16px;border-radius:999px;margin-bottom:1rem;text-transform:uppercase}
.header h1{font-size:clamp(1.75rem,5vw,2.75rem);font-weight:800;line-height:1.15;margin-bottom:.6rem;color:#f1f5f9}
.header h1 span{background:linear-gradient(135deg,#818cf8,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header p{color:#64748b;font-size:.9rem}

/* STATS */
.stats-bar{display:flex;gap:10px;margin-bottom:2rem;flex-wrap:wrap}
.stat-card{flex:1;min-width:130px;background:#111827;border:1px solid #1e2d45;border-radius:14px;padding:.875rem 1.1rem}
.stat-label{font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.35rem}
.stat-value{font-size:1.35rem;font-weight:800}
.stat-value.purple{color:#a5b4fc}
.stat-value.green{color:#4ade80}
.stat-value.amber{color:#fbbf24}

/* LIVE PILL */
.live-pill{display:inline-flex;align-items:center;gap:7px;background:#111827;border:1px solid #1e2d45;border-radius:999px;padding:5px 14px;font-size:11px;color:#475569;margin-bottom:1.75rem}
.live-dot{width:6px;height:6px;border-radius:50%;background:#4ade80;flex-shrink:0;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

/* DAY TABS */
.day-tabs{display:flex;gap:8px;margin-bottom:1.5rem;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.day-tabs::-webkit-scrollbar{display:none}
.day-tab{flex-shrink:0;padding:8px 18px;border-radius:999px;border:1px solid #1e2d45;background:#111827;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:.04em}
.day-tab.active{background:#6366f1;border-color:#6366f1;color:#fff}
.day-tab:hover:not(.active){border-color:#6366f1;color:#a5b4fc}

/* CARDS */
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

/* MAPEL LIST */
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

/* PRAKTEK BOX */
.praktek-box{margin-top:.9rem;background:rgba(251,191,36,.04);border:1px solid rgba(251,191,36,.13);border-radius:11px;padding:.7rem 1rem;display:flex;gap:.7rem;align-items:flex-start}
.praktek-label{font-size:9px;font-weight:800;color:#fbbf24;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;margin-top:2px}
.praktek-detail{font-size:.85rem;color:#e2e8f0}

/* MODAL OVERLAY */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s;backdrop-filter:blur(4px)}
.modal-overlay.open{opacity:1;pointer-events:all}
@media(min-width:600px){
    .modal-overlay{align-items:center}
}

/* MODAL SHEET */
.modal-sheet{background:#111827;border:1px solid #1e2d45;border-radius:24px 24px 0 0;width:100%;max-width:700px;max-height:90vh;overflow-y:auto;padding:1.5rem;transform:translateY(30px);transition:transform .3s cubic-bezier(.34,1.56,.64,1);scrollbar-width:thin;scrollbar-color:#1e2d45 transparent}
.modal-sheet::-webkit-scrollbar{width:4px}
.modal-sheet::-webkit-scrollbar-thumb{background:#1e2d45;border-radius:4px}
.modal-overlay.open .modal-sheet{transform:translateY(0)}
@media(min-width:600px){
    .modal-sheet{border-radius:20px;max-height:85vh}
}

.modal-handle{width:36px;height:4px;background:#1e2d45;border-radius:2px;margin:0 auto 1.25rem}
.modal-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1.25rem}
.modal-title-wrap{}
.modal-mapel-name{font-size:1.25rem;font-weight:800;color:#f1f5f9;margin-bottom:.2rem}
.modal-mapel-sub{font-size:.8rem;color:#64748b}
.modal-close{width:32px;height:32px;border-radius:50%;border:1px solid #1e2d45;background:#080b14;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;transition:all .2s}
.modal-close:hover{border-color:#6366f1;color:#a5b4fc}

/* MODAL CONTENT */
.modal-loading{text-align:center;padding:3rem 1rem;color:#475569;font-size:.9rem}
.modal-loading .spin{display:inline-block;width:28px;height:28px;border:2px solid #1e2d45;border-top-color:#6366f1;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:.75rem}
@keyframes spin{to{transform:rotate(360deg)}}
.modal-empty{text-align:center;padding:2.5rem 1rem}
.modal-empty-icon{font-size:2.5rem;margin-bottom:.75rem}
.modal-empty-title{font-size:.95rem;font-weight:700;color:#475569;margin-bottom:.3rem}
.modal-empty-sub{font-size:.8rem;color:#334155}

/* FILE GRID */
.file-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.file-card{background:#080b14;border:1px solid #1a2535;border-radius:13px;overflow:hidden;transition:border-color .2s;text-decoration:none;display:block}
.file-card:hover{border-color:#6366f1}
.file-preview{width:100%;height:140px;object-fit:cover;display:block;background:#0d1220}
.file-preview-pdf{width:100%;height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d1220;gap:.5rem}
.pdf-icon{font-size:2rem}
.pdf-label{font-size:11px;font-weight:700;color:#f87171;letter-spacing:.05em}
.file-info{padding:.65rem .75rem}
.file-name{font-size:.75rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.file-time{font-size:.7rem;color:#334155;margin-top:.2rem}
.open-btn{display:flex;align-items:center;justify-content:center;gap:.4rem;margin:.75rem;padding:.5rem;border-radius:8px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);color:#a5b4fc;font-size:.75rem;font-weight:700;text-decoration:none;transition:all .2s}
.open-btn:hover{background:rgba(99,102,241,.2)}

/* FOOTER */
.footer{text-align:center;margin-top:2.5rem;color:#1e2d45;font-size:.75rem;padding-bottom:1rem}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <div class="header-badge">Pusat Belajar</div>
        <h1>Kisi-Kisi <span>Ujian</span></h1>
        <p>Klik pelajaran untuk lihat materi & file yang sudah diupload admin</p>
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

    <div class="footer">Dikelola bot WhatsApp &mdash; <code>!update_kisi-kisi [mapel]</code> untuk update materi</div>
</div>

<!-- MODAL -->
<div class="modal-overlay" id="modal" onclick="closeModalOnBg(event)">
    <div class="modal-sheet" id="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
            <div class="modal-title-wrap">
                <div class="modal-mapel-name" id="modal-mapel-name">-</div>
                <div class="modal-mapel-sub" id="modal-mapel-sub">Memuat file...</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div id="modal-content">
            <div class="modal-loading"><div class="spin"></div><br>Memuat materi...</div>
        </div>
    </div>
</div>

<script>
const JADWAL = ${JSON.stringify(jadwalData)};
const DAY_NAMES = ['','SENIN','SELASA','RABU','KAMIS','JUMAT'];
const API_BASE = '${domain}';
let activeDay = ${hariAktif};

function renderCards(days) {
    return days.map(d => {
        const data = JADWAL[d];
        if (!data) return '';
        const isAct = d === ${hariAktif};

        const mapelHtml = data.mapel.map(m => {
            const hasFile = m.fileCount > 0;
            return \`
            <div class="mapel-item" onclick="openMapel('\${escHtml(m.nama)}', \${d})">
                <div class="mapel-left">
                    <div class="mapel-icon">\${m.nama.match(/^(\\S+)/)?.[1] || '📖'}</div>
                    <span class="mapel-name">\${escHtml(m.nama.replace(/^[^\\w]+\\s*/,''))}</span>
                </div>
                <div class="mapel-right">
                    <span class="file-count \${hasFile?'ada':'kosong'}">\${hasFile ? m.fileCount+' file' : 'Belum ada'}</span>
                    <span class="arrow-icon">›</span>
                </div>
            </div>\`;
        }).join('');

        const praktekHtml = data.adaPraktek ? \`
            <div class="praktek-box">
                <span class="praktek-label">Praktek</span>
                <span class="praktek-detail">\${escHtml(data.praktek)}</span>
            </div>\` : '';

        return \`
        <div class="day-card \${isAct?'highlight':''}">
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
    el.innerHTML = [1,2,3,4,5].map(d => \`
        <button class="day-tab \${d===activeDay?'active':''}" onclick="switchDay(\${d})">\${DAY_NAMES[d]}</button>
    \`).join('') + \`<button class="day-tab \${activeDay===0?'active':''}" onclick="switchDay(0)">SEMUA</button>\`;
}

function switchDay(d) {
    activeDay = d;
    buildTabs();
    const toShow = d===0 ? [1,2,3,4,5] : [d];
    document.getElementById('cards-container').innerHTML = renderCards(toShow);
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- MODAL ----
async function openMapel(namaLengkap, hari) {
    const modal = document.getElementById('modal');
    const namaEl = document.getElementById('modal-mapel-name');
    const subEl = document.getElementById('modal-mapel-sub');
    const contentEl = document.getElementById('modal-content');

    // Nama bersih (tanpa emoji di depan)
    const namaBersih = namaLengkap.replace(/^[^\\w]+\\s*/, '');
    namaEl.textContent = namaLengkap;
    subEl.textContent = 'Memuat file materi...';
    contentEl.innerHTML = '<div class="modal-loading"><div class="spin"></div><br>Mengambil data...</div>';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    try {
        const res = await fetch(\`/kisi-api/mapel?nama=\${encodeURIComponent(namaBersih)}\`);
        const files = await res.json();

        subEl.textContent = files.length > 0 ? \`\${files.length} file tersedia\` : 'Belum ada file materi';

        if (files.length === 0) {
            contentEl.innerHTML = \`
            <div class="modal-empty">
                <div class="modal-empty-icon">📭</div>
                <div class="modal-empty-title">Belum ada materi</div>
                <div class="modal-empty-sub">Admin belum upload file untuk mapel ini.<br>Gunakan <code>!update_kisi-kisi \${escHtml(namaBersih)}</code> di WhatsApp.</div>
            </div>\`;
            return;
        }

        const fileCardsHtml = files.map(f => {
            const waktu = f.time ? new Date(f.time).toLocaleString('id-ID') : '-';
            if (f.type === 'image') {
                return \`
                <a class="file-card" href="\${f.url}" target="_blank">
                    <img class="file-preview" src="\${f.url}" alt="\${escHtml(f.name)}" loading="lazy" onerror="this.style.display='none'"/>
                    <div class="file-info">
                        <div class="file-name">\${escHtml(f.name)}</div>
                        <div class="file-time">\${waktu}</div>
                    </div>
                </a>\`;
            } else {
                return \`
                <a class="file-card" href="\${f.url}" target="_blank">
                    <div class="file-preview-pdf">
                        <div class="pdf-icon">📄</div>
                        <div class="pdf-label">PDF</div>
                    </div>
                    <div class="file-info">
                        <div class="file-name">\${escHtml(f.name)}</div>
                        <div class="file-time">\${waktu}</div>
                    </div>
                    <div class="open-btn">Buka PDF ↗</div>
                </a>\`;
            }
        }).join('');

        contentEl.innerHTML = \`<div class="file-grid">\${fileCardsHtml}</div>\`;
    } catch (err) {
        subEl.textContent = 'Gagal memuat';
        contentEl.innerHTML = '<div class="modal-empty"><div class="modal-empty-icon">⚠️</div><div class="modal-empty-title">Gagal mengambil data</div><div class="modal-empty-sub">Periksa koneksi dan coba lagi.</div></div>';
    }
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
    document.body.style.overflow = '';
}

function closeModalOnBg(e) {
    if (e.target === document.getElementById('modal')) closeModal();
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

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
