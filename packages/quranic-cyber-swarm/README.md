# quranic-cyber-swarm

A consent-first Web Component for a local visual swarm simulation. It renders on a canvas inside Shadow DOM and does not fetch external websites, inspect host pages, or transmit user data.

## Browser usage

```html
<quranic-swarm count="57" max="300" balance="33"></quranic-swarm>
<script type="module" src="https://elazzouz-dotcom.github.io/quranic-swarm.js"></script>
```

The component accepts these attributes:

- `count`: initial number of agents; clamped to 1–300.
- `max`: maximum number of agents; clamped to 300.
- `balance`: displayed balance target from 1–100.

## NPM usage

The package is prepared in this repository but is **not published automatically**. To publish it, a maintainer must review the package, authenticate to npm, and explicitly run:

```bash
cd packages/quranic-cyber-swarm
npm publish --access public
```

No install or publish action is performed by the website.

## Privacy and limits

The component uses local animation state only. It does not use `fetch`, `innerHTML`, cross-origin scraping, hidden background execution, cryptocurrency mining, or telemetry. Offline caching is handled separately by the Slaks site Service Worker and only after the user visits the site.

This simulation is educational and visual; its Quranic labels are presentation metadata, not scientific validation or a religious ruling.
