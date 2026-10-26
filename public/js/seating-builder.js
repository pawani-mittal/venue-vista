/**
 * Venue Vista - Seating Chart & Venue Layout Designer
 * Enables venue managers to design custom venue layouts, configure stage orientation,
 * add tiered sections, rows, and seats, and publish new venues.
 */

class SeatingBuilder {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.onVenueCreated = options.onVenueCreated || (() => {});

    // Default Layout Template: Proscenium Theatre
    this.venueData = {
      name: 'The Starlight Pavilion',
      type: 'theatre',
      city: 'Chicago, IL',
      address: '220 N Michigan Ave',
      stage: {
        label: 'STARLIGHT MAIN STAGE',
        width: 580,
        height: 44
      },
      sections: [
        { id: 'sec_orch', name: 'Front Orchestra', rows: 4, seats_per_row: 14, x: 80, y: 100, row_spacing: 28, seat_spacing: 34, color: '#8b5cf6' },
        { id: 'sec_circle', name: 'Grand Mezzanine', rows: 4, seats_per_row: 16, x: 50, y: 240, row_spacing: 28, seat_spacing: 33, color: '#06b6d4' },
        { id: 'sec_balc', name: 'Upper Balcony', rows: 3, seats_per_row: 18, x: 20, y: 380, row_spacing: 28, seat_spacing: 32, color: '#10b981' }
      ]
    };

    this.initDOM();
    this.render();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="builder-layout">
        <!-- Left: Configuration Controls -->
        <div class="builder-sidebar">
          <div class="builder-card">
            <h3 class="builder-title">Venue Details</h3>
            <div class="form-group">
              <label>Venue Name</label>
              <input type="text" id="builder-venue-name" class="form-input" value="${this.venueData.name}" />
            </div>
            <div class="form-row">
              <div class="form-group flex-1">
                <label>Venue Type</label>
                <select id="builder-venue-type" class="form-select">
                  <option value="theatre">Proscenium Theatre</option>
                  <option value="arena">Concert Arena</option>
                  <option value="club">Jazz / Comedy Club</option>
                  <option value="amphitheatre">Amphitheatre</option>
                </select>
              </div>
              <div class="form-group flex-1">
                <label>City & State</label>
                <input type="text" id="builder-venue-city" class="form-input" value="${this.venueData.city}" />
              </div>
            </div>
            <div class="form-group">
              <label>Address</label>
              <input type="text" id="builder-venue-address" class="form-input" value="${this.venueData.address}" />
            </div>
          </div>

          <div class="builder-card">
            <div class="card-header-flex">
              <h3 class="builder-title">Stage & Orientation</h3>
            </div>
            <div class="form-group">
              <label>Stage Headline Label</label>
              <input type="text" id="builder-stage-label" class="form-input" value="${this.venueData.stage.label}" />
            </div>
            <div class="form-row">
              <div class="form-group flex-1">
                <label>Stage Width (px)</label>
                <input type="number" id="builder-stage-width" class="form-input" value="${this.venueData.stage.width}" min="200" max="700" step="20" />
              </div>
              <div class="form-group flex-1">
                <label>Stage Depth (px)</label>
                <input type="number" id="builder-stage-height" class="form-input" value="${this.venueData.stage.height}" min="20" max="80" step="5" />
              </div>
            </div>
          </div>

          <div class="builder-card">
            <div class="card-header-flex">
              <h3 class="builder-title">Seating Sections</h3>
              <button id="builder-add-section-btn" class="btn-sm btn-accent">+ Add Section</button>
            </div>
            <div id="builder-sections-list" class="sections-list-container"></div>
          </div>

          <div class="builder-actions">
            <button id="builder-save-venue-btn" class="btn-primary w-full">Save & Publish Venue</button>
            <div class="template-presets">
              <span class="template-label">Quick Templates:</span>
              <button class="preset-pill" data-template="theatre">Broadway Hall</button>
              <button class="preset-pill" data-template="arena">360° Arena</button>
              <button class="preset-pill" data-template="club">Comedy Club</button>
            </div>
          </div>
        </div>

