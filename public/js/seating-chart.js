/**
 * Venue Vista - Interactive SVG Seating Chart Engine
 * Features:
 * - Scalable vector graphics renderer with multi-section layout
 * - Interactive Pan & Zoom navigation controls
 * - Dynamic seat state management: Available, Selected, Held, Sold, ADA Accessible
 * - Rich hover card tooltips with tier perks & pricing breakdown
 * - Cart hold synchronization with countdown timer
 * - Live Server-Sent Events (SSE) updates
 */

class SeatingChart {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.event = null;
    this.seats = [];
    this.selectedSeatIds = new Set();
    this.holdToken = null;
    this.holdExpiresAt = null;
    this.holdTimerInterval = null;
    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.onHoldExpire = options.onHoldExpire || (() => {});

    // Pan / Zoom transform state
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    this.activeFilterSection = 'all';
    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="seating-chart-wrapper">
        <!-- Toolbar & Legend Bar -->
        <div class="chart-header-bar">
          <div class="section-filter-wrap">
            <label class="filter-label">Filter Section:</label>
            <select id="chart-section-filter" class="chart-select">
              <option value="all">All Sections</option>
            </select>
          </div>

          <div class="chart-legend">
            <div class="legend-item"><span class="legend-dot status-available"></span> Available</div>
            <div class="legend-item"><span class="legend-dot status-selected"></span> Selected</div>
            <div class="legend-item"><span class="legend-dot status-held"></span> In Cart (Held)</div>
            <div class="legend-item"><span class="legend-dot status-sold"></span> Sold Out</div>
            <div class="legend-item"><span class="legend-badge-ada">♿</span> Accessible</div>
          </div>

          <div class="zoom-controls">
            <button id="zoom-in-btn" class="chart-tool-btn" title="Zoom In">+</button>
            <button id="zoom-out-btn" class="chart-tool-btn" title="Zoom Out">−</button>
            <button id="zoom-reset-btn" class="chart-tool-btn" title="Reset View">⟲</button>
          </div>
        </div>

        <!-- SVG Viewport -->
        <div class="svg-viewport" id="svg-viewport">
          <svg id="seating-svg" class="seating-svg" viewBox="0 0 760 540" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="stageGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3" />
                <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.05" />
              </linearGradient>
              <linearGradient id="spotlightGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#60a5fa" stop-opacity="0.4" />
                <stop offset="100%" stop-color="#0284c7" stop-opacity="0" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <!-- Zoomable & Pannable Group -->
            <g id="viewport-group" class="viewport-group">
              <!-- Stage & Lights -->
              <g id="stage-layer"></g>

              <!-- Sections & Seats Layer -->
              <g id="seats-layer"></g>
            </g>
          </svg>

          <!-- Floating Hover Card Tooltip -->
          <div id="seat-tooltip" class="seat-hover-card hidden"></div>
        </div>

