<script>
  import { PET_CREDITS } from "./gamification.js";
  import { onDestroy } from "svelte";

  // Renders the "Holo-Pets" square frame pinned to the bottom-right of the
  // app. Lives in App.svelte (not NoteEditor) so it survives note switches
  // and stays visible even with no note selected.
  //
  // Only one pet shows at a time, in its own square frame — left/right
  // arrows switch which owned pet is active when you own more than one.
  // Clicking the pet pets it; the 🍖/🧸 buttons feed it or play with it.
  // All three do the same thing underneath — a little bounce, a sparkle
  // burst, a floating emoji, and a small credit (see interact() below) —
  // just with a different saying category and floating emoji each.
  //
  // Each pet is drawn as a small hand-built CSS/SVG animation by default
  // (fully offline, zero bundled assets). A pet whose catalog entry has a
  // `gifUrl` renders that image instead — so dropping in a real GIF later
  // needs no changes here, just setting `gifUrl` in gamification.js.
  let {
    ownedPets = [],
    activePetId = null,
    windowVisible = true,
    onSetActivePet,
    onToggleWindow,
    onEarnCredits,
  } = $props();

  let activeIndex = $derived.by(() => {
    const i = ownedPets.findIndex((p) => p.id === activePetId);
    return i === -1 ? 0 : i;
  });
  let currentPet = $derived(ownedPets[activeIndex] ?? null);

  function step(delta) {
    if (ownedPets.length === 0) return;
    const next = (activeIndex + delta + ownedPets.length) % ownedPets.length;
    onSetActivePet?.(ownedPets[next].id);
    // The bubble was that pet's line — clear it rather than leave it
    // floating over whichever pet you just switched to.
    clearTimeout(speechTimer);
    speech = "";
  }

  // ---- Petting/feeding/playing: a bounce on the frame, plus floaters +
  // sparkles that spawn and remove themselves once their animation
  // finishes. Spamming any of these is fine on purpose — every single
  // interaction earns its credit, no cooldown. ----
  let petting = $state(false);
  let floaters = $state([]); // {id, emoji, dx, delay} — 💗 when pet, 🍖 when fed, 🧸 when played with
  let sparkles = $state([]);
  let creditPops = $state([]);
  let fxSeq = 0;

  // What the pet is currently saying. `currentPet.sayings` is either a
  // flat array (every built-in pet — the same lines work for any
  // occasion) or, for a custom pet, an object of { idle, pet, fed, played }
  // arrays the user wrote themselves. A category with nothing written for
  // it falls back to that pet's "idle" lines rather than staying silent.
  let speech = $state("");
  let speechTimer;

  function linesFor(category) {
    const s = currentPet?.sayings;
    if (!s) return [];
    if (Array.isArray(s)) return s;
    return s[category]?.length ? s[category] : s.idle ?? [];
  }

  function sayRandomLine(category = "idle") {
    const lines = linesFor(category);
    if (!lines || lines.length === 0) return;
    speech = lines[Math.floor(Math.random() * lines.length)];
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => {
      speech = "";
    }, 1800);
  }

  // ---- Idle chatter: pets say something on their own now and then, not
  // just when interacted with, so the frame feels alive even when you're
  // not clicking on it. Re-armed on a new random delay after every line
  // (its own or one triggered by petting/feeding/playing), and restarted
  // whenever the active pet or the frame's visibility changes.
  let idleTimer;

  function scheduleIdleSpeech() {
    clearTimeout(idleTimer);
    if (!currentPet || !windowVisible) return;
    const delay = 9000 + Math.random() * 14000; // ~9-23s
    idleTimer = setTimeout(() => {
      sayRandomLine("idle");
      scheduleIdleSpeech();
    }, delay);
  }

  $effect(() => {
    // Reading these makes the effect re-run (and reschedule) whenever the
    // active pet or the dock's visibility changes.
    currentPet;
    windowVisible;
    scheduleIdleSpeech();
    return () => clearTimeout(idleTimer);
  });

  onDestroy(() => {
    clearTimeout(idleTimer);
    clearTimeout(speechTimer);
  });

  // Shared by petting/feeding/playing — only the saying category and the
  // floating emoji differ between them.
  function interact(category, emoji) {
    if (!currentPet) return;

    // Restart the bounce animation even on a rapid re-click: toggling the
    // class off then on within the same tick wouldn't repaint in between
    // (Svelte would just collapse the two updates), so nothing would ever
    // visibly restart. Turning it off, waiting two animation frames (so the
    // browser actually paints the "off" state), then turning it back on
    // forces the animation to play again from the start every time.
    petting = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        petting = true;
        setTimeout(() => {
          petting = false;
        }, 420);
      });
    });

    onEarnCredits?.(PET_CREDITS);
    const popId = ++fxSeq;
    creditPops = [...creditPops, { id: popId }];
    setTimeout(() => {
      creditPops = creditPops.filter((p) => p.id !== popId);
    }, 850);

    sayRandomLine(category);
    // A manual interaction counts as chatter too — push the next idle line
    // back out so it doesn't immediately step on the one just triggered.
    scheduleIdleSpeech();

    for (let i = 0; i < 2; i++) {
      const id = ++fxSeq;
      const floater = { id, emoji, dx: Math.round(Math.random() * 30 - 15), delay: i * 120 };
      floaters = [...floaters, floater];
      setTimeout(() => {
        floaters = floaters.filter((f) => f.id !== id);
      }, 950 + floater.delay);
    }
    for (let i = 0; i < 4; i++) {
      const id = ++fxSeq;
      const angle = i * 90 + Math.round(Math.random() * 30 - 15);
      const sparkle = { id, angle };
      sparkles = [...sparkles, sparkle];
      setTimeout(() => {
        sparkles = sparkles.filter((s) => s.id !== id);
      }, 550);
    }
  }

  function handlePet() {
    interact("pet", "💗");
  }

  function handleFeed() {
    interact("fed", "🍖");
  }

  function handlePlay() {
    interact("played", "🧸");
  }