        <!-- Right: Interactive Live Seating Map Canvas -->
        <div class="builder-preview-panel">
          <div class="builder-stats-bar">
            <div class="stat-badge">
              <span class="stat-label">Total Sections:</span>
              <span id="builder-stat-sections" class="stat-val">3</span>
            </div>
            <div class="stat-badge">
              <span class="stat-label">Total Capacity:</span>
              <span id="builder-stat-capacity" class="stat-val highlight">174 Seats</span>
            </div>
            <div class="builder-badge-hint">Interactive Layout Editor</div>
          </div>

          <div class="builder-canvas-wrap">
            <svg id="builder-svg" class="seating-svg" viewBox="0 0 760 540">
              <defs>
                <linearGradient id="builderStageGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#6366f1" stop-opacity="0.3" />
                  <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.05" />
                </linearGradient>
                <linearGradient id="builderBeam" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#818cf8" stop-opacity="0.35" />
                  <stop offset="100%" stop-color="#4f46e5" stop-opacity="0" />
                </linearGradient>
              </defs>
              <g id="builder-svg-stage"></g>
              <g id="builder-svg-seats"></g>
            </svg>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Input bindings
    const nameInput = document.getElementById('builder-venue-name');
    nameInput.addEventListener('input', (e) => { this.venueData.name = e.target.value; });

    const typeSelect = document.getElementById('builder-venue-type');
    typeSelect.addEventListener('change', (e) => { this.venueData.type = e.target.value; });

    const cityInput = document.getElementById('builder-venue-city');
    cityInput.addEventListener('input', (e) => { this.venueData.city = e.target.value; });

    const addrInput = document.getElementById('builder-venue-address');
    addrInput.addEventListener('input', (e) => { this.venueData.address = e.target.value; });

    const stageLabel = document.getElementById('builder-stage-label');
    stageLabel.addEventListener('input', (e) => {
      this.venueData.stage.label = e.target.value;
      this.render();
    });

    const stageWidth = document.getElementById('builder-stage-width');
    stageWidth.addEventListener('input', (e) => {
      this.venueData.stage.width = Number(e.target.value) || 500;
      this.render();
    });

    const stageHeight = document.getElementById('builder-stage-height');
    stageHeight.addEventListener('input', (e) => {
      this.venueData.stage.height = Number(e.target.value) || 40;
      this.render();
    });

    // Add Section button
    document.getElementById('builder-add-section-btn').addEventListener('click', () => {
      this.addSection();
    });

    // Save Venue button
    document.getElementById('builder-save-venue-btn').addEventListener('click', () => {
      this.saveVenue();
    });

