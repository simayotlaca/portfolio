// =============================================
// STAGGER REVEAL — SETUP
// Must run before querySelectorAll('.reveal') to exclude converted items
// =============================================

// Helper: animate a container's direct .stagger-child elements sequentially
function staggerReveal(container, baseDelay) {
  var gap = baseDelay || 95;
  var children = Array.from(container.querySelectorAll(':scope > .stagger-child'));
  children.forEach(function(child, i) {
    setTimeout(function() {
      child.classList.add('stagger-in');
      // After animation completes, clear it so hover transforms work normally
      setTimeout(function() { child.classList.add('stagger-done'); }, 620);
    }, i * gap);
  });
}

// 1. Convert individually-observed list items → stagger-children
//    (removes them from the main .reveal observer)
document.querySelectorAll('.proj-item.reveal, .exp-item.reveal').forEach(function(el) {
  el.classList.remove('reveal');
  el.classList.add('stagger-child');
});

// 2. Mark inline grid / collection items as stagger-children
//    (they live inside .reveal containers — triggered when parent reveals)
document.querySelectorAll('.stat-item, .bento-box, .lang-item, .edu-item').forEach(function(el) {
  el.classList.add('stagger-child');
});

// 3. Observe list parents directly (proj-list, exp-list)
var listStaggerObs = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (!entry.isIntersecting) return;
    listStaggerObs.unobserve(entry.target);
    staggerReveal(entry.target, 110);
  });
}, { threshold: 0.01, rootMargin: '0px 0px 100px 0px' });

document.querySelectorAll('.proj-list, .exp-list').forEach(function(p) {
  listStaggerObs.observe(p);
});

// =============================================
// NAVBAR SCROLL
// =============================================
var navbar = document.getElementById('navbar');
var tickingNav = false;
window.addEventListener('scroll', function() {
  if (!tickingNav) {
    window.requestAnimationFrame(function() {
      if (window.scrollY > 40) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
      tickingNav = false;
    });
    tickingNav = true;
  }
}, { passive: true });

// =============================================
// MOBILE MENU TOGGLE
// =============================================
var toggle = document.getElementById('mobile-toggle');
var navLinks = document.querySelector('.nav-links');

if (toggle && navLinks) {
  toggle.addEventListener('click', function() {
    navLinks.classList.toggle('open');
  });
  navLinks.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', function() {
      navLinks.classList.remove('open');
    });
  });
}

// =============================================
// SCROLL REVEAL — main (section headings, text blocks, hero, etc.)
// Note: .proj-item & .exp-item are now stagger-children — excluded above
// =============================================
var reveals = document.querySelectorAll('.reveal');

var observer = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    observer.unobserve(entry.target);

    // Stagger any nested .stagger-child elements (stat-items, bento-boxes, etc.)
    var nested = Array.from(entry.target.querySelectorAll('.stagger-child'));
    if (nested.length > 0) {
      // Group by direct parent so each group staggers independently
      var map = new Map();
      nested.forEach(function(child) {
        var p = child.parentElement;
        if (!map.has(p)) map.set(p, []);
        map.get(p).push(child);
      });
      map.forEach(function(kids) {
        kids.forEach(function(child, i) {
          setTimeout(function() {
            child.classList.add('stagger-in');
            setTimeout(function() { child.classList.add('stagger-done'); }, 620);
          }, 80 + i * 80);
        });
      });
    }
  });
}, {
  threshold: 0.01,
  rootMargin: '0px 0px 120px 0px'
});

reveals.forEach(function(el) { observer.observe(el); });



// =============================================
// ACTIVE NAV LINK ON SCROLL
// =============================================
var sections = document.querySelectorAll('section[id]');
var navItems = document.querySelectorAll('.nav-links a');

var sectionObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      var id = entry.target.getAttribute('id');
      navItems.forEach(function(item) {
        item.style.color = '';
        if (item.getAttribute('href') === '#' + id) {
          item.style.color = 'var(--text)';
        }
      });
    }
  });
}, { threshold: 0.4 });

sections.forEach(function(s) { sectionObserver.observe(s); });