        <!-- Hold Reservation Warning Bar -->
        <div id="hold-status-bar" class="hold-status-bar hidden">
          <div class="hold-bar-content">
            <span class="hold-pulse-indicator"></span>
            <span id="hold-timer-text">Seats locked in cart: <strong>08:00</strong> remaining</span>
          </div>
          <button id="release-hold-btn" class="release-btn">Release Seats</button>
        </div>
      </div>
    `;

    this.viewport = document.getElementById('svg-viewport');
    this.viewportGroup = document.getElementById('viewport-group');
    this.stageLayer = document.getElementById('stage-layer');
    this.seatsLayer = document.getElementById('seats-layer');
    this.tooltip = document.getElementById('seat-tooltip');
    this.sectionFilter = document.getElementById('chart-section-filter');
    this.holdStatusBar = document.getElementById('hold-status-bar');
    this.holdTimerText = document.getElementById('hold-timer-text');

    this.bindEvents();
  }

  bindEvents() {
    // Zoom Controls
    document.getElementById('zoom-in-btn').addEventListener('click', () => this.zoom(1.2));
    document.getElementById('zoom-out-btn').addEventListener('click', () => this.zoom(0.8));
    document.getElementById('zoom-reset-btn').addEventListener('click', () => this.resetTransform());

    // Mouse Pan & Drag
    this.viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('.seat-node')) return; // ignore clicks on seats
      this.isDragging = true;
      this.dragStartX = e.clientX - this.translateX;
      this.dragStartY = e.clientY - this.translateY;
      this.viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.translateX = e.clientX - this.dragStartX;
        this.translateY = e.clientY - this.dragStartY;
        this.updateTransform();
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.viewport.style.cursor = 'grab';
      }
    });

    // Mouse Wheel Zoom
    this.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoom(zoomFactor);
    }, { passive: false });

    // Section Filter
    this.sectionFilter.addEventListener('change', (e) => {
      this.activeFilterSection = e.target.value;
      this.applySectionFilter();
    });

    // Release Hold Button
    document.getElementById('release-hold-btn').addEventListener('click', () => {
      this.releaseCurrentHold();
    });
  }

  zoom(factor) {
    this.scale = Math.min(Math.max(0.6, this.scale * factor), 3.0);
    this.updateTransform();
  }

  resetTransform() {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.updateTransform();
  }

  updateTransform() {
    this.viewportGroup.setAttribute('transform', `translate(${this.translateX}, ${this.translateY}) scale(${this.scale})`);
  }

  async loadEvent(eventId) {
    this.selectedSeatIds.clear();
    this.stopHoldTimer();
    this.holdToken = null;
    this.holdExpiresAt = null;
    this.holdStatusBar.classList.add('hidden');

    try {
      const [event, seats] = await Promise.all([
        api.getEvent(eventId),
        api.getSeats(eventId)
      ]);

      this.event = event;
      this.seats = seats;
      this.render();
      this.onSelectionChange([]);
    } catch (err) {
      console.error('Failed to load event seating:', err);
    }
  }

  render() {
    if (!this.event || !this.seats) return;

    this.renderStage();
    this.renderSections();
    this.populateSectionFilter();
    this.resetTransform();
  }

  renderStage() {
    const layout = typeof this.event.layout_config === 'string'
      ? JSON.parse(this.event.layout_config || '{}')
      : (this.event.layout_config || {});

    const stageLabel = layout.stage?.label || 'MAIN STAGE';
    const stageWidth = layout.stage?.width || 600;
    const stageHeight = layout.stage?.height || 42;
    const stageX = (760 - stageWidth) / 2;

    this.stageLayer.innerHTML = `
      <!-- Spotlight Light Beam Cone -->
      <polygon points="${stageX},${50} ${stageX + stageWidth},${50} 740,500 20,500" fill="url(#spotlightGlow)" opacity="0.4" pointer-events="none" />

      <!-- Stage Platform -->
      <rect x="${stageX}" y="20" width="${stageWidth}" height="${stageHeight}" rx="8" fill="#1e293b" stroke="#475569" stroke-width="2" />
      <rect x="${stageX + 4}" y="24" width="${stageWidth - 8}" height="${stageHeight - 8}" rx="6" fill="url(#stageGrad)" />
      
      <!-- Stage Front Edge Glow -->
      <line x1="${stageX + 10}" y1="${20 + stageHeight - 2}" x2="${stageX + stageWidth - 10}" y2="${20 + stageHeight - 2}" stroke="#38bdf8" stroke-width="3" filter="url(#glow)" />
      
