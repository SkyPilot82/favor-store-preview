/**
 * FAVOR — How to Play v3: the fully guided game (branch howto-v3)
 *
 * A hand-holding walk through a REAL game where THE TUTORIAL OWNS THE PACING:
 * the player sits at a scripted three-seat table (You = the Bandit, Sir Aldric
 * = the Knight, Old Wren = the Fisherman) and plays a genuine game with the
 * actual engine — EVERY turn is prompted, and the missions phase and Melee are
 * narrated in place (the engine only advances when a step allows it; the Melee
 * is forced to wait-for-tap via window.TUT_ACTIVE, see showMeleeSplash).
 *
 * Scripted cards are rigged PER TURN and moved to the FRONT of the hand (from
 * this act's own deck/hands, or cloned from card data as a last resort) so the
 * lesson card is always first — the draft's pass-left rotation and the rivals'
 * picks stay genuine.
 *
 * SCOPE: this file currently scripts the Act 1 SLICE (opening → every draft
 * turn → mission claim → missions phase → Melee → "Act 1 Complete"). Acts 2 & 3
 * (potions, artifacts, Map free-play, Mind's Eye / Philosopher's Stone, final
 * scoring) follow the same skeleton and are built next.
 *
 * Integration contract (root game):
 *   reads/writes `game` (ui.js top-level binding), sets window.TUT_ACTIVE,
 *   calls showGameScreen, renderGameState, beginThrowPhase, throwCard,
 *   addLogEntry; anchors on #actionPanel [data-act], #missionSelect,
 *   #boardThumb, #boardOverlay, #handZone .hand-card, #missionCeremony,
 *   #meleeSplash, .stats-panel, .mission-strip.
 *   Remove = delete this file + css/tutorial.css + the two script/link tags
 *   and the `window.TUT_ACTIVE` guard in showMeleeSplash; nothing else
 *   references them.
 */
