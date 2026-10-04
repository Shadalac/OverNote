<script>
  import { onMount } from "svelte";
  import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
  import { relaunch } from "@tauri-apps/plugin-process";
  import NoteList from "./lib/NoteList.svelte";
  import NoteEditor from "./lib/NoteEditor.svelte";
  import PetWindow from "./lib/PetWindow.svelte";
  import {
    listNotes,
    createNote,
    updateNote,
    deleteNote,
    listTemplates,
    createTemplate,
    deleteTemplate,
    renameTemplate,
    createNoteFromTemplate,
    renameTagEverywhere,
    deleteTagEverywhere,
    getAppState,
    setAppState,
    setNotePinned,
    reorderPinnedNotes,
  } from "./lib/db.js";
  import { THEMES_CATALOG, PETS_CATALOG, CUSTOM_PET_COST, CUSTOM_PET_SAYINGS } from "./lib/gamification.js";

  let notes = $state([]);
  let templates = $state([]);
  let selectedId = $state(null);
  let loading = $state(true);
  let error = $state(null);

  // Whether the notes-list sidebar is shown. Persisted like the other
  // device-level display preferences (theme, UI scale) so it stays hidden
  // (or shown) across restarts.
  function loadSidebarVisible() {
    try {
      const v = localStorage.getItem("overnote-sidebar-visible");
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  }
  let sidebarVisible = $state(loadSidebarVisible());

  function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
    try {
      localStorage.setItem("overnote-sidebar-visible", sidebarVisible ? "1" : "0");
    } catch {
      // Best-effort — a private/locked-down webview can throw here.
    }
  }

  let selectedNote = $derived(notes.find((n) => n.id === selectedId) ?? null);

  // ---- Gamification: credits, unlocked themes, owned/visible pets --------
  //
  // Global (not per-note) progress, persisted in the database so it's
  // never lost even if localStorage were cleared. Lives here, not in
  // NoteEditor, so it survives switching notes (NoteEditor is torn down
  // and rebuilt on every note switch) and so the pet window can render
  // even when no note is selected.
  let appState = $state({
    credits: 0,
    unlockedThemes: ["default"],
    ownedPets: [],
    // Only one Holo-Pet is shown at a time, in its own square frame;
    // left/right arrows there switch which owned pet is active. Persisted
    // so the same one is still showing after a restart.
    activePetId: null,
    petsWindowVisible: true,
    customPets: [],
  });

  // The Store/Settings UI wants full catalog entries (name, cost, art), not
  // just the bare ids persisted in appState — plus any custom pets, which
  // are already stored as full entries (no catalog to look them up in).
  let ownedPetEntries = $derived([
    ...PETS_CATALOG.filter((p) => appState.ownedPets.includes(p.id)),
    ...appState.customPets,
  ]);

  // ---- Auto-update -------------------------------------------------------
  //
  // A quiet background check against the GitHub Releases feed configured in
  // tauri.conf.json's `plugins.updater`. This is the one time the otherwise-
  // offline app touches the network on its own — it's a single small
  // version check, and failing (no internet, no release published yet) is
  // silent rather than shown as an error, since it's a convenience, not a
  // feature the user depends on to use their notes.
  let pendingUpdate = $state(null); // the Update object from the plugin, once one's found
  let updateStage = $state("idle"); // idle | downloading | installing | error
  let updateError = $state(null);

  async function checkForAppUpdate() {
    try {
      const update = await checkForUpdate();
      if (update?.available) {
        pendingUpdate = update;
      }
    } catch {
      // No internet, no release yet, or the endpoint 404s — nothing to
      // surface to the user for a background check.
    }
  }

  async function installPendingUpdate() {
    if (!pendingUpdate) return;
    try {
      updateStage = "downloading";
      await pendingUpdate.downloadAndInstall();
      updateStage = "installing";
      await relaunch();
    } catch (err) {
      updateStage = "error";
      updateError = String(err);
    }
  }

  function dismissUpdate() {
    pendingUpdate = null;
    updateStage = "idle";
  }

  onMount(async () => {
    await Promise.all([refresh(), refreshTemplates(), refreshAppState()]);
    loading = false;
    checkForAppUpdate();
  });

  async function refreshAppState() {
    try {
      appState = await getAppState();
    } catch (err) {
      error = String(err);
    }
  }

  async function persistAppState(partial) {
    appState = { ...appState, ...partial };
    await setAppState(partial);
  }

  function handleEarnCredits(amount) {
    persistAppState({ credits: appState.credits + amount });
  }

  function handleBuyTheme(themeId) {
    const theme = THEMES_CATALOG.find((t) => t.id === themeId);
    if (!theme || appState.unlockedThemes.includes(themeId)) return;
    // A "+" theme is an upgrade — it can only be bought once its base
    // theme is already owned.
    if (theme.requires && !appState.unlockedThemes.includes(theme.requires)) return;
    if (appState.credits < theme.cost) return;
    persistAppState({
      credits: appState.credits - theme.cost,
      unlockedThemes: [...appState.unlockedThemes, themeId],
    });
  }

  function handleBuyPet(petId) {
    const pet = PETS_CATALOG.find((p) => p.id === petId);
    if (!pet || appState.ownedPets.includes(petId)) return;
    if (appState.credits < pet.cost) return;
    persistAppState({
      credits: appState.credits - pet.cost,
      ownedPets: [...appState.ownedPets, petId],
      // A newly bought pet shows up right away rather than needing a
      // separate step to reveal it.
      activePetId: petId,
    });
  }

  // The Store's "Create a custom pet" flow — `image` is already a
  // "data:...;base64,..." URL by the time it gets here (NoteEditor reads
  // and downsizes the user's chosen file before calling this). Each
  // purchase makes a brand-new pet, so this can be bought repeatedly.
  // `sayings` is { idle, pet, fed, played } arrays the user typed in the
  // Store — any group left empty falls back to the generic lines rather
  // than that pet staying silent on that occasion.
  function handleCreateCustomPet(name, image, sayings) {
    const trimmedName = name.trim();
    if (!trimmedName || !image || appState.credits < CUSTOM_PET_COST) return;
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const pet = {
      id,
      name: trimmedName,
      gifUrl: image,
      kind: "custom",
      blurb: "Your custom pet.",
      sayings: {
        idle: sayings?.idle?.length ? sayings.idle : CUSTOM_PET_SAYINGS,
        pet: sayings?.pet?.length ? sayings.pet : CUSTOM_PET_SAYINGS,
        fed: sayings?.fed?.length ? sayings.fed : CUSTOM_PET_SAYINGS,
        played: sayings?.played?.length ? sayings.played : CUSTOM_PET_SAYINGS,
      },
    };
    persistAppState({
      credits: appState.credits - CUSTOM_PET_COST,
      customPets: [...appState.customPets, pet],
      activePetId: id,
    });
  }

  function handleSetActivePet(petId) {
    if (!appState.ownedPets.includes(petId)) return;
    persistAppState({ activePetId: petId });
  }

  function handleTogglePetsWindow() {
    persistAppState({ petsWindowVisible: !appState.petsWindowVisible });
  }

  async function refresh() {
    try {
      notes = await listNotes();
      if (selectedId === null && notes.length > 0) {
        selectedId = notes[0].id;
      }
    } catch (err) {
      error = String(err);
    }
  }

  async function refreshTemplates() {
    try {
      templates = await listTemplates();
    } catch (err) {
      error = String(err);
    }
  }

  async function handleNew() {
    const id = await createNote();
    await refresh();
    selectedId = id;
  }

  async function handleNewFromTemplate(templateId) {
    const id = await createNoteFromTemplate(templateId);
    await refresh();
    selectedId = id;
  }

  async function handleSaveTemplate(name, title, body, tags) {
    await createTemplate(name, title, body, tags);
    await refreshTemplates();
  }

  async function handleDeleteTemplate(id) {
    await deleteTemplate(id);
    await refreshTemplates();
  }

  async function handleRenameTemplate(id, name) {
    await renameTemplate(id, name);
    await refreshTemplates();
  }

  async function handleRenameTag(oldTag, newTag) {
    await renameTagEverywhere(oldTag, newTag);
    await refresh();
  }

  async function handleDeleteTag(tag) {
    await deleteTagEverywhere(tag);
    await refresh();
  }

  function handleSelect(id) {
    selectedId = id;
  }

  async function handleChange(id, title, body, tags, earnedItemIds = "") {
    await updateNote(id, title, body, tags, earnedItemIds);
    const note = notes.find((n) => n.id === id);
    if (note) {
      note.title = title;
      note.body = body;
      note.tags = tags;
      note.earned_item_ids = earnedItemIds;
      note.updated_at = new Date().toISOString();
      // Mirrors listNotes()'s ORDER BY: pinned notes stay grouped at the top
      // in their pin_order, and only the unpinned rest re-sorts by recency —
      // editing a note should never shuffle the pinned group around.
      notes = [...notes].sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        if (a.pinned) return a.pin_order - b.pin_order;
        return new Date(b.updated_at) - new Date(a.updated_at);
      });
    }
  }

  async function handleDelete(id) {
    await deleteNote(id);
    if (selectedId === id) {
      selectedId = null;
    }
    await refresh();
  }

  async function handleTogglePin(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    await setNotePinned(id, !note.pinned);
    await refresh();
  }

  // Optimistically reorders the local list so the drag feels instant, then
  // persists it — orderedIds is every pinned note's id, top to bottom.
  async function handleReorderPinned(orderedIds) {
    const order = new Map(orderedIds.map((id, i) => [id, i + 1]));
    const pinnedNotes = orderedIds
      .map((id) => notes.find((n) => n.id === id))
      .filter(Boolean)
      .map((n) => ({ ...n, pin_order: order.get(n.id) }));
    const restNotes = notes.filter((n) => !order.has(n.id));
    notes = [...pinnedNotes, ...restNotes];
    await reorderPinnedNotes(orderedIds);
  }
