/* aq-room-card — Home Assistant custom card
 * Room air-quality overview: each metric shown as a horizontal bar with
 * colored good/moderate/bad zones and a marker at the current value.
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
    label: "PM2.5", icon: "mdi:carbon-monoxide", unit: "\u00b5g/m\u00b3", suffix: "pm2_5",
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
};

const ZONE_NAMES = ["Good", "Moderate", "Poor"];

class AqRoomCard extends HTMLElement {
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

  _metricRow(key) {
    const m = AQ_METRICS[key];
    const value = this._state(key);
    if (value === null) {
      return `<div class="row">
        <ha-icon .icon="${m.icon}"></ha-icon>
        <span class="label">${m.label}</span>
        <span class="val muted">\u2014</span>
        <div class="track empty"></div>
      </div>`;
    }
    const zi = this._zoneIndex(value, m);
    const pct = Math.max(0, Math.min(100, (value / m.max) * 100));
    const unit = m.unit ? ` <span class="unit">${m.unit}</span>` : "";
    return `<div class="row">
      <ha-icon .icon="${m.icon}"></ha-icon>
      <span class="label">${m.label}</span>
      <span class="val" style="color:${m.zones[zi][1]}">${value.toFixed(m.decimals)}${unit}
        <span class="zone">${ZONE_NAMES[zi]}</span></span>
      <div class="track" style="background:${this._gradient(m)}">
        <div class="marker" style="left:${pct}%"></div>
      </div>
    </div>`;
  }

  _render() {
    if (!this._hass || !this.config) return;
    let worst = 0;
    for (const key of this.config.metrics) {
      const v = this._state(key);
      if (v !== null) {
        const zi = this._zoneIndex(v, AQ_METRICS[key]);
        if (zi > worst) worst = zi;
      }
    }
    const chipColors = [AQ_GREEN, AQ_YELLOW, AQ_RED];
    const rows = this.config.metrics.map((k) => this._metricRow(k)).join("");
    const el = this.shadowRoot.getElementById("body");
    if (!el) return;
    el.innerHTML = `
      <div class="head">
        <span class="roomname">${this.config.title}</span>
        <span class="chip" style="background:${chipColors[worst]}1a;color:${chipColors[worst]};border:1px solid ${chipColors[worst]}55">
          ${ZONE_NAMES[worst]}
        </span>
      </div>
      <div class="rows">${rows}</div>`;
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
        .row {
          display: grid;
          grid-template-columns: 20px 74px minmax(90px, auto) 1fr;
          align-items: center;
          gap: 10px;
          padding: 7px 0;
        }
        .row + .row { border-top: 1px solid rgba(128,128,128,0.14); }
        .row ha-icon { width: 20px; height: 20px; color: var(--secondary-text-color, #9aa0a8); }
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
    description: "Room air quality overview with zoned bar gauges",
    preview: true,
    documentationURL: "http://192.168.1.7:8130/",
  });
}