(function () {
    'use strict';

    const CAST = [
        { characterId: 'bandit',    playerName: 'You' },
        { characterId: 'knight',    playerName: 'Sir Aldric' },
        { characterId: 'fisherman', playerName: 'Old Wren' },
    ];

    // ── Card/mission rigging ─────────────────────────────────────────
    // Pull a card matching `pred` from anywhere in THIS act (deck first,
    // then rivals' hands) into the player's hand, swapping a non-key card
    // back so every count stays honest. `cloneName` is a last-resort: in a
    // live draft a rival can PLAY the exact card a lesson needs before we
    // pull it (gone from deck AND hands) — so for named lessons we clone a
    // fresh copy from the card data, still swapping one out to keep counts.
    function pullCard(pred, keepNames, cloneName) {
        const hand = game.players[0].hand;
        // Already holding it? Move it to the FRONT so the lesson card is the
        // first (leftmost) card — the pulse and the copy both point at it.
        const have = hand.findIndex(pred);
        if (have >= 0) {
            if (have > 0) { const [c] = hand.splice(have, 1); hand.unshift(c); }
            return true;
        }
        const act = game.currentAct;
        const give = hand.find(c => !keepNames.includes(c.name));
        const swapIn = (take) => {
            if (give) { hand.splice(hand.indexOf(give), 1); }
            hand.unshift(take);
        };
        const deckIdx = game.actDecks[act].findIndex(pred);
        if (deckIdx >= 0) {
            const take = game.actDecks[act].splice(deckIdx, 1)[0];
            if (give) game.actDecks[act].push(give);
            swapIn(take);
            return true;
        }
        for (let i = 1; i < game.playerCount; i++) {
            const rh = game.players[i].hand;
            const j = rh.findIndex(pred);
            if (j >= 0) {
                const take = rh.splice(j, 1)[0];
                if (give) rh.push(give);
                swapIn(take);
                return true;
            }
        }
        // Clone fallback (named lessons only): copy the data template, mint a
        // fresh id so it's a distinct card, drop the giveaway into the deck.
        if (cloneName && window.FAVOR_DATA && window.FAVOR_DATA.cards) {
            const tpl = window.FAVOR_DATA.cards.find(c => c.name === cloneName);
            if (tpl) {
                const clone = JSON.parse(JSON.stringify(tpl));
                clone.id = 'tut-' + cloneName.replace(/\s+/g, '') + '-' + (game.currentAct);
                if (give) game.actDecks[act].push(give);
                swapIn(clone);
                return true;
            }
        }
        return false;
    }
    const byName = n => c => c.name === n;
    // Cards the rig must never swap OUT of the hand to make room for another.
    // Act 1 lesson set: Hunting (endeavor+green glow), Shark Tooth (weapon/Power),
    // First Aid (endeavor, tops Survival to 3 for the mission), the Letter.
    const KEY_NAMES = ['Hunting', 'Shark Tooth', 'First Aid', 'Mission Letter', 'Great North Connection'];

    function rigTurn(preds) {
        preds.forEach(p => {
            const isName = typeof p === 'string';
            pullCard(isName ? byName(p) : p, KEY_NAMES, isName ? p : null);
        });
        renderGameState();
    }
    // Make sure Helping the Merchant sits face-up in the mission pool, no matter
    // what — reclaim it from ANY deck or a rival who grabbed it, or clone it from
    // the data. Rivals are ALSO barred from taking missions in the tutorial
    // (window.TUT_ACTIVE guard in ui.js activateAllCards); this is the safety net.
    function rigMissions() {
        const NAME = 'Helping the Merchant';
        if (game.visibleMissions.some(m => m.name === NAME)) return;
        const pinToPool = (mission, fromDeck) => {
            const give = game.visibleMissions.pop();
            if (give) { (fromDeck || (game.missionDecks[1] = game.missionDecks[1] || [])).push(give); }
            game.visibleMissions.unshift(mission);
        };
        // 1) any mission deck
        for (const act of [1, 2, 3]) {
            const d = game.missionDecks[act] || [];
            const i = d.findIndex(m => m.name === NAME);
            if (i >= 0) { pinToPool(d.splice(i, 1)[0], d); return; }
        }
        // 2) reclaim from a rival who already claimed it (draft-time; not yet resolved)
        for (let pi = 1; pi < game.playerCount; pi++) {
            const held = game.players[pi].missions || [];
            const j = held.findIndex(m => m.name === NAME);
            if (j >= 0) { pinToPool(held.splice(j, 1)[0]); return; }
        }
        // 3) last resort: clone a fresh copy from the card data
        if (window.FAVOR_DATA && window.FAVOR_DATA.missions) {
            const tpl = window.FAVOR_DATA.missions.find(m => m.name === NAME);
            if (tpl) { const c = JSON.parse(JSON.stringify(tpl)); c.id = 'tut-mission-helping'; pinToPool(c); }
        }
    }
    const heldMap = name => game.getPlayerMaps(0).includes(name);
    const you = () => game.players[0];

    // ── State probes the steps gate on ───────────────────────────────
    const panelActive = () => {
        const p = document.getElementById('actionPanel');
        return !!p && p.classList.contains('active');
    };
    const overlayActive = (sel) => {
        const e = document.querySelector(sel);
        return !!e && e.classList.contains('active');
    };
    // Between turns: your card isn't committed and no chooser is up — the
    // moment it's safe to rig the next hand and prompt the next throw.
    const gameplayIdle = () =>
        game.phase === 'gameplay' && game.pendingActivations[0] === null && !panelActive();

    // ── Melee gate ───────────────────────────────────────────────────
    // Wyatt: the Melee prompt must come up FIRST — read it, hit Next, THEN the
    // cinematic starts (unobstructed). showMeleeSplash (ui.js) awaits this gate
    // when TUT_ACTIVE; the melee step's Next resolves it. meleePreOk covers the
    // (human-impossible) case where Next fires before the cinematic asks.
    let meleeResolve = null, meleePreOk = false;
    function tutMeleeGate() {
        return new Promise(res => {
            if (meleePreOk) { meleePreOk = false; res(); return; }
            meleeResolve = res;
        });
    }
    function tutMeleeGo() {
        if (meleeResolve) { const r = meleeResolve; meleeResolve = null; r(); }
        else meleePreOk = true;
    }

    // ── The shield: 4 blocker slabs + a spotlight hole + the bubble ──
    let root, hole, bubble, blockers, tick = null, stepIdx = -1, active = false;

    function buildDom() {
        root = document.createElement('div');
        root.id = 'tutRoot';
        root.innerHTML = `
            <div class="tut-block" data-b="top"></div>
            <div class="tut-block" data-b="bottom"></div>
            <div class="tut-block" data-b="left"></div>
            <div class="tut-block" data-b="right"></div>
            <div id="tutHole"></div>
            <div id="tutBubble">
                <div class="tut-kicker">How to Play</div>
                <div class="tut-title"></div>
                <div class="tut-text"></div>
                <div class="tut-anatomy"></div>
                <button class="btn-royal primary tut-next"><span>Next</span></button>
                <div class="tut-count"></div>
            </div>
            <button id="tutSkip" title="Leave the tutorial">Skip tutorial ✕</button>`;
        document.body.appendChild(root);
        hole = root.querySelector('#tutHole');
        bubble = root.querySelector('#tutBubble');
        blockers = [...root.querySelectorAll('.tut-block')];
        bubble.querySelector('.tut-next').onclick = () => {
            const s = STEPS[stepIdx];
            if (s && s.advance === 'next') {
                if (s.onNext) { try { s.onNext(); } catch (e) { /* non-fatal */ } }
                nextStep();
            }
        };
        // Skip-anytime — persistent, works in every step (shielded or watch).
        root.querySelector('#tutSkip').onclick = skip;
        window.addEventListener('resize', layout);
    }

    // Leave the guided game for the real menu. On the standalone How-to page
    // (tools/howto.html = index.html + this driver) that lands on the title.
    function skip() {
        if (!active) return;
        if (!window.confirm('Leave the tutorial and go to the menu?')) return;
        active = false;
        if (tick) clearInterval(tick);
        try { window.CINEMATIC_SPEED = 1.0; } catch (e) {}
        location.assign('index.html');
    }

    // Phone landscape runs the TABLE VIEW (tv-* ids); desktop runs .game-layout.
    // Map each desktop anchor to its table-view twin and let coachEl (ui.js) pick
    // whichever is actually VISIBLE — same helper the in-game coach-marks use.
    const PHONE_ALT = {
        '#boardThumb': '#tvBoardThumb',
        '.stats-panel': '#tvPurse',
        '.mission-strip': '#tvMissionRail',
        '#handZone': '#tvHandStrip',
    };
    function targetEl(s) {
        if (!s || !s.target) return null;
        if (typeof s.target === 'function') return s.target();
        const alt = PHONE_ALT[s.target];
        if (alt && typeof coachEl === 'function') return coachEl(alt, s.target);
        return document.querySelector(s.target);
    }

    function layout() {
        if (!active) return;
        const s = STEPS[stepIdx];
        if (!s) return;
        // A ready-gated step stays INVISIBLE until its moment arrives — no
        // bubble or shield pops over the reveal cinematic playing behind it.
        if (!armed) {
            hole.style.display = 'none';
            blockers.forEach(b => { b.style.display = 'none'; });
            bubble.style.display = 'none';
            return;
        }
        bubble.style.display = '';
        // No-shield step (e.g., the slider, which sits over the board overlay —
        // dimming would black out the board Wyatt is trying to look at). Just the
        // bubble, off to a side so the board stays visible.
        if (s.noShield) {
            hole.style.display = 'none';
            blockers.forEach(b => { b.style.display = 'none'; });
            placeBubble(null, s);
            return;
        }
        const el = targetEl(s);
        const watch = s.mode === 'watch';
        root.classList.toggle('tut-watch', watch);

        if (watch || !el) {
            hole.style.display = 'none';
            blockers.forEach(b => {
                b.style.display = watch ? 'none' : 'block';
                if (!watch) Object.assign(b.style, { left: 0, top: 0, right: 0, bottom: 0, width: 'auto', height: 'auto' });
            });
            // one full blocker is enough — park the other three
            if (!watch) for (let i = 1; i < 4; i++) blockers[i].style.display = 'none';
            placeBubble(null, s);
            return;
        }
        const pad = s.pad != null ? s.pad : 10;
        const r = el.getBoundingClientRect();
        const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad);
        const w = Math.min(window.innerWidth, r.right + pad) - x;
        const h = Math.min(window.innerHeight, r.bottom + pad) - y;
        hole.style.display = 'block';
        Object.assign(hole.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
        const set = (b, v) => Object.assign(b.style, { display: 'block' }, v);
        set(blockers[0], { left: 0, top: 0, width: '100vw', height: y + 'px', right: 'auto', bottom: 'auto' });
        set(blockers[1], { left: 0, top: (y + h) + 'px', width: '100vw', height: Math.max(0, window.innerHeight - y - h) + 'px', right: 'auto', bottom: 'auto' });
        set(blockers[2], { left: 0, top: y + 'px', width: x + 'px', height: h + 'px', right: 'auto', bottom: 'auto' });
        set(blockers[3], { left: (x + w) + 'px', top: y + 'px', width: Math.max(0, window.innerWidth - x - w) + 'px', height: h + 'px', right: 'auto', bottom: 'auto' });
        placeBubble({ x, y, w, h }, s);
    }

    function placeBubble(rect, s) {
        bubble.classList.remove('tut-b-center', 'tut-b-corner', 'tut-b-left', 'tut-b-right');
        if (s.mode === 'watch') { bubble.classList.add('tut-b-corner'); bubble.style.left = ''; bubble.style.top = ''; return; }
        // Pinned to a side — used when the spotlit thing sits in the middle (the
        // board on the slider step, the mission card on the pick step) so the
        // bubble doesn't cover it. CSS handles the actual placement.
        if (s.bubbleSide === 'left' || s.bubbleSide === 'right') {
            bubble.classList.add(s.bubbleSide === 'left' ? 'tut-b-left' : 'tut-b-right');
            bubble.style.left = ''; bubble.style.top = ''; return;
        }
        if (!rect) { bubble.classList.add('tut-b-center'); bubble.style.left = ''; bubble.style.top = ''; return; }
        // Use the REAL bubble size (compact CSS makes it narrower/shorter on phones).
        const bw = bubble.offsetWidth || Math.min(430, window.innerWidth - 24);
        const bh = bubble.offsetHeight || 180;
        let x = Math.min(Math.max(8, rect.x + rect.w / 2 - bw / 2), window.innerWidth - bw - 8);
        let yy = rect.y + rect.h + 14;
        if (yy + bh > window.innerHeight - 10) yy = rect.y - bh - 14;   // flip above
        // Never let the bubble sit partly off a short screen — clamp on-screen.
        yy = Math.max(8, Math.min(yy, window.innerHeight - bh - 8));
        bubble.style.left = x + 'px';
        bubble.style.top = yy + 'px';
    }

    // ── Step engine ──────────────────────────────────────────────────
    let pulseEl = null, clickArm = null, armed = true;

    function applyPulse(s) {
        if (!s.pulse) return;
        // Both layouts share class names (.hand-card, [data-act]) with one copy
        // hidden — pulse the VISIBLE one (offsetParent is null when hidden).
        const all = [...document.querySelectorAll(s.pulse)];
        const p = all.find(e => e.offsetParent !== null) || all[0];
        if (p) { p.classList.add('tut-pulse'); if (s.pulseCls) p.classList.add(s.pulseCls); pulseEl = p; }
    }

    function showStep(i) {
        stepIdx = i;
        const s = STEPS[i];
        if (!s) return finish();
        if (s.before) { try { s.before(); } catch (e) { console.warn('[TUT] before failed:', s.id, e); } }
        bubble.querySelector('.tut-title').textContent = s.title || '';
        const txt = typeof s.text === 'function' ? s.text() : s.text;
        bubble.querySelector('.tut-text').innerHTML = txt;
        bubble.querySelector('.tut-anatomy').innerHTML = s.anatomy || '';
        bubble.querySelector('.tut-next').style.display = s.advance === 'next' ? '' : 'none';
        bubble.querySelector('.tut-count').textContent = `${i + 1} / ${STEPS.length}`;
        clearPulse();

        // Show the shield+bubble+pulse and start listening for advance.
        const arm = () => { armed = true; applyPulse(s); layout(); armAdvance(s); };

        // Edge-trigger guard: a step that reacts to state X must not arm
        // until X has actually ARRIVED — otherwise a stale "not X yet"
        // satisfies the exit condition instantly and the script skips. While
        // it waits, the overlay is HIDDEN so the game plays unobstructed.
        if (s.ready) {
            armed = false;
            layout();   // hides everything while we wait
            const gate = setInterval(() => {
                if (stepIdx !== STEPS.indexOf(s)) { clearInterval(gate); return; }
                let r = false;
                try { r = s.ready(); } catch (e) { /* not yet */ }
                if (r) {
                    clearInterval(gate);
                    if (s.onReady) { try { s.onReady(); } catch (e) { console.warn('[TUT] onReady failed:', s.id, e); } }
                    arm();
                }
            }, 250);
        } else {
            arm();
        }
    }

    function clearPulse() {
        if (pulseEl) { pulseEl.classList.remove('tut-pulse', 'tut-pulse-green'); pulseEl = null; }
        if (clickArm) { document.removeEventListener('click', clickArm, true); clickArm = null; }
    }

    function armAdvance(s) {
        if (s.advance === 'next') return;
        if (s.advance === 'click') {
            clickArm = (e) => {
                const el = targetEl(s);
                if (el && (e.target === el || el.contains(e.target))) {
                    document.removeEventListener('click', clickArm, true); clickArm = null;
                    setTimeout(nextStep, s.delay != null ? s.delay : 500);
                }
            };
            document.addEventListener('click', clickArm, true);
            return;
        }
        if (typeof s.advance === 'function') {
            const poll = setInterval(() => {
                if (stepIdx !== STEPS.indexOf(s)) { clearInterval(poll); return; }
                let ok = false;
                try { ok = s.advance(); } catch (e) { /* not yet */ }
                if (ok) { clearInterval(poll); setTimeout(nextStep, s.delay != null ? s.delay : 700); }
            }, 300);
        }
    }

    function nextStep() { showStep(stepIdx + 1); }

    function finish() {
        active = false;
        if (tick) clearInterval(tick);
        clearPulse();
        root.classList.add('tut-done');
        root.innerHTML = `
            <div class="tut-finale">
                <div class="tut-finale-card">
                    <div class="tut-kicker">How to Play</div>
                    <h2>The Court Awaits</h2>
                    <p>You know the table, the cards, the missions, the Melee and the score.
                       Gold flows, skills stay, Favor crowns the winner. Go take the throne.</p>
                    <button class="btn-royal primary" onclick="location.reload()"><span>Play Again</span></button>
                </div>
            </div>`;
    }

    // ── Fast-forward: let the real loop run at speed, auto-answering ──
    let ffOn = false;
    function fastForward(untilFn, done) {
        ffOn = true;
        window.CINEMATIC_SPEED = 0.15;
        const drive = setInterval(() => {
            try {
                if (untilFn()) {
                    clearInterval(drive);
                    ffOn = false;
                    window.CINEMATIC_SPEED = 1.0;
                    done();
                    return;
                }
                // Your throw, played for you.
                if (game.phase === 'gameplay' && game.pendingActivations[0] === null
                    && game.players[0].hand.length) {
                    throwCard(0);
                }
                // Your reveal, answered for you: Play when it can, else Discard.
                const panel = document.getElementById('actionPanel');
                if (panel && panel.classList.contains('active')) {
                    const play = panel.querySelector('[data-act="play"]');
                    const discard = panel.querySelector('[data-act="discard"]');
                    (play || discard) && (play || discard).click();
                }
            } catch (e) { /* keep driving */ }
        }, 450);
    }

    // ═════════════════════════════════════════════════════════════════
    // THE SCRIPT — every prompt, with the why (rendered on the review
    // page). text may be a function for live values.
    // ═════════════════════════════════════════════════════════════════
    // Card art in the CENTER, callout labels in the side gutters so they
    // never cover the symbols they describe. o = {left:[...], right:[...], below}.
    const AN = (img, o) => `
        <div class="tut-anat2">
            <div class="aa-side left">${(o.left || []).map(t => `<span class="aa-lbl">${t}</span>`).join('')}</div>
            <div class="aa-card"><img src="${img}" alt=""></div>
            <div class="aa-side right">${(o.right || []).map(t => `<span class="aa-lbl">${t}</span>`).join('')}</div>
        </div>${o.below ? `<div class="tut-anat-cap">${o.below}</div>` : ''}`;

    const STEPS = [
    // ══════════ OPENING — the table, the pieces, the goal ══════════
    {
        id: 'welcome', target: null, advance: 'next',
        title: 'Welcome to FAVOR',
        text: `The King is dead — and you are one of his heirs. Over three <b>Acts</b>
               you'll play cards, chase missions and clash in the <b>Melee</b>. Whoever
               holds the most <b>Favor</b> when the dust settles takes the crown. Let's
               play a real hand together — I'll stop and explain every new thing as it comes.`,
        why: 'Sets the fantasy and the single win condition (Favor) before any mechanics.',
    },
    {
        id: 'your-board', target: '#boardThumb', advance: 'next',
        title: 'Your Character Board',
        text: `You play the <b>Bandit</b>. This is your board. Your ring sits on the
               <b>center slot</b>, which quietly feeds you <b>+2 Power</b> the whole time
               you stand there — and every hero's board grants something different.`,
        why: 'Orients to their own board and plants that boards GRANT resources — the Bandit Power pays off at the Melee.',
    },
    {
        id: 'purse', target: '.stats-panel', advance: 'next',
        title: 'Your Purse & Reputation',
        text: `Four numbers to watch. <b>Gold</b> pays to play cards and to borrow.
               <b>Prestige</b> is points you win — mostly in the Melee. <b>Scorn</b> is
               points AGAINST you. <b>Favor</b> is the score itself. Gold isn't points —
               but ties go to the richer heir.`,
        why: 'The four currencies, one line each. Players confuse Gold with score — the tiebreaker settles it early.',
    },
    {
        id: 'missions-pool', target: '.mission-strip', advance: 'next',
        title: 'The Mission Pool',
        text: `Three missions always wait face-up in the middle of the table. Missions are
               the single biggest source of Favor — we'll claim one in a few turns.`,
        why: 'Names the third table zone and promises the mission beat.',
    },
    {
        id: 'hand-intro', target: '#handZone', advance: 'next', pad: 16,
        title: 'Your Hand — and the Draft',
        text: `Seven cards. Each turn every player secretly commits <b>one</b> card, then
               all are revealed at once. The twist: the cards you DON'T use are
               <b>passed to your left</b>. Everyone drafts from everyone's hands — so your
               hand changes every single turn.`,
        why: "The draft-and-pass rule is FAVOR's most alien mechanic — it gets its own beat before anything is thrown.",
    },
    {
        id: 'card-types', target: '#handZone', advance: 'next', pad: 16,
        title: 'Six Kinds of Card',
        text: `Every card is one of six types: <b>Endeavors</b> (build skills),
               <b>Weapons</b> (⚔ Power for the Melee), <b>Adventures</b> (Favor & skills),
               <b>Wisdom</b> (rare skills), <b>Potions</b> (instant effects) and
               <b>Artifacts</b> (pure Favor) — plus <b>Mission Letters</b>. Potions and
               Artifacts appear in later Acts; you'll meet each type as it comes. Let's
               read your first card.`,
        why: 'Names all types up front (Wyatt: explain all on sight) so each later reveal lands prepared; flags that some are later-Act.',
    },

    // ══════════ TURN 1 — ENDEAVOR (card anatomy + the green glow) ══════════
    {
        id: 'card-anatomy', target: '#handZone', advance: 'next', pad: 16,
        before: () => rigTurn(['Hunting']),
        title: 'Reading a Card',
        text: `Here's <b>Hunting</b>, an Endeavor from your hand. Every card speaks the same
               language — <b>top-left is the cost, top-right is what you gain</b>:`,
        anatomy: () => AN('assets/cards/regular/Hunting Card.jpg', {
            left: ['⬅ <b>TOP-LEFT — the COST.</b> Skills you must already have (Hunting needs 1 Power — your board covers it), or Gold.'],
            right: ['<b>TOP-RIGHT — what it GRANTS ➡</b> Gold ovals are the skills you gain (here, 2 Survival). Skills stay for the whole game.'],
            below: `Some cards also carry a blue <b>Favor</b> shield along the bottom — those score points at the very end. Hunting has none: it builds skills, not Favor.`,
        }),
        anatomyIsFn: true,
        why: 'The symbol legend on the real card, with callouts in the GUTTERS (not over the art). Only what Hunting actually has: cost (a Power requirement) + granted skills. Favor shields taught truthfully in words (Hunting has none). Dropped the false "border = Act" claim.',
    },
    {
        id: 'green-glow', target: '#handZone', advance: 'next', pad: 16,
        pulse: '.hand-card.playable', pulseCls: 'tut-pulse-green',
        title: 'The Green Glow',
        text: `See Hunting breathing <span class="tut-green">green</span>? Green means
               <b>you can play it right now</b> — you meet its cost as things stand
               (Hunting needs 1 Power; your board's center slot covers it).
               <b>But heads up:</b> if the table shifts before your turn resolves — gold
               spent, a skill borrowed away — a green card can stop being playable. Green
               is "right now," not "forever."`,
        why: 'Explicit design ask: teach the green glow AND the disclaimer that affordability can change mid-round.',
    },
    {
        id: 'throw-hunting', target: '#handZone', advance: () => game.pendingActivations[0] !== null, pad: 16,
        pulse: '.hand-card.playable', pulseCls: 'tut-pulse-green',
        title: 'Throw Your First Card',
        text: `Drag <b>Hunting</b> up toward the table to commit it, face-down.`,
        why: 'First real action — the commit gesture, done by the player, not a button.',
    },
    {
        id: 'reveal-hunting', ready: () => panelActive(), target: '#actionPanel',
        advance: () => !panelActive(), pulse: '#actionPanel [data-act="play"]',
        title: 'Your Reveal — Play It',
        text: `Cards reveal in table order. This panel is your whole turn: <b>Play</b> it
               (pay the top-left cost, keep the gold ovals for the rest of the game) — or
               <b>Discard</b> it for +3 Gold or a free ring slide. Hit <b>Play</b>: those
               2 Survival are yours to keep.`,
        why: 'The action panel decides every turn; Play now, Discard named for later.',
    },
    {
        id: 'rivals-reveal', mode: 'watch',
        // Advance when the reveal is done and the next turn opens — phase back to
        // 'gameplay' (stays true even once you throw, so a quick throw can't
        // starve the gate the way a pending===null check could).
        advance: () => game.phase === 'gameplay',
        title: 'The Other Heirs Reveal',
        text: `You went first as the <b>Emblem holder</b>. Now Sir Aldric's and Old Wren's
               cards flip and resolve in turn — <b>watch what they play</b>. Every card
               they lay down is skills or Power they're building, just like you. This
               reveal happens after every turn; from here I'll let it play out quietly.`,
        why: "Wyatt: explain what's happening while the other players play their cards. Taught ONCE — a watch beat that HOLDS through the rivals' spotlight reveals (advance waits for the next gameplay turn) instead of popping Turn 2's bubble over them.",
    },

    // ══════════ TURN 2 — WEAPON (Power feeds the Melee) ══════════
    {
        id: 'weapon-turn', ready: () => gameplayIdle(), target: '#handZone',
        onReady: () => rigTurn(['Shark Tooth']),
        advance: () => game.pendingActivations[0] !== null, pad: 16,
        title: 'A Weapon — Power for the Melee',
        text: `Your hand passed and changed. This is <b>Shark Tooth</b>, a <b>Weapon</b> —
               it grants ⚔ <b>Power</b>. At the end of each Act every heir's total Power
               clashes in the <b>Melee</b>, and the strongest win Prestige. Throw Shark
               Tooth and start building your strength.`,
        why: 'Introduces the Weapon type and the Melee it feeds, one Act before that Melee lands.',
    },
    {
        id: 'weapon-play', ready: () => panelActive(), target: '#actionPanel',
        advance: () => !panelActive(), pulse: '#actionPanel [data-act="play"]',
        title: 'Bank the Power',
        text: `Play it — what you build now, you carry into the Melee. Your Power is climbing.`,
        why: 'Closes the second guided play; frames Power as cumulative.',
    },

    // ══════════ SLIDER DETOUR — the board ring ══════════
    {
        // ONLY when the table is idle (rivals done revealing, waiting on you) —
        // otherwise the detour lands mid-reveal and the board keeps blacking out
        // as the reveal re-renders (Wyatt). At idle nothing moves, so opening the
        // board is a real pause; closing it resumes with the next prompt.
        id: 'board-tour', ready: () => gameplayIdle(), target: '#boardThumb', advance: 'click', delay: 800,
        title: 'Visit Your Board',
        text: `Quick detour — <b>tap your board</b> to see the ring up close. The table waits
               while you look.`,
        why: 'Hands-on transition into the slider lesson. Gated on gameplayIdle so no rival reveal is running behind it (that was blacking out the board).',
    },
    {
        // No shield (dimming would black out the board) + bubble pinned LEFT so the
        // board in the middle stays visible (Wyatt: prompt covered almost the board).
        id: 'slider', ready: () => overlayActive('#boardOverlay'), target: '#boardOverlay',
        advance: () => !overlayActive('#boardOverlay'), noShield: true, bubbleSide: 'left',
        title: 'The Ring & the Slider',
        text: `Five slots. Your ring can slide for <b>5 Gold a space</b> (or free, when you
               discard for a slide). Land on a slot and it pays: gold coins pay Gold, skill
               crests grant skills while you stand there, and event slots — like the
               Bandit's <b>steal from everyone</b> — fire as you arrive. Drag the ring to
               peek, then close the board (✕ or tap outside) to go on.`,
        why: 'The slider is half of every board decision — taught in the real overlay with the real ring.',
    },

    // ══════════ TURN 3 — MISSION LETTER (claim a mission) ══════════
    {
        id: 'mission-turn', ready: () => gameplayIdle(), target: '#handZone',
        onReady: () => { rigTurn(['Mission Letter']); rigMissions(); },
        advance: () => game.pendingActivations[0] !== null, pad: 16,
        title: 'The Mission Letter',
        text: `This turn you drew a <b>Mission Letter</b> — throw it. A Letter is how you
               claim one of the face-up missions for 1 Gold.`,
        why: 'Rigged so the Letter arrives exactly when the concept is fresh.',
    },
    {
        id: 'mission-panel', ready: () => panelActive(), target: '#actionPanel',
        advance: () => overlayActive('#missionSelect'), pulse: '#actionPanel [data-act="mission_letter"]',
        title: 'Send the Letter',
        text: `Pay the 1 Gold — then you'll choose from the three face-up missions.`,
        why: 'Bridges the letter to the pick; the real teaching is on the pick screen.',
    },
    {
        id: 'mission-pick', ready: () => overlayActive('#missionSelect'),
        target: () => {
            const img = document.querySelector('#missionSelect img[src*="Helping"]');
            return (img && (img.closest('.mission-option') || img.parentElement))
                || document.getElementById('missionSelect');
        },
        advance: () => !overlayActive('#missionSelect'),
        // Helping the Merchant is the leftmost mission — pin the bubble RIGHT so it
        // doesn't cover the card the player has to read (Wyatt).
        bubbleSide: 'right',
        title: 'Read a Mission — Take Helping the Merchant',
        text: `A mission reads like a card: <b>top-left = what it takes to succeed</b>
               (3 Survival & 3 Power), <b>top-right = the reward</b> (Gold, a skill, and a
               <b>Map</b> — remember that), and the <b>grey bottom = what failing costs
               you</b>. Take <b>Helping the Merchant</b> — your Hunting Survival and your
               board's Power put it in reach.`,
        why: 'Mission-card anatomy exactly when they must read one, plus modelling WHY this one is achievable. The Map pays off in Act 2.',
    },
    {
        id: 'mission-held', ready: () => gameplayIdle(), target: '.mission-strip', advance: 'next',
        title: "Yours Now — Resolves at Act's End",
        text: `The mission is yours, held face-down. Missions resolve when the Act ends:
               meet the requirement then and the reward is yours; fall short and the grey
               consequence bites. Keep building toward those 3 Survival & 3 Power.`,
        why: 'Sets the timing expectation so the missions phase is anticipated. Borrow reference removed — kept for Act 2 per Wyatt.',
    },

    // ══════════ TURN 4 — ENDEAVOR (finish the mission requirement) ══════════
    {
        id: 'build-turn', ready: () => gameplayIdle(), target: '#handZone',
        onReady: () => rigTurn(['First Aid']),
        advance: () => game.pendingActivations[0] !== null, pad: 16,
        title: 'Keep Building',
        text: `<b>First Aid</b> grants 1 more Survival. Play it and you'll hold
               <b>3 Survival</b> — exactly what Helping the Merchant needs. Throw it in.`,
        why: 'Lands the third Survival so the mission visibly succeeds later; reinforces skills stacking toward a goal.',
    },
    {
        id: 'build-play', ready: () => panelActive(), target: '#actionPanel',
        advance: () => !panelActive(), pulse: '#actionPanel [data-act="play"]',
        title: 'Play It',
        text: `Play it — that's <b>3 Survival</b> and <b>3 Power</b> banked. Your mission is
               in reach.`,
        why: 'Confirms the requirement is met before the resolution.',
    },

    // ══════════ TURN 5 — DISCARD (the bad-hand economy; Borrow waits for Act 2) ══════════
    {
        id: 'discard-turn', ready: () => gameplayIdle(), target: '#handZone',
        onReady: () => rigTurn(['Cooking']),
        advance: () => game.pendingActivations[0] !== null, pad: 16,
        title: 'Not Every Card Is For You',
        text: `<b>Cooking</b> needs 1 Knowledge — you have none, so no green glow. Cards you
               can't use still have value. Throw it and we'll turn it into Gold.`,
        why: 'Teaches the no-glow (grey) state on a genuinely unplayable card, setting up the discard economy.',
    },
    {
        id: 'discard-panel', ready: () => panelActive(), target: '#actionPanel',
        advance: () => !panelActive(), pulse: '#actionPanel [data-act="discard"]',
        title: 'Discard = Gold or Movement',
        text: `Can't play it? Every card is still worth something: <b>+3 Gold</b>, or a free
               <b>ring slide</b> on your board. A bad card is never a wasted turn. Take the Gold.`,
        why: "The discard economy keeps bad hands fun. Borrowing is DELIBERATELY not taught here — it never comes up in Act 1 (Wyatt); it's introduced and demonstrated in Act 2 where it's actually used.",
    },

    // ══════════ TURN 6 — THE LAST TWO ══════════
    {
        id: 'final-turn', mode: 'watch',
        // Wait until the Act truly ENDS (missions phase begins) — NOT the moment
        // the hand empties (that fires the instant you THROW your last two, before
        // you've revealed and played them). Wyatt saw this jump away too early.
        advance: () => game.phase === 'missions',
        title: 'Play Out the Act',
        text: `Down to your last cards — when only two remain you play <b>both</b> at once.
               Commit them, then <b>reveal and play each one</b> as it comes up. That's the
               whole draft: play, pass, until the Act empties — then missions resolve.`,
        why: 'Every turn is prompted, but the loop is learned — a watch beat carries the final plays. Advances on phase===missions so it HOLDS through the last two reveals instead of vanishing the instant the hand empties (Wyatt).',
    },

    // ══════════ MISSIONS PHASE — hard-paced, narrated ══════════
    {
        id: 'missions-phase', ready: () => game.phase === 'missions', mode: 'watch',
        advance: () => game.phase === 'melee' || game.currentAct !== 1,
        title: 'The Missions Phase',
        text: `The Act is over — now every heir's mission resolves, one at a time, starting
               from the Emblem holder. Nothing rushes past: <b>tap each card to reveal
               it.</b> Meet the requirement and the reward lands (yours pays Gold, a skill,
               and the <b>Map</b>); fall short and the grey consequence fires. Watch yours
               succeed.`,
        why: 'Frames the real ceremony (already tap-paced) and points out the player\'s own success — Wyatt: the phase must slow and be explained.',
    },

    // ══════════ MELEE PHASE — read the prompt, THEN it plays (unobstructed) ══════════
    {
        // The cinematic is HELD (showMeleeSplash awaits tutMeleeGate). This prompt
        // comes up over the table, you read it, hit Next → the Melee begins with no
        // tutorial overlay covering it (act1-done stays hidden until Act 2). Wyatt.
        id: 'melee-phase', ready: () => game.phase === 'melee', advance: 'next',
        onNext: () => tutMeleeGo(),
        title: 'THE MELEE',
        text: `The Act ends in the <b>Melee</b>: every heir's Power clashes head to head —
               weapons, board slots, everything counts (you can't borrow Power here — what
               you built is what you bring). The winners take <b>Prestige</b>: the podium
               pays <b>5 / 3 / 1</b> in Act 1… and it triples by Act 3.
               <b>Hit Next to watch it unfold.</b>`,
        why: 'Wyatt: the Melee prompt must appear FIRST, be read, and Next STARTS the cinematic (gated on tutMeleeGo). Then the tutorial hides (act1-done waits for Act 2) so nothing blocks the Melee.',
    },

    // ══════════ SLICE END ══════════
    {
        // Hidden (armed=false) while the Melee cinematic plays — appears only once
        // the Melee is done and Act 2 begins, so it never covers the Melee.
        id: 'act1-done', ready: () => game.currentAct >= 2, target: null, advance: 'next',
        title: 'Act 1 Complete',
        text: `You've played the whole loop: read cards, built skills and Power, claimed and
               resolved a mission, and fought the Melee. Acts 2 and 3 raise the stakes —
               new card types, <b>Maps</b> that play cards for free, and the grand final
               score. <b>That part is coming next.</b>`,
        why: 'Closes the Act 1 slice; sets up Acts 2 & 3 (built next). Placeholder finale until the full game is scripted.',
    },
    ];

    // Anatomy steps declare a function — resolve at show time.
    STEPS.forEach(s => {
        if (typeof s.anatomy === 'function') {
            const fn = s.anatomy;
            Object.defineProperty(s, 'anatomy', { get: fn });
        }
    });

    // ── Boot ─────────────────────────────────────────────────────────
    function start() {
        const title = document.getElementById('title-screen');
        if (title) { title.classList.add('hidden'); title.style.display = 'none'; }
        window._mpSkipQueue = true;

        game = new FavorGame(3);
        game.loadDecks();
        game.initPlayers(CAST);
        game.emblemHolder = 0;
        game.startAct(1);
        game.phase = 'gameplay';   // arm the throw phase (beginThrowPhase early-returns otherwise)
        rigMissions();
        addLogEntry('═══ How to Play — a guided game ═══');
        showGameScreen();
        renderGameState();

        buildDom();
        active = true;
        // The tutorial owns pacing — this flag tells showMeleeSplash to WAIT
        // for a tap instead of auto-closing, so the Melee can be narrated.
        window.TUT_ACTIVE = true;
        // The Melee waits for the player to read its prompt and hit Next.
        window.__tutMeleeGate = tutMeleeGate;
        // Silence the in-game coach-marks (Prong 2) — they'd fire a SECOND
        // tutorial overlay on top of this one. coachTick early-returns on this.
        window._coachOff = true;
        tick = setInterval(layout, 300);
        showStep(0);
        // Arm turn 1 exactly like a real act start: rivals think, then commit;
        // the player drags to throw when the script reaches the throw step.
        beginThrowPhase();
    }

    // goto('step-id') — review/debug seam: jump the guide to any step.
    // Game state does NOT rewind; use it to proof-read prompts in place.
    function goto(id) {
        const i = STEPS.findIndex(x => x.id === id);
        if (i >= 0) showStep(i);
        return i;
    }
    window.TUT = { start, steps: STEPS, goto };

    // Auto-start on the standalone howto page.
    if (/[?&]tutorial=1/.test(location.search) || window.TUTORIAL_AUTOSTART) {
        window.addEventListener('load', () => setTimeout(start, 400));
    }
})();