// =============================================
// COUNT-UP ANIMATION — STAT CARDS
// =============================================
(function initCountUp() {
  var easeOut = function(t) { return 1 - Math.pow(1 - t, 3); };

  function animateCount(el, start, end, suffix, duration, delay) {
    el.classList.add('counting');

    setTimeout(function() {
      var t0 = performance.now();
      (function tick(now) {
        var elapsed  = now - t0;
        var progress = Math.min(elapsed / duration, 1);
        
        var current;
        if (progress < 1) {
          var rawCurrent = start + (end - start) * easeOut(progress);
          current = Math.round(rawCurrent);
        } else {
          current = end;
        }

        var newText = current + suffix;
        if (el.textContent !== newText) {
          el.textContent = newText;
        }

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          el.classList.remove('counting');
        }
      })(performance.now());
    }, delay);
  }

  var statsGrid = document.querySelector('.about-stats');
  if (!statsGrid) return;

  var countObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      countObs.disconnect();
      var statItems = statsGrid.querySelectorAll('.stat-val[data-end]');
      statItems.forEach(function(el, index) {
        var start = parseInt(el.dataset.start) || 0;
        var end = parseInt(el.dataset.end) || 0;
        var suffix = el.dataset.suffix || '';
        var duration = 900; // snappier animation
        var delay = index * 80; // cascade faster
        animateCount(el, start, end, suffix, duration, delay);
      });
    });
  }, { threshold: 0.05, rootMargin: '0px 0px 100px 0px' });

  countObs.observe(statsGrid);
})();

// =============================================
// HERO AMBIENT PARTICLES
// =============================================
(function initHeroParticles() {
  var container = document.getElementById('hero-particles');
  if (!container) return;

  var colors = [
    { r: 6,   g: 182, b: 212 },
    { r: 124, g: 92,  b: 252 },
    { r: 244, g: 114, b: 182 },
    { r: 6,   g: 182, b: 212 },
    { r: 124, g: 92,  b: 252 },
  ];

  for (var i = 0; i < 11; i++) {
    var p   = document.createElement('div');
    p.className = 'hero-particle';
    var c   = colors[Math.floor(Math.random() * colors.length)];
    var size  = Math.random() * 3.5 + 1.5;
    var op    = Math.random() * 0.10 + 0.04;
    var dur   = Math.random() * 22 + 20;
    var delay = -(Math.random() * dur);
    var dx    = ((Math.random() - 0.5) * 80).toFixed(1);
    var dy    = (-(Math.random() * 100 + 40)).toFixed(1);
    var left  = (Math.random() * 100).toFixed(2);
    var top   = (Math.random() * 100).toFixed(2);

    p.style.cssText = [
      'width:'  + size + 'px',
      'height:' + size + 'px',
      'left:'   + left + '%',
      'top:'    + top  + '%',
      'background:rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + op + ')',
      'box-shadow:0 0 ' + (size * 3).toFixed(1) + 'px rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (op * 1.4).toFixed(3) + ')',
      'animation-duration:' + dur + 's',
      'animation-delay:'    + delay + 's',
      '--dx:' + dx + 'px',
      '--dy:' + dy + 'px',
    ].join(';');

    container.appendChild(p);
  }

  var heroEl = document.getElementById('hero');
  if (!heroEl) return;

  var tickingScroll = false;
  window.addEventListener('scroll', function() {
    if (!tickingScroll) {
      window.requestAnimationFrame(function() {
        var heroBottom = heroEl.getBoundingClientRect().bottom;
        var vh = window.innerHeight;
        var progress = 1 - Math.max(0, Math.min(1, (heroBottom - vh * 0.2) / (vh * 0.6)));
        container.style.opacity = (1 - progress).toString();
        tickingScroll = false;
      });
      tickingScroll = true;
    }
  }, { passive: true });
})();

// =============================================
// BENTO GRID SPOTLIGHT EFFECT
// =============================================
(function initBentoSpotlight() {
  var bentoGrid = document.getElementById('skills-bento');
  if (!bentoGrid) return;

  var cards = bentoGrid.querySelectorAll('.bento-card');
  var ticking = false;
  bentoGrid.addEventListener('mousemove', function(e) {
    if (!ticking) {
      window.requestAnimationFrame(function() {
        cards.forEach(function(card) {
          var rect = card.getBoundingClientRect();
          var x = e.clientX - rect.left;
          var y = e.clientY - rect.top;
          card.style.setProperty('--mouse-x', x + 'px');
          card.style.setProperty('--mouse-y', y + 'px');
        });
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();

// =============================================
// VIDEO PLAYBACK SPEED
// =============================================
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('video.pureplate-video').forEach(function(video) {
    video.playbackRate = 1.5;
  });
});
// =============================================
// COPY PROTECTION (Basic Deterrents)
// =============================================
document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
});
document.addEventListener('copy', function(e) {
  e.preventDefault();
});
