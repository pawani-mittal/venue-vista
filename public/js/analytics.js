/**
 * Venue Vista - Box Office & Sales Analytics Engine
 * Interactive SVG charts, section heatmaps, sales velocity, promo ROI, and CSV audit export
 */

class SalesAnalytics {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.selectedEventId = 'all';
    this.initDOM();
    this.loadData();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="analytics-wrapper">
        <!-- Analytics Header & Filter Bar -->
        <div class="analytics-header">
          <div>
            <h2 class="analytics-title">Box Office & Sales Analytics</h2>
            <p class="analytics-subtitle">Real-time revenue metrics, seating heatmaps, velocity trends & yields</p>
          </div>

          <div class="analytics-actions">
            <select id="analytics-event-filter" class="form-select"></select>

            <div class="export-dropdown-wrap">
              <button id="export-btn" class="btn-outline">📥 Export Data ▾</button>
              <div id="export-menu" class="export-menu hidden">
                <a href="#" id="export-orders-csv" class="export-menu-item">Export Orders (CSV)</a>
                <a href="#" id="export-orders-json" class="export-menu-item">Export Orders (JSON)</a>
                <a href="#" id="export-attendees-csv" class="export-menu-item">Export Attendee Roster (CSV)</a>
                <a href="#" id="export-attendees-json" class="export-menu-item">Export Attendee Roster (JSON)</a>
              </div>
            </div>
          </div>
        </div>

        <!-- KPI Metrics Grid -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-label">Gross Revenue</span>
              <span class="kpi-icon">💰</span>
            </div>
            <div class="kpi-value" id="kpi-gross-rev">$0.00</div>
            <div class="kpi-sub" id="kpi-gross-sub">Includes tickets & fees</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-label">Tickets Sold</span>
              <span class="kpi-icon">🎟️</span>
            </div>
            <div class="kpi-value" id="kpi-tickets-sold">0</div>
            <div class="kpi-sub" id="kpi-capacity-sub">0% of total capacity</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-label">Average Order Value</span>
              <span class="kpi-icon">📈</span>
            </div>
            <div class="kpi-value" id="kpi-aov">$0.00</div>
            <div class="kpi-sub" id="kpi-orders-count">Across 0 orders</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-label">Promo Discounts</span>
              <span class="kpi-icon">🏷️</span>
            </div>
            <div class="kpi-value text-amber" id="kpi-discounts">$0.00</div>
            <div class="kpi-sub" id="kpi-fees-sub">Service fees: $0.00</div>
          </div>
        </div>

        <!-- Charts Grid 1: Revenue by Section & Tier Breakdown -->
        <div class="charts-row">
          <!-- Section Bar Chart -->
          <div class="chart-card flex-2">
            <h3 class="chart-title">Revenue by Venue Section</h3>
            <div id="chart-section-bars" class="chart-body"></div>
          </div>

          <!-- Tier Breakdown -->
          <div class="chart-card flex-1">
            <h3 class="chart-title">Sales by Ticket Tier</h3>
            <div id="chart-tier-breakdown" class="chart-body"></div>
          </div>
        </div>

        <!-- Charts Grid 2: Sales Timeline & Seating Occupancy Heatmap -->
        <div class="charts-row">
          <!-- Timeline Velocity Chart -->
          <div class="chart-card flex-1">
            <h3 class="chart-title">Sales Velocity & Daily Volume</h3>
            <div id="chart-timeline" class="chart-body"></div>
          </div>

          <!-- Section Heatmap -->
          <div class="chart-card flex-1">
            <h3 class="chart-title">Seating Occupancy Heatmap</h3>
            <div id="chart-heatmap" class="chart-body"></div>
          </div>
        </div>

        <!-- Promo Code & Top Events Tables -->
        <div class="charts-row">
          <!-- Top Events Table -->
          <div class="chart-card flex-1">
            <h3 class="chart-title">Top Performing Events</h3>
            <div class="table-wrap">
              <table class="data-table" id="top-events-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Genre</th>
                    <th>Tickets</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>

          <!-- Promo Codes Table -->
          <div class="chart-card flex-1">
            <h3 class="chart-title">Promo Code Conversions</h3>
            <div class="table-wrap">
              <table class="data-table" id="promos-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Uses</th>
                    <th>Discount Given</th>
                    <th>Driven Revenue</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const filter = document.getElementById('analytics-event-filter');
    filter.addEventListener('change', (e) => {
      this.selectedEventId = e.target.value;
      this.loadData();
    });