      <!-- Stage Text -->
      <text x="380" y="${20 + stageHeight / 2 + 5}" text-anchor="middle" fill="#f8fafc" font-size="13" font-weight="700" letter-spacing="3">
        ${stageLabel}
      </text>
    `;
  }

  renderSections() {
    this.seatsLayer.innerHTML = '';

    // Group seats by section
    const sectionMap = new Map();
    for (const seat of this.seats) {
      if (!sectionMap.has(seat.section_id)) {
        sectionMap.set(seat.section_id, {
          id: seat.section_id,
          name: seat.section_name,
          seats: []
        });
      }
      sectionMap.get(seat.section_id).seats.push(seat);
    }

    // Build SVG fragments
    for (const [secId, secData] of sectionMap.entries()) {
      const secGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      secGroup.setAttribute('class', 'section-group');
      secGroup.setAttribute('data-section-id', secId);

      // Section label placement
      if (secData.seats.length > 0) {
        const firstSeat = secData.seats[0];
        const secLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        secLabel.setAttribute('x', firstSeat.x);
        secLabel.setAttribute('y', Math.max(75, firstSeat.y - 12));
        secLabel.setAttribute('fill', '#94a3b8');
        secLabel.setAttribute('font-size', '11');
        secLabel.setAttribute('font-weight', '600');
        secLabel.setAttribute('letter-spacing', '1');
        secLabel.textContent = secData.name.toUpperCase();
        secGroup.appendChild(secLabel);
      }

      for (const seat of secData.seats) {
        const seatNode = this.createSeatNode(seat);
        secGroup.appendChild(seatNode);
      }

      this.seatsLayer.appendChild(secGroup);
    }
  }

  createSeatNode(seat) {
    const isSelected = this.selectedSeatIds.has(seat.id);
    const isHeld = seat.status === 'held' && (!this.holdToken || seat.hold_token !== this.holdToken);
    const isHeldByMe = seat.status === 'held' && this.holdToken && seat.hold_token === this.holdToken;
    const isSold = seat.status === 'sold';
    const isAvailable = seat.status === 'available' || isHeldByMe;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `seat-node status-${seat.status} ${isSelected ? 'selected' : ''}`);
    g.setAttribute('data-seat-id', seat.id);
    g.setAttribute('transform', `translate(${seat.x}, ${seat.y})`);

    // Outer circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '9');
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', '0');

    // Seat colors based on state
    if (isSelected) {
      circle.setAttribute('fill', '#06b6d4'); // Electric cyan
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('filter', 'url(#glow)');
    } else if (isSold) {
      circle.setAttribute('fill', '#262e3d');
      circle.setAttribute('stroke', '#334155');
      circle.setAttribute('stroke-width', '1');
    } else if (isHeld) {
      circle.setAttribute('fill', '#854d0e'); // Amber pulse
      circle.setAttribute('stroke', '#f59e0b');
      circle.setAttribute('stroke-width', '1.5');
    } else {
      // Available: tier color
      circle.setAttribute('fill', seat.tier_color || '#6366f1');
      circle.setAttribute('stroke', '#1e293b');
      circle.setAttribute('stroke-width', '1');
    }

    g.appendChild(circle);

    // ADA Accessible marker or seat number
    if (seat.is_accessible) {
      const adaText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      adaText.setAttribute('x', '0');
      adaText.setAttribute('y', '3');
      adaText.setAttribute('text-anchor', 'middle');
      adaText.setAttribute('font-size', '8');
      adaText.setAttribute('fill', '#ffffff');
      adaText.textContent = '♿';
      g.appendChild(adaText);
    } else if (!isSold) {
      const numText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      numText.setAttribute('x', '0');
      numText.setAttribute('y', '3');
      numText.setAttribute('text-anchor', 'middle');
      numText.setAttribute('font-size', '7.5');
      numText.setAttribute('font-weight', 'bold');
      numText.setAttribute('fill', isSelected ? '#0f172a' : '#ffffff');
      numText.textContent = seat.seat_number;
      g.appendChild(numText);
    }

    // Hover tooltip handlers
    g.addEventListener('mouseenter', (e) => this.showTooltip(seat, e));
    g.addEventListener('mousemove', (e) => this.moveTooltip(e));
    g.addEventListener('mouseleave', () => this.hideTooltip());

    // Click handler for selection
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleSeatClick(seat);
    });

    return g;
  }

  showTooltip(seat, e) {
    let statusBadge = `<span class="badge badge-avail">Available</span>`;
    if (seat.status === 'sold') {
      statusBadge = `<span class="badge badge-sold">Sold Out</span>`;
    } else if (seat.status === 'held') {
      statusBadge = `<span class="badge badge-held">Reserved in Cart</span>`;
    } else if (this.selectedSeatIds.has(seat.id)) {
      statusBadge = `<span class="badge badge-selected">Selected</span>`;
    }

    let perksHtml = '';
    if (seat.tier_name) {
      perksHtml = `<div class="tooltip-tier-name" style="color: ${seat.tier_color}">${seat.tier_name}</div>`;
    }

    this.tooltip.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-seat-label">${seat.section_name} • Row ${seat.row_label}-${seat.seat_number}</span>
        ${statusBadge}
      </div>
      ${perksHtml}
      <div class="tooltip-price-line">
        <span class="tooltip-price">$${seat.price.toFixed(2)}</span>
        <span class="tooltip-fee">+ $${(seat.tier_fee || 5.00).toFixed(2)} fee</span>
      </div>
      ${seat.is_accessible ? '<div class="tooltip-ada">♿ Designated Accessible Seating</div>' : ''}
      ${seat.restricted_view ? '<div class="tooltip-warn">⚠️ Slightly restricted sightline</div>' : ''}
    `;