    // Template Presets
    document.querySelectorAll('.preset-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tmpl = e.target.getAttribute('data-template');
        this.applyPreset(tmpl);
      });
    });
  }

  addSection() {
    const idx = this.venueData.sections.length + 1;
    const colors = ['#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#8b5cf6'];
    const newSec = {
      id: 'sec_custom_' + Date.now().toString(36),
      name: `Section Tier ${String.fromCharCode(64 + idx)}`,
      rows: 3,
      seats_per_row: 12,
      x: 70,
      y: 120 + (idx - 1) * 110,
      row_spacing: 28,
      seat_spacing: 34,
      color: colors[idx % colors.length]
    };
    this.venueData.sections.push(newSec);
    this.render();
  }

  removeSection(index) {
    if (this.venueData.sections.length <= 1) {
      alert('A venue must have at least one seating section.');
      return;
    }
    this.venueData.sections.splice(index, 1);
    this.render();
  }

  calculateTotalCapacity() {
    return this.venueData.sections.reduce((sum, sec) => sum + (sec.rows * sec.seats_per_row), 0);
  }

  applyPreset(presetName) {
    if (presetName === 'theatre') {
      this.venueData.type = 'theatre';
      this.venueData.stage = { label: 'PROSCENIUM ARCH STAGE', width: 600, height: 44 };
      this.venueData.sections = [
        { id: 'sec_orch', name: 'Front Orchestra (Stalls)', rows: 4, seats_per_row: 14, x: 80, y: 100, row_spacing: 28, seat_spacing: 34, color: '#8b5cf6' },
        { id: 'sec_circle', name: 'Dress Circle', rows: 4, seats_per_row: 16, x: 50, y: 240, row_spacing: 28, seat_spacing: 33, color: '#06b6d4' },
        { id: 'sec_balc', name: 'Upper Balcony', rows: 3, seats_per_row: 18, x: 20, y: 380, row_spacing: 28, seat_spacing: 32, color: '#10b981' }
      ];
    } else if (presetName === 'arena') {
      this.venueData.type = 'arena';
      this.venueData.stage = { label: '360° HYDRAULIC ARENA STAGE', width: 560, height: 48 };
      this.venueData.sections = [
        { id: 'sec_pit', name: 'Diamond VIP Pit', rows: 3, seats_per_row: 16, x: 60, y: 100, row_spacing: 30, seat_spacing: 32, color: '#ec4899' },
        { id: 'sec_floor', name: 'Floor Reserved Tier A', rows: 4, seats_per_row: 18, x: 30, y: 215, row_spacing: 28, seat_spacing: 32, color: '#3b82f6' },
        { id: 'sec_club', name: 'Executive Club Level', rows: 4, seats_per_row: 20, x: 10, y: 350, row_spacing: 28, seat_spacing: 30, color: '#10b981' }
      ];
    } else if (presetName === 'club') {
      this.venueData.type = 'club';
      this.venueData.stage = { label: 'COMEDY SPOTLIGHT STAGE', width: 440, height: 40 };
      this.venueData.sections = [
        { id: 'sec_front', name: 'VIP Front Banquettes', rows: 3, seats_per_row: 10, x: 100, y: 100, row_spacing: 35, seat_spacing: 40, color: '#f97316' },
        { id: 'sec_tables', name: 'Mezzanine Cocktail Tables', rows: 3, seats_per_row: 12, x: 60, y: 230, row_spacing: 32, seat_spacing: 38, color: '#8b5cf6' },
        { id: 'sec_bar', name: 'High-Top Bar Rail', rows: 2, seats_per_row: 16, x: 20, y: 360, row_spacing: 30, seat_spacing: 34, color: '#06b6d4' }
      ];
    }

    document.getElementById('builder-stage-label').value = this.venueData.stage.label;
    document.getElementById('builder-stage-width').value = this.venueData.stage.width;
    document.getElementById('builder-stage-height').value = this.venueData.stage.height;
    document.getElementById('builder-venue-type').value = this.venueData.type;

    this.render();
  }

  render() {
    this.renderSectionControls();
    this.renderCanvas();
    this.updateStats();
  }

  renderSectionControls() {
    const list = document.getElementById('builder-sections-list');
    list.innerHTML = '';

    this.venueData.sections.forEach((sec, idx) => {
      const item = document.createElement('div');
      item.className = 'section-control-item';
      item.innerHTML = `
        <div class="sec-item-header">
          <span class="sec-dot" style="background: ${sec.color || '#6366f1'}"></span>
          <input type="text" class="sec-name-input" value="${sec.name}" />
          <button class="sec-delete-btn" title="Delete section">✕</button>
        </div>
        <div class="sec-item-grid">
          <div class="sec-field">
            <label>Rows</label>
            <input type="number" class="sec-rows-input" value="${sec.rows}" min="1" max="10" />
          </div>
          <div class="sec-field">
            <label>Seats/Row</label>
            <input type="number" class="sec-seats-input" value="${sec.seats_per_row}" min="2" max="25" />
          </div>
          <div class="sec-field">
            <label>Y Offset</label>
            <input type="number" class="sec-y-input" value="${sec.y}" min="60" max="440" step="10" />
          </div>
        </div>
      `;

      // Event handlers for this section
      item.querySelector('.sec-name-input').addEventListener('input', (e) => {
        sec.name = e.target.value;
        this.renderCanvas();
      });

      item.querySelector('.sec-rows-input').addEventListener('input', (e) => {
        sec.rows = Math.max(1, Number(e.target.value) || 1);
        this.renderCanvas();
        this.updateStats();
      });

      item.querySelector('.sec-seats-input').addEventListener('input', (e) => {
        sec.seats_per_row = Math.max(1, Number(e.target.value) || 1);
        this.renderCanvas();
        this.updateStats();
      });

      item.querySelector('.sec-y-input').addEventListener('input', (e) => {
        sec.y = Number(e.target.value) || 100;
        this.renderCanvas();
      });

      item.querySelector('.sec-delete-btn').addEventListener('click', () => {
        this.removeSection(idx);
      });

      list.appendChild(item);
    });
  }

  renderCanvas() {
    const stageG = document.getElementById('builder-svg-stage');
    const seatsG = document.getElementById('builder-svg-seats');

    const stageWidth = this.venueData.stage.width;
    const stageHeight = this.venueData.stage.height;
    const stageX = (760 - stageWidth) / 2;

    // Stage Platform
    stageG.innerHTML = `
      <polygon points="${stageX},${50} ${stageX + stageWidth},${50} 740,500 20,500" fill="url(#builderBeam)" opacity="0.4" pointer-events="none" />
      <rect x="${stageX}" y="20" width="${stageWidth}" height="${stageHeight}" rx="8" fill="#1e293b" stroke="#475569" stroke-width="2" />
      <rect x="${stageX + 4}" y="24" width="${stageWidth - 8}" height="${stageHeight - 8}" rx="6" fill="url(#builderStageGrad)" />
      <text x="380" y="${20 + stageHeight / 2 + 5}" text-anchor="middle" fill="#f8fafc" font-size="13" font-weight="700" letter-spacing="2">
        ${this.venueData.stage.label}
      </text>
    `;

    // Sections & Seats
    seatsG.innerHTML = '';
    this.venueData.sections.forEach(sec => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      // Section label
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', sec.x);
      txt.setAttribute('y', Math.max(70, sec.y - 10));
      txt.setAttribute('fill', '#94a3b8');
      txt.setAttribute('font-size', '11');
      txt.setAttribute('font-weight', '600');
      txt.setAttribute('letter-spacing', '1');
      txt.textContent = sec.name.toUpperCase();
      g.appendChild(txt);

      // Seats grid
      for (let r = 0; r < sec.rows; r++) {
        const rowChar = String.fromCharCode(65 + r);
        for (let s = 1; s <= sec.seats_per_row; s++) {
          const seatX = sec.x + (s - 1) * sec.seat_spacing;
          const seatY = sec.y + r * sec.row_spacing;

          const seatNode = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          seatNode.setAttribute('transform', `translate(${seatX}, ${seatY})`);

          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('r', '8.5');
          circle.setAttribute('fill', sec.color || '#6366f1');
          circle.setAttribute('stroke', '#0f172a');
          circle.setAttribute('stroke-width', '1');
          seatNode.appendChild(circle);

          const seatNum = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          seatNum.setAttribute('x', '0');
          seatNum.setAttribute('y', '3');
          seatNum.setAttribute('text-anchor', 'middle');
          seatNum.setAttribute('font-size', '7');
          seatNum.setAttribute('font-weight', 'bold');
          seatNum.setAttribute('fill', '#ffffff');
          seatNum.textContent = s;
          seatNode.appendChild(seatNum);

          g.appendChild(seatNode);
        }
      }

      seatsG.appendChild(g);
    });
  }

  updateStats() {
    const secCount = this.venueData.sections.length;
    const capacity = this.calculateTotalCapacity();

    document.getElementById('builder-stat-sections').textContent = secCount;
    document.getElementById('builder-stat-capacity').textContent = `${capacity} Seats`;
  }

  async saveVenue() {
    const name = document.getElementById('builder-venue-name').value.trim();
    if (!name) {
      alert('Please enter a venue name.');
      return;
    }

    const payload = {
      name,
      type: document.getElementById('builder-venue-type').value,
      city: document.getElementById('builder-venue-city').value.trim() || 'Los Angeles, CA',
      address: document.getElementById('builder-venue-address').value.trim() || '100 Entertainment Way',
      capacity: this.calculateTotalCapacity(),
      layout_config: {
        style: this.venueData.type,
        stage: this.venueData.stage,
        sections: this.venueData.sections
      }
    };

    try {
      const res = await api.createVenue(payload);
      alert(`🎉 Venue "${res.venue.name}" created successfully with ${payload.capacity} seats!`);
      this.onVenueCreated(res.venue);
    } catch (err) {
      alert(`Error saving venue: ${err.message}`);
    }
  }
}
