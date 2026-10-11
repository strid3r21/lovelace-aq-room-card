/* aq-room-card — Home Assistant custom card
 * Room air-quality overview: each metric shown as a horizontal bar with
 * colored good/moderate/bad zones and a marker at the current value.
 * Rows expand on click to show a 7-day history line graph.
 *
 * Config:
 *   type: custom:aq-room-card
 *   title:  optional override (default: room)
 *   room:   display name
 *   prefix: entity id prefix, e.g. "sensor.air_quality_"
 *   metrics: optional list of metric keys to show (default: all)
 */

const AQ_GREEN  = "#43a047";
const AQ_YELLOW = "#fbc02d";
const AQ_RED    = "#e53935";

const AQ_METRICS = {
  co2: {
    label: "CO2", icon: "mdi:molecule-co2", unit: "ppm", suffix: "co2",
    max: 2000, zones: [[0, AQ_GREEN], [800, AQ_YELLOW], [1200, AQ_RED]], decimals: 0,
  },
  pm2_5: {
    label: "PM2.5", icon: "mdi:smoke", unit: "\u00b5g/m\u00b3", suffix: "pm2_5",
    max: 50, zones: [[0, AQ_GREEN], [12, AQ_YELLOW], [35.4, AQ_RED]], decimals: 1,
  },
  pm1_0: {
    label: "PM1", icon: "mdi:air-filter", unit: "\u00b5g/m\u00b3", suffix: "pm1_0",
    max: 20, zones: [[0, AQ_GREEN], [4, AQ_YELLOW], [15, AQ_RED]], decimals: 1,
  },
  pm10_0: {
    label: "PM10", icon: "mdi:air-purifier", unit: "\u00b5g/m\u00b3", suffix: "pm10_0",
    max: 100, zones: [[0, AQ_GREEN], [15, AQ_YELLOW], [45, AQ_RED]], decimals: 0,
  },
  voc_index: {
    label: "VOC Index", icon: "mdi:radiator", unit: "", suffix: "voc_index",
    max: 200, zones: [[0, AQ_GREEN], [50, AQ_YELLOW], [100, AQ_RED]], decimals: 0,
  },
  nox_index: {
    label: "NOx Index", icon: "mdi:cloud", unit: "", suffix: "nox_index",
    max: 200, zones: [[0, AQ_GREEN], [50, AQ_YELLOW], [100, AQ_RED]], decimals: 0,
  },
  particles: {
    label: "Particles", icon: "mdi:blur", unit: "#/0.1L", suffix: "pmc_0_3mm",
    max: 500, zones: [[0, AQ_GREEN], [100, AQ_YELLOW], [250, AQ_RED]], decimals: 0,
  },
  temperature: {
    label: "Temp", icon: "mdi:thermometer", unit: "°F", suffix: "temperature",
    max: 100,
    zones: [[0, "#1e88e5"], [60, "#4dd0e1"], [65, AQ_GREEN], [78, "#ff9800"], [85, AQ_RED]],
    zone_labels: ["Cold", "Cool", "Good", "Warm", "Hot"],
    zone_severity: [2, 1, 0, 1, 2],
    decimals: 1,
  },
  humidity: {
    label: "Humidity", icon: "mdi:water-percent", unit: "%", suffix: "humidity",
    max: 100,
    zones: [[0, AQ_RED], [20, "#ff9800"], [30, AQ_GREEN], [60, "#4dd0e1"], [75, "#1e88e5"]],
    zone_labels: ["Very Dry", "Dry", "Good", "Humid", "Very Humid"],
    zone_severity: [2, 1, 0, 1, 2],
    decimals: 0,
  },
};

const ZONE_NAMES = ["Good", "Moderate", "Poor"];

class AqRoomCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._open = {};
    this._hist = {};
    this._hours = 24 * 7; // 7-day graph window
  }

  setConfig(config) {
    if (!config.room) throw new Error("room is required");
    if (!config.prefix) throw new Error("prefix is required");
    this.config = Object.assign({
      title: config.room,
      metrics: Object.keys(AQ_METRICS),
    }, config);
    this._hass = null;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _state(key) {
    const id = this.config.prefix + AQ_METRICS[key].suffix;
    const st = this._hass && this._hass.states[id];
    if (!st) return null;
    const v = parseFloat(st.state);
    if (!isFinite(v)) return null;
    return v;
  }

  _zoneIndex(value, m) {
    let idx = 0;
    for (let i = 0; i < m.zones.length; i++) {
      if (value >= m.zones[i][0]) idx = i;
    }
    return idx;
  }

  _gradient(m) {
    const stops = m.zones.map(([from, color]) =>
      `${color} ${(from / m.max) * 100}%`
    );
    stops.push(`${m.zones[m.zones.length - 1][1]} 100%`);
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  }

  _fetchHistory(key) {
    const existing = this._hist[key];
    if (existing && !existing.loading && !existing.error) return;
    this._hist[key] = { loading: true };
    const m = AQ_METRICS[key];
    const id = this.config.prefix + m.suffix;
    const base = (this.config && this.config.history_url || "").replace(/\/+$/, "");
    const finish = (points) => {
      const step = Math.max(1, Math.ceil(points.length / 220));
      this._hist[key] = { points: points.filter((_, i) => i % step === 0), loading: false };
      this._render();
    };
    const fail = (err) => {
      this._hist[key] = { error: String((err && err.message) || err), loading: false };
      this._render();
    };
    // Primary: external history server (e.g. hassio-aq-history add-on)
    if (base) {
      fetch(`${base}/history?entity_id=${encodeURIComponent(id)}&hours=${this._hours}&max_points=500`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
        .then((j) => {
          const pts = (j && j.points) || [];
          if (!Array.isArray(pts)) throw new Error("unexpected response");
          finish(pts.map((p) => [p[0], parseFloat(p[1])]).filter((p) => isFinite(p[1])));
        })
        .catch(fail);
      return;
    }
    // Fallback: HA websocket history API (not present in some builds)
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const conn = this._hass && this._hass.connection;
    const run = () => {
      const msgId = "aq" + Math.random().toString(16).slice(2);
      const pending = new Promise((resolve) => {
        const unsub = conn.subscribeMessage(
          (msg) => {
            if (msg.id === msgId) {
              unsub();
              resolve(msg);
            }
          },
          {
            id: msgId,
            type: "history/history_during_period",
            start_time: since,
            entity_ids: [id],
            no_attributes: true,
            significant_changes_only: false,
          }
        );
      });
      return pending;
    };
    Promise.resolve()
      .then(() => {
        if (!conn) throw new Error("no websocket connection");
        return run();
      })
      .then((msg) => {
        if (!msg || !msg.success) {
          const code = msg && msg.error && msg.error.code;
          throw new Error(
            code === "unknown_command"
              ? "history is not available on this HA build (no history API)"
              : (msg && msg.error && msg.error.message) || "history fetch failed"
          );
        }
        const states = (msg.result && msg.result[id]) || [];
        const pts = states
          .map((st) => [
            (st.last_updated || st.last_changed) * 1000,
            parseFloat(st.state),
          ])
          .filter((p) => isFinite(p[0]) && isFinite(p[1]));
        pts.sort((a, b) => a[0] - b[0]);
        finish(pts);
      })
      .catch(fail);
  }

  _graph(key) {
    const h = this._hist[key];
    if (!h) return "";
    if (h.loading) return `<div class="gstatus">Loading history\u2026</div>`;
    if (h.error) return `<div class="gstatus">History unavailable: ${h.error}</div>`;
    const pts = h.points;
    if (!pts || !pts.length) return `<div class="gstatus">No history data yet</div>`;
    const m = AQ_METRICS[key];
    const W = 600, H = 110, PADT = 6;
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    const x = (ts) => ((ts - t0) / Math.max(1, t1 - t0)) * W;
    const y = (v) => H - PADT - (Math.max(0, Math.min(m.max, v)) / m.max) * (H - 2 * PADT);
    let bands = "";
    for (let i = m.zones.length - 1; i >= 0; i--) {
      const from = m.zones[i][0];
      const to = i < m.zones.length - 1 ? m.zones[i + 1][0] : m.max;
      const yTop = y(to), yBot = y(from);
      bands += `<rect x="0" y="${yTop.toFixed(1)}" width="${W}" height="${(yBot - yTop).toFixed(1)}" fill="${m.zones[i][1]}" opacity="0.13"></rect>`;
    }
    const line = pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
    const label = `${new Date(t0).toLocaleDateString()} \u2192 ${new Date(t1).toLocaleDateString()}`;
    return `<div class="gwrap">
      <div class="glab">${label} \u00b7 last 7 days</div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        ${bands}
        <polyline points="${line}" fill="none" stroke="var(--accent-color, #42a5f5)" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
      </svg>
    </div>`;
  }

  _metricBlock(key) {
    const m = AQ_METRICS[key];
    const value = this._state(key);
    const open = !!this._open[key];
    let valueHtml, trackHtml;
    if (value === null) {
      valueHtml = `<span class="val muted">\u2014</span>`;
      trackHtml = `<div class="track empty"></div>`;
    } else {
      const zi = this._zoneIndex(value, m);
      const pct = Math.max(0, Math.min(100, (value / m.max) * 100));
      const unit = m.unit ? ` <span class="unit">${m.unit}</span>` : "";
      const labels = m.zone_labels || ZONE_NAMES;
      valueHtml = `<span class="val" style="color:${m.zones[zi][1]}">${value.toFixed(m.decimals)}${unit}
        <span class="zone">${labels[zi]}</span></span>`;
      trackHtml = `<div class="track" style="background:${this._gradient(m)}">
        <div class="marker" style="left:${pct}%"></div>
      </div>`;
    }
    return `<div class="metric">
      <div class="row${open ? " open" : ""}" data-key="${key}">
        <ha-icon icon="${m.icon}"></ha-icon>
        <span class="label">${m.label}</span>
        ${valueHtml}
        ${trackHtml}
        <ha-icon class="chev" icon="mdi-chevron-down"></ha-icon>
      </div>
      ${open ? `<div class="graph">${this._graph(key)}</div>` : ""}
    </div>`;
  }

  _render() {
    if (!this._hass || !this.config) return;
    let worst = 0;
    for (const key of this.config.metrics) {
      const v = this._state(key);
      if (v !== null) {
        const m = AQ_METRICS[key];
        const zi = this._zoneIndex(v, m);
        const sev = m.zone_severity ? m.zone_severity[zi] : zi;
        if (sev > worst) worst = sev;
      }
    }
    const chipColors = [AQ_GREEN, AQ_YELLOW, AQ_RED];
    const blocks = this.config.metrics.map((k) => this._metricBlock(k)).join("");
    const el = this.shadowRoot.getElementById("body");
    if (!el) return;
    el.innerHTML = `
      <div class="head">
        <span class="roomname">${this.config.title}</span>
        <span class="chip" style="background:${chipColors[worst]}1a;color:${chipColors[worst]};border:1px solid ${chipColors[worst]}55">
          ${ZONE_NAMES[worst]}
        </span>
      </div>
      <div class="rows">${blocks}</div>`;
    el.querySelectorAll(".row").forEach((rowEl) => {
      rowEl.addEventListener("click", () => {
        const key = rowEl.getAttribute("data-key");
        this._open[key] = !this._open[key];
        if (this._open[key]) this._fetchHistory(key);
        this._render();
      });
    });
  }

  connectedCallback() {
    if (!this.shadowRoot.querySelector("style")) {
      const style = document.createElement("style");
      style.textContent = `
        :host {
          display: block;
          background: var(--card-background-color, #17181c);
          border-radius: var(--card-border-radius, 12px);
          padding: 14px 16px;
          color: var(--primary-text-color, #eaecef);
        }
        .head {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px;
        }
        .roomname {
          font-size: 1.05rem; font-weight: 600;
          letter-spacing: 0.2px;
        }
        .chip {
          font-size: 0.72rem; font-weight: 600;
          padding: 3px 10px; border-radius: 999px;
          text-transform: uppercase; letter-spacing: 0.6px;
        }
        .metric + .metric { border-top: 1px solid rgba(128,128,128,0.14); }
        .row {
          display: grid;
          grid-template-columns: 20px 74px minmax(90px, auto) 1fr 20px;
          align-items: center;
          gap: 10px;
          padding: 7px 0;
          cursor: pointer;
          user-select: none;
        }
        .row ha-icon { width: 20px; height: 20px; color: var(--secondary-text-color, #9aa0a8); }
        .row .chev { transition: transform 0.15s ease; }
        .row.open .chev { transform: rotate(180deg); }
        .label { font-size: 0.85rem; color: var(--secondary-text-color, #9aa0a8); }
        .val { font-size: 0.9rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .val .unit { font-size: 0.72rem; opacity: 0.75; }
        .val .zone {
          margin-left: 8px; font-size: 0.68rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9;
        }
        .val.muted { color: var(--secondary-text-color, #9aa0a8); }
        .track {
          position: relative;
          height: 10px; border-radius: 999px;
          background: var(--secondary-background-color, #2a2c33);
          overflow: visible;
        }
        .track.empty { opacity: 0.35; }
        .marker {
          position: absolute; top: -3px;
          width: 4px; height: 16px; border-radius: 2px;
          background: var(--primary-text-color, #fff);
          box-shadow: 0 0 0 1.5px rgba(0,0,0,0.55);
          transform: translateX(-50%);
        }
        .graph {
          padding: 6px 0 12px 30px;
        }
        .gwrap svg { width: 100%; height: 110px; display: block; border-radius: 6px; }
        .glab {
          font-size: 0.72rem; color: var(--secondary-text-color, #9aa0a8);
          margin-bottom: 6px;
        }
        .gstatus {
          font-size: 0.78rem; color: var(--secondary-text-color, #9aa0a8);
          padding: 12px 0;
        }
      `;
      this.shadowRoot.appendChild(style);
    }
    if (!this.shadowRoot.getElementById("body")) {
      const body = document.createElement("div");
      body.id = "body";
      this.shadowRoot.appendChild(body);
    }
  }
}

customElements.define("aq-room-card", AqRoomCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "aq-room-card")) {
  window.customCards.push({
    type: "aq-room-card",
    name: "AQ Room Card",
    description: "Room air quality overview with zoned bar gauges and expandable 7-day history",
    preview: true,
    documentationURL: "https://github.com/strid3r21/lovelace-aq-room-card",
  });
}
