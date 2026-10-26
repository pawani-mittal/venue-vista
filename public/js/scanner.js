/**
 * Venue Vista - Box Office Gate Access & QR Scanner Engine
 * Real-time access control, anti-fraud duplicate detection, Web Audio feedback,
 * and live turnstile statistics.
 */

class GateScanner {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.selectedEventId = options.defaultEventId || 'evt_hamilton';
    this.audioCtx = null;
    this.initAudio();
    this.initDOM();
    this.loadGateData();
  }

  initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch {
      // Audio optional
    }
  }

  playAudioFeedback(type) {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    if (type === 'SUCCESS') {
      // Pleasant high dual chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.15);
      osc2.frequency.setValueAtTime(1108.73, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.08);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);

    } else if (type === 'ALREADY_REDEEMED') {
      // Low buzz warning
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.setValueAtTime(140, now + 0.12);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);

    } else {
      // Invalid triple descending error beep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(330, now + 0.08);
      osc.frequency.setValueAtTime(220, now + 0.16);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    }
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="scanner-layout">
        <!-- Left: Scanner Viewfinder & Input -->
        <div class="scanner-left-panel">
          <div class="gate-event-selector-card">
            <label class="gate-selector-label">Select Active Event Gate:</label>
            <select id="gate-event-select" class="form-select"></select>
          </div>

          <div class="viewfinder-card">
            <div class="viewfinder-header">
              <span class="device-pill"><span class="pulse-green"></span> Turnstile Gate Alpha-1</span>
              <span class="mode-tag">Optical QR / Barcode</span>
            </div>

            <!-- Optical Camera Viewfinder Simulation -->
            <div class="camera-simulation-box">
              <div class="camera-grid"></div>
              <div class="laser-scanner-line"></div>
              <div class="viewfinder-corner top-left"></div>
              <div class="viewfinder-corner top-right"></div>
              <div class="viewfinder-corner bottom-left"></div>
              <div class="viewfinder-corner bottom-right"></div>
              <div class="camera-center-prompt">
                <span class="camera-icon">📷</span>
                <span>Align Ticket QR Code In Frame</span>
              </div>
            </div>

            <!-- Manual / Barcode Gun Input -->
            <div class="scanner-input-wrap">
              <input type="text" id="scanner-input" class="scanner-input" placeholder="Scan or enter Ticket ID (e.g. TKT-...) or paste QR payload" autofocus />
              <button id="scanner-submit-btn" class="btn-primary">Scan Pass</button>
            </div>

            <!-- Fast Quick-Test Triggers -->
            <div class="quick-test-tray">
              <span class="quick-test-label">Simulate Scans:</span>
              <button id="test-scan-valid" class="btn-xs btn-outline">Valid VIP Pass</button>
              <button id="test-scan-dup" class="btn-xs btn-outline">Duplicate Pass (Fraud)</button>
              <button id="test-scan-fake" class="btn-xs btn-outline">Fake / Invalid Code</button>
            </div>

            <!-- Scan Result Display Overlay -->
            <div id="scan-result-card" class="scan-result-card hidden"></div>
          </div>
        </div>

        <!-- Right: Real-Time Gate Attendance & Logs -->
        <div class="scanner-right-panel">
          <div class="gate-metrics-grid">
            <div class="gate-stat-box">
              <span class="stat-num" id="gate-total-issued">0</span>
              <span class="stat-lbl">Tickets Issued</span>
            </div>
            <div class="gate-stat-box highlight-green">
              <span class="stat-num" id="gate-checked-in">0</span>
              <span class="stat-lbl">Checked In</span>
            </div>
            <div class="gate-stat-box">
              <span class="stat-num" id="gate-pending">0</span>
              <span class="stat-lbl">Pending Arrival</span>
            </div>
          </div>

          <!-- Turnstile Progress Bar -->
          <div class="progress-wrap">
            <div class="progress-label-row">
              <span>Gate Fill Rate</span>
              <span id="gate-progress-pct" class="font-bold">0%</span>
            </div>
            <div class="progress-track">
              <div id="gate-progress-fill" class="progress-fill" style="width: 0%"></div>
            </div>
          </div>

          <!-- Section Breakdown -->
          <div class="gate-section-breakdown">
            <h4 class="gate-sub-title">Attendance by Section</h4>
            <div id="gate-sections-list" class="gate-sections-list"></div>
          </div>

          <!-- Recent Turnstile Logs -->
          <div class="gate-logs-wrap">
            <h4 class="gate-sub-title">Recent Turnstile Activity</h4>
            <div id="gate-logs-list" class="gate-logs-list"></div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const input = document.getElementById('scanner-input');
    const submitBtn = document.getElementById('scanner-submit-btn');
    const eventSelect = document.getElementById('gate-event-select');

    submitBtn.addEventListener('click', () => {
      this.handleScan(input.value.trim());
      input.value = '';
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleScan(input.value.trim());
        input.value = '';
      }
    });

    eventSelect.addEventListener('change', (e) => {
      this.selectedEventId = e.target.value;
      this.loadGateData();
    });

    // Test simulation buttons
    document.getElementById('test-scan-valid').addEventListener('click', async () => {
      const tickets = await this.fetchSampleTickets();
      if (tickets.length > 0) {
        const unredeemed = tickets.find(t => t.checked_in === 0) || tickets[0];
        this.handleScan(unredeemed.id);
      } else {
        alert('No tickets available for this event. Purchase tickets from the catalog first!');
      }
    });

    document.getElementById('test-scan-dup').addEventListener('click', async () => {
      const tickets = await this.fetchSampleTickets();
      if (tickets.length > 0) {
        const redeemed = tickets.find(t => t.checked_in === 1);
        if (redeemed) {
          this.handleScan(redeemed.id);
        } else {
          // Check-in first, then scan again
          await this.handleScan(tickets[0].id);
          setTimeout(() => this.handleScan(tickets[0].id), 500);
        }
      }
    });

    document.getElementById('test-scan-fake').addEventListener('click', () => {
      this.handleScan('TKT-COUNTERFEIT-999');
    });
  }

  async fetchSampleTickets() {
    const stats = await api.getGateStats(this.selectedEventId);
    // Find tickets via export endpoint
    const attendees = await fetch(`/api/analytics/export?type=attendees&format=json&eventId=${this.selectedEventId}`).then(r => r.json()).catch(() => []);
    return attendees.map(a => ({
      id: a.ticket_id,
      checked_in: a.checked_in
    }));
  }

  async loadGateData() {
    // Populate events dropdown if empty
    const select = document.getElementById('gate-event-select');
    if (select.children.length === 0) {
      const events = await api.getEvents();
      events.forEach(ev => {
        const opt = document.createElement('option');
        opt.value = ev.id;
        opt.textContent = `${ev.title} (${ev.venue_name})`;
        if (ev.id === this.selectedEventId) opt.selected = true;
        select.appendChild(opt);
      });
    }

    try {
      const stats = await api.getGateStats(this.selectedEventId);
      this.renderStats(stats);
    } catch (err) {
      console.error('Error loading gate stats:', err);
    }
  }

  renderStats(stats) {
    document.getElementById('gate-total-issued').textContent = stats.totalIssued;
    document.getElementById('gate-checked-in').textContent = stats.checkedInCount;
    document.getElementById('gate-pending').textContent = stats.pendingCount;
    document.getElementById('gate-progress-pct').textContent = `${stats.checkInPct}%`;
    document.getElementById('gate-progress-fill').style.width = `${stats.checkInPct}%`;

    // Sections
    const secList = document.getElementById('gate-sections-list');
    secList.innerHTML = '';
    (stats.bySection || []).forEach(sec => {
      const pct = sec.total > 0 ? Math.round((sec.checked_in / sec.total) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'gate-sec-row';
      row.innerHTML = `
        <div class="sec-row-info">
          <span class="sec-row-name">${sec.section_name}</span>
          <span class="sec-row-counts">${sec.checked_in} / ${sec.total} (${pct}%)</span>
        </div>
        <div class="mini-bar-track">
          <div class="mini-bar-fill" style="width: ${pct}%"></div>
        </div>
      `;
      secList.appendChild(row);
    });

    // Recent Logs
    const logList = document.getElementById('gate-logs-list');
    logList.innerHTML = '';
    (stats.recentLogs || []).forEach(l => {
      const item = document.createElement('div');
      item.className = `gate-log-item status-${l.scan_result.toLowerCase()}`;
      const timeStr = new Date(l.scanned_at).toLocaleTimeString();
      item.innerHTML = `
        <div class="log-left">
          <span class="log-badge ${l.scan_result}">${l.scan_result}</span>
          <span class="log-id">${l.ticket_id || 'Unknown'}</span>
          ${l.buyer_name ? `<span class="log-name">• ${l.buyer_name}</span>` : ''}
        </div>
        <div class="log-right">
          <span class="log-time">${timeStr}</span>
        </div>
      `;
      logList.appendChild(item);
    });
  }

  async handleScan(code) {
    if (!code) return;
    const resultCard = document.getElementById('scan-result-card');

    try {
      const result = await api.scanTicket(code, 'Gate Turnstile Alpha 1');
      this.playAudioFeedback(result.status);

      resultCard.className = `scan-result-card res-${result.status.toLowerCase()}`;
      resultCard.classList.remove('hidden');

      if (result.status === 'SUCCESS') {
        const t = result.ticket;
        resultCard.innerHTML = `
          <div class="res-banner success">
            <span class="res-icon">✓</span>
            <div>
              <h3>ACCESS GRANTED</h3>
              <p>Welcome to ${t.eventTitle || 'the show'}</p>
            </div>
          </div>
          <div class="res-details">
            <div class="res-row"><span>Attendee:</span> <strong>${t.buyerName}</strong></div>
            <div class="res-row"><span>Section / Seat:</span> <strong>${t.section} • ${t.seat}</strong></div>
            <div class="res-row"><span>Pass Tier:</span> <strong>${t.tier} ${t.vip ? '⭐ VIP Laminate' : ''}</strong></div>
            <div class="res-row"><span>Verified At:</span> <span>${new Date(result.timestamp).toLocaleTimeString()}</span></div>
          </div>
        `;
      } else if (result.status === 'ALREADY_REDEEMED') {
        const t = result.ticket;
        resultCard.innerHTML = `
          <div class="res-banner duplicate">
            <span class="res-icon">⚠️</span>
            <div>
              <h3>DUPLICATE PASS ALERT</h3>
              <p>Pass was already checked in!</p>
            </div>
          </div>
          <div class="res-details">
            <div class="res-row"><span>Ticket ID:</span> <strong>${t?.id || code}</strong></div>
            <div class="res-row"><span>Assigned To:</span> <strong>${t?.buyerName || 'Unknown'}</strong></div>
            <div class="res-row"><span>First Scanned:</span> <strong class="text-amber">${new Date(t?.checkedInAt).toLocaleTimeString()}</strong></div>
            <div class="res-warn-msg">Security notice: Duplicate entry attempt flagged.</div>
          </div>
        `;
      } else {
        resultCard.innerHTML = `
          <div class="res-banner invalid">
            <span class="res-icon">✕</span>
            <div>
              <h3>INVALID TICKET CODE</h3>
              <p>${result.message || 'Pass not recognized in database'}</p>
            </div>
          </div>
          <div class="res-details">
            <div class="res-row"><span>Scanned Code:</span> <code>${code}</code></div>
            <div class="res-warn-msg">Please direct guest to Box Office Assistance Desk.</div>
          </div>
        `;
      }

      // Refresh gate counters
      this.loadGateData();

    } catch (err) {
      this.playAudioFeedback('INVALID');
      resultCard.className = 'scan-result-card res-invalid';
      resultCard.classList.remove('hidden');
      resultCard.innerHTML = `
        <div class="res-banner invalid">
          <span class="res-icon">✕</span>
          <div>
            <h3>SCAN ERROR</h3>
            <p>${err.message}</p>
          </div>
        </div>
      `;
    }
  }
}