</script>

<main>
  {#if error}
    <div class="error">Something went wrong: {error}</div>
  {:else if loading}
    <div class="loading">Loading…</div>
  {:else}
    <div class="layout" style="grid-template-columns: {sidebarVisible ? '280px' : '0px'} 1fr">
      <button
        type="button"
        class="sidebar-toggle"
        title={sidebarVisible ? "Hide notes list" : "Show notes list"}
        onclick={toggleSidebar}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="1.5" y="2.5" width="15" height="13" rx="2" stroke="currentColor" stroke-width="1.4" />
          <line x1="6.5" y1="2.5" x2="6.5" y2="15.5" stroke="currentColor" stroke-width="1.4" />
        </svg>
      </button>
      {#if sidebarVisible}
        <NoteList
          {notes}
          {templates}
          {selectedId}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
          onNewFromTemplate={handleNewFromTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onTogglePin={handleTogglePin}
          onReorderPinned={handleReorderPinned}
        />
      {:else}
        <div class="sidebar-placeholder"></div>
      {/if}
      <div class="main-pane">
        {#if selectedNote}
          {#key selectedNote.id}
            <NoteEditor
              note={selectedNote}
              onChange={handleChange}
              onSaveTemplate={handleSaveTemplate}
              {notes}
              {templates}
              onRenameTag={handleRenameTag}
              onDeleteTag={handleDeleteTag}
              onRenameTemplate={handleRenameTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              credits={appState.credits}
              unlockedThemes={appState.unlockedThemes}
              ownedPets={appState.ownedPets}
              customPets={appState.customPets}
              onEarnCredits={handleEarnCredits}
              onBuyTheme={handleBuyTheme}
              onBuyPet={handleBuyPet}
              onCreateCustomPet={handleCreateCustomPet}
            />
          {/key}
        {:else}
          <div class="placeholder">Select a note, or create a new one.</div>
        {/if}
      </div>
    </div>
    <PetWindow
      ownedPets={ownedPetEntries}
      activePetId={appState.activePetId}
      windowVisible={appState.petsWindowVisible}
      onSetActivePet={handleSetActivePet}
      onToggleWindow={handleTogglePetsWindow}
      onEarnCredits={handleEarnCredits}
    />
    {#if pendingUpdate}
      <div class="update-banner">
        {#if updateStage === "error"}
          <span class="update-text">Update failed: {updateError}</span>
          <button class="update-dismiss" onclick={dismissUpdate}>Dismiss</button>
        {:else if updateStage === "downloading"}
          <span class="update-text">Downloading update…</span>
        {:else if updateStage === "installing"}
          <span class="update-text">Installing — restarting…</span>
        {:else}
          <span class="update-text">Update {pendingUpdate.version} is available</span>
          <button class="update-install" onclick={installPendingUpdate}>
            Install &amp; Restart
          </button>
          <button class="update-dismiss" onclick={dismissUpdate} title="Dismiss">
            ×
          </button>
        {/if}
      </div>
    {/if}
  {/if}
</main>

<style>
  /* Color palette: a small set of accent variables every component reads
     with var(...), swapped per data-theme attribute (set on <html> by
     NoteEditor's Settings panel). These cascade to the whole document —
     the sidebar included — regardless of which component defines or reads
     them, since custom properties aren't subject to Svelte's per-component
     style scoping the way selectors are. The base dark shell (backgrounds,
     borders, body text) stays the same across palettes; only the
     accent/highlight colors change. */
  :global(html) {
    --accent: #0f8983;
    --accent-hover: #0c6f6a;
    --accent-bg: #163a38;
    --accent-text: #7dd8cd;
    --accent-bg-2: #17302e;
    /* --ui-scale itself is still set here (by NoteEditor's Settings panel),
       but the actual `zoom` that reads it is applied down on NoteEditor's
       own .editor element, not here — zooming the whole <html> scaled the
       real viewport math (100vh, the fixed-position modal overlays, the
       grid/flex height:100% chain everything else relies on) and broke
       scrolling everywhere else in the app. Scoping it to .editor keeps the
       scaling contained to the note content it's meant for. */
  }

  /* "+" upgrade: NOT a brighter shade of the base theme — a deliberate hue
     swap into a completely different, high-contrast neon-on-near-black
     combo, so switching to it reads as a different theme at a glance. */
  :global(html[data-theme="default-plus"]) {
    --accent: #ff0090;
    --accent-hover: #d6007a;
    --accent-bg: #120014;
    --accent-text: #ffd23f;
    --accent-bg-2: #0a000c;
  }

  :global(html[data-theme="cyberpunk"]) {
    --accent: #ff2ec4;
    --accent-hover: #d61aa3;
    --accent-bg: #2a123a;
    --accent-text: #7df9ff;
    --accent-bg-2: #1f0e2e;
  }

  :global(html[data-theme="cyberpunk-plus"]) {
    --accent: #d4ff00;
    --accent-hover: #a8cc00;
    --accent-bg: #050b14;
    --accent-text: #00eaff;
    --accent-bg-2: #030610;
  }

  :global(html[data-theme="neo-tokyo"]) {
    --accent: #ff8fc7;
    --accent-hover: #e572ac;
    --accent-bg: #123332;
    --accent-text: #f5d98b;
    --accent-bg-2: #0f2b2a;
  }

  :global(html[data-theme="neo-tokyo-plus"]) {
    --accent: #b400ff;
    --accent-hover: #8e00cc;
    --accent-bg: #0d1407;
    --accent-text: #caff33;
    --accent-bg-2: #080f04;
  }

  /* Warm sunset synthwave: orange accent, golden highlights. */
  :global(html[data-theme="solarwave"]) {
    --accent: #ff7a3d;
    --accent-hover: #e0632a;
    --accent-bg: #3a1f12;
    --accent-text: #ffd27a;
    --accent-bg-2: #2e170d;
  }

  :global(html[data-theme="solarwave-plus"]) {
    --accent: #7b2fff;
    --accent-hover: #5e1fd6;
    --accent-bg: #140a2e;
    --accent-text: #2ff2ff;
    --accent-bg-2: #0d0620;
  }

  /* Toxic/hacker green, like an old CRT full of nuclear slime. */
  :global(html[data-theme="radslime"]) {
    --accent: #39ff14;
    --accent-hover: #2ecc0f;
    --accent-bg: #10240d;
    --accent-text: #baff8f;
    --accent-bg-2: #0c1c09;
  }

  :global(html[data-theme="radslime-plus"]) {
    --accent: #ff0074;
    --accent-hover: #cc005c;
    --accent-bg: #0a0005;
    --accent-text: #caff00;
    --accent-bg-2: #060003;
  }

  /* Deep-sea bioluminescent blue. */
  :global(html[data-theme="abyssal"]) {
    --accent: #2ea8ff;
    --accent-hover: #1f86d1;
    --accent-bg: #0c2438;
    --accent-text: #8fe3ff;
    --accent-bg-2: #091c2c;
  }

  :global(html[data-theme="abyssal-plus"]) {
    --accent: #ff5500;
    --accent-hover: #cc4400;
    --accent-bg: #01111f;
    --accent-text: #ffcf6e;
    --accent-bg-2: #000c16;
  }

  /* Gothic dark red/pink. */
  :global(html[data-theme="bloodmoon"]) {
    --accent: #ff3355;
    --accent-hover: #d81f42;
    --accent-bg: #2a0d14;
    --accent-text: #ff9baa;
    --accent-bg-2: #1f0a0f;
  }

  :global(html[data-theme="bloodmoon-plus"]) {
    --accent: #baff00;
    --accent-hover: #93cc00;
    --accent-bg: #14000a;
    --accent-text: #ff2e6b;
    --accent-bg-2: #0d0006;
  }

  /* Retro monochrome amber CRT terminal. */
  :global(html[data-theme="amber-terminal"]) {
    --accent: #ffb000;
    --accent-hover: #cc8c00;
    --accent-bg: #2a1d05;
    --accent-text: #ffd97a;
    --accent-bg-2: #201703;
  }

  :global(html[data-theme="amber-terminal-plus"]) {
    --accent: #00fff2;
    --accent-hover: #00ccc2;
    --accent-bg: #050505;
    --accent-text: #ffee00;
    --accent-bg-2: #000000;
  }

  /* Subtle, muted sage green — quieter than Radslime's neon green. */
  :global(html[data-theme="manta"]) {
    --accent: #6fae8c;
    --accent-hover: #5a9276;
    --accent-bg: #16241d;
    --accent-text: #a8d9bf;
    --accent-bg-2: #101b16;
  }

  :global(html[data-theme="manta-plus"]) {
    --accent: #ff6f91;
    --accent-hover: #d65879;
    --accent-bg: #140a24;
    --accent-text: #8fe3ff;
    --accent-bg-2: #0d0618;
  }

  :global(html, body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    /* Fallback for non-WebKit engines — WebKit/Chromium (used everywhere
       this app runs) instead uses each scrollable area's own
       ::-webkit-scrollbar rules for a fully dark, styled scrollbar. */
    scrollbar-color: #444 #1e1e1e;
    scrollbar-width: thin;
  }

  :global(#app) {
    height: 100vh;
  }

  main {
    height: 100%;
  }

  .layout {
    display: grid;
    height: 100%;
    /* Column widths are set inline (based on sidebarVisible) rather than
       here, so the sidebar can collapse to 0 without unmounting the grid
       itself. */
  }

  .sidebar-placeholder {
    /* Occupies the collapsed 0px column when the sidebar is hidden, so the
       grid always has exactly two items and never has to reflow the third
       (.main-pane) into the wrong track. */
    min-width: 0;
    overflow: hidden;
  }

  /* Fixed to the viewport corner (not the grid) so it stays in exactly the
     same spot whether the sidebar is open or collapsed — the same pattern
     Claude's own sidebar-collapse button uses. NoteList reserves left
     padding in its header so this never overlaps the "(OverNote_)" title. */
  .sidebar-toggle {
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 20;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #999;
    cursor: pointer;
    padding: 0;
  }

  .sidebar-toggle:hover {
    background: #2a2a2a;
    color: #e6e6e6;
  }

  .main-pane {
    height: 100%;
    min-height: 0;
    min-width: 0;
    /* The note editor scrolls internally (its own body area) — this stays
       hidden so there's never a second, outer scrollbar at the window's
       edge in addition to the one right next to the note text. */
    overflow: hidden;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #666;
    background: #1e1e1e;
  }

  .loading,
  .error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #e6e6e6;
    background: #1e1e1e;
  }

  .error {
    color: #ef4444;
    padding: 24px;
    text-align: center;
  }

  /* Deliberately understated and easy to dismiss — this is a convenience
     notice, not something that should interrupt note-taking the way the
     credits/pet UI's more playful feedback does. */
  .update-banner {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--accent, #333);
    background: #1f1f1f;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
    font-size: 0.8rem;
    color: #e6e6e6;
  }

  .update-text {
    white-space: nowrap;
  }

  .update-install {
    border: none;
    border-radius: 6px;
    padding: 5px 10px;
    background: var(--accent);
    color: white;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .update-install:hover {
    background: var(--accent-hover);
  }

  .update-dismiss {
    border: none;
    background: none;
    color: #888;
    font-size: 0.95rem;
    cursor: pointer;
    padding: 2px 4px;
  }

  .update-dismiss:hover {
    color: #ccc;
  }
</style>