    const exportBtn = document.getElementById('export-btn');
    const exportMenu = document.getElementById('export-menu');

    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      exportMenu.classList.add('hidden');
    });

    // Export links
    document.getElementById('export-orders-csv').addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = api.exportUrl('orders', 'csv', this.selectedEventId);
    });

    document.getElementById('export-orders-json').addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = api.exportUrl('orders', 'json', this.selectedEventId);
    });

    document.getElementById('export-attendees-csv').addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = api.exportUrl('attendees', 'csv', this.selectedEventId);
    });

    document.getElementById('export-attendees-json').addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = api.exportUrl('attendees', 'json', this.selectedEventId);
    });
  }

  async loadData() {
    // Populate event selector
    const filter = document.getElementById('analytics-event-filter');
    if (filter.children.length === 0) {
      filter.innerHTML = '<option value="all">All Entertainment Events</option>';
      const events = await api.getEvents();
      events.forEach(ev => {
        const opt = document.createElement('option');
        opt.value = ev.id;
        opt.textContent = ev.title;
        filter.appendChild(opt);
      });
    }

    try {
      const data = await api.getAnalytics(this.selectedEventId);
      this.renderKPIs(data.kpis);
      this.renderSectionBars(data.bySection);
      this.renderTierBreakdown(data.byTier);
      this.renderTimeline(data.timeline);
      this.renderHeatmap(data.bySection);
      this.renderTopEvents(data.topEvents);
      this.renderPromos(data.promos);
    } catch (err) {
      console.error('Failed to load analytics data:', err);
    }
  }

  renderKPIs(kpis) {
    if (!kpis) return;
    document.getElementById('kpi-gross-rev').textContent = `$${kpis.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('kpi-gross-sub').textContent = `Tickets: $${kpis.ticketRevenue.toLocaleString()} | Fees: $${kpis.totalFees.toLocaleString()}`;

    document.getElementById('kpi-tickets-sold').textContent = kpis.ticketsSold;
    document.getElementById('kpi-capacity-sub').textContent = `${kpis.occupancyPct}% of venue capacity (${kpis.totalCapacity} total)`;

    document.getElementById('kpi-aov').textContent = `$${kpis.aov.toFixed(2)}`;
    document.getElementById('kpi-orders-count').textContent = `Across ${kpis.totalOrders} completed orders`;

    document.getElementById('kpi-discounts').textContent = `-$${kpis.totalDiscounts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('kpi-fees-sub').textContent = `Total Service Fees: $${kpis.totalFees.toFixed(2)}`;
  }

  renderSectionBars(sections = []) {
    const container = document.getElementById('chart-section-bars');
    if (sections.length === 0) {
      container.innerHTML = '<div class="empty-chart">No section sales recorded yet</div>';
      return;
    }

    const maxRev = Math.max(...sections.map(s => s.revenue), 100);

    let html = '<div class="bar-chart-list">';
    sections.forEach(s => {
      const pct = Math.round((s.revenue / maxRev) * 100);
      html += `
        <div class="bar-chart-row">
          <div class="bar-label-col">
            <span class="bar-sec-name">${s.section_name}</span>
            <span class="bar-sec-sub">${s.tickets_sold} tickets</span>
          </div>
          <div class="bar-fill-col">
            <div class="bar-fill-track">
              <div class="bar-fill-bar" style="width: ${pct}%"></div>
            </div>
          </div>
          <div class="bar-val-col">
            $${s.revenue.toLocaleString()}
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  renderTierBreakdown(tiers = []) {
    const container = document.getElementById('chart-tier-breakdown');
    if (tiers.length === 0) {
      container.innerHTML = '<div class="empty-chart">No tier data available</div>';
      return;
    }

    const totalRev = tiers.reduce((acc, t) => acc + t.revenue, 0) || 1;
    const colors = ['#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899'];

    let html = '<div class="tier-cards-list">';
    tiers.forEach((t, i) => {
      const share = Math.round((t.revenue / totalRev) * 100);
      const color = colors[i % colors.length];
      html += `
        <div class="tier-card-item">
          <div class="tier-card-top">
            <span class="tier-dot" style="background: ${color}"></span>
            <span class="tier-name">${t.tier_name}</span>
            <span class="tier-share">${share}%</span>
          </div>
          <div class="tier-card-nums">
            <strong>$${t.revenue.toLocaleString()}</strong>
            <span class="text-muted">${t.tickets_sold} sold</span>
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  renderTimeline(timeline = []) {
    const container = document.getElementById('chart-timeline');
    if (timeline.length === 0) {
      container.innerHTML = '<div class="empty-chart">No transaction history found</div>';
      return;
    }

    const maxRev = Math.max(...timeline.map(t => t.daily_revenue), 100);
    const chartHeight = 160;

    // Render interactive SVG Line & Column Chart
    const barWidth = Math.min(38, Math.max(20, Math.floor(400 / timeline.length) - 8));
    let svgContent = '';

    timeline.forEach((pt, i) => {
      const h = Math.round((pt.daily_revenue / maxRev) * (chartHeight - 40));
      const x = 30 + i * (barWidth + 12);
      const y = chartHeight - h - 25;

      svgContent += `
        <g class="chart-col-group">
          <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4" fill="#38bdf8" opacity="0.85">
            <title>${pt.sale_date}: $${pt.daily_revenue.toLocaleString()} (${pt.order_count} orders)</title>
          </rect>
          <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" fill="#94a3b8" font-size="9">$${Math.round(pt.daily_revenue / 1000)}k</text>
          <text x="${x + barWidth / 2}" y="${chartHeight - 8}" text-anchor="middle" fill="#64748b" font-size="9">${pt.sale_date.slice(5)}</text>
        </g>
      `;
    });

    container.innerHTML = `
      <svg class="timeline-svg" viewBox="0 0 ${Math.max(480, 40 + timeline.length * (barWidth + 12))} ${chartHeight}">
        <line x1="20" y1="${chartHeight - 24}" x2="100%" y2="${chartHeight - 24}" stroke="#334155" stroke-dasharray="2,2" />
        ${svgContent}
      </svg>
    `;
  }

  renderHeatmap(sections = []) {
    const container = document.getElementById('chart-heatmap');
    if (sections.length === 0) {
      container.innerHTML = '<div class="empty-chart">No heatmap data available</div>';
      return;
    }

    let html = '<div class="heatmap-grid">';
    sections.forEach(s => {
      // Heat intensity 0 to 1 based on tickets sold
      const intensity = Math.min(1, s.tickets_sold / 20);
      let bgStyle = `rgba(59, 130, 246, ${0.2 + intensity * 0.7})`;
      if (intensity > 0.7) {
        bgStyle = `rgba(239, 68, 68, ${0.25 + intensity * 0.75})`;
      } else if (intensity > 0.4) {
        bgStyle = `rgba(245, 158, 11, ${0.25 + intensity * 0.75})`;
      }

      html += `
        <div class="heatmap-tile" style="background: ${bgStyle}; border-color: rgba(255,255,255,0.15)">
          <div class="tile-title">${s.section_name}</div>
          <div class="tile-count">${s.tickets_sold} Sold</div>
          <div class="tile-rev">$${s.revenue.toLocaleString()}</div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  renderTopEvents(events = []) {
    const tbody = document.querySelector('#top-events-table tbody');
    tbody.innerHTML = '';
    events.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${e.title}</strong><div class="text-muted text-xs">${e.venue_name}</div></td>
        <td><span class="genre-tag">${e.genre}</span></td>
        <td>${e.tickets_sold}</td>
        <td><strong>$${e.total_revenue.toLocaleString()}</strong></td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderPromos(promos = []) {
    const tbody = document.querySelector('#promos-table tbody');
    tbody.innerHTML = '';
    promos.forEach(p => {
      const tr = document.createElement('tr');
      const discountLabel = p.discount_percent > 0 ? `${p.discount_percent}% Off` : `$${p.fixed_discount} Off`;
      tr.innerHTML = `
        <td><code class="promo-badge">${p.code}</code></td>
        <td>${discountLabel}</td>
        <td>${p.current_uses}</td>
        <td class="text-amber">-$${p.total_savings.toFixed(2)}</td>
        <td><strong>$${p.driven_revenue.toLocaleString()}</strong></td>
      `;
      tbody.appendChild(tr);
    });
  }
}
