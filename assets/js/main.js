(() => {
  const IMG_VERSION = '20261021';

  const PROJECTS = [
    {
      img: 'assets/images/covers/rc-wheelleg.webp',
      titleKey: 'projects.item0.title',
      descKey: 'projects.item0.desc',
      featured: true,
      tags: ['Reinforcement Learning', 'MuJoCo / mjlab', 'Sim2Real', 'ROS 2', 'TensorRT', 'C++'],
      links: [
        { href: 'rc-wheelleg.html', labelKey: 'projects.links.detail', icon: 'fas fa-book-open' },
        { href: 'playground.html', labelKey: 'projects.links.playground', icon: 'fas fa-robot' },
        { href: 'https://github.com/zeitvex/RC_WheelLeg', labelKey: 'projects.links.code', icon: 'fab fa-github' },
      ],
    },
    {
      img: 'assets/images/covers/humanoid.webp',
      titleKey: 'projects.item1.title',
      descKey: 'projects.item1.desc',
      tags: ['RDK X5', 'SolidWorks', 'URDF', 'VR Teleoperation', 'IK', 'Node.js'],
      links: [],
    },
    {
      img: 'assets/images/covers/vision-gimbal.webp',
      titleKey: 'projects.item2.title',
      descKey: 'projects.item2.desc',
      tags: ['YOLOv5', 'MaixCAM', 'MSPM0G3507', 'UART', 'PD Control', 'Embedded C'],
      links: [
        { href: 'https://github.com/zeitvex/NUEDC-Car-Vision', labelKey: 'projects.links.code', icon: 'fab fa-github' },
      ],
    },
    {
      img: 'assets/images/covers/go2-isaacsim.webp',
      titleKey: 'projects.item3.title',
      descKey: 'projects.item3.desc',
      tags: ['Isaac Sim', 'ROS 2', 'PPO', 'Unitree GO2', 'PaddleOCR', 'Orin NX'],
      links: [],
    },
    {
      img: 'assets/images/covers/servo-quadruped.webp',
      titleKey: 'projects.item4.title',
      descKey: 'projects.item4.desc',
      tags: ['Ascend CANN', 'ModelArts', 'Serial Bus Servo', 'Gait Control', 'Huawei Cloud'],
      links: [],
    },
    {
      img: 'assets/images/covers/so-arm100.webp',
      titleKey: 'projects.item5.title',
      descKey: 'projects.item5.desc',
      tags: ['LeRobot', 'SO-ARM100', 'RDK X5', 'Docker', 'YOLO Quantization'],
      links: [],
    },
    {
      img: 'assets/images/covers/logistics-car.webp',
      titleKey: 'projects.item6.title',
      descKey: 'projects.item6.desc',
      tags: ['ESP32-S3', 'PlatformIO', 'Closed-loop Stepper', 'Mecanum', 'ROS'],
      links: [],
    },
    {
      img: 'assets/images/covers/orchard.webp',
      titleKey: 'projects.item7.title',
      descKey: 'projects.item7.desc',
      tags: ['YOLOv5', 'STM32', '3D Printing', 'ESP32', 'Line Tracking'],
      links: [],
    },
    {
      img: 'assets/images/covers/algorithm-elite.webp',
      titleKey: 'projects.item8.title',
      descKey: 'projects.item8.desc',
      tags: ['ROS', 'SLAM', 'RPLIDAR A1', 'Costmap', 'Pan-Tilt Control'],
      links: [],
    },
    {
      img: 'assets/images/covers/auto-car.webp',
      titleKey: 'projects.item9.title',
      descKey: 'projects.item9.desc',
      tags: ['MSPM0G3507', 'IMU', 'Encoder', 'PID', 'Line Tracking'],
      links: [],
    },
  ];

  const DOCUMENTS = [
    {
      titleKey: 'documents.item0.title',
      descKey: 'documents.item0.desc',
      links: [
        { href: 'https://github.com/zeitvex/RC_WheelLeg', labelKey: 'projects.links.code', icon: 'fab fa-github' },
      ],
    },
    {
      titleKey: 'documents.item1.title',
      descKey: 'documents.item1.desc',
      links: [
        { href: 'https://github.com/zeitvex/NUEDC-Car-Vision', labelKey: 'projects.links.code', icon: 'fab fa-github' },
      ],
    },
    {
      titleKey: 'documents.item2.title',
      descKey: 'documents.item2.desc',
      links: [
        { href: 'mailto:zeitvex@qq.com?subject=Resume%20Request', labelKey: 'documents.links.resume', icon: 'fas fa-envelope' },
      ],
    },
    {
      titleKey: 'documents.item3.title',
      descKey: 'documents.item3.desc',
      links: [
        { href: 'https://github.com/zeitvex', labelKey: 'documents.links.profile', icon: 'fab fa-github' },
      ],
    },
  ];

  const AWARDS = [
    { year: '2026', level: 'first', titleKey: 'awards.item0.title', descKey: 'awards.item0.desc' },
    { year: '2025', level: 'first', titleKey: 'awards.item1.title', descKey: 'awards.item1.desc' },
    { year: '2025', level: 'second', titleKey: 'awards.item2.title', descKey: 'awards.item2.desc' },
    { year: '2025', level: 'third', titleKey: 'awards.item3.title', descKey: 'awards.item3.desc' },
    { year: '2025', level: 'second', titleKey: 'awards.item4.title', descKey: 'awards.item4.desc' },
    { year: '2024', level: 'second', titleKey: 'awards.item5.title', descKey: 'awards.item5.desc' },
  ];

  const TIMELINE_EVENTS = [
    'timeline.event0',
    'timeline.event1',
    'timeline.event4',
    'timeline.event2',
    'timeline.event3',
    'timeline.event5',
    'timeline.event6',
  ];

  const TECH_STACK = [
    {
      category: 'skills.robotics',
      items: [
        { name: 'PPO', icon: 'fas fa-brain' },
        { name: 'MuJoCo', icon: 'fas fa-cube' },
        { name: 'mjlab', icon: 'fas fa-flask' },
        { name: 'Isaac Sim / Lab', icon: 'fas fa-vr-cardboard' },
        { name: 'Sim2Sim / Sim2Real', icon: 'fas fa-arrows-left-right' },
        { name: 'URDF / IK', icon: 'fas fa-sitemap' },
        { name: 'PID / Feedforward', icon: 'fas fa-wave-square' },
        { name: 'A*', icon: 'fas fa-route' },
      ],
    },
    {
      category: 'skills.embedded',
      items: [
        { name: 'C / C++', icon: 'fas fa-code' },
        { name: 'STM32', icon: 'fas fa-microchip' },
        { name: 'MSPM0', icon: 'fas fa-microchip' },
        { name: 'ESP32', icon: 'fas fa-microchip' },
        { name: 'UART / I2C / SPI', icon: 'fas fa-diagram-project' },
        { name: 'CAN / SocketCAN', icon: 'fas fa-network-wired' },
        { name: 'PlatformIO / Keil', icon: 'fas fa-screwdriver-wrench' },
      ],
    },
    {
      category: 'skills.software',
      items: [
        { name: 'ROS 2 / DDS', icon: 'fas fa-robot' },
        { name: 'Nav2', icon: 'fas fa-map-location-dot' },
        { name: 'OpenCV / YOLOv5', icon: 'fas fa-eye' },
        { name: 'TensorRT / ONNX', icon: 'fas fa-bolt' },
        { name: 'Linux', icon: 'fab fa-linux' },
        { name: 'Docker', icon: 'fab fa-docker' },
        { name: 'CMake / Git', icon: 'fas fa-gears' },
      ],
    },
    {
      category: 'skills.hardware',
      items: [
        { name: 'SolidWorks', icon: 'fas fa-drafting-compass' },
        { name: 'Ansys', icon: 'fas fa-chart-area' },
        { name: 'LCEDA', icon: 'fas fa-pencil-ruler' },
        { name: '3D Printing', icon: 'fas fa-print' },
        { name: 'CNC', icon: 'fas fa-industry' },
      ],
    },
    {
      category: 'skills.web',
      items: [
        { name: 'Python', icon: 'fab fa-python' },
        { name: 'Node.js', icon: 'fab fa-node-js' },
        { name: 'WebSocket', icon: 'fas fa-plug' },
        { name: '1Panel', icon: 'fas fa-server' },
        { name: 'LaTeX', icon: 'fas fa-file-lines' },
      ],
    },
  ];

  const GALLERY = [
    { img: 'assets/images/portfolio/rc-walk.webp', captionKey: 'gallery.item0' },
    { img: 'assets/images/portfolio/rc-side.webp', captionKey: 'gallery.item1' },
    { img: 'assets/images/portfolio/rc-cad.webp', captionKey: 'gallery.item2' },
    { img: 'assets/images/portfolio/go2-sim.webp', captionKey: 'gallery.item3' },
    { img: 'assets/images/portfolio/servo-quadruped.webp', captionKey: 'gallery.item4' },
    { img: 'assets/images/portfolio/humanoid-early.webp', captionKey: 'gallery.item5' },
    { img: 'assets/images/portfolio/humanoid-late.webp', captionKey: 'gallery.item6' },
    { img: 'assets/images/portfolio/robot-webui.webp', captionKey: 'gallery.item7' },
    { img: 'assets/images/portfolio/auto-car.webp', captionKey: 'gallery.item8' },
    { img: 'assets/images/portfolio/auto-aim.webp', captionKey: 'gallery.item9' },
    { img: 'assets/images/portfolio/so-arm100.webp', captionKey: 'gallery.item10' },
    { img: 'assets/images/portfolio/logistics.webp', captionKey: 'gallery.item11' },
    { img: 'assets/images/portfolio/algorithm-elite.webp', captionKey: 'gallery.item12' },
    { img: 'assets/images/portfolio/orchard.webp', captionKey: 'gallery.item13' },
    { img: 'assets/images/portfolio/arm-cad.webp', captionKey: 'gallery.item14' },
    { img: 'assets/images/portfolio/arm-assembly.webp', captionKey: 'gallery.item15' },
  ];

  const STATS = [
    { value: '2×', labelKey: 'stats.item0' },
    { value: '20+', labelKey: 'stats.item1' },
    { value: '153', labelKey: 'stats.item2' },
    { value: '2', labelKey: 'stats.item3' },
  ];

  const CONTACT_LINKS = [
    { icon: 'fas fa-envelope', key: 'contact.email', link: 'mailto:zeitvex@qq.com' },
    { icon: 'fab fa-github', key: 'contact.github', link: 'https://github.com/zeitvex' },
    { icon: 'fas fa-envelope', key: 'contact.resume', link: 'mailto:zeitvex@qq.com?subject=Resume%20Request' },
    { icon: 'fas fa-robot', key: 'contact.playground', link: 'playground.html' },
  ];

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function clear(el) {
    if (!el) return;
    el.innerHTML = '';
  }

  function t(key) {
    return window.i18n?.get ? window.i18n.get(key) : key;
  }

  function escapeAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function isExternal(href) {
    return /^https?:\/\//.test(href);
  }

  function renderSpanTags(tags, className) {
    if (!Array.isArray(tags)) return '';
    return tags.map((tag) => `<span class="${className}">${tag}</span>`).join('');
  }

  function renderProjectTags(tags) {
    if (!Array.isArray(tags)) return '';
    return `<div class="project-tags">${renderSpanTags(tags, 'project-tag')}</div>`;
  }

  function renderProjectActions(links) {
    if (!Array.isArray(links) || links.length === 0) return '';

    const items = links
      .filter((link) => link.href)
      .map((link) => {
        const label = link.labelKey ? t(link.labelKey) : link.label;
        const icon = link.icon || 'fas fa-arrow-up-right-from-square';
        const external = isExternal(link.href);
        const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `
          <a href="${escapeAttr(link.href)}"${target} class="project-action" aria-label="${escapeAttr(label)}">
            <i class="${icon}"></i>
            <span>${label}</span>
          </a>
        `;
      })
      .join('');

    return items ? `<div class="project-actions">${items}</div>` : '';
  }

  function initThemeToggle() {
    const toggleBtn = qs('.theme-toggle');
    const htmlEl = document.documentElement;
    if (!toggleBtn) return;

    const savedTheme = localStorage.getItem('theme') || htmlEl.getAttribute('data-theme') || 'light';
    htmlEl.setAttribute('data-theme', savedTheme);
    htmlEl.style.colorScheme = savedTheme;
    updateThemeColor(savedTheme);

    toggleBtn.addEventListener('click', () => {
      const currentTheme = htmlEl.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';

      htmlEl.setAttribute('data-theme', newTheme);
      htmlEl.style.colorScheme = newTheme;
      localStorage.setItem('theme', newTheme);
      updateThemeColor(newTheme);
    });
  }

  function updateThemeColor(theme) {
    const meta = qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1e1e1e' : '#ffffff');
  }

  function initLangToggle() {
    const toggleBtn = qs('.lang-toggle');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      const current = window.i18n.currentLang();
      const next = current === 'zh' ? 'en' : 'zh';
      window.i18n.changeLang(next);
    });
  }

  function initProjects() {
    const grid = qs('.projects-grid');
    if (!grid) return;
    clear(grid);

    PROJECTS.forEach((project) => {
      const thumbnailHtml = project.img
        ? `
        <div class="project-thumbnail-wrapper">
          <img src="${project.img}?v=${IMG_VERSION}" alt="${escapeAttr(t('projects.imgAlt'))}" class="project-thumbnail" loading="lazy" decoding="async">
        </div>
      `
        : '';

      const card = document.createElement('div');
      card.className = project.img ? 'card project-card' : 'card project-card project-card--text-only';
      card.innerHTML = `
        ${thumbnailHtml}
        <div class="project-info">
          ${project.featured ? `<span class="project-featured-badge">${t('projects.featured')}</span>` : ''}
          <h3>${t(project.titleKey)}</h3>
          <p>${t(project.descKey)}</p>
          ${renderProjectTags(project.tags)}
          ${renderProjectActions(project.links)}
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function initDocuments() {
    const grid = qs('.documents-grid');
    if (!grid) return;
    clear(grid);

    DOCUMENTS.forEach((doc) => {
      const card = document.createElement('div');
      card.className = 'card project-card project-card--text-only';
      card.innerHTML = `
        <div class="project-info">
          <h3>${t(doc.titleKey)}</h3>
          <p>${t(doc.descKey)}</p>
          <div class="project-meta-row">
            ${renderProjectActions(doc.links)}
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function initAwards() {
    const grid = qs('.awards-grid');
    if (!grid) return;
    clear(grid);

    AWARDS.forEach((award) => {
      const levelClass = award.level === 'first' ? ' level-first' : '';
      const levelKey = `awards.level.${award.level}`;
      const card = document.createElement('div');
      card.className = 'award-card';
      card.innerHTML = `
        <div class="award-year">${award.year}</div>
        <div class="award-body">
          <span class="award-level${levelClass}">${t(levelKey)}</span>
          <h3>${t(award.titleKey)}</h3>
          <p>${t(award.descKey)}</p>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function initTimeline() {
    const container = qs('.timeline-container');
    if (!container) return;
    clear(container);

    TIMELINE_EVENTS.forEach((key) => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.innerHTML = `
        <div class="timeline-dot"></div>
        <span class="timeline-date">${t(`${key}.date`)}</span>
        <div class="timeline-content">
          <h3>${t(`${key}.title`)}</h3>
          <p>${t(`${key}.desc`)}</p>
        </div>
      `;
      container.appendChild(item);
    });
  }

  function initTechStack() {
    const container = qs('.skills-wrapper');
    if (!container) return;
    clear(container);

    TECH_STACK.forEach((group) => {
      const itemsHtml = group.items
        .map((s) => `<div class="skill-badge"><i class="${s.icon}"></i> ${s.name}</div>`)
        .join('');

      const col = document.createElement('div');
      col.className = 'skill-category';
      col.innerHTML = `<h3>${t(group.category)}</h3><div class="skill-list">${itemsHtml}</div>`;
      container.appendChild(col);
    });
  }

  function initGallery() {
    const grid = qs('.gallery-grid');
    if (!grid) return;
    clear(grid);

    GALLERY.forEach((item, index) => {
      const caption = t(item.captionKey);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gallery-item';
      btn.dataset.index = String(index);
      btn.setAttribute('aria-label', caption);
      btn.innerHTML = `
        <img src="${item.img}?v=${IMG_VERSION}" alt="${escapeAttr(caption)}" loading="lazy" decoding="async">
        <span class="gallery-caption">${caption}</span>
      `;
      grid.appendChild(btn);
    });
  }

  function initStats() {
    const container = qs('.stats-strip');
    if (!container) return;
    clear(container);

    STATS.forEach((stat) => {
      const item = document.createElement('div');
      item.className = 'stat';
      item.innerHTML = `<b>${stat.value}</b><span>${t(stat.labelKey)}</span>`;
      container.appendChild(item);
    });
  }

  function initContactLinks() {
    const container = qs('.intro-contact-links');
    if (!container) return;
    clear(container);

    CONTACT_LINKS.forEach((contact) => {
      const label = t(contact.key);
      const item = document.createElement('a');
      item.className = 'intro-contact-link';
      item.href = contact.link;
      if (contact.download) item.setAttribute('download', '');
      if (isExternal(contact.link)) {
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
      }
      item.title = label;
      item.setAttribute('aria-label', label);
      item.innerHTML = `<span>${label}</span><i class="${contact.icon}"></i>`;
      container.appendChild(item);
    });
  }

  function initSmoothScroll() {
    qsa('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();

        const href = this.getAttribute('href');
        if (!href) return;
        if (href === '#') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        let target;
        try {
          target = qs(href);
        } catch {
          return;
        }

        if (target) {
          const navHeight = qs('nav')?.offsetHeight || 72;
          window.scrollTo({
            top: target.getBoundingClientRect().top + window.scrollY - navHeight - 12,
            behavior: 'smooth',
          });
        }
      });
    });
  }

  function initScrollSpy() {
    const sections = qsa('section[id]');
    const links = qsa('.nav-links a');
    if (!sections.length || !links.length) return;

    const linkMap = new Map(
      links
        .map((link) => [link.getAttribute('href')?.replace('#', ''), link])
        .filter(([id]) => id),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((link) => link.classList.remove('active'));
          linkMap.get(entry.target.id)?.classList.add('active');
        });
      },
      { rootMargin: '-42% 0px -52% 0px', threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
  }

  function initRevealMotion() {
    const targets = [
      ...qsa('.projects-grid .card'),
      ...qsa('.documents-grid .card'),
      ...qsa('.awards-grid .award-card'),
      ...qsa('.timeline-container .timeline-item'),
      ...qsa('.skills-wrapper .skill-category'),
      ...qsa('.gallery-grid .gallery-item'),
    ];

    if (!targets.length) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    targets.forEach((el, index) => {
      el.classList.add('reveal');
      el.style.setProperty('--reveal-delay', `${(index % 6) * 60}ms`);
    });

    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -8% 0px',
      },
    );

    targets.forEach((el) => observer.observe(el));
  }

  let lightboxIndex = 0;
  let lastFocusedElement = null;

  function initLightbox() {
    const lightbox = qs('#lightbox');
    const image = qs('#lightboxImage');
    const caption = qs('#lightboxCaption');
    if (!lightbox || !image || !caption) return;

    const closeBtn = qs('.lightbox-close');
    const prevBtn = qs('.lightbox-prev');
    const nextBtn = qs('.lightbox-next');

    function updateLightbox() {
      const item = GALLERY[lightboxIndex];
      if (!item) return;
      image.src = `${item.img}?v=${IMG_VERSION}`;
      image.alt = t(item.captionKey);
      caption.textContent = t(item.captionKey);
    }

    function openLightbox(index) {
      lightboxIndex = index;
      lastFocusedElement = document.activeElement;
      updateLightbox();
      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lightbox-open');
      closeBtn?.focus();
    }

    function closeLightbox() {
      lightbox.classList.remove('is-open');
      document.body.classList.remove('lightbox-open');
      if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
      lightbox.setAttribute('aria-hidden', 'true');
    }

    function step(direction) {
      lightboxIndex = (lightboxIndex + direction + GALLERY.length) % GALLERY.length;
      updateLightbox();
    }

    document.addEventListener('click', (event) => {
      const item = event.target.closest('.gallery-item');
      if (!item) return;
      openLightbox(Number(item.dataset.index));
    });

    closeBtn?.addEventListener('click', closeLightbox);
    prevBtn?.addEventListener('click', () => step(-1));
    nextBtn?.addEventListener('click', () => step(1));

    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', (event) => {
      if (!lightbox.classList.contains('is-open')) return;
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    });
  }

  function renderAll() {
    initProjects();
    initDocuments();
    initAwards();
    initTimeline();
    initTechStack();
    initGallery();
    initStats();
    initContactLinks();
    initRevealMotion();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initLangToggle();
    initSmoothScroll();
    initLightbox();
    initScrollSpy();
  });

  window.addEventListener('i18nLoaded', renderAll);
})();
