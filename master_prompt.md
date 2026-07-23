# MASTER PROMPT: "Dabang" Analytics Dashboard Template

## Role

You are a senior front-end engineer. Build a pixel-faithful, responsive, production-quality admin dashboard template based on the specification below. Use **React + TypeScript + Tailwind CSS + Recharts** (or the stack the project already uses). All UI copy, identifiers, and comments in English. Use mock data — no backend required — but structure every widget so data comes from typed props/fixtures, never hardcoded inside components.

## Global Design System

- **Theme**: light, airy SaaS aesthetic. Page background `#FAFBFC`; all cards white `#FFFFFF`, border-radius ~16px, very soft shadow (`0 4px 20px rgba(238,238,238,0.5)`), generous padding (~24px), 24px gutters between cards.
- **Primary color**: violet `#5D5FEF` / `#7C3AED` gradient family (sidebar active state, brand).
- **Accent palette**: red/coral `#EF4444`, orange/amber `#F59E0B`, green/emerald `#10B981`, blue `#0EA5E9`, magenta `#BF00FF`, yellow `#FCB859`.
- **Typography**: a geometric sans (Poppins or Inter). Card titles: 18–20px semibold, near-black `#151D48`. Secondary text: 12–14px, muted gray `#737791`.
- **Layout**: fixed left sidebar (~260px), top navbar, main content area with a 12-column CSS grid.

## Structure

### 1. Sidebar (fixed left)

- Brand row: rounded violet gradient logo mark + wordmark **"Dabang"** (bold, dark).
- Nav items with line icons: Dashboard (active), Leaderboard, Order, Products, Sales Report, Messages, Settings, Sign Out.
- Active item: fully rounded-xl pill filled with violet gradient, white icon + label. Inactive: gray icon + label, hover state with light violet tint.
- Bottom promo card: violet gradient rounded-2xl card with a small logo badge, title **"Dabang Pro"**, caption "Get access to all features on tetumbas", and a white pill button **"Get Pro"**.

### 2. Top Navbar

- Left: page title **"Dashboard"** (24–28px bold).
- Center: search input — light gray `#F9FAFB` rounded-full field, violet magnifier icon, placeholder "Search here...".
- Right: language selector (US flag + "Eng (US)" + chevron), notification bell icon with red dot badge inside a pale yellow rounded square, then user avatar + name **"Musfiq"** with role caption **"Admin"** and a chevron dropdown.

### 3. Main Grid (three rows)

**Row 1**

- **Today's Sales** card (~2/3 width): header with title "Today's Sales", subtitle "Sales Summary", and an outlined **Export** button (download icon) top-right. Below, 4 stat tiles in a row, each a soft pastel rounded-2xl block with a colored circular icon on top:
  1. Pale red tile — red icon — **$1k**, "Total Sales", caption "+8% from yesterday" in red.
  2. Pale orange tile — orange icon — **300**, "Total Order", "+5% from yesterday" in orange.
  3. Pale green tile — green check icon — **5**, "Product Sold", "+1,2% from yesterday" in green.
  4. Pale purple tile — purple users icon — **8**, "New Customers", "0,5% from yesterday" in purple.
- **Visitor Insights** card (~1/3 width): smooth multi-line chart, months Jan–Dec on X axis, three curved series — Loyal Customers (magenta), New Customers (red, with one highlighted dot marker + dashed vertical reference line), Unique Customers (green). Legend below with colored squares.

**Row 2** (three equal cards)

- **Total Revenue**: grouped bar chart, days Monday–Sunday, two series per day — Online Sales (blue `#0095FF`) and Offline Sales (green `#00E096`) — rounded bar tops, Y axis 0–25k with gridlines, legend with dot markers below.
- **Customer Satisfaction**: two smooth area/line charts stacked visually — Last Month (blue line, light blue gradient fill) and This Month (teal/green line, light fill on top). Footer split in two halves separated by a vertical divider: "Last Month **$3,004**" and "This Month **$4,504**", each with a small line-style legend marker.
- **Target vs Reality**: paired bar chart Jan–July, Reality Sales (green) vs Target Sales (yellow), rounded bars. Below the chart, two legend rows: green icon chip + "Reality Sales / Global" with green value **8.823**; yellow icon chip + "Target Sales / Commercial" with yellow value **12.122**.

**Row 3**

- **Top Products** (~1/2 width): table with columns `#`, Name, Popularity, Sales. 4 rows:

  | #   | Name                         | Popularity bar color | Sales badge |
  | --- | ---------------------------- | -------------------- | ----------- |
  | 01  | Home Decor Range             | blue                 | 45%         |
  | 02  | Disney Princess Pink Bag 18' | green                | 29%         |
  | 03  | Bathroom Essentials          | purple               | 18%         |
  | 04  | Apple Smartwatches           | orange               | 25%         |

  Popularity is a thin rounded progress bar (filled portion in the series color, track in a pale tint). Sales is an outlined pill badge in the matching color.

- **Sales Mapping by Country** (~1/4): world map (use `react-simple-maps` or an inline SVG) with countries in light gray and highlighted fills: USA orange, Brazil red, China purple, Indonesia green, plus one blue region.
- **Volume vs Service Level** (~1/4): stacked bar chart (~6 bars), bottom segment blue (Volume), top segment green (Services), rounded tops. Footer legend: "Volume **1,135**" and "Services **635**" separated by a divider.

## Behavior & Quality Requirements

- **Responsive**: 3-column grid on desktop, 2 on tablet, 1 on mobile; sidebar collapses to a hamburger/drawer below `lg`.
- Charts must be responsive containers with tooltips on hover; no fixed pixel widths.
- Sidebar navigation is client-side routing-ready (active state driven by route).
- Extract reusable components: `StatTile`, `ChartCard` (title + optional action slot), `ProgressBar`, `Badge`, `SidebarItem`.
- All mock data lives in a single `data/mock.ts` fixture file, typed with interfaces.
- Accessible: semantic landmarks (`nav`, `main`, `header`), alt text, visible focus states, WCAG AA contrast for text (pastel tiles keep dark text).
- Deliver: component files, mock data file, and a single dashboard page assembling everything. It must run with zero console errors.
