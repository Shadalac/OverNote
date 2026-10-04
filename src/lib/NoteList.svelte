<script>
  let {
    notes,
    selectedId,
    onSelect,
    onNew,
    onDelete,
    templates = [],
    onNewFromTemplate,
    onDeleteTemplate,
    onTogglePin,
    onReorderPinned,
  } = $props();

  let searchQuery = $state("");
  let activeTag = $state(null);

  // The "+" button asks whether the new note should start blank or from one
  // of the user's saved templates, rather than always creating blank.
  let showNewModal = $state(false);

  function openNewModal() {
    showNewModal = true;
  }

  function cancelNewModal() {
    showNewModal = false;
  }

  function chooseBlank() {
    showNewModal = false;
    onNew();
  }

  function chooseTemplate(template) {
    showNewModal = false;
    onNewFromTemplate?.(template.id);
  }

  function removeTemplate(event, template) {
    event.stopPropagation();
    onDeleteTemplate?.(template.id);
  }

  function handleNewModalKeydown(event) {
    if (event.key === "Escape") cancelNewModal();
  }

  // Deleting is destructive and can't be undone, so it's gated behind a
  // confirmation modal rather than firing straight off the × button.
  let pendingDelete = $state(null); // { id, title } of the note awaiting confirmation

  function requestDelete(note) {
    pendingDelete = { id: note.id, title: note.title || "Untitled note" };
  }

  function cancelDelete() {
    pendingDelete = null;
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    onDelete(pendingDelete.id);
    pendingDelete = null;
  }

  function handleModalKeydown(event) {
    if (event.key === "Escape") cancelDelete();
    else if (event.key === "Enter") confirmDelete();
  }

  // Focuses the modal as soon as it's mounted so Escape/Enter work
  // immediately without requiring a click first.
  function focusOnMount(node) {
    node.focus();
  }

  function parseTags(tagString) {
    if (!tagString) return [];
    return tagString
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // All distinct tags across every note, for the filter row. Sorted so the
  // chip row doesn't jump around as notes are edited.
  let allTags = $derived(
    [...new Set(notes.flatMap((n) => parseTags(n.tags)))].sort((a, b) =>
      a.localeCompare(b)
    )
  );

  let filteredNotes = $derived(
    notes.filter((note) => {
      const matchesTag = !activeTag || parseTags(note.tags).includes(activeTag);
      if (!matchesTag) return false;

      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        note.title.toLowerCase().includes(query) ||
        note.body.toLowerCase().includes(query) ||
        parseTags(note.tags).some((t) => t.toLowerCase().includes(query))
      );
    })
  );

  function toggleTag(tag) {
    activeTag = activeTag === tag ? null : tag;
  }

  // `notes` (and therefore filteredNotes) already arrives pinned-first, in
  // pin_order, from the database — so splitting it here just separates the
  // two groups for rendering a "Pinned" heading; it doesn't need its own
  // sort.
  let pinnedNotes = $derived(filteredNotes.filter((n) => n.pinned));
  let unpinnedNotes = $derived(filteredNotes.filter((n) => !n.pinned));

  // Drag-to-reorder only ever touches the pinned group, and it needs to
  // compute positions against *every* pinned note (not just the ones a
  // search/tag filter currently shows) so reordering while filtered can't
  // scramble the order of pinned notes that are temporarily hidden.
  let allPinnedIds = $derived(notes.filter((n) => n.pinned).map((n) => n.id));

  let dragId = $state(null);
  let dragOverId = $state(null);

  function handleDragStart(event, note) {
    dragId = note.id;
    event.dataTransfer.effectAllowed = "move";
    // Firefox requires data to actually be set for the drag to start.
    event.dataTransfer.setData("text/plain", String(note.id));
  }

  function handleDragOver(event, note) {
    if (dragId === null || dragId === note.id) return;
    event.preventDefault();
    dragOverId = note.id;
  }

  function handleDragLeave(note) {
    if (dragOverId === note.id) dragOverId = null;
  }

  function handleDrop(event, note) {
    event.preventDefault();
    dragOverId = null;
    if (dragId === null || dragId === note.id) return;
    const fromIndex = allPinnedIds.indexOf(dragId);
    const toIndex = allPinnedIds.indexOf(note.id);
    dragId = null;
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...allPinnedIds];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    onReorderPinned?.(reordered);
  }

  function handleDragEnd() {
    dragId = null;
    dragOverId = null;
  }

  function preview(body) {
    // Swap markdown-style checklist markup for a plain glyph so the sidebar
    // preview reads naturally instead of showing raw "- [ ] " syntax.
    const cleaned = body
      .replace(/^- \[ \] /gm, "☐ ")
      .replace(/^- \[x\] /gm, "☑ ");
    const trimmed = cleaned.trim();
    return trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
</script>

<div class="list">
  <div class="list-header">
    <h1>(OverNote_)</h1>
    <button class="new-btn" onclick={openNewModal} title="New note">+</button>
  </div>

  <div class="search-row">
    <input
      type="text"
      class="search-input"
      placeholder="Search notes…"
      bind:value={searchQuery}
    />
  </div>

  {#if allTags.length > 0}
    <div class="tag-filter-row">
      {#each allTags as tag}
        <button
          type="button"
          class="tag-filter-chip"
          class:active={activeTag === tag}
          onclick={() => toggleTag(tag)}
        >
          {tag}
        </button>
      {/each}
    </div>
  {/if}

  {#if notes.length === 0}
    <p class="empty">No notes yet. Click + to create one.</p>
  {:else if filteredNotes.length === 0}
    <p class="empty">No notes match your search.</p>
  {/if}

  {#snippet noteRow(note, draggable)}
    <li
      class:selected={note.id === selectedId}
      class:drag-over={draggable && dragOverId === note.id}
      class:dragging={draggable && dragId === note.id}
      draggable={draggable}
      ondragstart={draggable ? (e) => handleDragStart(e, note) : undefined}
      ondragover={draggable ? (e) => handleDragOver(e, note) : undefined}
      ondragleave={draggable ? () => handleDragLeave(note) : undefined}
      ondrop={draggable ? (e) => handleDrop(e, note) : undefined}
      ondragend={draggable ? handleDragEnd : undefined}
    >
      <button class="note-row" onclick={() => onSelect(note.id)}>
        <span class="title">{note.title || "Untitled note"}</span>
        <span class="preview">{preview(note.body) || "No content"}</span>
        {#if parseTags(note.tags).length > 0}
          <span class="row-tags">
            {#each parseTags(note.tags) as tag}
              <span class="row-tag">{tag}</span>
            {/each}
          </span>
        {/if}
        <span class="date">{formatDate(note.updated_at)}</span>
      </button>
      <button
        type="button"
        class="pin-btn"
        class:pinned={note.pinned}
        title={note.pinned ? "Unpin note" : "Pin note"}
        onclick={() => onTogglePin?.(note.id)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={note.pinned ? "currentColor" : "none"}
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path fill="none" d="M12 17v5" />
          <path
            d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
          />
        </svg>
      </button>
      <button
        class="delete-btn"
        title="Delete note"
        onclick={() => requestDelete(note)}
      >
        ×
      </button>
    </li>
  {/snippet}

  <ul>
    {#if pinnedNotes.length > 0}
      <li class="group-label">Pinned</li>
      {#each pinnedNotes as note (note.id)}
        {@render noteRow(note, true)}
      {/each}
      {#if unpinnedNotes.length > 0}
        <li class="group-label">Notes</li>
      {/if}
    {/if}
    {#each unpinnedNotes as note (note.id)}
      {@render noteRow(note, false)}
    {/each}
  </ul>
</div>

{#if showNewModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="-1"
    onclick={cancelNewModal}
    onkeydown={handleNewModalKeydown}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      use:focusOnMount
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleNewModalKeydown}
    >
      <p class="modal-title">New note</p>
      <button type="button" class="menu-option" onclick={chooseBlank}>
        + Blank note
      </button>

      {#if templates.length > 0}
        <p class="modal-subtitle">Or start from a template</p>
        <ul class="template-list">
          {#each templates as template (template.id)}
            <li class="template-row">
              <button
                type="button"
                class="menu-option template-option"
                onclick={() => chooseTemplate(template)}
              >
                {template.name}
              </button>
              <button
                type="button"
                class="template-delete"
                title="Delete template"
                onclick={(e) => removeTemplate(e, template)}
              >
                ×
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="modal-subtitle">
          No templates saved yet — save a note as one from its editor.
        </p>
      {/if}

      <div class="modal-actions">
        <button type="button" class="modal-btn modal-cancel" onclick={cancelNewModal}>
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

{#if pendingDelete}
  <div
    class="modal-overlay"
    role="button"
    tabindex="-1"
    onclick={cancelDelete}
    onkeydown={handleModalKeydown}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      use:focusOnMount
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleModalKeydown}
    >
      <p class="modal-title">Delete this note?</p>
      <p class="modal-body">
        “{pendingDelete.title}” will be deleted permanently. This can't be undone.
      </p>
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-cancel" onclick={cancelDelete}>
          Cancel
        </button>
        <button type="button" class="modal-btn modal-delete" onclick={confirmDelete}>
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    height: 100%;
    /* This is a grid item (see App.svelte's .layout), and grid/flex items
       default to min-height: auto — which refuses to shrink below the
       list's own content size. With many notes that silently grows the
       whole column (and, since the page itself no longer scrolls, clips
       the overflow instead of showing it). This lets it actually respect
       the column's real height, so its own `ul` scrolls internally. */
    min-height: 0;
    border-right: 1px solid #2a2a2a;
    background: var(--surface-sidebar, #171717);
    color: #e6e6e6;
  }

  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    /* Extra left padding reserves room for App.svelte's fixed sidebar-
       collapse button (top-left corner of the whole window), so the title
       never sits underneath it. */
    padding-left: 44px;
    border-bottom: 1px solid #2a2a2a;
  }

  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  .new-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: var(--accent);
    color: white;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }

  .new-btn:hover {
    background: var(--accent-hover);
  }

  .search-row {
    padding: 10px 12px;
    border-bottom: 1px solid #2a2a2a;
  }

  .search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid #333;
    background: #1f1f1f;
    color: #e6e6e6;
    font-size: 0.85rem;
    outline: none;
  }

  .search-input:focus {
    border-color: var(--accent);
  }

  .tag-filter-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 12px;
    border-bottom: 1px solid #2a2a2a;
  }

  .tag-filter-chip {
    border: 1px solid #333;
    background: #1f1f1f;
    color: #999;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .tag-filter-chip:hover {
    border-color: #555;
    color: #ccc;
  }

  .tag-filter-chip.active {
    background: var(--accent-bg);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .empty {
    padding: 16px;
    color: #888;
    font-size: 0.9rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    /* flex: 1 + min-height: 0 is what makes this the one thing in the
       column that scrolls — without min-height: 0 a flex child won't
       shrink below its content size, so the whole sidebar (or the page)
       would grow/scroll instead of just this list. */
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* Dark scrollbar, scoped to this list so it only ever appears inside the
     notes column, right at its own right edge. */
  ul::-webkit-scrollbar {
    width: 10px;
  }

  ul::-webkit-scrollbar-track {
    background: var(--surface-sidebar, #171717);
  }

  ul::-webkit-scrollbar-thumb {
    background: #3a3a3a;
    border-radius: 6px;
  }

  ul::-webkit-scrollbar-thumb:hover {
    background: #484848;
  }

  li {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--sidebar-divider, #232323);
  }

  li.selected {
    background: var(--accent-bg, #232323);
  }

  li[draggable="true"] {
    cursor: grab;
  }

  li.dragging {
    opacity: 0.4;
  }

  /* Shown while another pinned row is being dragged over this one, as the
     drop target indicator. */
  li.drag-over {
    box-shadow: inset 0 2px 0 var(--accent), inset 0 -2px 0 transparent;
  }

  .group-label {
    padding: 8px 12px 4px;
    font-size: 0.68rem;
    font-weight: 600;
    color: #777;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: none;
  }

  .note-row {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 10px 12px;
    border: none;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }

  .title {
    font-weight: 600;
    font-size: 0.92rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .preview {
    font-size: 0.8rem;
    color: #999;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .row-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .row-tag {
    font-size: 0.68rem;
    color: var(--accent-text);
    background: var(--accent-bg-2);
    border-radius: 999px;
    padding: 1px 7px;
  }

  .date {
    font-size: 0.72rem;
    color: #666;
  }

  .pin-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: #666;
    cursor: pointer;
    padding: 0 6px;
    /* Hidden until the row is hovered, unless the note is already pinned —
       then it stays visible (filled) so there's always a visible way to
       unpin it. */
    opacity: 0;
  }

  li:hover .pin-btn,
  .pin-btn.pinned {
    opacity: 1;
  }

  .pin-btn:hover {
    color: var(--accent-text);
  }

  .pin-btn.pinned {
    color: var(--accent);
  }

  .delete-btn {
    border: none;
    background: none;
    color: #666;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 10px;
  }

  .delete-btn:hover {
    color: #ef4444;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    overflow-y: auto;
    padding: 40px 16px;
    box-sizing: border-box;
    z-index: 100;
  }

  .modal {
    width: 320px;
    max-width: calc(100vw - 48px);
    background: #1f1f1f;
    border: 1px solid #333;
    border-radius: 10px;
    padding: 18px 20px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    outline: none;
  }

  .modal-title {
    margin: 0 0 8px;
    font-size: 1rem;
    font-weight: 700;
    color: #e6e6e6;
  }

  .modal-body {
    margin: 0 0 18px;
    font-size: 0.85rem;
    line-height: 1.4;
    color: #aaa;
  }

  .modal-subtitle {
    margin: 14px 0 6px;
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .menu-option {
    display: block;
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    padding: 9px 10px;
    border: 1px solid #333;
    border-radius: 7px;
    background: #262626;
    color: #e6e6e6;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .menu-option:hover {
    border-color: var(--accent);
    background: #232323;
  }

  .template-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .template-row {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  .template-option {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .template-delete {
    flex-shrink: 0;
    border: none;
    background: none;
    color: #666;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 8px;
    border-radius: 6px;
  }

  .template-delete:hover {
    color: #ef4444;
    background: #262626;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .modal-btn {
    border: none;
    border-radius: 6px;
    padding: 7px 14px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .modal-cancel {
    background: #2a2a2a;
    color: #ccc;
  }

  .modal-cancel:hover {
    background: #333;
  }

  .modal-delete {
    background: #ef4444;
    color: white;
    font-weight: 600;
  }

  .modal-delete:hover {
    background: #dc2626;
  }
</style>
