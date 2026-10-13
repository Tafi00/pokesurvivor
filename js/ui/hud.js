/* ============ hud.js — interfaz dentro del canvas ============
 * Se dibuja en coordenadas de PANTALLA (sin la transformación de cámara).
 */
G.HUD = (() => {
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bar(ctx, x, y, w, h, frac, col, bg = 'rgba(0,0,0,.55)', trailFrac = 0) {
    roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    if (trailFrac > frac || frac > 0) {
      ctx.save();
      roundRect(ctx, x, y, w, h, h / 2); ctx.clip();
      if (trailFrac > frac) {
        ctx.fillStyle = 'rgba(255,235,170,.75)';
        ctx.fillRect(x, y, w * G.U.clamp(trailFrac, 0, 1), h);
      }
      if (frac > 0) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, w * G.U.clamp(frac, 0, 1), h);
      }
      ctx.restore();
    }
  }

  function drawMinimap(ctx, w, h, pl, touch, hasWeather) {
    const show = G.Settings.get('minimap') !== false;
    const S = 84, R = S / 2;
    const x0 = w - S - 16 - (touch ? 56 : 0);
    const y0 = 14 + (hasWeather ? 32 : 0);
    const mx = x0 + R, my = y0 + R;

    if (!show) {
      const bw = 66, bh = 22, bx = w - bw - 16 - (touch ? 56 : 0);
      roundRect(ctx, bx, y0, bw, bh, 8);
      ctx.fillStyle = 'rgba(15, 28, 60, 0.82)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(244, 248, 255, 0.55)'; ctx.stroke();
      ctx.font = F(800, 9); ctx.fillStyle = '#d8e6ff'; ctx.textAlign = 'center';
      ctx.fillText('MAPA [M]', bx + bw / 2, y0 + 14);
      G.Touch.addButton(bx, y0, bw, bh, () => { G.Settings.set('minimap', true); G.Audio.sfx('select'); }, 4);
      return;
    }

    ctx.save();
    G.Touch.addButton(x0, y0, S, S, () => { G.Settings.set('minimap', false); G.Audio.sfx('select'); }, 4);

    // Sombra exterior y marco estilo PMD
    roundRect(ctx, x0, y0, S, S, 10);
    ctx.fillStyle = 'rgba(12, 24, 54, 0.84)';
    ctx.fill();
    ctx.save();
    roundRect(ctx, x0 + 2, y0 + 2, S - 4, S - 4, 8);
    ctx.clip();

    const scale = R / 640; // 640 px de mundo caben en medio lado del mapa
    // Obstáculos y agua cercanos (bloques pixel-art)
    if (G.World.terrainAt) {
      const TS = G.World.TS || 32;
      const ptx = Math.floor(pl.x / TS), pty = Math.floor(pl.y / TS);
      for (let dy = -18; dy <= 18; dy += 2) {
        for (let dx = -18; dx <= 18; dx += 2) {
          const k = G.World.terrainAt(ptx + dx, pty + dy);
          if (!k) continue;
          const px = Math.round(mx + dx * TS * scale) - 1;
          const py = Math.round(my + dy * TS * scale) - 1;
          ctx.fillStyle = k === 1 ? 'rgba(175, 200, 235, 0.28)' : 'rgba(79, 180, 255, 0.34)';
          ctx.fillRect(px, py, 3, 3);
        }
      }
    }

    // Objetos interactivos cercanos (altares, manantiales, cofres grandes)
    if (G.World.specialsNear) {
      for (const sp of G.World.specialsNear(pl.x, pl.y, 640)) {
        const px = Math.round(mx + (sp.x - pl.x) * scale) - 2;
        const py = Math.round(my + (sp.y - pl.y) * scale) - 2;
        ctx.fillStyle = sp.kind === 'altar' ? '#c47bff' : sp.kind === 'spring' ? '#5fe08a' : '#ffd23f';
        ctx.fillRect(px, py, 4, 4);
      }
    }

    // Grieta dimensional
    const rift = G.Rift.rift;
    if (rift) {
      const rx = G.U.clamp(Math.round(mx + (rift.x - pl.x) * scale), x0 + 5, x0 + S - 5);
      const ry = G.U.clamp(Math.round(my + (rift.y - pl.y) * scale), y0 + 5, y0 + S - 5);
      ctx.fillStyle = '#1a0b33';
      ctx.fillRect(rx - 3, ry - 3, 6, 6);
      ctx.fillStyle = '#d9a6ff';
      ctx.fillRect(rx - 2, ry - 2, 4, 4);
    }

    // Enemigos, jefes y shinies (puntos cuadrados estilo PMD)
    for (const e of G.EnemyMgr.all()) {
      if (e.dead) continue;
      const dx = (e.x - pl.x) * scale, dy = (e.y - pl.y) * scale;
      if (!e.boss && !e.shiny && (Math.abs(dx) > R || Math.abs(dy) > R)) continue;
      const ex = G.U.clamp(Math.round(mx + dx), x0 + 4, x0 + S - 4);
      const ey = G.U.clamp(Math.round(my + dy), y0 + 4, y0 + S - 4);
      if (e.shiny) {
        ctx.fillStyle = '#0b1838'; ctx.fillRect(ex - 3, ey - 3, 6, 6);
        ctx.fillStyle = '#9ae6ff'; ctx.fillRect(ex - 2, ey - 2, 4, 4);
      } else if (e.boss) {
        ctx.fillStyle = '#0b1838'; ctx.fillRect(ex - 3, ey - 3, 6, 6);
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(ex - 2, ey - 2, 4, 4);
      } else {
        ctx.fillStyle = 'rgba(255, 95, 109, 0.82)';
        ctx.fillRect(ex - 1, ey - 1, 2, 2);
      }
    }

    // Compañeros en cooperativo
    if (G.Coop.active) {
      for (const m of G.Coop.mates) {
        if (!m.connected) continue;
        const cx = G.U.clamp(Math.round(mx + (m.pl.x - pl.x) * scale), x0 + 4, x0 + S - 4);
        const cy = G.U.clamp(Math.round(my + (m.pl.y - pl.y) * scale), y0 + 4, y0 + S - 4);
        ctx.fillStyle = '#0b1838'; ctx.fillRect(cx - 3, cy - 3, 5, 5);
        ctx.fillStyle = m.color || '#5fe08a'; ctx.fillRect(cx - 2, cy - 2, 3, 3);
      }
    }

    // Jugador en el centro
    const px = Math.round(mx), py = Math.round(my);
    ctx.fillStyle = '#0b1838';
    ctx.fillRect(px - 3, py - 3, 6, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 2, py - 2, 4, 4);
    ctx.restore();

    // Doble borde estilo ventana PMD
    roundRect(ctx, x0, y0, S, S, 10);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(7, 15, 36, 0.9)';
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = 'rgba(244, 248, 255, 0.78)';
    ctx.stroke();

    ctx.font = F(800, 8);
    ctx.fillStyle = 'rgba(216, 230, 255, 0.78)';
    ctx.textAlign = 'right';
    ctx.fillText('M', x0 + S - 5, y0 + S - 5);
    ctx.restore();
  }

  function draw(ctx, w, h, pl, st) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    G.Touch.clearButtons();
    const touch = G.Touch.active;

    // ---------- barra de experiencia (borde superior) ----------
    const xpF = pl.xp / pl.xpNext;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, 0, w, 7);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#4fd1ff'); g.addColorStop(1, '#a98bff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w * G.U.clamp(xpF, 0, 1), 7);

    // ---------- vida + nivel ----------
    const px = 16, py = 20;
    ctx.font = F(800, 13);
    ctx.fillStyle = '#eaf2ff';
    ctx.textAlign = 'left';
    ctx.fillText(pl.mon.name, px, py + 10);

    ctx.font = F(700, 11);
    ctx.fillStyle = '#ffcb3d';
    ctx.fillText('Nv. ' + pl.level, px, py + 26);

    bar(ctx, px + 48, py + 17, 168, 11, pl.hp / pl.maxHp, '#ff5f6d', 'rgba(0,0,0,.55)', (pl.hpTrail || pl.hp) / pl.maxHp);
    ctx.font = F(700, 10);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(pl.hp) + ' / ' + Math.round(pl.maxHp), px + 48 + 84, py + 26);

    // buffs activos
    const COL = { atk: '#ff6b4d', spd: '#7fe0ff', def: '#b0b8c8', regen: '#5fe08a' };
    const LBL = { atk: 'ATK', spd: 'VEL', def: 'DEF', regen: 'REG' };
    let bx = px;
    ctx.textAlign = 'left';
    for (const k in pl.buffs) {
      const b = pl.buffs[k];
      if (b.n <= 0) continue;
      ctx.font = F(800, 9);
      const txt = LBL[k] + ' ×' + b.n;
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
      ctx.fillStyle = COL[k];
      ctx.fillText(txt, bx + 6, py + 45);
      bx += tw + 5;
    }

    // ---------- racha de combo + DPS ----------
    if (pl.combo >= 3 && pl.comboT > 0) {
      const cCol = pl.combo >= 50 ? '#ff8ad8' : pl.combo >= 25 ? '#ffd23f' : '#7fe0ff';
      ctx.font = F(800, 10);
      const cTxt = 'COMBO ×' + pl.combo;
      const cw = ctx.measureText(cTxt).width + 14;
      roundRect(ctx, bx, py + 34, cw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fill();
      ctx.fillStyle = cCol;
      ctx.fillText(cTxt, bx + 7, py + 45);
      // Pequeña barra de tiempo restante del combo
      ctx.fillStyle = cCol;
      ctx.fillRect(bx + 4, py + 47, (cw - 8) * G.U.clamp(pl.comboT / 3.8, 0, 1), 1.5);
      bx += cw + 5;
    }

    // ---------- reloj / bioma / kills ----------
    ctx.textAlign = 'center';
    ctx.font = F(800, 26);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fillText(G.U.mmss(st.time), w / 2, 42);
    ctx.font = F(600, 10);
    ctx.fillStyle = '#8fa3c4';
    const dps = st.time > 2 && pl.dmgDealt ? Math.round(pl.dmgDealt / st.time) : 0;
    ctx.fillText(G.World.biomeName().toUpperCase() + '  ·  ' + pl.kills + ' DERROTADOS  ·  ' + pl.coins + ' MONEDAS' + (dps > 0 ? '  ·  ' + dps + ' DPS' : ''), w / 2, 58);

    // ---------- clima (arriba a la derecha) ----------
    const wx = G.Weather.current;
    if (wx) {
      ctx.font = F(800, 11);
      ctx.textAlign = 'left';
      const txt = wx.name.toUpperCase() + ' · ' + Math.ceil(wx.left) + 's';
      const tw = ctx.measureText(txt).width + 40;
      const x0 = w - tw - 16 - (touch ? 56 : 0), y0 = 14;
      roundRect(ctx, x0, y0, tw, 26, 9);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
      G.Icons.draw(ctx, wx.icon, x0 + 6, y0 + 3, 20);
      ctx.fillStyle = wx.color;
      ctx.fillText(txt, x0 + 32, y0 + 17);
    }

    // ---------- minimapa radar (arriba a la derecha) ----------
    drawMinimap(ctx, w, h, pl, touch, !!wx);

    // ---------- barra del jefe ----------
    const boss = G.EnemyMgr.all().find(e => e.boss && !e.dead);
    if (boss) {
      boss.hpTrail = boss.hpTrail === undefined ? boss.hp : boss.hp > boss.hpTrail ? boss.hp : boss.hpTrail + (boss.hp - boss.hpTrail) * 0.08;
      const bw = Math.min(420, w - 80);
      bar(ctx, (w - bw) / 2, 70, bw, 12, boss.hp / boss.maxHp, '#ffcb3d', 'rgba(0,0,0,.55)', boss.hpTrail / boss.maxHp);
      ctx.font = F(800, 10);
      ctx.fillStyle = '#20160a';
      ctx.fillText(boss.name.toUpperCase(), w / 2, 80);
    }

    // ---------- aviso ----------
    // ---------- shinies fuera de pantalla: destello en el borde ----------
    const cam = G.Camera, pulse = 0.6 + Math.sin(performance.now() / 160) * 0.4;
    for (const e of G.EnemyMgr.shinies()) {
      const sx = (e.x - cam.left()) * cam.scale, sy = (e.y - cam.top()) * cam.scale;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M = 34;
      const ex = G.U.clamp(sx, M, w - M), ey = G.U.clamp(sy, M + 60, h - M - 70);
      const a = Math.atan2(sy - ey, sx - ex);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.translate(ex, ey);
      ctx.fillStyle = '#9ae6ff';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
      ctx.lineTo(Math.cos(a + 2.5) * 12, Math.sin(a + 2.5) * 12);
      ctx.lineTo(Math.cos(a - 2.5) * 12, Math.sin(a - 2.5) * 12);
      ctx.fill();
      ctx.globalAlpha = 1;
      G.Icons.draw(ctx, 'shiny', -12, -12, 24);
      ctx.restore();
    }

    // Poder de altar activo.
    if (pl.power) {
      const pw = pl.power, txt = pw.def.name.toUpperCase() + ' ' + Math.ceil(pw.t) + 's';
      ctx.font = F(800, 9);
      ctx.textAlign = 'left';
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
      ctx.fillStyle = pw.def.color;
      ctx.fillText(txt, bx + 6, py + 45);
      bx += tw + 5;
    }

    if (G.Coop.active) drawCoop(ctx, w, h, pl, px, py + (bx > px ? 56 : 40));

    // Grieta: flecha grande que late en el borde si no se ve, y si se ve, una
    // flecha que bota encima; en la arena, cuenta atrás.
    const rift = G.Rift.rift;
    if (rift) {
      const sx = (rift.x - cam.left()) * cam.scale, sy = (rift.y - 40 - cam.top()) * cam.scale;
      const now = performance.now() / 1000, beat = 0.5 + Math.sin(now * 7) * 0.5;
      const label = 'GRIETA · ' + Math.round(G.U.dist(pl.x, pl.y, rift.x, rift.y) / 32) + ' m · ' + Math.ceil(rift.ttl) + ' s';
      const off = sx < 0 || sx > w || sy < 0 || sy > h;
      ctx.save();
      if (off) {
        const M = 52, ex = G.U.clamp(sx, M, w - M), ey = G.U.clamp(sy, M + 70, h - M - 80);
        const a = Math.atan2(sy - ey, sx - ex), ca = Math.cos(a), sa = Math.sin(a);
        ctx.translate(ex, ey);
        // Halo que late.
        ctx.globalAlpha = 0.18 + beat * 0.22;
        ctx.fillStyle = '#b48aff';
        ctx.beginPath(); ctx.arc(0, 0, 30 + beat * 8, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        const tri = (k) => {
          ctx.beginPath();
          ctx.moveTo(ca * 40 * k, sa * 40 * k);
          ctx.lineTo(Math.cos(a + 2.45) * 20 * k, Math.sin(a + 2.45) * 20 * k);
          ctx.lineTo(Math.cos(a - 2.45) * 20 * k, Math.sin(a - 2.45) * 20 * k);
          ctx.closePath();
        };
        tri(1.12); ctx.fillStyle = '#1a0b33'; ctx.fill();
        tri(1); ctx.fillStyle = beat > 0.5 ? '#e2d0ff' : '#a06bff'; ctx.fill();
        ctx.font = F(800, 12);
        ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
        const lx = -ca * 34, ly = -sa * 30 + 4;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = '#e2d0ff';
        ctx.fillText(label, lx, ly);
      } else {
        // Encima de la grieta: flecha hacia abajo que bota.
        const by = sy - 46 - Math.abs(Math.sin(now * 4)) * 10;
        ctx.translate(sx, by);
        ctx.beginPath(); ctx.moveTo(-15, -12); ctx.lineTo(15, -12); ctx.lineTo(0, 8); ctx.closePath();
        ctx.lineWidth = 4; ctx.strokeStyle = '#1a0b33'; ctx.stroke();
        ctx.fillStyle = beat > 0.5 ? '#e2d0ff' : '#a06bff'; ctx.fill();
        ctx.font = F(800, 11); ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        const l2 = 'GRIETA · ' + Math.ceil(rift.ttl) + ' s';
        ctx.strokeText(l2, 0, -18); ctx.fillStyle = '#e2d0ff'; ctx.fillText(l2, 0, -18);
      }
      ctx.restore();
    }
    if (G.Rift.inArena) {
      ctx.textAlign = 'center';
      ctx.font = F(800, 12);
      ctx.fillStyle = '#d9c2ff';
      ctx.fillText('GRIETA · ' + G.U.mmss(G.Rift.timeLeft), w / 2, boss ? 98 : 76);
    }

    // Eventos: cuenta atrás, flecha al Pokémon perdido / a la marca y a los duendes.
    G.Events.drawHud(ctx, w, h, pl, F);

    // Aviso propio al abrirse una grieta (no lo tapan los otros avisos).
    if (rift && rift.t < 4.5) {
      const a = Math.min(1, rift.t * 4, (4.5 - rift.t) * 2), pop = 1 + Math.max(0, 0.25 - rift.t) * 1.6;
      const y0 = h * 0.2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(w / 2, y0); ctx.scale(pop, pop);
      ctx.font = F(800, 20);
      const t1 = '¡SE HA ABIERTO UNA GRIETA!', t2 = 'Sigue la flecha morada: dentro te espera un legendario';
      const bw = Math.min(w - 24, Math.max(ctx.measureText(t1).width, (ctx.font = F(700, 11), ctx.measureText(t2).width)) + 36);
      roundRect(ctx, -bw / 2, -26, bw, 52, 10);
      ctx.fillStyle = 'rgba(26,11,51,.88)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#b48aff'; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = F(800, 20); ctx.fillStyle = '#e2d0ff'; ctx.fillText(t1, 0, -2);
      ctx.font = F(700, 11); ctx.fillStyle = '#c9b0ff'; ctx.fillText(t2, 0, 16);
      ctx.restore();
    }

    const ban = G.Spawner.banner();
    if (ban) {
      const a = Math.min(1, ban.t * 1.6);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = F(800, 22);
      ctx.fillStyle = '#ffcb3d';
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4;
      ctx.strokeText(ban.text, w / 2, h * 0.3);
      ctx.fillText(ban.text, w / 2, h * 0.3);
      ctx.restore();
    }

    // ---------- ranura de movimientos ----------
    const S = 54, GAP = 9;
    const n = Math.max(1, pl.slots.length);
    const totalW = n * S + (n - 1) * GAP;
    let sx = (w - totalW) / 2;
    // Por encima de la barra de inicio del iPhone (allí los toques a veces no llegan).
    const sy = h - S - 18 - (touch ? Math.min(28, G.Touch.safeArea().bottom) : 0);
    const BOND = '#ff8ad8';
    const cdOf = m => m.kind === 'orbit' ? 0 : G.U.clamp(m.t / (m.cd * pl.cdMul), 0, 1);

    for (let i = 0; i < n; i++) {
      const g = pl.slots[i] || [];
      const m = g[0];
      const fused = g.length > 1;
      const on = i === pl.active;
      const x = sx + i * (S + GAP);
      const y = on ? sy - 6 : sy;
      // Tocar (o hacer clic en) un icono activa ese movimiento.
      if (m) G.Touch.addButton(x, y, S, S, () => { if (G.Game.state === 'playing' && pl.active !== i) { pl.setActive(i); G.Audio.sfx('click'); } }, GAP / 2 + 3);
      const col = m ? G.U.TYPE_COLOR[m.type] : '#4a5468';

      // fondo
      roundRect(ctx, x, y, S, S, 12);
      ctx.fillStyle = on ? 'rgba(20,30,50,.95)' : 'rgba(10,16,28,.8)';
      ctx.fill();
      ctx.lineWidth = on ? 2.5 : fused || (m && m.evolved) ? 2 : 1.2;
      // Vínculo: borde rosa. Evolucionado: dorado.
      ctx.strokeStyle = fused ? BOND : m && m.evolved ? '#ffd23f' : on ? col : 'rgba(140,170,210,.22)';
      ctx.stroke();

      if (!m) continue;

      if (fused) {
        // Vínculo: los movimientos en una cuadrícula de 2×2, cada uno con su recarga.
        const C = 22, P = (S - C * 2) / 3;
        g.forEach((gm, k) => {
          const cx = x + P + (k % 2) * (C + P), cy = y + P + Math.floor(k / 2) * (C + P);
          G.Icons.draw(ctx, 'move:' + gm.id, cx, cy, C);
          const f = cdOf(gm);
          if (f > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx, cy, C, C * f); }
          if (gm.evolved) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, C - 1, C - 1); }
          // Destello al lanzarse.
          const fl = 1 - (performance.now() - (gm.castAt || 0)) / 180;
          if (fl > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (fl * 0.55).toFixed(2) + ')'; ctx.fillRect(cx, cy, C, C); }
        });
      } else {
        // recarga: se vacía de abajo a arriba
        const cdFrac = cdOf(m);
        if (cdFrac > 0) {
          ctx.save();
          roundRect(ctx, x, y, S, S, 12); ctx.clip();
          ctx.fillStyle = 'rgba(0,0,0,.6)';
          ctx.fillRect(x, y, S, S * cdFrac);
          ctx.restore();
        }

        // emblema del tipo + insignia de la familia
        G.Icons.draw(ctx, 'move:' + m.id, x + (S - 32) / 2, y + (S - 32) / 2 - 2, 32);

        // nivel del movimiento (puntitos)
        const dots = m.def.maxLvl;
        const dw = 4, dgap = 2;
        const tw = dots * dw + (dots - 1) * dgap;
        for (let d = 0; d < dots; d++) {
          ctx.fillStyle = d < m.lvl ? col : 'rgba(255,255,255,.18)';
          ctx.fillRect(x + (S - tw) / 2 + d * (dw + dgap), y + S - 9, dw, 3);
        }
      }

      // tecla
      ctx.font = F(800, 9);
      ctx.fillStyle = fused ? BOND : on ? col : 'rgba(180,200,230,.6)';
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1), x + 3, y + 10);

      // nombre encima del activo (con un vínculo: "Ascuas +2")
      if (on) {
        ctx.font = F(700, 10);
        ctx.textAlign = 'center';
        ctx.fillStyle = fused ? BOND : col;
        ctx.fillText(fused ? m.name + ' +' + (g.length - 1) : m.name, x + S / 2, y - 7);
      }
    }

    // ---------- ranura de impulso (a la derecha de los movimientos, simétrica al objeto) ----------
    {
      const rx = sx + totalW + 18, ry = sy;
      const dFrac = pl.dashMaxCd ? G.U.clamp(pl.dashCd / (pl.dashMaxCd * Math.pow(pl.cdMul, 0.5)), 0, 1) : 0;
      const ready = dFrac <= 0;

      // Casilla 54×54 estilo PMD con icono pixel-art 'boot'
      roundRect(ctx, rx, ry, S, S, 12);
      ctx.fillStyle = ready ? 'rgba(20, 30, 50, 0.92)' : 'rgba(10, 16, 28, 0.8)';
      ctx.fill();
      if (dFrac > 0) {
        ctx.save();
        roundRect(ctx, rx, ry, S, S, 12); ctx.clip();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(rx, ry, S, S * dFrac);
        ctx.restore();
      }
      ctx.lineWidth = ready ? 2 : 1.2;
      ctx.strokeStyle = ready ? '#7fe0ff' : 'rgba(140, 170, 210, 0.22)';
      ctx.stroke();

      G.Icons.draw(ctx, 'boot', rx + (S - 32) / 2, ry + (S - 32) / 2 + 1, 32);

      // Tecla / cuenta atrás en la esquina superior izquierda (igual que las ranuras 1-4)
      ctx.font = F(800, 9);
      ctx.fillStyle = ready ? '#7fe0ff' : 'rgba(180, 200, 230, 0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(ready ? 'Esp' : pl.dashCd.toFixed(1) + 's', rx + 4, ry + 10);
      G.Touch.addButton(rx, ry, S, S, () => { if (G.Game.state === 'playing') pl.tryDash(); }, 4);

      // Pastilla AUTO [C] justo encima de la casilla
      const autoOn = !!G.Settings.get('autoCycle');
      const ay = ry - 18, ah = 14;
      roundRect(ctx, rx, ay, S, ah, 6);
      ctx.fillStyle = autoOn ? 'rgba(26, 68, 50, 0.92)' : 'rgba(10, 16, 28, 0.75)';
      ctx.fill();
      ctx.lineWidth = autoOn ? 1.5 : 1;
      ctx.strokeStyle = autoOn ? '#5fe08a' : 'rgba(140, 170, 210, 0.25)';
      ctx.stroke();
      ctx.font = F(800, 8);
      ctx.textAlign = 'center';
      ctx.fillStyle = autoOn ? '#5fe08a' : '#9fb1c9';
      ctx.fillText(touch ? 'AUTO' : 'AUTO · C', rx + S / 2, ay + 10);
      G.Touch.addButton(rx, ay, S, ah, () => {
        G.Settings.set('autoCycle', !G.Settings.get('autoCycle'));
        G.Audio.sfx('select');
      }, 4);

      // ---------- vínculo guardado (aún no hay dos movimientos sueltos) ----------
      if (pl.bonds > 0) {
        const bx2 = rx + S + 12, by2 = sy + S / 2 - 12;
        G.Icons.draw(ctx, 'bond', bx2, by2, 24);
        if (pl.bonds > 1) {
          ctx.font = F(800, 10);
          ctx.textAlign = 'left';
          ctx.fillStyle = BOND;
          ctx.fillText('×' + pl.bonds, bx2 + 25, by2 + 20);
        }
      }
    }

    // ---------- objeto equipado (a la izquierda de los movimientos) ----------
    {
      const ix = sx - S - 18, iy = sy;
      roundRect(ctx, ix, iy, S, S, 12);
      ctx.fillStyle = pl.item ? 'rgba(40,30,10,.9)' : 'rgba(10,16,28,.55)';
      ctx.fill();
      ctx.lineWidth = pl.item ? 2 : 1;
      ctx.strokeStyle = pl.item ? '#ffd23f' : 'rgba(140,170,210,.18)';
      ctx.stroke();
      if (pl.item) {
        G.Icons.draw(ctx, pl.item, ix + (S - 36) / 2, iy + (S - 36) / 2, 36);
        ctx.font = F(700, 9);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(G.Items.BY[pl.item].name, ix + S / 2, iy - 6);
      }
    }

    // ---------- botón de pausa (táctil) ----------
    if (touch) {
      const sa = G.Touch.safeArea();
      const bx = w - 52 - Math.min(44, sa.right), by = 12 + Math.min(20, sa.top), bs = 40;
      roundRect(ctx, bx, by, bs, bs, 10);
      ctx.fillStyle = 'rgba(10,16,28,.7)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,248,255,.8)'; ctx.stroke();
      ctx.fillStyle = '#f4f8ff';
      ctx.fillRect(bx + 13, by + 11, 5, 18); ctx.fillRect(bx + 22, by + 11, 5, 18);
      G.Touch.addButton(bx, by, bs, bs, () => G.Game.togglePause(), 8);
    }

    // pista de controles
    if (st.time < 14) {
      ctx.font = F(600, 10);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(180,200,230,.55)';
      ctx.fillText(touch ? 'Arrastra el dedo para moverte  ·  toca un ataque, AUTO o DASH'
                         : 'WASD moverse  ·  Espacio impulso  ·  1-4 / Q / E o C (auto) ataque  ·  M mapa  ·  Esc pausa', w / 2, h - 4);
    }

    ctx.restore();
  }

  // ---------------- cooperativo ----------------

  /**
   * - Vida de cada compañero debajo de la tuya.
   * - Flecha en el borde de la pantalla hacia los que no se ven, con su nombre
   *   y a cuántos metros están (roja y parpadeando si está caído).
   * - Si has caído tú: aviso y barra de "te están levantando".
   */
  function drawCoop(ctx, w, h, pl, px, top) {
    const cam = G.Camera;
    const t = performance.now() / 1000;
    let y = top;
    ctx.textAlign = 'left';
    for (const m of G.Coop.mates) {
      if (!m.connected) continue;
      const o = m.pl;
      ctx.font = F(800, 10);
      ctx.fillStyle = m.color;
      ctx.fillText(m.name, px, y + 9);
      const lx = px + 78;
      bar(ctx, lx, y + 1, 110, 8, o.dead ? 0 : o.hp / o.maxHp, o.dead ? '#ff5f6d' : '#5fe08a');
      if (o.dead) {
        ctx.font = F(800, 9);
        ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ff8a96' : '#ffd0d5';
        ctx.fillText('CAÍDO', lx + 116, y + 9);
      }
      y += 15;
    }

    // Flechas hacia los compañeros fuera de la vista.
    for (const m of G.Coop.mates) {
      if (!m.connected) continue;
      const o = m.pl;
      const sx = (o.x - cam.left()) * cam.scale, sy = (o.y - o.bodyH * 0.5 - cam.top()) * cam.scale;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M = 42;
      const ex = G.U.clamp(sx, M, w - M), ey = G.U.clamp(sy, M + 70, h - M - 80);
      const a = Math.atan2(sy - ey, sx - ex);
      const metres = Math.round(G.U.dist(pl.x, pl.y, o.x, o.y) / 32);
      const col = o.dead ? (Math.sin(t * 8) > 0 ? '#ff5f6d' : '#ffd0d5') : m.color;
      ctx.save();
      ctx.translate(ex, ey);
      // Flecha
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, 6.2832); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
      ctx.lineTo(Math.cos(a + 2.4) * 14, Math.sin(a + 2.4) * 14);
      ctx.lineTo(Math.cos(a - 2.4) * 14, Math.sin(a - 2.4) * 14);
      ctx.closePath(); ctx.fill();
      // Inicial del compañero dentro del círculo
      ctx.font = F(800, 14);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(m.name.charAt(0).toUpperCase(), 0, 5);
      // Nombre y distancia: al lado contrario de la flecha, para que no se salga
      const lx = -Math.cos(a) * 30, ly = -Math.sin(a) * 26 + 4;
      ctx.font = F(800, 12);
      const label = (o.dead ? '¡' + m.name + ' necesita ayuda! ' : m.name + ' ') + '· ' + metres + ' m';
      ctx.textAlign = Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = col;
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }

    // Tú, caído.
    if (pl.dead) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = F(800, 20);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      const msg = G.Coop.players().every(p => p.dead) ? 'Habéis caído todos…' : 'Has caído: un compañero puede levantarte';
      ctx.strokeText(msg, w / 2, h * 0.62);
      ctx.fillStyle = '#ffb0b8';
      ctx.fillText(msg, w / 2, h * 0.62);
      const f = (pl.reviveT || 0) / G.Player.REVIVE_TIME;
      if (f > 0) bar(ctx, w / 2 - 110, h * 0.62 + 12, 220, 10, f, '#5fe08a');
      ctx.restore();
    }
  }

  return { draw, roundRect, bar };
})();
