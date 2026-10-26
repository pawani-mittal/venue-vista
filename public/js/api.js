/**
 * Venue Vista - Client API Bridge
 * Encapsulates all backend REST calls, error handling, and real-time SSE stream
 */

const API_BASE = '/api';

const api = {
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  },

  // Venues
  getVenues() {
    return this.request('/venues').then(res => res.venues || []);
  },

  getVenue(id) {
    return this.request(`/venues/${id}`).then(res => res.venue);
  },

  createVenue(venueData) {
    return this.request('/venues', {
      method: 'POST',
      body: JSON.stringify(venueData)
    });
  },

  // Events
  getEvents(filters = {}) {
    const params = new URLSearchParams();
    if (filters.genre && filters.genre !== 'All') params.append('genre', filters.genre);
    if (filters.status && filters.status !== 'All') params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/events${qs}`).then(res => res.events || []);
  },

  getEvent(id) {
    return this.request(`/events/${id}`).then(res => res.event);
  },

  createEvent(eventData) {
    return this.request('/events', {
      method: 'POST',
      body: JSON.stringify(eventData)
    });
  },

  updateEvent(id, data) {
    return this.request(`/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deleteEvent(id) {
    return this.request(`/events/${id}`, {
      method: 'DELETE'
    });
  },

  // Seating
  getSeats(eventId) {
    return this.request(`/events/${eventId}/seats`).then(res => res.seats || []);
  },

  holdSeats(eventId, seatIds, holdToken = null) {
    return this.request(`/events/${eventId}/hold`, {
      method: 'POST',
      body: JSON.stringify({ seatIds, holdToken })
    });
  },

  releaseHold(eventId, seatIds = null, holdToken) {
    return this.request(`/events/${eventId}/release-hold`, {
      method: 'POST',
      body: JSON.stringify({ seatIds, holdToken })
    });
  },

  // Promos
  validatePromo(code, subtotal) {
    return this.request('/promos/validate', {
      method: 'POST',
      body: JSON.stringify({ code, subtotal })
    });
  },

  // Checkout
  checkout(eventId, payload) {
    return this.request(`/events/${eventId}/checkout`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getOrder(id) {
    return this.request(`/orders/${id}`).then(res => res.order);
  },

  // Access Control & Scanner
  scanTicket(payloadOrId, device = 'Mobile Box Office Scanner') {
    return this.request('/tickets/scan', {
      method: 'POST',
      body: JSON.stringify({ payloadOrId, device })
    });
  },

  getGateStats(eventId) {
    return this.request(`/events/${eventId}/gate-stats`);
  },

  // Sales Analytics
  getAnalytics(eventId = null) {
    const qs = eventId && eventId !== 'all' ? `?eventId=${eventId}` : '';
    return this.request(`/analytics${qs}`);
  },

  exportUrl(type = 'orders', format = 'csv', eventId = null) {
    let url = `/api/analytics/export?type=${type}&format=${format}`;
    if (eventId && eventId !== 'all') url += `&eventId=${eventId}`;
    return url;
  },

  resetDemo() {
    return this.request('/reset-demo', { method: 'POST' });
  },

  // Real-time Event Stream (SSE)
  connectLiveStream(eventId, onMessage) {
    try {
      const evtSource = new EventSource(`/api/events/${eventId}/live-stream`);
      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch {
          // heartbeat or unformatted
        }
      };
      return evtSource;
    } catch (err) {
      console.warn('SSE not supported or failed to connect:', err);
      return null;
    }
  }
};
