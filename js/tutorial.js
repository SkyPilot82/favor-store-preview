/**
 * FAVOR — How to Play v2: the guided first game (branch howto-v2)
 *
 * A hand-holding walk through a REAL game: the player sits at a scripted
 * three-seat table (You = the Bandit, Sir Aldric = the Knight, Old Wren =
 * the Fisherman) and plays a genuine Act 1 into Act 2 with the actual
 * engine — every prompt anchored to the real thing on screen, all other
 * input shielded off until the step allows it.
 *
 * Scripted cards are rigged PER TURN (swapped into the current hand from
 * this act's own deck/hands, so nothing act-illegal ever appears) — the
 * draft's pass-left rotation and the rivals' picks stay genuine.
 *
 * Integration contract (root game):
 *   reads/writes `game` (ui.js top-level binding), calls showGameScreen,
 *   renderGameState, beginThrowPhase, throwCard, addLogEntry; anchors on
 *   #actionPanel [data-act], #missionSelect, #boardThumb, #boardOverlay,
 *   #handZone .hand-card, #meleeSplash, .stats-panel, .mission-strip.
 *   Remove = delete this file + css/tutorial.css + the two script/link
 *   tags; nothing else references them.
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
    // back so every count stays honest.
    function pullCard(pred, keepNames) {
        const hand = game.players[0].hand;
        if (hand.some(pred)) return true;
        const act = game.currentAct;
        const give = hand.find(c => !keepNames.includes(c.name));
        const deckIdx = game.actDecks[act].findIndex(pred);
        if (deckIdx >= 0) {
            const take = game.actDecks[act].splice(deckIdx, 1)[0];
            if (give) { hand.splice(hand.indexOf(give), 1); game.actDecks[act].push(give); }
            hand.unshift(take);
            return true;
        }
        for (let i = 1; i < game.playerCount; i++) {
            const rh = game.players[i].hand;
            const j = rh.findIndex(pred);
            if (j >= 0) {
                const take = rh.splice(j, 1)[0];
                if (give) { hand.splice(hand.indexOf(give), 1); rh.push(give); }
                hand.unshift(take);
                return true;
            }
        }
        return false;
    }
    const byName = n => c => c.name === n;
    const KEY_NAMES = ['Hunting', 'Cooking', 'Mission Letter', 'Great North Connection'];

    function rigTurn(preds) {
        preds.forEach(p => pullCard(typeof p === 'string' ? byName(p) : p, KEY_NAMES));
        renderGameState();
    }
    // Make sure Helping the Merchant sits face-up in the mission pool.
    function rigMissions() {
        if (game.visibleMissions.some(m => m.name === 'Helping the Merchant')) return;
        const d = game.missionDecks[1] || [];
        const i = d.findIndex(m => m.name === 'Helping the Merchant');
        if (i >= 0) {
            const take = d.splice(i, 1)[0];
            const give = game.visibleMissions.pop();
            if (give) d.push(give);
            game.visibleMissions.unshift(take);
        }
    }
    const heldMap = name => game.getPlayerMaps(0).includes(name);
    const you = () => game.players[0];

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
            </div>`;
        document.body.appendChild(root);
        hole = root.querySelector('#tutHole');
        bubble = root.querySelector('#tutBubble');
        blockers = [...root.querySelectorAll('.tut-block')];
        bubble.querySelector('.tut-next').onclick = () => {
            const s = STEPS[stepIdx];
            if (s && s.advance === 'next') nextStep();
        };
        window.addEventListener('resize', layout);
    }

    function targetEl(s) {
        if (!s || !s.target) return null;
        return typeof s.target === 'function' ? s.target() : document.querySelector(s.target);
    }

    function layout() {
        if (!active) return;
        const s = STEPS[stepIdx];
        if (!s) return;
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
        bubble.classList.remove('tut-b-center', 'tut-b-corner');
        if (s.mode === 'watch') { bubble.classList.add('tut-b-corner'); bubble.style.left = ''; bubble.style.top = ''; return; }
        if (!rect) { bubble.classList.add('tut-b-center'); bubble.style.left = ''; bubble.style.top = ''; return; }
        const bw = Math.min(430, window.innerWidth - 24);
        const bh = bubble.offsetHeight || 180;
        let x = Math.min(Math.max(12, rect.x + rect.w / 2 - bw / 2), window.innerWidth - bw - 12);
        let yy = rect.y + rect.h + 14;
        if (yy + bh > window.innerHeight - 10) yy = Math.max(10, rect.y - bh - 14);
        bubble.style.left = x + 'px';
        bubble.style.top = yy + 'px';
    }

    // ── Step engine ──────────────────────────────────────────────────
    let pulseEl = null, clickArm = null;

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
        if (s.pulse) {
            const p = document.querySelector(s.pulse);
            if (p) { p.classList.add('tut-pulse'); pulseEl = p; }
        }
        layout();
        // Edge-trigger guard: a step that reacts to state X must not arm
        // until X has actually ARRIVED — otherwise a stale "not X yet"
        // satisfies the exit condition instantly and the script skips.
        if (s.ready) {
            const gate = setInterval(() => {
                if (stepIdx !== STEPS.indexOf(s)) { clearInterval(gate); return; }
                let r = false;
                try { r = s.ready(); } catch (e) { /* not yet */ }
                if (r) {
                    clearInterval(gate);
                    if (s.onReady) { try { s.onReady(); } catch (e) { console.warn('[TUT] onReady failed:', s.id, e); } }
                    layout(); armAdvance(s);
                }
            }, 250);
        } else {
            armAdvance(s);
        }
    }

    function clearPulse() {
        if (pulseEl) { pulseEl.classList.remove('tut-pulse'); pulseEl = null; }
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
    const AN = (img, labels) => `
        <div class="tut-anat"><img src="${img}" alt="">
        ${labels.map(l => `<span class="tut-an-chip" style="left:${l.x}%;top:${l.y}%">${l.t}</span>`).join('')}</div>`;

    const STEPS = [
    {
        id: 'welcome', target: null, advance: 'next',
        title: 'Welcome to FAVOR',
        text: `The King is dead — and you are one of his heirs. Over three Acts you'll
               play cards, chase missions and battle in the Melee. Whoever holds the most
               <b>Favor</b> when the dust settles takes the crown. Let's play a real
               hand together — I'll walk you through everything.`,
        why: 'Sets the fantasy and names the single win condition (Favor) before any mechanics. One idea per screen.',
    },
    {
        id: 'your-board', target: '#boardThumb', advance: 'next',
        title: 'Your Character Board',
        text: `You play the <b>Bandit</b>. This is your board — your ring sits on the
               <b>center slot</b>, which quietly feeds you <b>+2 Power</b> the whole time
               you stand there. Every hero's board is different.`,
        why: "Orients the player to their own board first and plants the seed that boards GRANT things — the Bandit's center Power pays off later at the Melee.",
    },
    {
        id: 'purse', target: '.stats-panel', advance: 'next',
        title: 'Your Purse & Reputation',
        text: `Four numbers to know: <b>Gold</b> buys plays and borrows. <b>Prestige</b> is
               points you win — mostly from the Melee. <b>Scorn</b> is points AGAINST you.
               <b>Favor</b> is the score itself. Gold isn't points — but ties go to the
               richer heir.`,
        why: 'The four currencies in one breath, each with its one-line job. Players confuse Gold with score — the tiebreaker line settles it early.',
    },
    {
        id: 'missions-strip', target: '.mission-strip', advance: 'next',
        title: 'The Mission Pool',
        text: `Three missions always wait face-up in the center of the table. Missions are
               the biggest single source of Favor — we'll grab one in a few turns.`,
        why: 'Names the third zone of the table and promises the mission beat, so the Mission Letter turn later lands on prepared ground.',
    },
    {
        id: 'hand-intro', target: '#handZone', advance: 'next', pad: 16,
        before: () => rigTurn(['Hunting', c => c.act === 1 && (c.skills || []).includes('power')]),
        title: 'Your Hand',
        text: `Seven cards. Each turn every player secretly throws ONE into the middle —
               then all are revealed and resolved. Here's the twist: the cards you don't
               use get <b>passed to your left</b> each turn. Everyone drafts from
               everyone's hands.`,
        why: "The draft-and-pass rule is FAVOR's most alien mechanic for new players — it gets its own step before anything is thrown.",
    },
    {
        id: 'card-anatomy', target: '#handZone', advance: 'next', pad: 16,
        title: 'Reading a Card',
        text: `Every card speaks the same language — here's Hunting from your hand:`,
        anatomy: () => AN('assets/cards/regular/Hunting Card.jpg', [
            { x: 2, y: 8,  t: '⬅ TOP-LEFT: what it COSTS you to play (skills you must already have, or Gold)' },
            { x: 60, y: 8, t: 'TOP-RIGHT ➡ gold ovals: skills it GRANTS — and skills stay all game' },
            { x: 2, y: 55, t: '⬅ Border color = its Act. Blue is Act 1' },
            { x: 60, y: 82, t: 'Blue shield = Favor it scores at the end ➡' },
        ]),
        why: 'The symbols legend, on a real card the player is holding. Left = price, right = gift, border = act, shield = score — four anchors that decode every card in the game.',
        anatomyIsFn: true,
    },
    {
        id: 'green-glow', target: '#handZone', advance: 'next', pad: 16,
        title: 'The Green Glow',
        text: `See the cards breathing <b>green</b>? Green means <b>you can play this right
               now</b> — you meet its cost as things stand. Hunting needs 1 Power: your
               Bandit board's center slot covers it. No glow? You're missing something.`,
        why: 'Explicit ask from the design: teach the green glow. Ties the glow to the board bonus from two steps ago, proving skills come from more than cards.',
    },
    {
        id: 'throw-first', target: '#handZone', advance: () => game.pendingActivations[0] !== null, pad: 16,
        pulse: '#handZone .hand-card.playable',
        title: 'Throw Your First Card',
        text: `Drag <b>Hunting</b> up toward the table to throw it in, face-down.
               (Any green card works — Hunting's the lesson.)`,
        why: 'First real action. The gesture is the phone/desktop commit, and letting them do it themselves — not a Next button — is what makes it stick.',
    },
    {
        id: 'rivals-throw', mode: 'watch',
        before: () => beginThrowPhase(),
        advance: () => game.allPlayersPicked && game.allPlayersPicked(),
        title: 'The Rivals Answer',
        text: `Sir Aldric and Old Wren are choosing too. Everyone commits blind —
               nobody knows what's coming until the reveal.`,
        why: 'A watch beat — the AI throws are real and staggered; narrating the blindness sells the simultaneous-commit tension.',
    },
    {
        ready: () => document.getElementById('actionPanel').classList.contains('active'),
        id: 'reveal-panel', target: '#actionPanel',
        advance: () => !document.getElementById('actionPanel').classList.contains('active'),
        pulse: '#actionPanel [data-act="play"]',
        title: 'Your Reveal — Choose Its Fate',
        text: `Cards reveal in table order. This panel is your whole turn: <b>Play</b> it
               (pay the top-left cost, keep the gold ovals forever) — or <b>Discard</b> it
               for +3 Gold or a free ring slide. Hit <b>Play</b>: those 2 Survival are
               yours for the rest of the game.`,
        why: 'The action panel is where every turn is decided; teaching Play and naming Discard here means the next step (discarding) is already half-taught. "Skills stay all game" is repeated deliberately.',
    },
    {
        ready: () => game.phase === 'gameplay' && game.pendingActivations[0] === null && !document.getElementById('actionPanel').classList.contains('active'),
        id: 'discard-turn', target: '#handZone',
        onReady: () => { rigTurn(['Cooking']); },
        advance: () => game.pendingActivations[0] !== null, pad: 16,
        title: 'Not Every Card Is For You',
        text: `New turn — and look: your hand changed! That's the pass. Now, <b>Cooking</b>
               needs 1 Knowledge and you have none — no green glow. Cards like that still
               have value: throw one anyway and we'll turn it into Gold.`,
        why: 'Two lessons at once: proof the pass-left really happened, and the grey (no-glow) state — setting up the discard economy.',
    },
    {
        ready: () => document.getElementById('actionPanel').classList.contains('active'),
        id: 'discard-panel', target: '#actionPanel',
        advance: () => !document.getElementById('actionPanel').classList.contains('active'),
        pulse: '#actionPanel [data-act="discard"]',
        title: 'Discard = Gold or Movement',
        text: `Can't play it? Every card is still worth <b>+3 Gold</b> — or a free
               <b>ring slide</b> on your board. (If a card only lacks SKILLS, you can also
               <b>Borrow</b> them from a neighbor at 2 Gold each — they pocket the fee.)
               For now, take the gold.`,
        why: "The discard economy keeps bad hands fun, and borrowing must be named exactly here — on a card that can't be played — or players never connect the two.",
    },
    {
        ready: () => game.phase === 'gameplay' && game.pendingActivations[0] === null && !document.getElementById('actionPanel').classList.contains('active'),
        id: 'mission-turn', target: '#handZone',
        onReady: () => { rigTurn(['Mission Letter']); rigMissions(); },
        advance: () => game.pendingActivations[0] !== null, pad: 16,
        title: 'The Mission Letter',
        text: `This turn you drew a <b>Mission Letter</b> — throw it. Letters are how you
               claim a mission from the pool for 1 Gold.`,
        why: 'Rigged so the letter arrives exactly when the concept is fresh from step 4. One action, one concept.',
    },
    {
        ready: () => document.getElementById('actionPanel').classList.contains('active'),
        id: 'mission-panel', target: '#actionPanel',
        advance: () => document.getElementById('missionSelect') && document.getElementById('missionSelect').classList.contains('active'),
        pulse: '#actionPanel [data-act="mission_letter"]',
        title: 'Send the Letter',
        text: `Pay the 1 Gold. You'll pick from the three face-up missions.`,
        why: 'Bridges the letter to the pick. Kept to two sentences — the real teaching happens on the pick screen.',
    },
    {
        ready: () => document.getElementById('missionSelect') && document.getElementById('missionSelect').classList.contains('active'),
        id: 'mission-pick',
        // Spotlight ONLY Helping the Merchant — the whole point of a guided
        // pick is that the player can't grab the wrong mission.
        target: () => {
            const img = document.querySelector('#missionSelect img[src*="Helping"]');
            return (img && (img.closest('.mission-option') || img.closest('[onclick]') || img.parentElement))
                || document.getElementById('missionSelect');
        },
        advance: () => !(document.getElementById('missionSelect') && document.getElementById('missionSelect').classList.contains('active')),
        title: 'Choose: Helping the Merchant',
        text: `Read a mission like a card: <b>top-left = what it takes to succeed</b>
               (3 Survival & 3 Power), <b>top-right = the reward</b> (Gold, a skill — and
               a <b>Map</b>, remember that), and the <b>grey bottom = what failing costs
               you</b>. Take <b>Helping the Merchant</b> — your Hunting survival plus your
               board's Power put it in reach.`,
        why: "Mission-card anatomy exactly when they must read one for real, plus strategy modeling: the tutorial shows WHY this mission is achievable with what they already hold. The Map tease pays off in Act 2.",
    },
    {
        id: 'mission-held', target: '.mission-strip', advance: 'next',
        title: 'Yours Now — Resolve at Act’s End',
        text: `The mission is yours, face-down. Missions resolve when the Act ends: meet
               the requirement then and the reward is yours — <b>you can even borrow
               skills for it</b>. Miss it, and the grey consequence bites.`,
        why: 'Sets the timing expectation (nothing happens immediately) so the missions phase later is anticipated, not surprising.',
    },
    {
        ready: () => game.phase === 'gameplay' && game.pendingActivations[0] === null && !document.getElementById('actionPanel').classList.contains('active'),
        id: 'power-turn', target: '#handZone',
        onReady: () => rigTurn([c => c.act === 1 && (c.skills || []).includes('power'),
                               c => c.act === 1 && (c.skills || []).includes('survival') && c.name !== 'Hunting']),
        advance: () => game.pendingActivations[0] !== null, pad: 16,
        title: 'Build Toward the Melee',
        text: `At the end of every Act comes the <b>Melee</b> — every heir's total
               <b>Power</b> clashes, and the strongest win <b>Prestige</b>. Throw a card
               with a ⚔ Power oval (or more Survival for your mission) and play it.`,
        why: 'Announces the melee one turn before the fast-forward so the player is building toward something, and doubles as mission-requirement progress.',
    },
    {
        ready: () => document.getElementById('actionPanel').classList.contains('active'),
        id: 'power-panel', target: '#actionPanel',
        advance: () => !document.getElementById('actionPanel').classList.contains('active'),
        pulse: '#actionPanel [data-act="play"]',
        title: 'Bank It',
        text: `Play it — what you build now, you bring to the Melee.`,
        why: 'Closes the fourth guided play without re-teaching the panel; without this step the shield would strand the reveal.',
    },
    {
        ready: () => game.phase === 'gameplay' && !document.getElementById('actionPanel').classList.contains('active'),
        id: 'board-tour', target: '#boardThumb', advance: 'click', delay: 800,
        title: 'Visit Your Board',
        text: `Quick detour — <b>tap your board</b>.`,
        why: 'Hands-on transition into the slider lesson; a tap they perform beats a picture.',
    },
    {
        ready: () => document.getElementById('boardOverlay').classList.contains('active'),
        id: 'slider', target: '#boardOverlay',
        advance: () => !document.getElementById('boardOverlay').classList.contains('active'),
        title: 'The Ring & the Slider',
        text: `Five slots. Your ring can slide for <b>5 Gold a space</b> (or free, when you
               discard for a slide). Slots pay out when you LAND: gold coins pay gold,
               skill crests grant skills while you stand there, and event slots — like the
               Bandit's <b>steal from everyone</b> — fire as you arrive. Drag the ring to
               peek, then close the board (✕ or tap outside) to continue.`,
        why: 'The slider is half of every board decision. Taught inside the real overlay with the real draggable ring; closing it is the natural advance.',
    },
    {
        id: 'fast-forward', mode: 'watch',
        before: function startFF() {
            // Drive through gameplay AND reveal ('activate') cycles — exit only
            // when Act 1's phases actually begin (missions/melee) or Act 2 starts.
            fastForward(() => game.currentAct !== 1 || game.phase === 'missions' || game.phase === 'melee', () => {});
        },
        advance: () => game.phase === 'missions' || game.phase === 'melee' || game.currentAct !== 1,
        title: 'Playing On…',
        text: `You've got the rhythm — I'll play your last few throws quickly.
               Watch the table: skills piling up, gold moving, rivals scheming.`,
        why: "Respecting the player's time: the loop is learned after four guided turns; forcing seven identical turns would teach boredom.",
    },
    {
        id: 'missions-phase', mode: 'watch',
        advance: () => game.phase === 'melee' || (document.getElementById('meleeSplash') && document.getElementById('meleeSplash').classList.contains('active')) || game.currentAct !== 1,
        title: 'The Missions Phase',
        text: () => `Act 1 ends — missions resolve around the table, starting from the
               Emblem holder. Yours needs 3 Survival & 3 Power…
               ${you().skills.survival >= 3 ? 'and you have it. Watch the reward land — including that <b>Map</b>.' : 'watch closely — if you fall short, the grey consequence fires (and next game you’ll know to borrow!).'}`,
        why: 'Dynamic text: celebrates the success we engineered, but stays honest if the run went sideways — either way the resolution mechanic is narrated as it happens.',
    },
    {
        id: 'melee-watch', mode: 'watch',
        advance: () => game.phase === 'gameplay' && game.currentAct === 2,
        title: 'THE MELEE',
        text: `Every heir's Power, head to head — weapons, board slots, everything counts.
               Tap <b>Continue ▸</b> to march through each fighter's tally. Prestige goes
               to the podium: <b>5 / 3 / 1</b> in Act 1… and it triples by Act 3. You
               can't borrow Power for the Melee — what you built is what you bring.`,
        why: 'The melee cinematic is the game’s showpiece — the prompt frames what the numbers mean and plants the Act 2/3 escalation, then gets out of the way.',
    },
    {
        ready: () => game.phase === 'gameplay' && game.currentAct === 2,
        id: 'act2', target: '#handZone',
        onReady: () => rigTurn(['Great North Connection']),
        advance: 'next', pad: 16,
        title: 'Act 2 — Higher Stakes',
        text: `New act, new deck — see the border color change on your fresh hand. Cards
               cost more and give more. The <b>Emblem</b> (who acts first) has passed one
               seat left, too.`,
        why: 'Act transition orientation: border colors, escalation, emblem movement — three small facts while the fresh hand is visibly different.',
    },
    {
        id: 'orange-glow', target: '#handZone', advance: 'next', pad: 16,
        pulse: '#handZone .hand-card.freeplay',
        title: 'The Orange Glow',
        text: () => heldMap('Helping the Merchant')
            ? `Look — <b>Great North Connection</b> burns <b>orange</b>. Orange means
               <b>FREE</b>: your mission's Map waives its whole cost. A Map always plays
               its linked card for nothing — even if you could afford it the hard way.`
            : `See a card burn <b>orange</b>? Orange means <b>FREE</b> — a Map you hold
               waives its whole cost. Maps from missions and cards link to specific
               cards; hold the Map, and its card costs you nothing.`,
        why: 'The second explicit ask: the orange glow, taught with a map the player EARNED in Act 1. Free-because-you-earned-it lands harder than free-by-decree.',
    },
    {
        ready: () => game.phase === 'gameplay' && game.pendingActivations[0] === null,
        id: 'play-free', target: '#handZone',
        // Early-throw-proof: the hand is spotlit one step earlier, so an
        // eager player may already have thrown (or even played) the card.
        advance: () => game.pendingActivations[0] !== null
            || (you().playedCards || []).some(c => c.name === 'Great North Connection'),
        pad: 16,
        title: 'Cash It In',
        text: `Throw Great North Connection and play it — free. It also opens a
               <b>Trade Route</b>: from now on you can borrow Survival, Alchemy, Charisma
               and Prospecting from <b>any</b> player at the table, not just neighbors.`,
        why: 'Completes the map arc with the actual free play, and introduces the one borrowing upgrade (trade route) on the exact card that grants it.',
    },
    {
        ready: () => document.getElementById('actionPanel').classList.contains('active')
            || (you().playedCards || []).some(c => c.name === 'Great North Connection'),
        id: 'free-panel', target: '#actionPanel',
        advance: () => (you().playedCards || []).some(c => c.name === 'Great North Connection')
            || !document.getElementById('actionPanel').classList.contains('active'),
        pulse: '#actionPanel [data-act="play"]',
        title: 'Not a Coin Leaves Your Purse',
        text: `Play it. The Map pays — watch your Gold: it doesn't move.`,
        why: 'The proof beat of the whole map arc: the player watches their own purse NOT change. Concrete evidence beats any explanation.',
    },
    {
        id: 'resources', target: null, advance: 'next',
        title: 'The Rare Treasures',
        text: `Two resources gate the mightiest cards: <b>Mind's Eye</b> 👁 and the
               <b>Philosopher's Stone</b> ⚗. They come only from certain cards, missions
               and board slots — and they can <b>never be borrowed</b>. When a card's
               top-left shows one, only the real thing opens it.`,
        why: "Mind's Eye and the Stone appear on card costs from mid-game on — naming them prevents the “why can't I borrow this?” confusion later.",
    },
    {
        id: 'scoring', target: null, advance: 'next',
        title: 'How the Crown Is Won',
        text: `After Act 3's Melee, the count: <b>mission Favor + card Favor (blue
               shields) + your board's Favor slots + Prestige − Scorn</b>. Gold breaks
               ties. Everything you did today fed one of those numbers.`,
        why: 'The full scoring formula, phrased as a recap of things they already touched — each term maps to a beat from this tutorial.',
    },
    {
        id: 'recap-glows', target: '#handZone', advance: 'next', pad: 16,
        title: 'Remember the Glows',
        text: `<span class="tut-green">Green</span> = you can play it right now.
               <span class="tut-orange">Orange</span> = it's FREE (a Map or a board boon
               pays for you). No glow = you're missing something — read the top-left,
               then think about borrowing.`,
        why: 'One final side-by-side of the two glows — the visual language the whole interface speaks. Redundancy on the two asks the design called out by name.',
    },
    {
        id: 'go-play', target: null, advance: 'next',
        title: 'You’re Ready',
        text: `Acts 2 and 3 are yours to finish — keep playing this table, or start
               fresh. The court remembers the bold. <b>Good luck, heir.</b>`,
        why: 'Ends on agency: the tutorial table is a real game they can keep playing, which is the strongest possible “you now know how” statement.',
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
        rigMissions();
        addLogEntry('═══ How to Play — a guided game ═══');
        showGameScreen();
        renderGameState();

        buildDom();
        active = true;
        tick = setInterval(layout, 300);
        showStep(0);
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