</script>

{#if ownedPets.length > 0}
  <div class="pet-dock">
    <button
      type="button"
      class="pet-dock-toggle"
      title={windowVisible ? "Hide Holo-Pets" : "Show Holo-Pets"}
      onclick={onToggleWindow}
    >
      {windowVisible ? "▾" : "▸"} Holo-Pets
    </button>

    {#if windowVisible && currentPet}
      <div class="pet-stage-wrap">
        {#if speech}
          <div class="pet-speech">{speech}</div>
        {/if}
        <div class="pet-frame-row">
        {#if ownedPets.length > 1}
          <button
            type="button"
            class="pet-arrow"
            onclick={() => step(-1)}
            aria-label="Previous Holo-Pet"
          >
            ‹
          </button>
        {/if}

        <button
          type="button"
          class="pet-frame"
          class:petting
          onclick={handlePet}
          title={`Pet ${currentPet.name}`}
        >
          {#if currentPet.gifUrl}
            <img class="pet-gif" src={currentPet.gifUrl} alt={currentPet.name} />
          {:else if currentPet.kind === "orb"}
            <div class="pet-anim pet-orb pet-holo">
              <div class="orb-core"></div>
              <div class="orb-ring"></div>
              <div class="orb-ring orb-ring-2"></div>
            </div>
          {:else if currentPet.kind === "fox"}
            <svg class="pet-anim pet-fox pet-holo" viewBox="0 0 40 40">
              <g class="fox-body">
                <polygon
                  points="8,30 20,12 32,30"
                  fill="var(--accent)"
                  fill-opacity="0.28"
                  stroke="var(--accent-text)"
                  stroke-width="1.1"
                  stroke-linejoin="round"
                />
                <polygon
                  points="14,30 20,20 26,30"
                  fill="var(--accent-text)"
                  fill-opacity="0.18"
                  stroke="var(--accent-text)"
                  stroke-width="0.8"
                  stroke-linejoin="round"
                />
                <circle class="fox-eye" cx="16" cy="22" r="1.6" fill="var(--accent-text)" />
                <circle class="fox-eye" cx="24" cy="22" r="1.6" fill="var(--accent-text)" />
              </g>
            </svg>
          {:else if currentPet.kind === "moth"}
            <svg class="pet-anim pet-moth pet-holo" viewBox="0 0 40 40">
              <g class="moth-wings">
                <ellipse
                  cx="14" cy="18" rx="9" ry="6"
                  fill="var(--accent)"
                  fill-opacity="0.3"
                  stroke="var(--accent-text)"
                  stroke-width="0.9"
                />
                <ellipse
                  cx="26" cy="18" rx="9" ry="6"
                  fill="var(--accent)"
                  fill-opacity="0.3"
                  stroke="var(--accent-text)"
                  stroke-width="0.9"
                />
              </g>
              <rect
                x="18.5" y="14" width="3" height="14" rx="1.5"
                fill="var(--accent-text)"
                fill-opacity="0.6"
              />
            </svg>
          {:else}
            <svg class="pet-anim pet-bot pet-holo" viewBox="0 0 40 40">
              <rect
                x="10" y="14" width="20" height="16" rx="4"
                fill="var(--accent)"
                fill-opacity="0.25"
                stroke="var(--accent-text)"
                stroke-width="1.1"
              />
              <circle class="bot-eye" cx="16" cy="22" r="2" fill="var(--accent-text)" />
              <circle class="bot-eye" cx="24" cy="22" r="2" fill="var(--accent-text)" />
              <rect x="18" y="6" width="4" height="8" fill="var(--accent)" fill-opacity="0.5" />
              <circle class="bot-light" cx="20" cy="6" r="2.5" fill="var(--accent-text)" />
            </svg>
          {/if}

          {#each sparkles as s (s.id)}
            <span
              class="pet-sparkle"
              style="--angle: {s.angle}deg;"
              aria-hidden="true">✦</span
            >
          {/each}
          {#each floaters as f (f.id)}
            <span
              class="pet-floater"
              style="--dx: {f.dx}px; animation-delay: {f.delay}ms;"
              aria-hidden="true">{f.emoji}</span
            >
          {/each}
          {#each creditPops as p (p.id)}
            <span class="pet-credit-pop" aria-hidden="true">+{PET_CREDITS}</span>
          {/each}
        </button>

        <div class="pet-action-col">
          <button
            type="button"
            class="pet-action-btn"
            title={`Feed ${currentPet.name}`}
            onclick={handleFeed}
          >
            🍖
          </button>
          <button
            type="button"
            class="pet-action-btn"
            title={`Play with ${currentPet.name}`}
            onclick={handlePlay}
          >
            🧸
          </button>
        </div>

        {#if ownedPets.length > 1}
          <button
            type="button"
            class="pet-arrow"
            onclick={() => step(1)}
            aria-label="Next Holo-Pet"
          >
            ›
          </button>
        {/if}
        </div>
      </div>
      <p class="pet-name">{currentPet.name}</p>
    {/if}
  </div>
{/if}

<style>
  .pet-dock {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 15;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .pet-dock-toggle {
    align-self: flex-end;
    background: #1e1e1e;
    border: 1px solid #333;
    color: #999;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .pet-dock-toggle:hover {
    color: #e6e6e6;
    border-color: #444;
  }

  .pet-stage-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .pet-frame-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pet-speech {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 10px;
    max-width: 160px;
    padding: 6px 10px;
    border-radius: 10px;
    background: #262626;
    border: 1px solid var(--accent, #333);
    color: #e6e6e6;
    font-size: 0.72rem;
    text-align: center;
    white-space: normal;
    word-break: break-word;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    animation: pet-speech-in 0.18s ease-out;
    z-index: 1;
  }

  /* The tail is two stacked triangles: a slightly bigger accent-colored one
     behind (::before) and the bubble-colored fill on top (::after), shifted
     up 1px so a sliver of the one behind still shows around its edges —
     that sliver is what reads as the tail's outline, since a single CSS
     border-triangle can't have its own separate border stroke. */
  .pet-speech::before,
  .pet-speech::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-style: solid;
    border-color: transparent;
  }

  .pet-speech::before {
    border-width: 7px;
    border-top-color: var(--accent, #333);
  }

  .pet-speech::after {
    border-width: 6px;
    margin-top: -1px;
    border-top-color: #262626;
  }

  @keyframes pet-speech-in {
    0% {
      opacity: 0;
      transform: translate(-50%, 4px) scale(0.9);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }

  .pet-arrow {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid #333;
    background: #1e1e1e;
    color: #999;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pet-arrow:hover {
    color: #e6e6e6;
    border-color: #444;
  }

  /* The square frame itself. */
  .pet-frame {
    position: relative;
    width: 96px;
    height: 96px;
    flex-shrink: 0;
    border-radius: 14px;
    border: 1px solid var(--accent, #2a2a2a);
    background: #1e1e1e;
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.4),
      0 0 5px -3px var(--accent, transparent) inset;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    overflow: visible;
  }

  .pet-frame.petting {
    animation: pet-frame-bounce 0.42s ease;
  }

  @keyframes pet-frame-bounce {
    0% {
      transform: scale(1);
    }
    30% {
      transform: scale(1.14) translateY(-4px);
    }
    60% {
      transform: scale(0.96) translateY(1px);
    }
    100% {
      transform: scale(1);
    }
  }

  .pet-name {
    margin: 0;
    font-size: 0.72rem;
    color: #999;
    text-align: center;
  }

  .pet-anim {
    width: 48px;
    height: 48px;
  }

  /* The "holographic" look shared by every pet: a neon glow projected from
     its (mostly transparent) shape, in whichever accent color the current
     palette sets — so Cyberpunk pets glow pink/cyan, Neo Tokyo pets glow
     pink/gold, etc., with zero per-pet color logic needed. */
  .pet-holo {
    filter: drop-shadow(0 0 1.5px var(--accent-text)) drop-shadow(0 0 3px var(--accent));
  }

  .pet-gif {
    width: 48px;
    height: 48px;
    object-fit: contain;
  }

  .pet-sparkle {
    position: absolute;
    top: 50%;
    left: 50%;
    color: var(--accent-text, #ffe27a);
    text-shadow: 0 0 2px var(--accent, currentColor);
    font-size: 0.85rem;
    transform: translate(-50%, -50%);
    animation: pet-sparkle-burst 0.5s ease-out forwards;
  }

  @keyframes pet-sparkle-burst {
    0% {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0) scale(0.6);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-28px) scale(1.1);
    }
  }

  .pet-action-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pet-action-btn {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid #333;
    background: #1e1e1e;
    font-size: 0.85rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .pet-action-btn:hover {
    border-color: #444;
    background: #262626;
  }

  .pet-floater {
    position: absolute;
    top: 50%;
    left: 50%;
    font-size: 0.9rem;
    transform: translate(-50%, -50%);
    animation: pet-heart-rise 0.95s ease-out forwards;
  }

  @keyframes pet-heart-rise {
    0% {
      opacity: 0;
      transform: translate(calc(-50% + var(--dx)), -50%) scale(0.7);
    }
    20% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(calc(-50% + var(--dx)), -140%) scale(1.1);
    }
  }

  .pet-credit-pop {
    position: absolute;
    top: -6px;
    right: -4px;
    color: #e6c65c;
    font-size: 0.78rem;
    font-weight: 700;
    animation: pet-credit-pop-float 0.85s ease-out forwards;
  }

  @keyframes pet-credit-pop-float {
    0% {
      opacity: 0;
      transform: translateY(4px) scale(0.8);
    }
    20% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(-18px) scale(1.05);
    }
  }

  /* ---- Glowbit: a softly pulsing, drifting orb ---- */
  .pet-orb {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: orb-drift 3.2s ease-in-out infinite;
  }
  .orb-core {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent-text, #7dd8cd);
    opacity: 0.55;
    box-shadow:
      0 0 4px 1px var(--accent-text, #7dd8cd),
      0 0 9px 3px var(--accent, #0f8983);
    animation: orb-pulse 1.8s ease-in-out infinite;
  }
  .orb-ring {
    position: absolute;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--accent-text, #7dd8cd);
    opacity: 0.45;
  }
  .orb-ring-2 {
    width: 26px;
    height: 26px;
    border-color: var(--accent, #0f8983);
    opacity: 0.6;
  }
  @keyframes orb-drift {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
  @keyframes orb-pulse {
    0%, 100% { opacity: 0.8; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.15); }
  }

  /* ---- Pixelfox: a little wiggle/hop ---- */
  .pet-fox {
    animation: fox-hop 1.4s ease-in-out infinite;
  }
  .fox-eye {
    animation: fox-blink 3.4s steps(1) infinite;
  }
  @keyframes fox-hop {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-4px) rotate(-2deg); }
  }
  @keyframes fox-blink {
    0%, 92%, 100% { opacity: 1; }
    95% { opacity: 0; }
  }

  /* ---- Blipmoth: flickering, fluttering wings ---- */
  .pet-moth {
    animation: moth-flit 2.6s ease-in-out infinite;
  }
  .moth-wings {
    transform-origin: 20px 18px;
    animation: moth-flutter 0.28s ease-in-out infinite alternate;
  }
  @keyframes moth-flit {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(4px, -5px); }
    50% { transform: translate(-3px, 3px); }
    75% { transform: translate(3px, 4px); }
  }
  @keyframes moth-flutter {
    from { transform: scaleX(1); }
    to { transform: scaleX(0.7); }
  }

  /* ---- Sprocket: idle bob with a blinking indicator light ---- */
  .pet-bot {
    animation: bot-bob 2s ease-in-out infinite;
  }
  .bot-light {
    animation: bot-blink 1.2s steps(1) infinite;
  }
  @keyframes bot-bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  @keyframes bot-blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0.25; }
  }
</style>
