# aq-room-card

A Home Assistant Lovelace custom card showing a room air-quality overview.
Each metric is displayed as a horizontal bar with colored good / moderate / poor
zones and a marker at the current value.

## Install

Option A — resource URL (no HACS needed):

Dashboard menu → Resources → Add → URL:
`https://raw.githubusercontent.com/strid3r21/lovelace-aq-room-card/main/aq-room-card.js`
(type: JavaScript module)

Option B — HACS: add this repo as a custom plugin, then use the resource URL
`/hacsfiles/lovelace-aq-room-card/aq-room-card.js`.

## Usage

```yaml
type: custom:aq-room-card
room: Living Room        # required
title: Living Room       # optional display override
prefix: sensor.air_quality_   # required, entity id prefix
metrics: [co2, pm2_5, pm1_0, pm10_0, voc_index]   # optional
```

### Expected entities (suffix appended to `prefix`)

| key       | entity suffix | scale        | zones (good → moderate → poor) |
|-----------|---------------|--------------|--------------------------------|
| co2       | `co2`         | 0–2000 ppm   | 800 / 1200                     |
| pm2_5     | `pm2_5`       | 0–50 µg/m³   | 12 / 35.4                      |
| pm1_0     | `pm1_0`       | 0–20 µg/m³   | 4 / 15                         |
| pm10_0    | `pm10_0`      | 0–100 µg/m³  | 15 / 45                        |
| voc_index | `voc_index`   | 0–200        | 50 / 100                       |

The card also shows an overall status chip (Good / Moderate / Poor) based on
the worst metric, and adapts to the active theme.
