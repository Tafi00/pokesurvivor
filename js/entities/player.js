/* ============ player.js — el Pokémon que controlas ============
 * (x, y) son los PIES. Sólo UN movimiento está activo a la vez: se dispara
 * solo y se cambia con 1-4 / Q / E. Cada disparo reproduce la animación de
 * ataque de Mundo Misterioso que le toca (Attack, Shoot o Charge).
 */
G.Player = class Player {
  /**
   * @param mon   entrada de G.DEX
   * @param perks mejoras permanentes ya resueltas (ver data/upgrades.js)
   */
  constructor(mon, perks = {}, shiny = false) {
    this.mon = mon;
    this.dex = mon.dex;
    this.shiny = shiny && G.Sprites.hasShiny(mon.dex);
    this.anim = new G.Sprites.Animator(mon.dex, 1, this.shiny);
    this.x = 0; this.y = 0;
    this.r = G.Sprites.bodyRadius(mon.dex);
    this.bodyH = G.Sprites.bodyHeight(mon.dex);

    this.atkMul = perks.atkMul || 1;
    this.spdMul = perks.spdMul || 1;
    this.cdMul = 0.88 * (perks.cdMul || 1);
    this.dmgReduce = perks.dmgReduce || 0;
    this.regenFlat = (perks.regen || 0) + 0.5;
    this.magnet = 96 * (perks.magnetMul || 1);
    this.xpMul = perks.xpMul || 1;
    this.coinMul = perks.coinMul || 1;

    this.maxHp = Math.round(mon.hp * 1.15) + (perks.hp || 0) + 12;
    this.hp = this.maxHp;
    this.baseSpd = Math.round(mon.spd * 1.12);
    this.baseAtk = mon.atk;

    this.moves = [];           // todos los movimientos aprendidos
    this.slots = [];           // huecos: cada uno, una lista de movimientos que se lanzan a la vez
    this.active = 0;           // hueco activo
    this.maxMoves = 4;         // huecos
    this.bonds = 0;            // vínculos por usar (premio de los legendarios)

    this.buffs = {
      atk: { n: 0, t: 0, amount: 0 },
      spd: { n: 0, t: 0, amount: 0 },
      def: { n: 0, t: 0, amount: 0 },
      regen: { n: 0, t: 0, amount: 0 }
    };

    this.level = 1;
    this.xp = 0;
    this.xpNext = Player.xpFor(1);
    this.kills = 0;
    this.bosses = 0;
    this.rerolls = 0;          // veces que ha cambiado las cartas de nivel en esta run
    this.rerollBonus = perks.rerolls || 0;   // cambios comprados en Mejoras (más el gratis)
    this.critChance = perks.crit || 0;       // probabilidad de golpe crítico (Mejoras)
    this.banned = new Set();                 // movimientos vetados (Mejoras → Veto): no salen en las cartas
    this.bind = {};                          // movimiento -> hueco fijo (0-3), elegido en Mejoras
    this.coins = 0;            // monedas recogidas en esta run
    this.t1 = 0; this.t10 = 0; // tickets del gacha recogidos en esta run
    this.dmgDealt = 0;

    this.invuln = 0;
    this.flash = 0;
    this.aim = Math.PI / 2;
    this.moveAngle = Math.PI / 2;
    this.walking = false;
    this.inLiquid = false;
    this.lavaTick = 0;
    this.attackFace = 0;       // tiempo que sigue mirando al objetivo tras atacar
    this.dead = false;
    this.power = null;         // poder de altar activo: { def, t, dur }
    this.slowT = 0;            // pegado por una trampa
    this.item = null;          // objeto equipado (data/items.js), uno por run
    this.sashT = -999;         // última vez que salvó la Banda Focus
    this.bellHeal = 0;         // curación pendiente del Cascabel Concha
    this.statsTaken = {};      // mejoras de stat cogidas (condición de evolución)
    this.hpTrail = this.maxHp; // barra de daño diferida suave
    this.dashCd = 0;           // enfriamiento del esquive táctico (Espacio/Shift)
    this.dashMaxCd = 2.6;
    this.dashT = 0;
    this.dashVx = 0; this.dashVy = 0;
    this.afterimages = [];
    this.ghostTick = 0;
    this.combo = 0;            // racha de enemigos derrotados seguidos
    this.comboT = 0;
    this.bestCombo = 0;
    this.godMode = !!(G.Admin && G.Admin.godMode);
    this.oneHitKo = !!(G.Admin && G.Admin.oneHitKo);
    this.noCd = !!(G.Admin && G.Admin.noCd);
  }

  /** Segundos que hay que estar junto a un compañero caído para levantarlo. */
  static get REVIVE_TIME() { return 2.2; }

  // Curva de subida de nivel más ágil y dinámica
  static xpFor(level) {
    return Math.floor((7 + level * 5.2 + Math.pow(level, 1.68) * 1.35) * 2.4);
  }

  cy() { return this.y; }

  // ---------------- stats efectivos ----------------
  get atk() {
    if (this.oneHitKo) return 999999;
    return this.baseAtk * this.atkMul * (1 + this.buffs.atk.n * this.buffs.atk.amount);
  }
  get spd() {
    const s = this.baseSpd * this.spdMul * (1 + this.buffs.spd.n * this.buffs.spd.amount) * (this.slowT > 0 ? 0.5 : 1);
    const w = G.Weather.speedFor(this.mon.types);
    const slow = this.inLiquid ? G.World.liquidEffect(this.mon.types).slow || 1 : 1;
    return s * slow * w;
  }
  get reduction() { return Math.min(0.8, this.dmgReduce + this.buffs.def.n * this.buffs.def.amount); }
  get regen() { return this.regenFlat + this.buffs.regen.n * this.buffs.regen.amount; }

  // ---------------- movimientos ----------------
  addMove(id) {
    if (this.slots.length >= this.maxMoves || this.hasMove(id)) return false;
    const m = G.Moves.instance(id, 1);
    this.moves.push(m);
    const group = [m];
    this.slots.push(group);
    this.arrange();
    // Se cambia al nuevo, salvo si estás usando un vínculo (no te quita el grupo).
    if (!(this.slots[this.active] && this.slots[this.active].length > 1)) this.setActive(this.slots.indexOf(group));
    return true;
  }

  /**
   * Huecos fijos (Mejoras → Atajos): cada movimiento con hueco elegido se pone
   * en ese número para la memoria muscular (Confusión siempre en el 1...).
   * Mientras no tengas tantos movimientos, va al más cercano; los demás
   * rellenan los huecos libres en el orden en que los aprendiste.
   */
  arrange() {
    const n = this.slots.length;
    if (n < 2 || !this.bind) return;
    const want = g => { let k = Infinity; for (const m of g) if (this.bind[m.id] != null) k = Math.min(k, this.bind[m.id]); return k; };
    const cur = this.slots[this.active];
    const out = new Array(n).fill(null);
    const bound = this.slots.filter(g => want(g) < Infinity).sort((a, b) => want(a) - want(b));
    for (const g of bound) {
      let p = Math.min(want(g), n - 1);
      while (p >= 0 && out[p]) p--;                          // ocupado: el de antes
      if (p < 0) { p = 0; while (out[p]) p++; }              // o el primero libre
      out[p] = g;
    }
    for (const g of this.slots) if (!out.includes(g)) out[out.indexOf(null)] = g;
    this.slots = out;
    if (cur) this.active = out.indexOf(cur);
  }

  hasMove(id) { return this.moves.some(m => m.id === id); }

  setActive(i, silent = false) {
    if (i < 0 || i >= this.slots.length || i === this.active) return;
    // Cinta Elección: no se puede cambiar de movimiento.
    if (this.hasItem('choiceband') && this.slots[this.active]) {
      if (!silent) G.FX.dmgText(this.x, this.y - this.bodyH - 8, 'Cinta Elección', '#ff8ad8');
      return;
    }
    this.active = i;
    G.Projectiles.clearOrbs(this);
    if (!silent) G.Audio.sfx('select');
    for (const m of this.slots[i]) m.t = Math.min(m.t, m.cd * 0.35);
    const m = this.slots[i][0];
    if (m) G.FX.ring(this.x, this.y - G.LIFT * 0.5, 6, this.r * (silent ? 2.4 : 3.4), G.U.TYPE_COLOR[m.type], 0.25, silent ? 2 : 3);
  }

  cycle(dir) {
    if (!this.slots.length) return;
    this.setActive((this.active + dir + this.slots.length) % this.slots.length);
  }

  /** Esquive táctico (tecla Espacio / Shift o botón táctil): impulso con invulnerabilidad breve. */
  tryDash() {
    if (this.dead || this.frozen || this.dashCd > 0 || this.dashT > 0) return false;
    const [ax, ay] = G.Input.axis();
    const ang = (ax !== 0 || ay !== 0) ? Math.atan2(ay, ax) : this.moveAngle || this.aim;
    this.moveAngle = ang;
    this.dashT = 0.22;
    this.dashMaxCd = Math.max(1.4, 2.6 * Math.max(0.55, this.cdMul));
    this.dashCd = this.dashMaxCd;
    this.invuln = Math.max(this.invuln, 0.34);
    const sp = Math.max(275, this.spd * 3.0);
    this.dashVx = Math.cos(ang) * sp;
    this.dashVy = Math.sin(ang) * sp;
    this.ghostTick = 0;
    G.Audio.sfx('shot', { kind: 'melee', type: this.mon.types[0] || 'normal' });
    G.FX.ring(this.x, this.y, 4, this.r * 2.8, '#7fe0ff', 0.26, 2.5);
    G.FX.burst(this.x, this.y - 4, '#b3f0ff', 8, 110);
    return true;
  }

  /** Racha de bajas consecutivas (combo). */
  onKill(e) {
    this.combo = (this.combo || 0) + 1;
    this.comboT = e && e.boss ? 5.0 : 3.5;
    if (this.combo > (this.bestCombo || 0)) this.bestCombo = this.combo;
    if (this.combo === 25 || (this.combo >= 50 && this.combo % 50 === 0)) {
      const bonus = Math.min(15, Math.floor(this.combo / 25) * 2);
      this.coins += bonus;
      G.FX.dmgText(this.x, this.y - this.bodyH - 18, `COMBO ×${this.combo}! +${bonus}`, '#7fe0ff', true);
      G.FX.ring(this.x, this.y, 6, this.r * 3.8, '#7fe0ff', 0.35, 3);
    }
  }

  // ---------------- vínculos (fusiones) ----------------
  // Cada legendario vencido da un vínculo. Con él se juntan movimientos en un
  // solo hueco y se lanzan a la vez. Sólo crece un grupo (hasta BOND_MAX); si
  // no hay ninguno a medias, el vínculo une dos movimientos sueltos.
  static get BOND_MAX() { return 4; }

  /** Lo que se puede hacer ahora con un vínculo: añadir a un grupo o unir dos sueltos. */
  bondOptions() {
    const loose = this.slots.filter(s => s.length === 1).map(s => s[0]);
    const grow = this.slots.find(s => s.length > 1 && s.length < Player.BOND_MAX);
    if (grow) return loose.length ? { mode: 'add', group: grow, loose } : null;
    return loose.length >= 2 ? { mode: 'pair', group: null, loose } : null;
  }

  /** Junta `moves` (sueltos) en el grupo `group` (o en uno nuevo) y gasta un vínculo. */
  fuse(moves, group = null) {
    const target = group || this.slots.find(s => s[0] === moves[0]);
    const cur = this.slots[this.active];
    for (const m of moves) {
      if (target.includes(m)) continue;
      const i = this.slots.findIndex(s => s.length === 1 && s[0] === m);
      if (i < 0) continue;
      this.slots.splice(i, 1);
      target.push(m);
    }
    this.arrange();
    // Se pasa al grupo, salvo con la Cinta Elección (sigues en el hueco que tenías, si queda).
    const a = this.slots.indexOf(cur);
    this.active = this.hasItem('choiceband') && a >= 0 ? a : this.slots.indexOf(target);
    this.bonds = Math.max(0, this.bonds - 1);
    G.Projectiles.clearOrbs(this);
    return target;
  }

  /** Movimientos que se lanzan ahora (el grupo del hueco activo). */
  activeGroup() { return this.slots[this.active] || []; }

  activeMove() { return this.activeGroup()[0]; }

  /**
   * Lo llama combat.js al lanzar un movimiento. Elige la animación de PMD y la
   * acelera si la recarga es más corta que la animación, para que encadene.
   */
  cast(m) {
    // Vidasfera: cada ataque cuesta un poco de vida (nunca te deja KO).
    if (this.hasItem('lifeorb') && !this.godMode && m.kind !== 'orbit' && m.kind !== 'trail' && !this.remote) {
      this.hp = Math.max(1, this.hp - Math.max(1, this.maxHp * 0.01));
    }
    const anim = { melee: 'Attack', beam: 'Shoot', projectile: 'Shoot', nova: 'Attack',
                   aura: 'Charge', buff: 'Charge', orbit: 'Charge', boomerang: 'Shoot', chain: 'Shoot',
                   mine: 'Charge', meteor: 'Charge', turret: 'Charge', dash: 'Attack', trail: 'Walk', cone: 'Shoot' }[m.kind] || 'Attack';
    // Las familias nuevas suenan como la parecida de las de siempre.
    const SND = { boomerang: 'projectile', chain: 'beam', mine: 'nova', meteor: 'nova', turret: 'buff', dash: 'melee', trail: 'aura', cone: 'projectile' };
    // El rastro no suena a cada charco (sería un zumbido constante).
    if (m.kind !== 'trail') G.Audio.sfx('shot', { kind: SND[m.kind] || m.kind, type: m.type });
    if (m.kind === 'trail') return;
    // No reinicies una animación que va por la mitad: se vería a tirones.
    if (this.anim.busy() && this.anim.progress() < 0.65) return;
    const meta = G.Sprites.animMeta(this.dex, anim);
    const len = meta ? meta.d.reduce((a, b) => a + b, 0) / 60 : 0.4;
    const cd = Math.max(0.12, m.cd * this.cdMul);
    this.anim.play(anim, { speed: Math.max(1, len / (cd * 0.9)) });
    this.attackFace = 0.35;
  }

  // ---------------- daño y curación ----------------
  /**
   * @param type  tipo del ataque (tabla de tipos y clima); sin tipo, daño tal cual
   * @param pure  daño que no baja con la defensa ni el cuerpo a cuerpo (Arceus)
   */
  hurt(amount, type = null, pure = false) {
    if (this.godMode || this.invuln > 0 || this.dead) return;
    let eff = null;
    if (type) {
      const k = G.Types.mult(type, this.mon.types);
      eff = G.Types.label(k);
      amount *= k * G.Weather.mult(type);
    }
    // Con un ataque cuerpo a cuerpo activo se recibe un 25 % menos: hay que
    // estar encima de los enemigos para pegar (iban muy por detrás).
    const close = this.activeGroup().some(m => m.kind === 'melee') ? 0.75 : 1;
    const d = pure ? Math.max(1, amount) : Math.max(1, amount * (1 - this.reduction) * close);
    this.hp -= d;
    this.invuln = 0.58;
    this.flash = 0.14;
    G.Audio.sfx('hurt');
    G.Camera.kick(0.28);
    G.FX.dmgText(this.x, this.y - this.bodyH - 4, '-' + Math.round(d), eff === 'super' ? '#ff3048' : eff === 'weak' ? '#c9a0a8' : '#ff6b7a', eff === 'super');
    G.FX.burst(this.x, this.y - this.bodyH * 0.5, '#ff5f6d', 6, 90);
    // Banda Focus: aguanta el golpe con 1 de vida (una vez cada 60 s).
    if (this.hp <= 0 && this.hasItem('focussash') && performance.now() - this.sashT > 60000) {
      this.sashT = performance.now();
      this.hp = 1; this.invuln = 1.2;
      G.FX.dmgText(this.x, this.y - this.bodyH - 16, '¡Banda Focus!', '#ff9a3d', true);
      G.FX.ring(this.x, this.y, 6, 70, '#ff9a3d', 0.5, 4);
    }
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true;
      this.anim.play('Faint', { hold: true });
      G.Projectiles.clearOrbs(this);
      this.reviveT = 0;
    }
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const got = Math.round(this.hp - before);
    if (got >= 1) G.FX.dmgText(this.x, this.y - this.bodyH - 6, '+' + got, '#5fe08a');
  }

  addMaxHp(amount) { this.maxHp += amount; this.hp += amount; }

  /** Devuelve cuántos niveles ha subido (pueden ser varios de golpe). */
  gainXp(amount) {
    this.xp += amount * this.xpMul;
    let leveled = 0;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = Player.xpFor(this.level);
      leveled++;
    }
    return leveled;
  }

  // ---------------- objeto equipado ----------------
  hasItem(id) { return this.item === id; }

  /** Se pone un objeto (y se quita el que llevara). */
  equip(id) {
    if (this.item) G.Items.BY[this.item].off(this);
    this.item = id;
    if (id) G.Items.BY[id].on(this);
  }

  /** Cascabel Concha: un poco de vida por el daño que haces (tope 4/s). */
  onDealt(dmg) {
    if (this.item === 'shellbell') this.bellHeal = Math.min(4, this.bellHeal + dmg * 0.04);
  }

  /** Poder de un altar (ver systems/interact.js): se aplica y se quita solo. */
  addPower(def, dur) {
    if (this.power) this.power.def.off(this);
    def.on(this);
    this.power = { def, t: dur, dur };
  }

  addBuff(stat, amount, dur, maxStacks) {
    const b = this.buffs[stat];
    if (!b) return;
    b.amount = amount;
    b.n = Math.min(maxStacks, b.n + 1);
    b.t = dur;
  }

  // ---------------- ciclo ----------------
  update(dt) {
    this.anim.update(dt);
    if (this.hpTrail == null) this.hpTrail = this.hp;
    if (this.hpTrail > this.hp) this.hpTrail = Math.max(this.hp, this.hpTrail - Math.max(14, (this.hpTrail - this.hp) * 4.2) * dt);
    else this.hpTrail = this.hp;

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].alpha -= dt * 2.6;
      if (this.afterimages[i].alpha <= 0) this.afterimages.splice(i, 1);
    }

    if (this.dead) return;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.attackFace > 0) this.attackFace -= dt;
    if (this.dashCd > 0) this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.noCd) {
      this.dashCd = 0;
      for (const m of this.moves) if (m.t > 0.06) m.t = 0.06;
    }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    for (const k in this.buffs) {
      const b = this.buffs[k];
      if (b.n > 0) { b.t -= dt; if (b.t <= 0) b.n = 0; }
    }
    if (this.slowT > 0) this.slowT -= dt;
    if (this.bellHeal > 0) { const h = Math.min(this.bellHeal, 4 * dt); this.hp = Math.min(this.maxHp, this.hp + h); this.bellHeal -= h; }
    if (this.power && (this.power.t -= dt) <= 0) { this.power.def.off(this); this.power = null; }
    if (this.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);

    // --- movimiento con colisiones ---
    // (En cooperativo la pausa no para el juego: sólo te quedas quieto.)
    const [ax, ay] = this.frozen ? [0, 0] : G.Input.axis();
    this.walking = ax !== 0 || ay !== 0 || this.dashT > 0;
    const s = this.spd;
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.ghostTick -= dt;
      if (this.ghostTick <= 0) {
        this.ghostTick = 0.038;
        this.afterimages.push({ x: this.x, y: this.y, dir: this.anim.dir, alpha: 0.52 });
      }
      this.x += this.dashVx * dt;
      this.y += this.dashVy * dt;
      G.World.collide(this);
    } else {
      // Hielo: resbalas (la velocidad cambia despacio).
      const slide = this.inLiquid && G.World.liquidEffect(this.mon.types).slide;
      this.svx = slide ? G.U.damp(this.svx || 0, ax * s * 1.15, 1.6, dt) : ax * s;
      this.svy = slide ? G.U.damp(this.svy || 0, ay * s * 1.15, 1.6, dt) : ay * s;
      this.x += this.svx * dt;
      this.y += this.svy * dt;
      G.World.collide(this);
      if (ax !== 0 || ay !== 0) this.moveAngle = Math.atan2(ay, ax);
    }

    // --- terreno líquido ---
    this.inLiquid = G.World.isLiquid(this.x, this.y);
    if (this.inLiquid) {
      const le = G.World.liquidEffect(this.mon.types);
      if (le.dmg) {
        this.lavaTick -= dt;
        if (this.lavaTick <= 0) {
          this.lavaTick = le.every; this.invuln = 0;
          this.hurt(Math.max(le.flat, this.maxHp * le.dmg * 0.5));
          G.FX.burst(this.x, this.y - 4, le.color, 5, 70);
        }
      } else if (this.walking && Math.random() < dt * 8) {
        G.FX.burst(this.x, this.y, le.slide ? '#ffffff' : '#b3defa', 2, 40);
      }
    }

    // --- apuntado: enemigo más cercano; si no hay, hacia donde caminas ---
    const all = G.EnemyMgr.all();
    const m = this.activeMove();
    const ranged = !!m && (m.kind === 'projectile' || m.kind === 'beam');
    const threat = G.Projectiles.nearest(all, this.x, this.y, this.r + 24);
    const boss = all.find(e => e.boss && !e.dead && G.U.dist(this.x, this.y, e.x, e.y) < 330);
    const tg = (ranged ? boss || threat : threat || boss)
            || G.Projectiles.nearest(all, this.x, this.y, 520)
            || G.World.nearestBreakable(this.x, this.y, 200);
    this.target = tg;
    if (tg) this.aim = Math.atan2(tg.y - this.y, tg.x - this.x);
    else if (this.walking) this.aim = this.moveAngle;

    // --- animación: mira al objetivo al atacar, si no a donde camina ---
    const face = this.attackFace > 0 || !this.walking ? this.aim : this.moveAngle;
    this.anim.dir = G.Sprites.dirFromAngle(face);
    this.anim.loop(this.walking ? 'Walk' : 'Idle', this.walking ? s / 110 : 1);
  }

  /** Vuelve a levantarse (lo revive un compañero en cooperativo). */
  revive(frac = 0.5) {
    this.dead = false;
    this.hp = Math.max(1, this.maxHp * frac);
    this.hpTrail = this.hp;
    this.invuln = 2;
    this.reviveT = 0;
    this.anim._start('Idle', false);
    G.FX.ring(this.x, this.y, 6, 70, '#5fe08a', 0.5, 4);
    G.FX.burst(this.x, this.y - this.bodyH * 0.5, '#9dffb8', 18, 150);
    G.Audio.sfx('heal');
  }

  // ---------------- compañero (cooperativo) ----------------

  netUpdate(dt) {
    this.anim.update(dt);
    const n = this.net;
    if (!n) return;
    if (this.flash > 0) this.flash -= dt;
    if (this.attackFace > 0) this.attackFace -= dt;
    if (G.U.dist2(this.x, this.y, n.x, n.y) > 300 * 300) { this.x = n.x; this.y = n.y; }
    else { this.x = G.U.damp(this.x, n.x, 14, dt); this.y = G.U.damp(this.y, n.y, 14, dt); }
    if (n.hp < this.hp - 0.5 && !n.dead) this.flash = 0.14;
    this.hp = n.hp; this.maxHp = n.maxHp;
    this.magnet = n.mag || this.magnet;
    this.reviveT = n.rev || 0;
    if (n.dead && !this.dead) { this.dead = true; this.anim.play('Faint', { hold: true }); G.Projectiles.clearOrbs(this); }
    else if (!n.dead && this.dead) this.revive(n.hp / (n.maxHp || 1));
    if (n.mv && (!this.moves[0] || this.moves[0].id !== n.mv || this.moves[0].lvl !== n.ml) && G.Moves.BY_ID[n.mv]) {
      this.moves = [G.Moves.instance(n.mv, n.ml || 1)];
      this.slots = [this.moves.slice()];
      this.active = 0;
      G.Projectiles.clearOrbs(this);
    }
    if (this.dead) return;
    this.walking = !!n.walk;
    this.moveAngle = n.ang;
    this.aim = n.aim;
    const face = this.attackFace > 0 || !this.walking ? this.aim : this.moveAngle;
    this.anim.dir = G.Sprites.dirFromAngle(face);
    this.anim.loop(this.walking ? 'Walk' : 'Idle', this.walking ? this.baseSpd / 110 : 1);
  }

  draw(ctx) {
    // Estelas fantasma del esquive (dash).
    if (this.afterimages && this.afterimages.length) {
      const prevDir = this.anim.dir;
      for (const gh of this.afterimages) {
        this.anim.dir = gh.dir;
        this.anim.draw(ctx, gh.x, gh.y, { flash: true, softFlash: true, alpha: gh.alpha * 0.65, color: '#7fe0ff' });
      }
      this.anim.dir = prevDir;
    }

    // Halo del tipo del movimiento activo bajo los pies.
    const m = this.activeMove();
    if (m && !this.dead) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = G.U.TYPE_COLOR[m.type];
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.5, this.r * 0.6, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    // Arco de recarga del esquive táctico bajo los pies.
    if (!this.remote && !this.dead && this.dashCd > 0) {
      const readyFrac = 1 - G.U.clamp(this.dashCd / (this.dashMaxCd || 3.6), 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#7fe0ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r * 1.2, this.r * 0.48, 0, -Math.PI / 2, -Math.PI / 2 + 6.2832 * readyFrac);
      ctx.stroke();
      ctx.restore();
    }

    G.Sprites.drawShadow(ctx, this.dex, this.x, this.y);
    // Poder de altar: aro de su color latiendo bajo los pies.
    if (this.power && !this.dead) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 120) * 0.15;
      ctx.strokeStyle = this.power.def.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 2.1, this.r * 0.85, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    const alpha = this.invuln > 0 && !this.dead ? (Math.floor(this.invuln * 18) % 2 ? 0.45 : 1) : 1;
    this.anim.draw(ctx, this.x, this.y, { flash: this.flash > 0, softFlash: true, alpha, color: '#ffcb3d' });

    // Arcos de buff alrededor de los pies.
    const COL = { atk: '#ff6b4d', spd: '#7fe0ff', def: '#b0b8c8', regen: '#5fe08a' };
    let i = 0;
    for (const k in this.buffs) {
      const b = this.buffs[k];
      if (b.n <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = COL[k];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r * 1.8 + i * 5, (this.r * 1.8 + i * 5) * 0.42, 0, 0, 6.2832 * (b.n / 5));
      ctx.stroke();
      ctx.restore();
      i++;
    }

    // Cooperativo: anillo de "reviviendo" y nombre encima.
    if (this.dead && this.reviveT > 0) {
      ctx.save();
      ctx.strokeStyle = '#5fe08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r * 2.4, this.r * 1.0, 0, -Math.PI / 2, -Math.PI / 2 + 6.2832 * Math.min(1, this.reviveT / G.Player.REVIVE_TIME));
      ctx.stroke();
      ctx.restore();
    }
    if (this.tag) {
      ctx.save();
      ctx.font = '700 7px Pixelify,"Segoe UI",sans-serif';
      ctx.textAlign = 'center';
      const y = this.y - this.bodyH - 8;
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(this.tag, this.x, y);
      ctx.fillStyle = this.dead ? '#ff8a96' : this.tagColor || '#fff';
      ctx.fillText(this.tag, this.x, y);
      if (this.dead) {
        ctx.font = '700 6px Pixelify,"Segoe UI",sans-serif';
        ctx.strokeText(this.revLabel || '', this.x, y - 8);
        ctx.fillText(this.revLabel || '', this.x, y - 8);
      }
      ctx.restore();
    }
  }
};
