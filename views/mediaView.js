// views/mediaView.js

const renderMediaView = (fileUrls) => {
    const urls = Array.isArray(fileUrls) ? fileUrls : [fileUrls];
    const isPdf = urls[0].toLowerCase().endsWith('.pdf');
    const fileName = urls[0].split('/').pop().split('?')[0] || 'Dokumen';
    const fileExt = fileName.split('.').pop().toUpperCase();
    const isMulti = !isPdf && urls.length > 1;

    const quotes = [
        "Semangat! Setiap langkah kecil membawamu ke tujuan besar.",
        "Jangan menyerah, hal-hal besar butuh waktu.",
        "Kamu melakukan pekerjaan yang luar biasa!",
        "Fokus pada proses, hasil akan mengikuti.",
        "Jadikan hari ini lebih baik dari kemarin.",
        "Disiplin adalah kunci kesuksesan.",
        "Percaya pada dirimu sendiri seperti Y.M.B percaya padamu.",
        "Tugas ini adalah investasi untuk masa depanmu.",
        "Istirahatlah jika lelah, tapi jangan berhenti.",
        "Kesalahan adalah bukti bahwa kamu sedang mencoba.",
        "Satu persen lebih baik setiap hari!",
        "Tetap tenang dan selesaikan tugasmu.",
        "Masa depan cerah menantimu di depan sana.",
        "Jangan bandingkan prosesmu dengan orang lain.",
        "Kamu lebih kuat dari tantangan yang kamu hadapi.",
        "Kerja keras hari ini, senyum manis hari esok.",
        "Bikin dirimu proud hari ini!",
        "Tidak ada kata terlambat untuk mulai belajar.",
        "Keberhasilan dimulai dari keputusan untuk mencoba.",
        "Y.M.B Asisten selalu mendukung setiap progresmu!"
    ];

    // Bangun dots HTML untuk multi-gambar
    const dotsHtml = isMulti
        ? urls.map((_, i) => `<div class="dot${i === 0 ? ' active' : ''}" id="dot-${i}"></div>`).join('')
        : '';

    // Bangun konten area preview
    let previewContent = '';
    if (isPdf) {
        previewContent = `
            <iframe
                id="pdfFrame"
                src="${urls[0]}"
                style="width:100%;height:100%;border:none;display:block;"
                onload="frameLoaded()"
                onerror="showError()">
            </iframe>`;
    } else {
        previewContent = `
            <img
                id="previewImg"
                src="${urls[0]}"
                alt="Preview"
                style="width:100%;height:100%;object-fit:contain;display:none;"
                onload="imgLoaded()"
                onerror="showError()" />`;
    }

    return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Y.M.B Asisten - Media Viewer</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
            --primary: #1a73e8;
            --success: #1e8e3e;
            --warning: #f9ab00;
            --bg: #f1f3f4;
            --surface: #ffffff;
            --surface2: #f8f9fa;
            --border: rgba(0,0,0,0.1);
            --text: #202124;
            --text2: #5f6368;
            --text3: #80868b;
            --radius-md: 8px;
            --radius-lg: 12px;
            --radius-xl: 16px;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #1a1a1a;
                --surface: #2d2d2d;
                --surface2: #3a3a3a;
                --border: rgba(255,255,255,0.1);
                --text: #e8eaed;
                --text2: #9aa0a6;
                --text3: #5f6368;
            }
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .card {
            background: var(--surface);
            border: 0.5px solid var(--border);
            border-radius: var(--radius-xl);
            width: 100%;
            max-width: 640px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.12);
        }

        /* HEADER */
        .header {
            padding: 16px 20px;
            border-bottom: 0.5px solid var(--border);
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .header-icon {
            width: 36px; height: 36px;
            border-radius: var(--radius-md);
            background: #e8f0fe;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px;
            flex-shrink: 0;
        }

        .header-text { flex: 1; min-width: 0; }
        .header-title { font-size: 14px; font-weight: 500; color: var(--text); }
        .header-sub { font-size: 12px; color: var(--text2); margin-top: 1px; }

        .badge-online {
            font-size: 11px; font-weight: 500;
            padding: 3px 10px;
            border-radius: 99px;
            background: #e6f4ea;
            color: var(--success);
            border: 0.5px solid #a8d5b5;
            white-space: nowrap;
        }

        /* PREVIEW */
        .preview-wrap {
            position: relative;
            background: var(--surface2);
            overflow: hidden;
        }

        .preview-wrap.is-image { aspect-ratio: 16/9; }
        .preview-wrap.is-pdf { height: 480px; }

        .loading-overlay {
            position: absolute; inset: 0;
            background: var(--surface2);
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 10px; z-index: 10;
        }

        .spinner {
            width: 28px; height: 28px;
            border: 2px solid var(--border);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        .loading-text { font-size: 12px; color: var(--text3); }

        @keyframes spin { to { transform: rotate(360deg); } }

        .error-view {
            display: none;
            flex-direction: column; align-items: center; justify-content: center;
            gap: 12px; padding: 40px 24px; text-align: center;
            position: absolute; inset: 0; background: var(--surface2);
        }

        .error-icon { font-size: 32px; }
        .error-title { font-size: 14px; font-weight: 500; color: var(--text); }
        .error-sub { font-size: 12px; color: var(--text2); line-height: 1.5; }
        .error-contact {
            font-size: 12px; color: var(--primary);
            text-decoration: none; padding: 8px 16px;
            border: 0.5px solid var(--primary);
            border-radius: 99px; margin-top: 4px;
            display: inline-block;
        }

        /* NAV TOMBOL SLIDE */
        .nav-btn {
            position: absolute; top: 50%; transform: translateY(-50%);
            width: 32px; height: 32px; border-radius: 50%;
            background: var(--surface);
            border: 0.5px solid var(--border);
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; color: var(--text2);
            font-size: 16px; z-index: 5;
            transition: background 0.15s;
            user-select: none;
        }

        .nav-btn:hover { background: var(--bg); }
        .nav-btn.prev { left: 10px; }
        .nav-btn.next { right: 10px; }
        .nav-btn.hidden { display: none; }

        .dots {
            position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
            display: flex; gap: 5px; z-index: 5;
        }

        .dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: rgba(0,0,0,0.25); transition: background 0.2s;
            cursor: pointer;
        }

        .dot.active { background: var(--primary); }

        /* COUNTER SLIDE */
        .slide-counter {
            position: absolute; top: 10px; right: 10px;
            background: rgba(0,0,0,0.5); color: #fff;
            font-size: 11px; padding: 3px 8px;
            border-radius: 99px; z-index: 5;
        }

        /* BODY */
        .body { padding: 16px 20px; }

        .quote-block {
            background: var(--surface2);
            border-left: 2px solid var(--primary);
            border-radius: 0 var(--radius-md) var(--radius-md) 0;
            padding: 10px 14px;
            margin-bottom: 14px;
        }

        .quote-label { font-size: 11px; color: var(--primary); font-weight: 500; margin-bottom: 3px; }
        .quote-text { font-size: 13px; color: var(--text2); line-height: 1.5; }

        .filename-row {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px;
            background: var(--surface2);
            border: 0.5px solid var(--border);
            border-radius: var(--radius-md);
            margin-bottom: 14px;
        }

        .filename-row svg { flex-shrink: 0; color: var(--text3); }
        .filename-name {
            font-size: 13px; color: var(--text); font-weight: 500;
            flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .filename-ext {
            font-size: 11px; color: var(--text3);
            background: var(--bg); padding: 2px 7px;
            border-radius: 99px; border: 0.5px solid var(--border);
            white-space: nowrap;
        }

        .actions { display: flex; gap: 8px; }

        .btn-primary {
            flex: 1;
            background: var(--primary); color: #fff;
            border: none; border-radius: var(--radius-md);
            padding: 10px 16px; font-size: 13px; font-weight: 500;
            cursor: pointer;
            display: flex; align-items: center; justify-content: center; gap: 6px;
            text-decoration: none; transition: opacity 0.15s;
        }

        .btn-primary:hover { opacity: 0.88; }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

        .btn-secondary {
            background: transparent; color: var(--text2);
            border: 0.5px solid var(--border);
            border-radius: var(--radius-md); padding: 10px 14px;
            font-size: 13px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; gap: 6px;
            transition: background 0.15s;
        }

        .btn-secondary:hover { background: var(--surface2); }

        /* FOOTER */
        .footer {
            padding: 12px 20px;
            border-top: 0.5px solid var(--border);
            display: flex; align-items: center; justify-content: space-between;
        }

        .footer-brand { font-size: 11px; color: var(--text3); font-weight: 500; }
        .footer-brand span { color: var(--primary); }

        .offline-pill {
            display: none; font-size: 11px; padding: 3px 8px; border-radius: 99px;
            background: #fef7e0; color: #b06000;
            border: 0.5px solid #f9ab00;
            align-items: center; gap: 4px;
        }

        /* FULLSCREEN */
        #previewImg:-webkit-full-screen { object-fit: contain; width: 100%; height: 100%; background: #000; }
        #previewImg:-moz-full-screen { object-fit: contain; width: 100%; height: 100%; background: #000; }
        #previewImg:fullscreen { object-fit: contain; width: 100%; height: 100%; background: #000; }
    </style>
</head>
<body>

<div class="card">

    <div class="header">
        <div class="header-icon">${isPdf ? '📄' : '🖼️'}</div>
        <div class="header-text">
            <div class="header-title">Y.M.B Asisten</div>
            <div class="header-sub">${isPdf ? 'Dokumen PDF' : 'Galeri foto'}</div>
        </div>
        <div class="badge-online" id="statusBadge">Online</div>
    </div>

    <div class="preview-wrap ${isPdf ? 'is-pdf' : 'is-image'}" id="previewWrap">

        <div class="loading-overlay" id="loadingOverlay">
            <div class="spinner"></div>
            <div class="loading-text">Memuat file...</div>
        </div>

        <div class="error-view" id="errorView">
            <div class="error-icon">⚠️</div>
            <div class="error-title">File tidak ditemukan</div>
            <div class="error-sub">File ini sudah dihapus oleh admin atau terjadi gangguan pada server.</div>
            <a href="https://wa.me/6289531549103?text=Halo%20Admin%2C%20file%20saya%20tidak%20bisa%20dibuka." class="error-contact">Hubungi Admin</a>
        </div>

        ${previewContent}

        ${isMulti ? `
        <button class="nav-btn prev" id="prevBtn" onclick="changeSlide(-1)">&#8249;</button>
        <button class="nav-btn next" id="nextBtn" onclick="changeSlide(1)">&#8250;</button>
        <div class="slide-counter" id="slideCounter">1 / ${urls.length}</div>
        <div class="dots" id="dots">${dotsHtml}</div>
        ` : ''}

    </div>

    <div class="body">

        <div class="quote-block">
            <div class="quote-label">Motivasi hari ini</div>
            <div class="quote-text" id="quoteText"></div>
        </div>

        <div class="filename-row">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span class="filename-name">${fileName}</span>
            <span class="filename-ext">${fileExt}</span>
        </div>

        <div class="actions">
            <a href="${urls[0]}" id="downloadLink" download="${fileName}" class="btn-primary" onclick="onDownload()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Unduh file
            </a>
            <a href="${urls[0]}" target="_blank" rel="noopener" class="btn-secondary" id="openBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Buka
            </a>
            <button class="btn-secondary" onclick="speakQuote()" title="Baca quote">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
            </button>
            ${!isPdf ? `
            <button class="btn-secondary" onclick="goFullscreen()" title="Layar penuh">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
            </button>` : ''}
        </div>

    </div>

    <div class="footer">
        <div class="footer-brand">Link oleh <span>Y.M.B Asisten</span></div>
        <div class="offline-pill" id="offlinePill">&#9679; Offline</div>
    </div>

</div>

<script>
    // ── DATA ──────────────────────────────────────────────
    const FILE_URLS = ${JSON.stringify(urls)};
    const IS_PDF    = ${isPdf};
    const IS_MULTI  = ${isMulti};
    const QUOTES    = ${JSON.stringify(quotes)};

    let currentIndex = 0;

    // ── QUOTE ─────────────────────────────────────────────
    const quoteEl = document.getElementById('quoteText');
    quoteEl.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];

    function speakQuote() {
        if (!('speechSynthesis' in window)) return;
        speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(quoteEl.textContent);
        msg.lang = 'id-ID';
        speechSynthesis.speak(msg);
    }

    // ── LOADING / ERROR ───────────────────────────────────
    function hideLoading() {
        const el = document.getElementById('loadingOverlay');
        if (el) el.style.display = 'none';
    }

    function showError() {
        hideLoading();
        const img = document.getElementById('previewImg');
        const frame = document.getElementById('pdfFrame');
        if (img)   img.style.display   = 'none';
        if (frame) frame.style.display = 'none';
        document.getElementById('errorView').style.display = 'flex';
        setDownloadDisabled(true);
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
            speechSynthesis.speak(new SpeechSynthesisUtterance('Maaf kak, filenya tidak ditemukan. Silahkan hubungi admin ya.'));
        }
    }

    function imgLoaded() {
        hideLoading();
        document.getElementById('previewImg').style.display = 'block';
    }

    function frameLoaded() {
        hideLoading();
    }

    // Timeout fallback: jika setelah 12 detik masih loading tampilkan error
    const loadTimeout = setTimeout(() => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay && overlay.style.display !== 'none') showError();
    }, 12000);

    window.addEventListener('load', () => clearTimeout(loadTimeout));

    // ── SLIDE (hanya untuk multi-gambar) ─────────────────
    function changeSlide(dir) {
        if (!IS_MULTI) return;
        const total = FILE_URLS.length;
        currentIndex = (currentIndex + dir + total) % total;
        updateSlide();
    }

    function goToSlide(idx) {
        currentIndex = idx;
        updateSlide();
    }

    function updateSlide() {
        // Ganti gambar
        const img = document.getElementById('previewImg');
        if (img) {
            img.style.display = 'none';
            document.getElementById('loadingOverlay').style.display = 'flex';
            img.src = FILE_URLS[currentIndex];
        }

        // Update download link ke file aktif
        const dl = document.getElementById('downloadLink');
        if (dl) {
            dl.href = FILE_URLS[currentIndex];
            dl.download = FILE_URLS[currentIndex].split('/').pop().split('?')[0];
        }

        // Update tombol buka
        const op = document.getElementById('openBtn');
        if (op) op.href = FILE_URLS[currentIndex];

        // Update dots
        document.querySelectorAll('.dot').forEach((d, i) => {
            d.classList.toggle('active', i === currentIndex);
        });

        // Update counter
        const counter = document.getElementById('slideCounter');
        if (counter) counter.textContent = (currentIndex + 1) + ' / ' + FILE_URLS.length;

        // Sembunyikan tombol nav jika hanya 1 gambar
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        if (prevBtn) prevBtn.classList.toggle('hidden', FILE_URLS.length <= 1);
        if (nextBtn) nextBtn.classList.toggle('hidden', FILE_URLS.length <= 1);
    }

    // Daftarkan klik dots secara dinamis
    document.querySelectorAll('.dot').forEach((dot, i) => {
        dot.addEventListener('click', () => goToSlide(i));
    });

    // ── DOWNLOAD ──────────────────────────────────────────
    function onDownload() {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
            speechSynthesis.speak(new SpeechSynthesisUtterance('Download dimulai, semangat ya kak!'));
        }
    }

    function setDownloadDisabled(disabled) {
        const dl = document.getElementById('downloadLink');
        if (!dl) return;
        if (disabled) {
            dl.style.pointerEvents = 'none';
            dl.style.opacity = '0.4';
        } else {
            dl.style.pointerEvents = '';
            dl.style.opacity = '1';
        }
    }

    // ── FULLSCREEN ────────────────────────────────────────
    function goFullscreen() {
        const img = document.getElementById('previewImg');
        if (!img) return;
        const req = img.requestFullscreen || img.webkitRequestFullscreen || img.mozRequestFullScreen;
        if (req) req.call(img);
    }

    // ── ONLINE / OFFLINE ─────────────────────────────────
    function updateConnStatus() {
        const pill   = document.getElementById('offlinePill');
        const badge  = document.getElementById('statusBadge');
        const online = navigator.onLine;

        pill.style.display  = online ? 'none' : 'flex';
        badge.textContent   = online ? 'Online' : 'Offline';
        badge.style.background = online ? '#e6f4ea' : '#fef7e0';
        badge.style.color      = online ? '#1e8e3e' : '#b06000';
        badge.style.borderColor = online ? '#a8d5b5' : '#f9ab00';
        setDownloadDisabled(!online);
    }

    window.addEventListener('online',  updateConnStatus);
    window.addEventListener('offline', updateConnStatus);
    updateConnStatus();

    // ── SERVICE WORKER (offline cache) ───────────────────
    if ('serviceWorker' in navigator) {
        const swCode = \`
            const CACHE = 'ymb-v2';
            self.addEventListener('install', e => self.skipWaiting());
            self.addEventListener('activate', e => e.waitUntil(clients.claim()));
            self.addEventListener('fetch', e => {
                e.respondWith(
                    caches.match(e.request).then(cached =>
                        cached || fetch(e.request).then(res => {
                            return caches.open(CACHE).then(cache => {
                                cache.put(e.request, res.clone());
                                return res;
                            });
                        })
                    )
                );
            });
        \`;
        const blob = new Blob([swCode], { type: 'text/javascript' });
        navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(() => {});
    }
</script>

</body>
</html>`;
};

module.exports = { renderMediaView };
