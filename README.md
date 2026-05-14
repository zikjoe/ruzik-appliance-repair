# Ruzik Appliance Repair & Handyman Services

**Owner:** Isaac-Josiah Olumor  
**Location:** Atlanta, GA (Fulton County)  
**Service Area:** Atlanta metro — Fulton, DeKalb, Cobb, Gwinnett counties

---

## Project Overview

Static website built with plain HTML, CSS, and JavaScript.  
Hosted on Netlify (free). Code stored on GitHub.  
No frameworks. No build tools. No dependencies.

---

## Folder Structure

```
ruzik-appliance-repair/
├── assets/
│   ├── css/
│   │   ├── main.css            ← global styles, variables, reset
│   │   ├── components.css      ← nav, footer, buttons, cards
│   │   ├── animations.css      ← all animation/transition code
│   │   └── pages/              ← page-specific styles
│   ├── js/
│   │   ├── main.js             ← nav, mobile menu, global behavior
│   │   ├── form.js             ← lead capture form logic
│   │   └── analytics.js        ← Google Analytics events
│   └── images/
│       ├── logo/
│       ├── services/
│       └── team/
├── services/                   ← individual service pages
├── brands/                     ← individual brand pages
├── blog/                       ← SEO blog posts
├── index.html                  ← homepage
├── about.html
├── contact.html
├── service-area.html
├── services.html
├── 404.html
├── sitemap.xml                 ← update when adding new pages
├── robots.txt
└── netlify.toml                ← Netlify deployment config
```

---

## Development

Open any HTML file with VS Code Live Server:
- Right-click the file → Open with Live Server
- Or press Alt+L then Alt+O

No build step needed. Edit and save — browser refreshes automatically.

---

## Deployment

Push to GitHub → Netlify auto-deploys within 30 seconds.

```bash
git add .
git commit -m "your message here"
git push
```

---

## Adding a New Page

1. Create the .html file in the right folder
2. Copy the HTML boilerplate from an existing page
3. Update the title, meta description, and h1
4. Add the page URL to sitemap.xml
5. Link to it from a relevant existing page

---

## Contact & Business Info

- Phone: 678-824-5161
- Email: ruzikrepairs@gmail.com
- Service ZIP codes: 30301-30354 and surrounding

---

## Phase Log

- [ ] Phase 1 — Infrastructure (GitHub, Netlify, domain)
- [ ] Phase 2 — Website build
- [ ] Phase 3 — SEO architecture
- [ ] Phase 4 — Lead capture system
- [ ] Phase 5 — Blog content
- [ ] Phase 6 — Reviews & GBP
