/**
 * Venue Vista - Master Application Controller
 * Manages view routing, event discovery catalog, checkout modal,
 * digital ticket pass generation, and real-time state.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global Application State
  const state = {
    currentTab: 'events',
    events: [],
    selectedEvent: null,
    selectedSeats: [],
    appliedPromo: null,
    activeOrder: null,
    seatingChart: null,
    seatingBuilder: null,
    gateScanner: null,
    salesAnalytics: null,
    sseSource: null
  };

  // --- INITIALIZATION ---
  initNavigation();
  initModals();
  initSeatingChartInstance();
  loadEventsCatalog();

  // --- TAB NAVIGATION ---
  function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchTab(tab);
      });
    });

    // Reset Demo button
    document.getElementById('reset-demo-btn').addEventListener('click', async () => {
      if (confirm('Reset Venue Vista demo data to initial state?')) {
        try {
          await api.resetDemo();
          alert('Demo data refreshed successfully!');
          window.location.reload();
        } catch (err) {
          alert('Failed to reset: ' + err.message);
        }
      }
    });

    // Create Event Button
    document.getElementById('create-event-nav-btn').addEventListener('click', () => {
      openCreateEventModal();
    });
  }

  function switchTab(tabName) {
    state.currentTab = tabName;

    // Update nav buttons
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    // Update tab sections
    document.querySelectorAll('.tab-view-section').forEach(sec => {
      sec.classList.toggle('hidden', sec.id !== `tab-${tabName}`);
    });

    // Lazy initialize tab controllers
    if (tabName === 'builder' && !state.seatingBuilder) {
      state.seatingBuilder = new SeatingBuilder('builder-container', {
        onVenueCreated: () => {
          loadEventsCatalog();
        }
      });
    } else if (tabName === 'scanner') {
      if (!state.gateScanner) {
        state.gateScanner = new GateScanner('scanner-container', {
          defaultEventId: state.selectedEvent ? state.selectedEvent.id : 'evt_hamilton'
        });
      } else {
        state.gateScanner.loadGateData();
      }
    } else if (tabName === 'analytics') {
      if (!state.salesAnalytics) {
        state.salesAnalytics = new SalesAnalytics('analytics-container');
      } else {
        state.salesAnalytics.loadData();
      }
    }
  }

  // --- SEATING CHART SETUP ---
  function initSeatingChartInstance() {
    state.seatingChart = new SeatingChart('seating-chart-container', {
      onSelectionChange: (selectedSeats) => {
        state.selectedSeats = selectedSeats;
        updateStickyCheckoutBar();
      },
      onHoldExpire: () => {
        state.selectedSeats = [];
        updateStickyCheckoutBar();
        closeModal('checkout-modal');
      }
    });
  }

  // --- EVENTS DISCOVERY CATALOG ---
  async function loadEventsCatalog() {
    try {
      const search = document.getElementById('search-events-input')?.value.trim() || '';
      const genre = document.querySelector('.genre-filter-btn.active')?.getAttribute('data-genre') || 'All';
      
      const events = await api.getEvents({ search, genre });
      state.events = events;
      renderEventsGrid(events);
    } catch (err) {
      console.error('Failed to load events catalog:', err);
    }
  }

  function renderEventsGrid(events) {
    const grid = document.getElementById('events-grid');
    if (!grid) return;

    if (events.length === 0) {
      grid.innerHTML = '<div class="empty-catalog">No events matching your search criteria.</div>';
      return;
    }

    grid.innerHTML = '';
    events.forEach(ev => {
      const card = document.createElement('div');
      card.className = 'event-card';

      const banner = ev.banner_url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80';
      const eventDate = new Date(ev.event_date);
      const dateFormatted = eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const timeFormatted = eventDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

      let statusBadge = '<span class="card-status-badge status-on-sale">On Sale</span>';
      if (ev.status === 'selling_fast') {
        statusBadge = '<span class="card-status-badge status-selling-fast">🔥 Selling Fast</span>';
      } else if (ev.status === 'sold_out') {
        statusBadge = '<span class="card-status-badge status-sold-out">Sold Out</span>';
      }

      card.innerHTML = `
        <div class="card-banner-wrap" style="background-image: url('${banner}')">
          <div class="card-overlay"></div>
          <div class="card-top-tags">
            <span class="card-genre-tag">${ev.genre}</span>
            ${statusBadge}
          </div>
          <div class="card-age-tag">${ev.age_restriction || 'All Ages'}</div>
        </div>

        <div class="card-body">
          <div class="card-date-line">
            <span class="calendar-icon">📅</span>
            <span>${dateFormatted} • Doors ${ev.doors_open || timeFormatted}</span>
          </div>

          <h3 class="card-title">${ev.title}</h3>
          <p class="card-venue-line">🏛️ ${ev.venue_name} • ${ev.venue_city}</p>
          <p class="card-desc">${ev.description ? ev.description.slice(0, 110) + '...' : ''}</p>

          <div class="card-occupancy-row">
            <div class="occupancy-labels">
              <span>Venue Fill Rate</span>
              <span class="font-bold">${ev.occupancy_pct}% (${ev.sold_seats || 0}/${ev.total_seats || 0})</span>
            </div>
            <div class="mini-bar-track">
              <div class="mini-bar-fill" style="width: ${ev.occupancy_pct}%; background: ${ev.occupancy_pct > 80 ? '#ec4899' : '#06b6d4'}"></div>
            </div>
          </div>

          <div class="card-footer">
            <div class="card-price-wrap">
              <span class="card-price-label">Tickets from</span>
              <span class="card-price-val">$${(ev.min_price || 45).toFixed(2)}</span>
            </div>
            <button class="btn-primary btn-select-seats" data-event-id="${ev.id}">Select Seats →</button>
          </div>
        </div>
      `;

      card.querySelector('.btn-select-seats').addEventListener('click', () => {
        openSeatingModal(ev.id);
      });

      grid.appendChild(card);
    });
  }

  // --- SEATING SELECTION MODAL ---
  async function openSeatingModal(eventId) {
    try {
      const event = await api.getEvent(eventId);
      state.selectedEvent = event;
      state.selectedSeats = [];

      // Update Modal Header
      document.getElementById('modal-event-title').textContent = event.title;
      document.getElementById('modal-event-venue').textContent = `${event.venue_name} • ${event.venue_city}`;
      document.getElementById('modal-event-date').textContent = `${new Date(event.event_date).toLocaleDateString()} | Doors ${event.doors_open}`;

      // Open Modal
      openModal('seating-modal');

      // Load interactive seating chart
      await state.seatingChart.loadEvent(eventId);

      // Connect real-time SSE stream for concurrent seat sync
      if (state.sseSource) {
        state.sseSource.close();
      }
      state.sseSource = api.connectLiveStream(eventId, (data) => {
        state.seatingChart.handleLiveUpdate(data);
      });

    } catch (err) {
      alert(`Could not load seating: ${err.message}`);
    }
  }

  // --- STICKY CHECKOUT BAR ---
  function updateStickyCheckoutBar() {
    const bar = document.getElementById('sticky-checkout-bar');
    const countSpan = document.getElementById('sticky-seat-count');
    const totalSpan = document.getElementById('sticky-total-price');
    const checkoutBtn = document.getElementById('open-checkout-modal-btn');

    const count = state.selectedSeats.length;
    if (count > 0) {
      let subtotal = 0;
      let fees = 0;
      state.selectedSeats.forEach(s => {
        subtotal += s.price;
        fees += (s.tier_fee || 5.00);
      });
      const total = subtotal + fees;

      countSpan.textContent = `${count} seat${count > 1 ? 's' : ''} selected`;
      totalSpan.textContent = `$${total.toFixed(2)}`;
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  }

  // --- CHECKOUT & PAYMENT MODAL ---
  document.getElementById('open-checkout-modal-btn').addEventListener('click', () => {
    openCheckoutModal();
  });

  function openCheckoutModal() {
    if (state.selectedSeats.length === 0) return;

    state.appliedPromo = null;
    document.getElementById('promo-input').value = '';
    document.getElementById('promo-feedback').innerHTML = '';

    renderCheckoutSummary();
    openModal('checkout-modal');
  }

  function renderCheckoutSummary() {
    const list = document.getElementById('checkout-seats-list');
    list.innerHTML = '';

    let subtotal = 0;
    let serviceFees = 0;

    state.selectedSeats.forEach(seat => {
      subtotal += seat.price;
      serviceFees += (seat.tier_fee || 5.00);

      const row = document.createElement('div');
      row.className = 'summary-seat-row';
      row.innerHTML = `
        <div class="summary-seat-info">
          <span class="summary-seat-name">${seat.section_name} • Row ${seat.row_label}-${seat.seat_number}</span>
          <span class="summary-seat-tier" style="color: ${seat.tier_color}">${seat.tier_name}</span>
        </div>
        <div class="summary-seat-price">$${seat.price.toFixed(2)}</div>
      `;
      list.appendChild(row);
    });

    let discount = 0;
    if (state.appliedPromo) {
      discount = state.appliedPromo.discount;
    }

    const tax = Number(((subtotal - discount) * 0.0825).toFixed(2));
    const total = Number((subtotal + serviceFees + tax - discount).toFixed(2));

    document.getElementById('calc-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('calc-fees').textContent = `$${serviceFees.toFixed(2)}`;
    document.getElementById('calc-tax').textContent = `$${tax.toFixed(2)}`;
    
    const discountRow = document.getElementById('calc-discount-row');
    if (discount > 0) {
      discountRow.classList.remove('hidden');
      document.getElementById('calc-discount').textContent = `-$${discount.toFixed(2)}`;
    } else {
      discountRow.classList.add('hidden');
    }

    document.getElementById('calc-total').textContent = `$${total.toFixed(2)}`;
  }

  // Promo Code Application
  document.getElementById('apply-promo-btn').addEventListener('click', async () => {
    const code = document.getElementById('promo-input').value.trim();
    const feedback = document.getElementById('promo-feedback');

    if (!code) {
      feedback.innerHTML = '<span class="text-error">Please enter a promo code</span>';
      return;
    }

    let subtotal = state.selectedSeats.reduce((acc, s) => acc + s.price, 0);

    try {
      const res = await api.validatePromo(code, subtotal);
      if (res.valid) {
        state.appliedPromo = res;
        feedback.innerHTML = `<span class="text-success">✓ ${res.message}</span>`;
        renderCheckoutSummary();
      } else {
        state.appliedPromo = null;
        feedback.innerHTML = `<span class="text-error">✕ ${res.message}</span>`;
        renderCheckoutSummary();
      }
    } catch (err) {
      feedback.innerHTML = `<span class="text-error">Error validating promo code</span>`;
    }
  });

  // Complete Purchase
  document.getElementById('complete-order-btn').addEventListener('click', async () => {
    const name = document.getElementById('buyer-name').value.trim();
    const email = document.getElementById('buyer-email').value.trim();
    const phone = document.getElementById('buyer-phone').value.trim();
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value || 'Credit Card';

    if (!name || !email) {
      alert('Please provide your full name and email address.');
      return;
    }

    const payload = {
      seatIds: state.selectedSeats.map(s => s.id),
      holdToken: state.seatingChart.holdToken,
      buyer: { name, email, phone },
      promoCode: state.appliedPromo ? state.appliedPromo.code : null,
      paymentMethod
    };

    const submitBtn = document.getElementById('complete-order-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing Transaction...';

    try {
      const result = await api.checkout(state.selectedEvent.id, payload);

      // Stop hold timer & close checkout modal
      state.seatingChart.stopHoldTimer();
      closeModal('checkout-modal');
      closeModal('seating-modal');

      // Refresh events and analytics in background
      loadEventsCatalog();
      if (state.salesAnalytics) state.salesAnalytics.loadData();
      if (state.gateScanner) state.gateScanner.loadGateData();

      // Open Digital Ticket Pass Modal
      state.activeOrder = result.order;
      openTicketPassModal(result.order);

    } catch (err) {
      alert(`Booking Failed: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Pay Now';
    }
  });

  // --- DIGITAL TICKET PASS MODAL ---
  function openTicketPassModal(order) {
    const container = document.getElementById('ticket-passes-carousel');
    container.innerHTML = '';

    document.getElementById('ticket-modal-order-id').textContent = order.id;
    document.getElementById('ticket-modal-buyer').textContent = `${order.buyerName} (${order.buyerEmail})`;

    order.tickets.forEach((ticket, idx) => {
      const pass = document.createElement('div');
      pass.className = 'ticket-pass-card';

      // Live SVG QR code generation
      const qrSvg = QRCode.toSVG(ticket.qr_code_payload, {
        size: 160,
        darkColor: '#090d16',
        lightColor: '#ffffff'
      });

      pass.innerHTML = `
        <div class="pass-header">
          <div class="pass-brand">VENUE VISTA PASS PRO</div>
          <div class="pass-laminate-badge ${ticket.tier_name.toLowerCase().includes('vip') ? 'vip' : 'standard'}">
            ${ticket.tier_name.toLowerCase().includes('vip') ? '⭐ VIP ACCESS' : 'OFFICIAL ADMISSION'}
          </div>
        </div>

        <div class="pass-event-details">
          <h2 class="pass-event-title">${order.eventTitle}</h2>
          <div class="pass-event-meta">
            <span>🏛️ ${order.venueName}</span>
            <span>📍 ${order.venueAddress}</span>
            <span>📅 ${new Date(order.eventDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span>⏰ Doors: ${order.doorsOpen}</span>
          </div>
        </div>

        <!-- Perforated Tear Line -->
        <div class="perforated-tear-line">
          <div class="tear-notch left"></div>
          <div class="tear-dash"></div>
          <div class="tear-notch right"></div>
        </div>

        <div class="pass-seating-grid">
          <div class="pass-seat-col">
            <span class="seat-lbl">SECTION</span>
            <span class="seat-val">${ticket.section_name}</span>
          </div>
          <div class="pass-seat-col">
            <span class="seat-lbl">ROW</span>
            <span class="seat-val">${ticket.row_label}</span>
          </div>
          <div class="pass-seat-col">
            <span class="seat-lbl">SEAT</span>
            <span class="seat-val">${ticket.seat_number}</span>
          </div>
          <div class="pass-seat-col">
            <span class="seat-lbl">TIER</span>
            <span class="seat-val">${ticket.tier_name}</span>
          </div>
        </div>

        <!-- QR Code & Security Barcode -->
        <div class="pass-qr-container">
          <div class="qr-code-box">${qrSvg}</div>
          <div class="pass-qr-info">
            <span class="pass-ticket-id">${ticket.id}</span>
            <span class="pass-auth-note">Valid for 1 Entry • Scanned at Turnstiles</span>
            <div class="security-barcode-lines">
              ${Array.from({ length: 36 }, () => `<span style="width: ${Math.random() > 0.5 ? '2px' : '1px'}; height: 26px; background: #475569"></span>`).join('')}
            </div>
          </div>
        </div>
      `;

      container.appendChild(pass);
    });

    openModal('ticket-modal');
  }

  // Print Pass Action
  document.getElementById('print-tickets-btn').addEventListener('click', () => {
    window.print();
  });

  // --- CREATE EVENT MODAL ---
  async function openCreateEventModal() {
    const venues = await api.getVenues();
    const select = document.getElementById('new-event-venue');
    select.innerHTML = '';
    venues.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = `${v.name} (${v.city} - ${v.capacity} seats)`;
      select.appendChild(opt);
    });

    openModal('create-event-modal');
  }

  document.getElementById('save-new-event-btn').addEventListener('click', async () => {
    const title = document.getElementById('new-event-title').value.trim();
    const venue_id = document.getElementById('new-event-venue').value;
    const genre = document.getElementById('new-event-genre').value;
    const date = document.getElementById('new-event-date').value;
    const time = document.getElementById('new-event-time').value || '19:30';
    const doors = document.getElementById('new-event-doors').value || '18:30';
    const desc = document.getElementById('new-event-desc').value.trim();
    const banner = document.getElementById('new-event-banner').value.trim();

    if (!title || !venue_id || !date) {
      alert('Title, venue, and date are required.');
      return;
    }

    try {
      await api.createEvent({
        title,
        venue_id,
        genre,
        event_date: `${date} ${time}`,
        doors_open: doors,
        description: desc,
        banner_url: banner || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80'
      });

      alert(`🎉 Event "${title}" created and seating inventory generated!`);
      closeModal('create-event-modal');
      loadEventsCatalog();
    } catch (err) {
      alert(`Error creating event: ${err.message}`);
    }
  });

  // --- GENRE FILTERS & SEARCH ---
  document.querySelectorAll('.genre-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.genre-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadEventsCatalog();
    });
  });

  const searchInput = document.getElementById('search-events-input');
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(loadEventsCatalog, 250);
    });
  }

  // --- MODAL UTILS ---
  function initModals() {
    document.querySelectorAll('.modal-close-btn, .modal-backdrop').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target === el) {
          const modal = el.closest('.modal-container');
          if (modal) modal.classList.add('hidden');
        }
      });
    });
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
  }
});
