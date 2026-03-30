// =====================================================
// BLAST MECHANIC — Portfolio Mini-Game
// NOW WITH REAL UNITY SPRITES FROM GITHUB
// =====================================================

const SPRITE_BASE = 'assets/blocks/';

const COLOR_NAMES = ['Blue', 'Green', 'Pink', 'Purple', 'Red', 'Yellow'];

// Preload all sprites: each color has Default, A, B, C variants
const SPRITES = {};
COLOR_NAMES.forEach(name => {
  SPRITES[name] = { Default: new Image(), A: new Image(), B: new Image(), C: new Image() };
  SPRITES[name].Default.src = `${SPRITE_BASE}${name}_Default.png`;
  SPRITES[name].A.src      = `${SPRITE_BASE}${name}_A.png`;
  SPRITES[name].B.src      = `${SPRITE_BASE}${name}_B.png`;
  SPRITES[name].C.src      = `${SPRITE_BASE}${name}_C.png`;
});

// Group size → icon variant (matches the real game logic)
function getVariant(groupSize) {
  if (groupSize < 4)  return 'Default';
  if (groupSize < 7)  return 'A';
  if (groupSize < 10) return 'B';
  return 'C';
}

// Glow colors per tile color
const GLOW_COLORS = [
  'rgba(76,130,255,0.7)',   // Blue
  'rgba(74,222,128,0.7)',   // Green
  'rgba(244,114,182,0.7)',  // Pink
  'rgba(163,114,255,0.7)', // Purple
  'rgba(248,113,113,0.7)', // Red
  'rgba(250,204,21,0.7)',  // Yellow
];

class BlastGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    this.COLS = 4;
    this.ROWS = 4;
    this.CELL = 54;
    this.GAP  = 1;

    this.grid = [];
    this.score = 0;
    this.best = parseInt(localStorage.getItem('blast_best') || '0');
    this.combo = 0;
    this.particles = [];
    this.floatingTexts = [];
    this.hoveredGroup = [];
    this.animating = false;
    this.isShuffling = false;
    this.spritesReady = false;
    this.showYourTurn = false;
    this.yourTurnAlpha = 0;
    this.demoScheduled = false;
    this.demoPlayed = true;
    this.inputAllowed = true;
    this.isFullyVisible = false;
    this.isLooping = false;
    this.hoverRow = -1;
    this.hoverCol = -1;
    this.boundLoop = this.loop.bind(this);

    this.boardLogic = new BoardLogic(this.ROWS, this.COLS, COLOR_NAMES.length);

    const W = this.COLS * this.CELL + (this.COLS + 1) * this.GAP;
    const H = this.ROWS * this.CELL + (this.ROWS + 1) * this.GAP + this.GAP;
    this.canvas.width  = W;
    this.canvas.height = H;
    this.gridOffsetX = this.GAP;
    this.gridOffsetY = this.GAP;

    // Auto-demo logic removed for stability

    // Wait for at least one sprite per color to load
    let loaded = 0;
    const total = COLOR_NAMES.length;
    const onSpriteSettled = () => {
      loaded++;
      if (loaded >= total) {
        this.spritesReady = true;
      }
    };
    COLOR_NAMES.forEach(name => {
      SPRITES[name].Default.onload  = onSpriteSettled;
      SPRITES[name].Default.onerror = onSpriteSettled;
    });

    this.init();
    this.bindEvents();
    
    // Performance Optimization & Lazy Load Detection
    this.isVisible = false;
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (!this.isVisible) {
            this.isVisible = true;
            if (!this.isLooping) {
              this.isLooping = true;
              requestAnimationFrame(this.boundLoop);
            }
          }
          if (entry.intersectionRatio >= 0.7) {
            this.isFullyVisible = true;
          } else {
            this.isFullyVisible = false;
          }
        } else {
          this.isVisible = false;
          this.isFullyVisible = false;
        }
      });
    }, { rootMargin: '0px', threshold: [0, 0.7] });
    this.observer.observe(this.canvas);

    setTimeout(() => {
      this.spritesReady = true;
    }, 1200);
  }



  init() {
    this.boardLogic.fillBoard();
    this.grid = [];
    for (let r = 0; r < this.ROWS; r++) {
      this.grid[r] = [];
      for (let c = 0; c < this.COLS; c++) {
        this.grid[r][c] = this.newTile(r, c, this.boardLogic.getColor(r, c));
      }
    }
    this.updateAllGroupSizes();
    this.score = 0;
    this.combo = 0;
    this.particles = [];
    this.floatingTexts = [];
    this.hoveredGroup = [];
    this.animating = false;
    this.isShuffling = false;
    if (this.demoPlayed) {
      this.inputAllowed = true;
    }
  }

  newTile(r, c, color, fromTop = false) {
    return {
      color: color,
      visualY: fromTop ? (this.ROWS + 2) : r,
      targetY: r,
      alpha: fromTop ? 0 : 1,
      scale: fromTop ? 0.5 : 1,
      targetScale: 1,
    };
  }

  tileX(c) { return this.gridOffsetX + c * (this.CELL + this.GAP); }
  tileY(r) { return this.gridOffsetY + (this.ROWS - 1 - r) * (this.CELL + this.GAP); }

  bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.inputAllowed) return;
      const [r, c] = this.getCell(e);
      if (r !== null) {
        if (this.hoverRow !== r || this.hoverCol !== c) {
          this.hoverRow = r;
          this.hoverCol = c;
          this.hoveredGroup = this.findGroup(r, c);
        }
      } else {
        if (this.hoverRow !== -1) {
          this.hoverRow = -1;
          this.hoverCol = -1;
          this.hoveredGroup = [];
        }
      }
    }, { passive: true });
    this.canvas.addEventListener('mouseleave', () => { 
      if (!this.inputAllowed) return;
      this.hoverRow = -1;
      this.hoverCol = -1;
      this.hoveredGroup = []; 
    });
    this.canvas.addEventListener('click', (e) => {
      if (!this.inputAllowed) return;
      // Dismiss "Your turn" overlay on first click
      if (this.showYourTurn) {
        this.showYourTurn = false;
      }
      if (this.animating || this.isShuffling) return;
      const [r, c] = this.getCell(e);
      if (r === null) return;
      const group = this.findGroup(r, c);
      if (group.length >= 2) this.blast(group);
    });
    // Touch support
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!this.inputAllowed) return;
      const touch = e.changedTouches[0];
      const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
      if (this.animating || this.isShuffling) return;
      const [r, c] = this.getCell(fakeEvent);
      if (r === null) return;
      const group = this.findGroup(r, c);
      if (group.length >= 2) this.blast(group);
    }, { passive: false });
  }

  getCell(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX - this.gridOffsetX;
    const my = (e.clientY - rect.top)  * scaleY - this.gridOffsetY;
    const c = Math.floor(mx / (this.CELL + this.GAP));
    const invR = Math.floor(my / (this.CELL + this.GAP));
    const r = this.ROWS - 1 - invR;
    if (r >= 0 && r < this.ROWS && c >= 0 && c < this.COLS) return [r, c];
    return [null, null];
  }

  findGroup(row, col) {
    let flats = this.boardLogic.getGroupMembers(row, col);
    let group = [];
    for (let i = 0; i < flats.length; i += 2) {
      group.push([flats[i], flats[i+1]]);
    }
    return group;
  }

  updateAllGroupSizes() {
    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        const t = this.grid[r][c];
        if (t) {
          t.groupSize = this.boardLogic.getGroupSize(r, c);
        }
      }
    }
  }

  blast(group) {
    if (!group || group.length === 0) return;
    this.animating = true;
    
    const root = group[0];
    this.boardLogic.removeGroupAt(root[0], root[1]);

    this.combo++;
    const multiplier = Math.min(this.combo, 5);
    const points = group.length * group.length * 10 * multiplier;
    this.score += points;
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('blast_best', this.best);
    }

    const cx = group.reduce((s,[r,c]) => s + this.tileX(c) + this.CELL/2, 0) / group.length;
    const cy = group.reduce((s,[r,c]) => s + this.tileY(r) + this.CELL/2, 0) / group.length;
    const glowColor = GLOW_COLORS[this.grid[group[0][0]][group[0][1]].color];

    this.floatingTexts.push({
      text: `+${points}${multiplier > 1 ? ` ×${multiplier}` : ''}`,
      x: cx, y: cy, alpha: 1, vy: -1.8, color: glowColor,
    });

    group.forEach(([r, c]) => {
      const px = this.tileX(c) + this.CELL/2;
      const py = this.tileY(r)  + this.CELL/2;
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
        const speed = 2.5 + Math.random() * 4.5;
        this.particles.push({
          x: px, y: py,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: glowColor,
          alpha: 1,
          size: Math.random() * 6 + 2,
          type: Math.random() > 0.5 ? 'circle' : 'square',
        });
      }
      this.grid[r][c] = null;
    });

    this.hoveredGroup = [];
    setTimeout(() => {
      this.applyGravity();
      setTimeout(() => {
        this.animating = false;
        let deadlockFix = this.boardLogic.ensureValidMoveExists();
        if (deadlockFix !== "None") {
          this.shuffleBoard();
        }
      }, 80);
    }, 30);
  }

  shuffleBoard() {
    this.isShuffling = true;
    this.animating = true;
    
    // Step 1: Shrink animation
    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        if (this.grid[r][c]) {
          this.grid[r][c].targetScale = 0;
        }
      }
    }

    // Step 2: Mix colors and ensure a valid move
    setTimeout(() => {
      for (let r = 0; r < this.ROWS; r++) {
        for (let c = 0; c < this.COLS; c++) {
          if (this.grid[r][c]) {
            this.grid[r][c].color = this.boardLogic.getColor(r, c);
          }
        }
      }
      this.updateAllGroupSizes();

      // Step 3: Expand back
      for (let r = 0; r < this.ROWS; r++) {
        for (let c = 0; c < this.COLS; c++) {
          if (this.grid[r][c]) {
            this.grid[r][c].targetScale = 1;
            this.grid[r][c].scale = 0;
          }
        }
      }

      // Conclude shuffle
      setTimeout(() => {
        this.isShuffling = false;
        this.animating = false;
      }, 200);

    }, 200); // wait for shrink to finish
  }

  applyGravity() {
    this.boardLogic.applyGravityAll();

    for (let c = 0; c < this.COLS; c++) {
      const existing = [];
      for (let r = 0; r < this.ROWS; r++) {
        if (this.grid[r][c]) {
            existing.push(this.grid[r][c]);
            this.grid[r][c] = null;
        }
      }
      for (let i = 0; i < existing.length; i++) {
        const t = existing[i];
        this.grid[i][c] = t;
        t.targetY = i;
      }
    }

    let spawns = this.boardLogic.refillEmptyCells();
    spawns.forEach(spawn => {
      this.grid[spawn.row][spawn.col] = this.newTile(spawn.row, spawn.col, spawn.color, true);
    });

    this.combo = 0;
    this.updateAllGroupSizes();
  }

  checkMoves() {
    let hasMove = false;
    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        if (this.boardLogic.getGroupSize(r, c) >= 2) hasMove = true;
      }
    }
    return hasMove;
  }

  loop() {
    if (!this.isVisible) {
      this.isLooping = false;
      return; // Stop animation loop to save resources
    }
    
    this.update();
    this.draw();
    requestAnimationFrame(this.boundLoop);
  }

  update() {
    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        const t = this.grid[r][c];
        if (!t) continue;
        t.visualY += (t.targetY - t.visualY) * 0.6;
        t.alpha    = Math.min(1, t.alpha  + 0.22);
        t.scale   += (t.targetScale - t.scale) * 0.6;
      }
    }
    this.particles = this.particles.filter(p => p.alpha > 0.01);
    this.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.18; p.vx *= 0.97;
      p.alpha -= 0.026; p.size *= 0.96;
    });
    this.floatingTexts = this.floatingTexts.filter(t => t.alpha > 0.01);
    this.floatingTexts.forEach(t => { t.y += t.vy; t.alpha -= 0.018; });
    // Animate "Your turn" overlay alpha
    if (this.showYourTurn) {
      this.yourTurnAlpha = Math.min(1, this.yourTurnAlpha + 0.08);
    } else {
      // Disappear almost instantly
      this.yourTurnAlpha = Math.max(0, this.yourTurnAlpha - 0.25);
    }
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Background
    ctx.fillStyle = '#06060f';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (this.isShuffling) {
      // Lightweight screen shake instead of expensive text rendering
      const dx = (Math.random() - 0.5) * 6;
      const dy = (Math.random() - 0.5) * 6;
      ctx.translate(dx, dy);
    }

    // Compute group variant for each hovered/clicked batch
    const hoveredSet = new Set(this.hoveredGroup.map(([r,c]) => `${r},${c}`));
    const variant = getVariant(this.hoveredGroup.length);

    // Tiles
    for (let r = 0; r < this.ROWS; r++) {
      for (let c = 0; c < this.COLS; c++) {
        const t = this.grid[r][c];
        if (!t) continue;

        const x = this.tileX(c);
        const y = this.tileY(t.visualY);
        const isHovered = hoveredSet.has(`${r},${c}`);
        // Subtle scale, no heavy dimming
        const scale = t.scale * (isHovered ? 1.05 : 1);
        const cx2   = x + this.CELL / 2;
        const cy2   = y + this.CELL / 2;
        const s     = this.CELL * scale;
        const colorName = COLOR_NAMES[t.color];
        
        // Use native group size to show merged variations all the time!
        const imgVariant = getVariant(t.groupSize || 1);
        const img = SPRITES[colorName] && SPRITES[colorName][imgVariant];

        ctx.save();
        ctx.translate(cx2, cy2);
        ctx.globalAlpha = t.alpha;

        if (isHovered) {
          ctx.shadowColor = GLOW_COLORS[t.color];
          ctx.shadowBlur  = this.isMobile ? 0 : 10; // Low blur for performance
        }

        if (img && img.complete && img.naturalWidth > 0) {
          // Draw real sprite
          ctx.drawImage(img, -s / 2, -s / 2, s, s);
        } else {
          // Fallback: colored rounded rect while sprites load
          const fallbackColors = ['#4c82ff','#4ade80','#f472b6','#a374ff','#f87171','#facc15'];
          ctx.beginPath();
          this.roundRect(ctx, -s/2, -s/2, s, s, 10 * scale);
          ctx.fillStyle = fallbackColors[t.color];
          ctx.fill();
        }

        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.shadowBlur  = 0;
      }
    }

    // Particles
    this.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = this.isMobile ? 0 : 8;
      if (p.type === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      }
      ctx.restore();
    });

    // Floating score texts
    this.floatingTexts.forEach(t => {
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.fillStyle   = '#ffffff';
      ctx.font        = 'bold 16px "JetBrains Mono", monospace';
      ctx.textAlign   = 'center';
      ctx.shadowColor = t.color;
      ctx.shadowBlur  = this.isMobile ? 0 : 12;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });
    ctx.textAlign = 'left';

    ctx.restore(); // Restore context to original transform for UI elements

    // "Your turn" overlay
    if (this.yourTurnAlpha > 0.01) {
      const a = this.yourTurnAlpha;
      // Semi-transparent backdrop pill
      const text = 'Your turn →';
      ctx.save();
      ctx.font = 'bold 15px "Sora", sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 36;
      const ph = 40;
      const px = (W - pw) / 2;
      const py = H / 2 - ph / 2;

      ctx.globalAlpha = a * 0.82;
      ctx.fillStyle = 'rgba(10,10,24,0.92)';
      this.roundRect(ctx, px, py, pw, ph, 20);
      ctx.fill();

      // Accent border with glow — cyan
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(6,182,212,0.9)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(6,182,212,0.7)';
      ctx.shadowBlur = this.isMobile ? 0 : 16;
      this.roundRect(ctx, px, py, pw, ph, 20);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Text
      ctx.fillStyle = '#eef0f6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(6,182,212,0.5)';
      ctx.shadowBlur = this.isMobile ? 0 : 10;
      ctx.fillText(text, W / 2, H / 2);
      ctx.shadowBlur = 0;
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
  }

  roundRect(ctx, x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    ctx.beginPath();
    ctx.moveTo(x + r[0], y);
    ctx.lineTo(x + w - r[1], y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r[1]);
    ctx.lineTo(x + w, y + h - r[2]);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
    ctx.lineTo(x + r[3], y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r[3]);
    ctx.lineTo(x, y + r[0]);
    ctx.quadraticCurveTo(x, y, x + r[0], y);
    ctx.closePath();
  }
}

window.__blastGame = null;
function initBlastGame() {
  if (window.__blastGame) {
    // Already running — just reinit board
    window.__blastGame.init();
    return;
  }
  if (document.getElementById('blast-canvas')) {
    window.__blastGame = new BlastGame('blast-canvas');
  }
}
