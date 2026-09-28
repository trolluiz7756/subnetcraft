<p align="center"><img src="assets/logo.png" alt="SubnetCraft logo" width="200" /></p>

# SubnetCraft — Plan, split and document IP networks

**English** · [Español](README.es.md)

A browser-based suite for planning and calculating IP networks. It works for beginners (guided flows, plain-language explanations) and for experienced engineers (fast inputs, exports, keyboard shortcuts, device configuration).

Everything runs in your browser. There is no backend, no build step, and no dependencies to install.

## Tools

| # | Tab | What it does |
|---|-----|--------------|
| 01 | **Visual splitter** | Split a network into subnets by clicking, as an interactive tree table. |
| 02 | **VLSM planner** | Tell it how many hosts each network needs and it sizes and places every subnet. |
| 03 | **IPv4 calculator** | Network, broadcast, masks, host range, binary view, and a plain-language summary. |
| 04 | **IPv6 calculator** | A guided plan for first-timers, plus a full calculator and subnet lister. |
| 05 | **Tools** | Is this IP in the network?, mask converter, route summarization, overlap detection. |

### Visual splitter
- Click a colored cell to split a subnet in two; click a parent cell to join it back.
- Modes: **Standard**, **AWS**, **Azure** and **OCI**, each with its own minimum subnet size and reserved addresses.
- Per-subnet VLAN and note, plus a suggested gateway and DHCP range.
- Save named **projects** (your work is also autosaved as a draft and restored on reload).
- Export: **copy the image to the clipboard** (to paste into documents), **PNG** (up to 4x resolution), **SVG** (vector, no quality loss with many subnets), copy the table, or **CSV**.
- Send every subnet to the IPv4 calculator's saved list, or **share a link** that restores your work.

### VLSM planner
- Enter a name, VLAN and number of hosts per network, choose a growth margin (0 to 100 %), and get the exact subnet for each one, packed without gaps.
- A live suggestion tells you whether your base prefix is too small, just right, or much larger than needed.
- Usage bar with a legend, free-space blocks, and a table with mask, capacity, gateway, DHCP and usable range.
- Generates **device configuration** for Cisco IOS, MikroTik RouterOS, FortiGate and Linux (iproute2 + dnsmasq) in Standard mode.

### IPv4 calculator
- Accepts `192.168.1.10/24`, `192.168.1.10 255.255.255.0`, a `/24` prefix, a dotted mask, or a wildcard.
- Explains the result in plain language and shows how the 32 bits split between network and hosts.
- Save subnets with a VLAN and a gateway suggestion, reopen them, or send them to the splitter.

### IPv6
- **Guided plan**: generates a private ULA `/48` (or uses your own prefix), assigns a subnet per VLAN, and exports the result.
- **Calculator**: compressed and expanded forms, network, first/last address, totals, address type, and a subnet lister. No IPv6 knowledge required; examples and a short glossary are built in.

### Tools
- Is this IP inside this network?
- Mask / wildcard / CIDR converter.
- Route summarization (aggregation), including the single covering supernet.
- Overlap detection, optionally loading the calculator's saved subnets.

## Everyday conveniences
- Spanish and English, switchable anytime from the header (remembers your choice).
- Light and dark themes.
- **Help** menu with task shortcuts, and `?` tooltips next to technical terms.
- Click any result value to copy it.
- `Alt+1` … `Alt+5` switch tabs.
- Shareable links for the splitter and the calculator.

## Running it locally

The app uses ES modules, so it must be served over HTTP (opening `index.html` directly with `file://` will not work).

```bash
cd path/to/the/project/folder
python -m http.server 8000
```

Then open <http://localhost:8000>. Any static server works, for example the VS Code *Live Server* extension.

## Privacy

Nothing is sent anywhere. Your data stays in your browser (`localStorage`): saved subnets, projects, the splitter draft, theme and small UI preferences. Shared links carry the state inside the URL fragment (`#…`), which browsers do not send to servers.

Fonts (Space Grotesk and JetBrains Mono) are loaded from Google Fonts; offline, the app falls back to system fonts.

## Project layout

| File | Purpose |
|------|---------|
| `index.html` | Page structure and tabs |
| `style.css` | Styles, themes and layout |
| `main.js` | Tabs, theme, Help menu, copy-on-click, shortcuts |
| `ip-utils.js` | IPv4 math and input parsing |
| `ipv6-utils.js` | IPv6 math (BigInt) |
| `modes.js` | Standard / AWS / Azure / OCI addressing rules |
| `calculator.js` | IPv4 calculator and saved subnets |
| `ipv6.js` | IPv6 guided plan and calculator |
| `planner.js` | VLSM planner and device configuration |
| `subnet-splitter.js` | Visual splitter, projects, exports, share links |
| `splitter-image.js` | High-resolution PNG and SVG rendering |
| `tools.js` | Utility tools |

`index.html` loads scripts and styles with a version query (`?v=N`). Bump `N` after changing files so browsers do not serve cached copies.

## Notes and limitations
- Cloud modes follow the reserved-address rules of AWS, Azure and OCI. Device configuration is only generated in Standard mode, because in the clouds the gateway and DHCP are managed by the platform.
- Generated device configuration is a starting point. **Review it before applying it to real equipment.**
- Copying an image to the clipboard needs a secure context (`localhost` or HTTPS) and a browser that supports it; otherwise use the PNG download.
- Requires a modern browser (it relies on ES modules, `BigInt`, `color-mix()` and `:has()`).
- The utility tools are IPv4 only.

## Ideas for the future
- Combined IPv4 + IPv6 (dual-stack) plan.
- Printable/PDF report and Terraform export for the clouds.
- Undo/redo in the splitter and CSV import.
- Publishing as a static site (for example GitHub Pages) and offline support.

## License

[MIT](LICENSE) — see the LICENSE file for the full text.