    this.tooltip.classList.remove('hidden');
    this.moveTooltip(e);
  }

  moveTooltip(e) {
    const rect = this.viewport.getBoundingClientRect();
    const x = e.clientX - rect.left + 15;
    const y = e.clientY - rect.top - 15;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  hideTooltip() {
    this.tooltip.classList.add('hidden');
  }

  async handleSeatClick(seat) {
    if (seat.status === 'sold') return;
    if (seat.status === 'held' && (!this.holdToken || seat.hold_token !== this.holdToken)) {
      alert('This seat is currently held in another customer\'s checkout session.');
      return;
    }

    if (this.selectedSeatIds.has(seat.id)) {
      this.selectedSeatIds.delete(seat.id);
    } else {
      if (this.selectedSeatIds.size >= 8) {
        alert('You can select a maximum of 8 seats per order.');
        return;
      }
      this.selectedSeatIds.add(seat.id);
    }

    // Refresh seat nodes visually
    this.refreshSeatVisuals();

    // Trigger hold reservation if seats are selected
    if (this.selectedSeatIds.size > 0) {
      await this.syncHoldReservation();
    } else {
      this.releaseCurrentHold();
    }

    const selectedList = this.seats.filter(s => this.selectedSeatIds.has(s.id));
    this.onSelectionChange(selectedList);
  }

  refreshSeatVisuals() {
    const seatNodes = this.seatsLayer.querySelectorAll('.seat-node');
    seatNodes.forEach(node => {
      const seatId = node.getAttribute('data-seat-id');
      const isSelected = this.selectedSeatIds.has(seatId);
      const circle = node.querySelector('circle');
      const text = node.querySelector('text');

      if (isSelected) {
        node.classList.add('selected');
        circle.setAttribute('fill', '#06b6d4');
        circle.setAttribute('stroke', '#ffffff');
        circle.setAttribute('stroke-width', '2');
        circle.setAttribute('filter', 'url(#glow)');
        if (text) text.setAttribute('fill', '#0f172a');
      } else {
        node.classList.remove('selected');
        const seatData = this.seats.find(s => s.id === seatId);
        if (seatData) {
          if (seatData.status === 'sold') {
            circle.setAttribute('fill', '#262e3d');
            circle.setAttribute('stroke', '#334155');
          } else if (seatData.status === 'held') {
            circle.setAttribute('fill', '#854d0e');
            circle.setAttribute('stroke', '#f59e0b');
          } else {
            circle.setAttribute('fill', seatData.tier_color || '#6366f1');
            circle.setAttribute('stroke', '#1e293b');
            circle.removeAttribute('filter');
          }
          if (text) text.setAttribute('fill', '#ffffff');
        }
      }
    });
  }

  async syncHoldReservation() {
    const seatIds = Array.from(this.selectedSeatIds);
    try {
      const res = await api.holdSeats(this.event.id, seatIds, this.holdToken);
      this.holdToken = res.holdToken;
      this.holdExpiresAt = res.expiresAt;
      this.startHoldTimer();
    } catch (err) {
      alert(`Could not reserve seats: ${err.message}`);
      // Remove conflicting seat
      this.selectedSeatIds.clear();
      this.refreshSeatVisuals();
      await this.loadEvent(this.event.id);
    }
  }

  startHoldTimer() {
    this.stopHoldTimer();
    this.holdStatusBar.classList.remove('hidden');

    const updateTimer = () => {
      const remainingMs = this.holdExpiresAt - Date.now();
      if (remainingMs <= 0) {
        this.stopHoldTimer();
        this.holdStatusBar.classList.add('hidden');
        alert('Your 8-minute seat reservation has expired. Seats have been returned to the pool.');
        this.selectedSeatIds.clear();
        this.refreshSeatVisuals();
        this.onHoldExpire();
        this.loadEvent(this.event.id);
        return;
      }

      const totalSec = Math.floor(remainingMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      const formatted = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      this.holdTimerText.innerHTML = `Seats locked in cart: <strong>${formatted}</strong> remaining`;
    };

    updateTimer();
    this.holdTimerInterval = setInterval(updateTimer, 1000);
  }

  stopHoldTimer() {
    if (this.holdTimerInterval) {
      clearInterval(this.holdTimerInterval);
      this.holdTimerInterval = null;
    }
  }

  async releaseCurrentHold() {
    if (this.holdToken && this.event) {
      try {
        await api.releaseHold(this.event.id, Array.from(this.selectedSeatIds), this.holdToken);
      } catch (err) {
        console.warn('Failed to release hold:', err);
      }
    }
    this.holdToken = null;
    this.holdExpiresAt = null;
    this.selectedSeatIds.clear();
    this.stopHoldTimer();
    this.holdStatusBar.classList.add('hidden');
    this.refreshSeatVisuals();
    this.onSelectionChange([]);
  }

  populateSectionFilter() {
    const sections = [...new Set(this.seats.map(s => s.section_name))];
    this.sectionFilter.innerHTML = '<option value="all">All Sections (Full View)</option>';
    sections.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec;
      opt.textContent = sec;
      this.sectionFilter.appendChild(opt);
    });
  }

  applySectionFilter() {
    const secGroups = this.seatsLayer.querySelectorAll('.section-group');
    secGroups.forEach(grp => {
      const secId = grp.getAttribute('data-section-id');
      const sampleSeat = this.seats.find(s => s.section_id === secId);
      if (this.activeFilterSection === 'all' || (sampleSeat && sampleSeat.section_name === this.activeFilterSection)) {
        grp.style.opacity = '1';
        grp.style.pointerEvents = 'all';
      } else {
        grp.style.opacity = '0.15';
        grp.style.pointerEvents = 'none';
      }
    });
  }

  // Handle incoming live SSE updates
  handleLiveUpdate(update) {
    if (!update || !update.seatIds) return;
    for (const seatId of update.seatIds) {
      const seat = this.seats.find(s => s.id === seatId);
      if (seat) {
        if (update.type === 'SEATS_HELD') {
          if (update.holdToken !== this.holdToken) {
            seat.status = 'held';
          }
        } else if (update.type === 'SEATS_SOLD') {
          seat.status = 'sold';
          this.selectedSeatIds.delete(seatId);
        } else if (update.type === 'SEATS_RELEASED') {
          seat.status = 'available';
        }
      }
    }
    this.refreshSeatVisuals();
  }
}
