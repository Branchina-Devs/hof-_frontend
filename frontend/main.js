const API = 'http://localhost:3000/api';

// ── Derive the raw.githubusercontent.com base URL from a GitHub repo URL
// e.g. https://github.com/Branchina-Devs/my-project
//   → https://raw.githubusercontent.com/Branchina-Devs/my-project/refs/heads/main/
function rawBaseUrl(repoGit) {
  if (!repoGit) return null;
  const parts = repoGit.replace(/\/$/, '').split('/');
  // parts: ['https:', '', 'github.com', 'owner', 'repo']
  const owner = parts[3];
  const repo  = parts[4];
  if (!owner || !repo) return null;
  return `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/main/`;
}

// ── Fetch GitHub profile data for a username
async function fetchGitHubUser(username) {
  if (!username) return null;
  try {
    const data = await fetch(`https://api.github.com/users/${username}`).then(r => r.json());
    if (data.message) return null; // e.g. "Not Found"
    return {
      avatar: data.avatar_url || '',
      displayName: data.name || username,
      ghUser: username,
    };
  } catch {
    return null;
  }
}

// ── Fetch actual contributors from the GitHub repository
async function fetchGitHubContributors(repoGit) {
  if (!repoGit) return [];
  const parts = repoGit.replace(/\/$/, '').split('/');
  const owner = parts[3];
  const repo  = parts[4];
  if (!owner || !repo) return [];

  try {
    const data = await fetch(`https://api.github.com/repos/${owner}/${repo}/contributors`).then(r => r.json());
    if (!Array.isArray(data)) return [];

    // Fetch full profile for each contributor to get their real name
    return await Promise.all(
      data.map(async (c) => {
        const profile = await fetchGitHubUser(c.login);
        return {
          avatar: c.avatar_url || '',
          displayName: profile && profile.displayName ? profile.displayName : c.login,
          ghUser: c.login
        };
      })
    );
  } catch {
    return [];
  }
}

// ── Load all projects and populate the left sidebar with year grouping
async function loadProjects() {
  try {
    const progetti = await fetch(`${API}/progetti`).then(r => r.json());

    const list = document.getElementById('projectList');

    if (!progetti.length) {
      list.innerHTML = '<p style="font-family:var(--serif);font-style:italic;font-size:0.85rem;color:var(--ink3);padding:1rem 0;">Nessun progetto presente.</p>';
      return;
    }

    // ── Group projects by year
    const projectsByYear = {};
    progetti.forEach(p => {
      const year = p.Data_P ? new Date(p.Data_P).getFullYear() : 'Senza Data';
      if (!projectsByYear[year]) projectsByYear[year] = [];
      projectsByYear[year].push(p);
    });

    // ── Sort years in descending order (newest first)
    const years = Object.keys(projectsByYear).sort((a, b) => {
      if (a === 'Senza Data') return 1;
      if (b === 'Senza Data') return -1;
      return Number(b) - Number(a);
    });

    // ── Sort projects within each year by date (newest first)
    years.forEach(year => {
      projectsByYear[year].sort((a, b) => {
        const dateA = a.Data_P ? new Date(a.Data_P).getTime() : 0;
        const dateB = b.Data_P ? new Date(b.Data_P).getTime() : 0;
        return dateB - dateA;
      });
    });

    // ── Render year groups
    list.innerHTML = '';
    years.forEach((year, yearIndex) => {
      const yearGroup = document.createElement('div');
      yearGroup.className = 'year-group';

      const yearHeader = document.createElement('div');
      yearHeader.className = 'year-header';
      yearHeader.dataset.year = year;
      yearHeader.innerHTML = `
        <div class="year-label">${year}</div>
        <span class="year-count">${projectsByYear[year].length}</span>
      `;

      const projectsContainer = document.createElement('div');
      projectsContainer.className = 'year-projects';
      projectsContainer.style.maxHeight = yearIndex === 0 ? '999px' : '0';
      projectsContainer.dataset.expanded = yearIndex === 0 ? 'true' : 'false';

      // ── Render projects within year
      projectsByYear[year].forEach((p, i) => {
        const el = document.createElement('div');
        el.className = 'project-item';
        el.dataset.id = p.id_p;

        const date = p.Data_P
          ? new Date(p.Data_P).toLocaleDateString('it-IT', { year: 'numeric', month: 'long' })
          : '';

        el.innerHTML = `
          <div class="project-item-num">№ ${String(i + 1).padStart(2, '0')}</div>
          <div class="project-item-name">${esc(p.Nome_P)}</div>
          ${date ? `<div class="project-item-date">${date}</div>` : ''}
        `;

        el.addEventListener('click', () => openProject(p));
        projectsContainer.appendChild(el);
      });

      // ── Year header click handler for expand/collapse
      yearHeader.addEventListener('click', (e) => {
        const isExpanded = projectsContainer.dataset.expanded === 'true';
        projectsContainer.style.maxHeight = isExpanded ? '0' : '999px';
        projectsContainer.dataset.expanded = !isExpanded;
        yearGroup.classList.toggle('expanded');
      });

      yearGroup.appendChild(yearHeader);
      yearGroup.appendChild(projectsContainer);
      list.appendChild(yearGroup);
    });

    // ── Expand first year by default
    if (years.length > 0) {
      const firstYearGroup = list.querySelector('.year-group');
      firstYearGroup?.classList.add('expanded');
    }

  } catch {
    document.getElementById('projectList').innerHTML =
      '<p style="font-family:var(--mono);font-size:0.72rem;color:#8b1a1a;padding:1rem 0;">Errore: backend non raggiungibile.</p>';
  }
}

