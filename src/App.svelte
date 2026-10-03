<script>
  import { onMount } from "svelte";
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
  } from "./lib/db.js";
  import { THEMES_CATALOG, PETS_CATALOG } from "./lib/gamification.js";

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
  });

  // The Store/Settings UI wants full catalog entries (name, cost, art), not
  // just the bare ids persisted in appState.
  let ownedPetEntries = $derived(
    PETS_CATALOG.filter((p) => appState.ownedPets.includes(p.id))
  );

  onMount(async () => {
    await Promise.all([refresh(), refreshTemplates(), refreshAppState()]);
    loading = false;
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
      notes = [...notes].sort(
        (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
      );
    }
  }

  async function handleDelete(id) {
    await deleteNote(id);
    if (selectedId === id) {
      selectedId = null;
    }
    await refresh();
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
              onEarnCredits={handleEarnCredits}
              onBuyTheme={handleBuyTheme}
              onBuyPet={handleBuyPet}
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

  :global(html[data-theme="cyberpunk"]) {
    --accent: #ff2ec4;
    --accent-hover: #d61aa3;
    --accent-bg: #2a123a;
    --accent-text: #7df9ff;
    --accent-bg-2: #1f0e2e;
  }

  :global(html[data-theme="neo-tokyo"]) {
    --accent: #ff8fc7;
    --accent-hover: #e572ac;
    --accent-bg: #123332;
    --accent-text: #f5d98b;
    --accent-bg-2: #0f2b2a;
  }

  /* Warm sunset synthwave: orange accent, golden highlights. */
  :global(html[data-theme="solarwave"]) {
    --accent: #ff7a3d;
    --accent-hover: #e0632a;
    --accent-bg: #3a1f12;
    --accent-text: #ffd27a;
    --accent-bg-2: #2e170d;
  }

  /* Toxic/hacker green, like an old CRT full of nuclear slime. */
  :global(html[data-theme="radslime"]) {
    --accent: #39ff14;
    --accent-hover: #2ecc0f;
    --accent-bg: #10240d;
    --accent-text: #baff8f;
    --accent-bg-2: #0c1c09;
  }

  /* Deep-sea bioluminescent blue. */
  :global(html[data-theme="abyssal"]) {
    --accent: #2ea8ff;
    --accent-hover: #1f86d1;
    --accent-bg: #0c2438;
    --accent-text: #8fe3ff;
    --accent-bg-2: #091c2c;
  }

  /* Gothic dark red/pink. */
  :global(html[data-theme="bloodmoon"]) {
    --accent: #ff3355;
    --accent-hover: #d81f42;
    --accent-bg: #2a0d14;
    --accent-text: #ff9baa;
    --accent-bg-2: #1f0a0f;
  }

  /* Retro monochrome amber CRT terminal. */
  :global(html[data-theme="amber-terminal"]) {
    --accent: #ffb000;
    --accent-hover: #cc8c00;
    --accent-bg: #2a1d05;
    --accent-text: #ffd97a;
    --accent-bg-2: #201703;
  }

  /* Subtle, muted sage green — quieter than Radslime's neon green. */
  :global(html[data-theme="manta"]) {
    --accent: #6fae8c;
    --accent-hover: #5a9276;
    --accent-bg: #16241d;
    --accent-text: #a8d9bf;
    --accent-bg-2: #101b16;
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
</style>