// ── Open and render a project
async function openProject(progetto) {
  // Mark active in sidebar
  document.querySelectorAll('.project-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id == progetto.id_p));

  // Show loading state
  document.getElementById('mainContent').innerHTML =
    '<div class="state-loading-msg"><span class="loading-dots">Caricamento articolo</span></div>';

  // Update masthead right corner with logo and project info
  const date = progetto.Data_P
    ? new Date(progetto.Data_P).toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  document.getElementById('mastheadRight').innerHTML = `
    <div class="masthead-right-text">
      <em style="font-family:var(--serif);font-style:italic;">${esc(progetto.Nome_P)}</em><br/>${date}
    </div>
    <img src="branchina_logo.png" alt="Branchina" class="masthead-logo"/>`;

  // Fetch README sections from backend
  let sections = [];
  try {
    const data = await fetch(`${API}/readme/${progetto.id_p}`).then(r => r.json());
    if (Array.isArray(data) && data[0]?.sections) sections = data[0].sections;
  } catch { /* silently continue with empty sections */ }

  // Get authors from GitHub contributors
  let authors = await fetchGitHubContributors(progetto.repo_git);
  
  renderArticle(progetto, sections, authors);
}

// ── Render the full article view
function renderArticle(progetto, sections, authors) {
  const h1      = sections.find(s => s.level === 1);
  const h2Sections = sections.filter(s => s.level === 2);
  const h3      = sections.find(s => s.level === 3);
  const h4      = sections.find(s => s.level === 4);
  const details = sections.filter(s => s.level >= 5);

  // ── Extract images from H2 sections and resolve their full raw URLs automatically
  const rawBase = rawBaseUrl(progetto.repo_git);
  const images  = [];

  h2Sections.forEach(sec => {
    const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(sec.content)) !== null) {
      const imgPath = m[2];
      // If the path is already a full URL, use it as-is; otherwise prepend the raw base
      const fullUrl = imgPath.startsWith('http') ? imgPath : (rawBase ? rawBase + imgPath : imgPath);
      images.push({ alt: m[1], url: fullUrl, label: sec.title });
    }
  });

  const date = progetto.Data_P
    ? new Date(progetto.Data_P).toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  // ── Populate right-side sommario
  const indexItems = details.map((s, i) => {
    const anchor = slug(s.title);
    return `<li data-level="${s.level}"><a href="#${anchor}"><span class="index-num">${i + 1}.</span> ${esc(s.title)}</a></li>`;
  }).join('');

  document.getElementById('indexList').innerHTML = indexItems ||
    '<li style="font-family:var(--serif);font-style:italic;font-size:0.8rem;color:var(--ink3);padding:0.5rem 0;border:none;">—</li>';

  // ── Carousel HTML
  let figureHtml = '';
  if (images.length) {
    const slidesHtml = images.map(img =>
      `<div class="carousel-slide"><img src="${esc(img.url)}" alt="${esc(img.alt)}"/></div>`
    ).join('');

    const arrows = images.length > 1 ? `
      <button class="carousel-btn prev" id="carPrev">&#8249;</button>
      <button class="carousel-btn next" id="carNext">&#8250;</button>` : '';

    figureHtml = `
      <div class="figure-block">
        <div class="figure-caption-top">Fig. — ${esc(h2Sections[0]?.title || 'Immagini')}</div>
        <div class="carousel" id="carousel">
          <div class="carousel-slides" id="carSlides">${slidesHtml}</div>
          ${arrows}
        </div>
        <div class="figure-caption-bottom">
          <span id="carLabel" style="font-style:italic;">${esc(images[0]?.label || '')}</span>
          ${images.length > 1 ? `<span class="carousel-counter" id="carCounter">1 / ${images.length}</span>` : ''}
        </div>
      </div>`;
  }

  // ── Abstract (H3) — falls back to Descrizione_P from the DB
  const abstractHtml = (h3 || progetto.Descrizione_P) ? `
    <div class="abstract-block">
      <div class="abstract-label">Abstract</div>
      <div class="abstract-text">${h3 ? renderMd(h3.content) : esc(progetto.Descrizione_P)}</div>
    </div>` : '';

  // ── Authors
  const authorsHtml = authors.length ? `
    <div class="authors-block">
      <div class="authors-label">Autori</div>
      <div class="authors-list">
        ${authors.map(a => `
          <div class="author-card">
            <a href="https://github.com/${esc(a.ghUser)}" target="_blank" class="author-avatar" style="text-decoration:none;">
              ${a.avatar ? `<img src="${esc(a.avatar)}" alt="${esc(a.displayName)}"/>` : '👤'}
            </a>
            <div>
              <div class="author-name">${esc(a.displayName)}</div>
              ${a.ghUser ? `<a href="https://github.com/${esc(a.ghUser)}" target="_blank" class="author-gh" style="text-decoration:none; color:inherit;">@${esc(a.ghUser)}</a>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  // ── Detail sections (H5+)
  const detailsHtml = details.length ? `
    <hr class="sections-divider"/>
    ${details.map((s, i) => `
      <div class="detail-section" id="${slug(s.title)}">
        <div class="detail-section-heading">
          <span class="section-num">${i + 1}.</span>${esc(s.title)}
        </div>
        <div class="detail-content">${renderMd(s.content)}</div>
      </div>`).join('')}` : '';

  // ── Inject article
  document.getElementById('mainContent').innerHTML = `
    <div class="article">
      <div class="article-header">
        ${date ? `<div class="article-label">${date}</div>` : ''}
        <h1 class="article-title">${esc(h1 ? h1.title : progetto.Nome_P)}</h1>
        <div class="article-meta">
          ${progetto.repo_git ? `<a class="btn-link" href="${esc(progetto.repo_git)}" target="_blank">↗ Repository GitHub</a>` : ''}
          ${h4 ? `<span style="color:var(--rule)">·</span><span class="license-badge">${esc(h4.title)}</span>` : ''}
        </div>
      </div>
      ${figureHtml}
      ${abstractHtml}
      ${authorsHtml}
      ${detailsHtml}
      <div class="article-footer">Hall of Fame · Istituto Branchina · Archivio Digitale</div>
    </div>`;

  // ── Init carousel controls
  if (images.length > 1) {
    let cur = 0;
    const slides  = document.getElementById('carSlides');
    const label   = document.getElementById('carLabel');
    const counter = document.getElementById('carCounter');

    const go = n => {
      cur = (n + images.length) % images.length;
      slides.style.transform = `translateX(-${cur * 100}%)`;
      if (label)   label.textContent   = images[cur]?.label || '';
      if (counter) counter.textContent = `${cur + 1} / ${images.length}`;
    };

    document.getElementById('carPrev').addEventListener('click', () => go(cur - 1));
    document.getElementById('carNext').addEventListener('click', () => go(cur + 1));
  }
}

// ── Minimal markdown → HTML renderer
function renderMd(md) {
  if (!md) return '';

  // Split code blocks out first so we don't escape their contents
  const parts = [];
  let last = 0;
  const codeRe = /```(\w*)\n([\s\S]*?)```/g;
  let m;
  while ((m = codeRe.exec(md)) !== null) {
    parts.push({ t: 'text', v: md.slice(last, m.index) });
    parts.push({ t: 'code', v: m[2] });
    last = m.index + m[0].length;
  }
  parts.push({ t: 'text', v: md.slice(last) });

  return parts.map(p => {
    if (p.t === 'code') return `<pre><code>${esc(p.v.trim())}</code></pre>`;

    let h = esc(p.v);
    h = h.replace(/`([^`]+)`/g,          '<code>$1</code>');
    h = h.replace(/\*\*([^*]+)\*\*/g,    '<strong>$1</strong>');
    h = h.replace(/\*([^*\n]+)\*/g,      '<em>$1</em>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    h = h.replace(/((?:^|\n)(?:- .+)(?:\n- .+)*)/g, blk => {
      const items = blk.trim().split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    });

    h = h.replace(/((?:^|\n)(?:\d+\. .+)(?:\n\d+\. .+)*)/g, blk => {
      const items = blk.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
      return `<ol>${items}</ol>`;
    });

    h = h.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>');
    return `<p>${h}</p>`.replace(/<p>\s*<\/p>/g, '');
  }).join('');
}

// ── Helpers
function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Boot
loadProjects();
