<script>
  import { tick } from "svelte";
  import findIcon from "../assets/icons/find.png";
  import checklistIcon from "../assets/icons/checklist.png";
  import {
    THEMES_CATALOG,
    PETS_CATALOG,
    CHECKLIST_CREATE_CREDITS,
    ITEM_COMPLETE_CREDITS,
  } from "./gamification.js";

  let {
    note,
    onChange,
    onSaveTemplate,
    notes = [],
    onRenameTag,
    onDeleteTag,
    templates = [],
    onRenameTemplate,
    onDeleteTemplate,
    credits = 0,
    unlockedThemes = ["default"],
    ownedPets = [],
    onEarnCredits,
    onBuyTheme,
    onBuyPet,
  } = $props();

  // ---- Settings: color palette + UI scale ----------------------------------
  //
  // Both are app-wide display preferences, not per-note, so they're kept in
  // localStorage and applied directly to the <html> element (a CSS custom
  // property for scale, a data-theme attribute for palette) rather than
  // scoped to this component — that's what lets the same palette/scale reach
  // the sidebar too, since CSS custom properties and attribute selectors
  // cascade through the whole document regardless of which component reads
  // them. The catalog itself (ids/labels/costs) lives in gamification.js so
  // it stays in sync with the Store, which locks/unlocks these same ids.
  const PALETTES = THEMES_CATALOG;

  function loadTheme() {
    try {
      const saved = localStorage.getItem("overnote-theme");
      return PALETTES.some((p) => p.id === saved) ? saved : "default";
    } catch {
      return "default";
    }
  }

  function loadScale() {
    try {
      const v = parseFloat(localStorage.getItem("overnote-ui-scale"));
      return Number.isFinite(v) && v >= 0.8 && v <= 1.6 ? v : 1;
    } catch {
      return 1;
    }
  }

  function applyTheme(theme) {
    try {
      document.documentElement.setAttribute("data-theme", theme);
    } catch {
      // no-op if document isn't reachable for some reason
    }
  }

  function applyScale(scale) {
    try {
      document.documentElement.style.setProperty("--ui-scale", scale);
    } catch {
      // no-op
    }
  }

  // Re-measures every auto-sizing textarea (the title, and every checklist
  // item) after a scale change — their heights were fixed in pixels for the
  // old size, and nothing else would notice the text now renders bigger or
  // smaller.
  function remeasureAllTextareas() {
    if (titleInputEl) {
      titleInputEl.style.height = "auto";
      titleInputEl.style.height = titleInputEl.scrollHeight + "px";
    }
    bodyEl?.querySelectorAll(".line-text").forEach(resizeTextarea);
  }

  let committedTheme = loadTheme();
  let committedScale = loadScale();
  // Applied on every mount (harmless/idempotent on a note switch) so the
  // whole app reflects the saved preference from the start.
  applyTheme(committedTheme);
  applyScale(committedScale);

  let settingsOpen = $state(false);
  let pendingTheme = $state(committedTheme);
  let pendingScale = $state(committedScale);

  // Manage tags/templates: renaming is a small inline edit within the list,
  // one row at a time.
  let editingTag = $state(null);
  let editingTagValue = $state("");
  let editingTemplateId = $state(null);
  let editingTemplateValue = $state("");

  let allTags = $derived(
    [...new Set(notes.flatMap((n) => parseTags(n.tags)))].sort((a, b) =>
      a.localeCompare(b)
    )
  );

  function openSettings() {
    pendingTheme = committedTheme;
    pendingScale = committedScale;
    editingTag = null;
    editingTemplateId = null;
    settingsOpen = true;
  }

  function selectPendingTheme(theme) {
    if (!unlockedThemes.includes(theme)) return; // locked — buy it in the Store first
    pendingTheme = theme;
    applyTheme(theme); // live preview
  }

  function handleScaleInput(event) {
    pendingScale = parseFloat(event.target.value);
    applyScale(pendingScale); // live preview
    remeasureAllTextareas();
  }

  function cancelSettings() {
    applyTheme(committedTheme);
    applyScale(committedScale);
    settingsOpen = false;
    remeasureAllTextareas();
  }

  function saveSettings() {
    committedTheme = pendingTheme;
    committedScale = pendingScale;
    try {
      localStorage.setItem("overnote-theme", committedTheme);
      localStorage.setItem("overnote-ui-scale", String(committedScale));
    } catch {
      // Preference just won't survive a restart — the rest of the app still
      // works fine for this session.
    }
    settingsOpen = false;
  }

  function handleSettingsModalKeydown(event) {
    if (event.key === "Escape") cancelSettings();
  }

  // ---- Store: spend credits on themes and pets ----------------------------
  let storeOpen = $state(false);

  function openStore() {
    storeOpen = true;
  }

  function closeStore() {
    storeOpen = false;
  }

  function handleStoreModalKeydown(event) {
    if (event.key === "Escape") closeStore();
  }

  function buyTheme(themeId) {
    const theme = THEMES_CATALOG.find((t) => t.id === themeId);
    if (!theme || unlockedThemes.includes(themeId) || credits < theme.cost) return;
    onBuyTheme?.(themeId);
  }

  function buyPet(petId) {
    const pet = PETS_CATALOG.find((p) => p.id === petId);
    if (!pet || ownedPets.includes(petId) || credits < pet.cost) return;
    onBuyPet?.(petId);
  }

  function startTagEdit(tag) {
    editingTag = tag;
    editingTagValue = tag;
  }

  function cancelTagEdit() {
    editingTag = null;
    editingTagValue = "";
  }

  async function commitTagRename(oldTag) {
    const newTag = editingTagValue.trim();
    cancelTagEdit();
    if (!newTag || newTag === oldTag) return;
    await onRenameTag?.(oldTag, newTag);
  }

  function handleManageTagKeydown(event, tag) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      commitTagRename(tag);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelTagEdit();
    }
  }

  function startTemplateEdit(tpl) {
    editingTemplateId = tpl.id;
    editingTemplateValue = tpl.name;
  }

  function cancelTemplateEdit() {
    editingTemplateId = null;
    editingTemplateValue = "";
  }

  async function commitTemplateRename(tpl) {
    const name = editingTemplateValue.trim();
    cancelTemplateEdit();
    if (!name || name === tpl.name) return;
    await onRenameTemplate?.(tpl.id, name);
  }

  function handleManageTemplateKeydown(event, tpl) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      commitTemplateRename(tpl);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelTemplateEdit();
    }
  }

  // The parent wraps this component in {#key selectedNote.id}, so a whole
  // new NoteEditor instance is created whenever the selected note changes —
  // these are intentionally only the *initial* values for this instance.
  // svelte-ignore state_referenced_locally
  let title = $state(note.title);

  let saveTimer;
  let titleInputEl;
  let findInputEl;
  let bodyEl;

  // Undo for an accidentally-deleted checklist group: removeChecklistBlock
  // is the one path that deletes a whole group (as opposed to one item
  // within it), so that's the one place that snapshots what it removed.
  // Kept as a single most-recent entry with a toast, not a full history —
  // simple, and matches what was actually asked for.
  let lastDeletedGroup = $state(null); // { title, items, index } | null
  let undoToastTimer;

  // ---- Gamification: earned-item tracking + credit toasts -----------------
  //
  // Which checklist items on THIS note have already paid out their one-time
  // completion credit, ever — loaded once from the note's saved column and
  // never reset just by unchecking/rechecking an item, matching "permanent,
  // ever" so rapid checking/unchecking can't be farmed for credits.
  let earnedItemIds = new Set(
    (note.earned_item_ids || "").split(",").filter(Boolean)
  );

  // A short queue of "+N" toasts floating up near the credits badge. Several
  // can be visible at once (e.g. checking off a few items quickly).
  let creditToasts = $state([]);
  let creditToastSeq = 0;

  function awardCredits(amount) {
    onEarnCredits?.(amount);
    const id = ++creditToastSeq;
    creditToasts = [...creditToasts, { id, amount }];
    setTimeout(() => {
      creditToasts = creditToasts.filter((t) => t.id !== id);
    }, 1100);
  }

  function generateItemId() {
    try {
      return crypto.randomUUID();
    } catch {
      return "id" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  // The body is a sequence of "blocks", each its own DOM element:
  //   - a plain text block: a normal contenteditable <div>, free-flowing —
  //     the browser handles wrapping, multi-line text, selection, and paste
  //     natively, so there's nothing custom to fight with here.
  //   - a checklist block: a distinct, visually grouped list of checkbox
  //     rows, each row a real <input type="checkbox"> next to its own
  //     <textarea>. Checkboxes can only ever be added as a whole block (or
  //     a new row within one) via the toolbar button or Enter inside an
  //     existing checklist — never inserted loose into running text — so a
  //     checkbox can never end up mid-sentence or get knocked out of place.
  // The DOM is built once when the note loads and is the source of truth
  // while editing; it's read back into plain text only when saving.
  let activeBlock = null; // last-focused block (text-block or checklist-block)
  let activeItem = null; // last-focused checklist row, if activeBlock is one
  // Last-known caret position inside a text-block, kept live via a
  // `selectionchange` listener (see initBody) so the toolbar's checklist
  // button can insert a new group exactly where the cursor is, even though
  // clicking the button itself moves focus off the text-block first.
  let savedTextRange = null;

  // Tracks an in-progress drag gesture started from a drag handle:
  //   { kind: "item", el, container } — reordering a row within its own
  //     checklist block (container = that checklist-block; rows never leave
  //     their group).
  //   { kind: "block", el } — reordering a whole block (text or checklist)
  //     within the body.
  let dragState = null;

  // "Save as template": a two-step modal off the disk icon — first a yes/no
  // confirmation, then (on yes) a name field — that copies this note's
  // current title/body/tags into the templates table.
  let templateModalStep = $state(null); // null | "confirm" | "name"
  let templateNameInput = $state("");
  let templateNameInputEl;

  // "Find in note": search box with match count + prev/next, like a
  // browser's Ctrl+F. Title matches and checklist item matches both use a
  // small canvas-measured overlay (a highlight-layer div drawn behind the
  // textarea, same technique for both), since neither is a place you can
  // drop a <mark> into. Text-block matches are real <mark> elements
  // inserted directly into that block, since the browser positions/wraps
  // those for us. All three are merged into one ordered `matchEls` list
  // (plus titleMatches) so next/prev walks the note top to bottom.
  let findOpen = $state(false);
  let findQuery = $state("");
  let currentMatchIndex = $state(0);
  let bodyMatchCount = $state(0);
  let matchEls = [];

  // Tags are stored as a comma-separated string in the database, parsed here
  // into a plain array for the chip UI below.
  // svelte-ignore state_referenced_locally
  let tags = $state(parseTags(note.tags));
  let tagInput = $state("");

  // Whether the body has no real content, just for showing/hiding the
  // placeholder text (a contenteditable div can't use a native
  // `placeholder` attribute, and this needs to also account for checklist
  // rows, whose text lives in <textarea> values rather than DOM text).
  // svelte-ignore state_referenced_locally
  let bodyEmpty = $state(note.body.trim() === "");

  function parseTags(tagString) {
    if (!tagString) return [];
    return tagString
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function addTag() {
    const value = tagInput.trim();
    tagInput = "";
    if (!value) return;
    const exists = tags.some((t) => t.toLowerCase() === value.toLowerCase());
    if (!exists) {
      tags.push(value);
      scheduleSave();
    }
  }

  function handleTagKeydown(event) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    } else if (event.key === "Backspace" && tagInput === "" && tags.length > 0) {
      tags.pop();
      scheduleSave();
    }
  }

  function removeTag(index) {
    tags.splice(index, 1);
    scheduleSave();
  }

  function findAllOccurrences(haystack, needle) {
    const positions = [];
    const lower = haystack.toLowerCase();
    let i = 0;
    while ((i = lower.indexOf(needle, i)) !== -1) {
      positions.push(i);
      i += needle.length;
    }
    return positions;
  }

  function computeTitleMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return findAllOccurrences(title, q).map((start, idx) => ({
      idx,
      start,
      end: start + q.length,
    }));
  }

  let titleMatches = $derived(computeTitleMatches(findQuery));
  let totalMatches = $derived(titleMatches.length + bodyMatchCount);

  let measureCanvas;
  function measureTextWidth(el, text) {
    if (!el || !text) return 0;
    if (!measureCanvas) measureCanvas = document.createElement("canvas");
    const ctx = measureCanvas.getContext("2d");
    ctx.font = getComputedStyle(el).font;
    return ctx.measureText(text).width;
  }

  let titleHighlights = $derived(
    titleMatches.map((m) => ({
      idx: m.idx,
      left: measureTextWidth(titleInputEl, title.slice(0, m.start)),
      width: measureTextWidth(titleInputEl, title.slice(m.start, m.end)) || 4,
      isCurrent: m.idx === currentMatchIndex,
    }))
  );

  // Removes every <mark> the previous search inserted into text blocks
  // (merging their text back into the surrounding text nodes) and clears
  // every checklist item's highlight overlay.
  function clearBodyMarks() {
    if (!bodyEl) return;
    bodyEl.querySelectorAll("mark.hl-mark").forEach((mark) => {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
    bodyEl.querySelectorAll(".check-item .highlight-layer").forEach((layer) => {
      layer.innerHTML = "";
    });
  }

  // Finds every occurrence of `query` in one text block and wraps each in a
  // <mark>, returning the marks in document order.
  function markTextBlock(block, q) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    for (const textNode of textNodes) {
      const lower = textNode.textContent.toLowerCase();
      const ranges = [];
      let i = 0;
      while ((i = lower.indexOf(q, i)) !== -1) {
        ranges.push([i, i + q.length]);
        i += q.length;
      }
      for (let r = ranges.length - 1; r >= 0; r--) {
        const [start, end] = ranges[r];
        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        const mark = document.createElement("mark");
        mark.className = "hl-mark";
        range.surroundContents(mark);
      }
    }
    return Array.from(block.querySelectorAll("mark.hl-mark"));
  }

  // Finds every occurrence of `query` in one checklist row's textarea and
  // draws it as a positioned span in that row's highlight-layer overlay
  // (the textarea itself can't hold a <mark>), returning the spans in order.
  function markChecklistItem(row, q) {
    const ta = row.querySelector(".line-text");
    const layer = row.querySelector(".highlight-layer");
    const text = ta.value;
    const lower = text.toLowerCase();
    const spans = [];
    let i = 0;
    while ((i = lower.indexOf(q, i)) !== -1) {
      const span = document.createElement("span");
      span.className = "item-hl-mark";
      span.style.left = measureTextWidth(ta, text.slice(0, i)) + "px";
      span.style.width = (measureTextWidth(ta, text.slice(i, i + q.length)) || 4) + "px";
      layer.appendChild(span);
      spans.push(span);
      i += q.length;
    }
    return spans;
  }

  // Walks the body in document order, highlighting matches in every text
  // block and every checklist item, and merges them into one ordered list
  // so Find's next/prev moves top-to-bottom through the whole note.
  function applyBodyMarks(query) {
    clearBodyMarks();
    matchEls = [];
    const q = query.trim().toLowerCase();
    if (!q || !bodyEl) {
      bodyMatchCount = 0;
      return;
    }
    for (const block of bodyEl.children) {
      if (block.classList.contains("checklist-block")) {
        block.querySelectorAll(".check-item").forEach((row) => {
          matchEls.push(...markChecklistItem(row, q));
        });
      } else {
        matchEls.push(...markTextBlock(block, q));
      }
    }
    bodyMatchCount = matchEls.length;
  }

  function markCurrent() {
    bodyEl?.querySelectorAll("mark.hl-mark.current, .item-hl-mark.current").forEach((m) =>
      m.classList.remove("current")
    );
    const bodyIdx = currentMatchIndex - titleMatches.length;
    if (bodyIdx >= 0 && matchEls[bodyIdx]) {
      matchEls[bodyIdx].classList.add("current");
    }
  }

  function scrollToMatch(index) {
    if (index < titleMatches.length) {
      titleInputEl?.scrollIntoView?.({ block: "center" });
    } else {
      matchEls[index - titleMatches.length]?.scrollIntoView?.({ block: "center" });
    }
  }

  function handleFindInput(event) {
    findQuery = event.target.value;
    applyBodyMarks(findQuery);
    currentMatchIndex = 0;
    markCurrent();
    if (totalMatches > 0) scrollToMatch(0);
  }

  function nextMatch() {
    if (totalMatches === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % totalMatches;
    markCurrent();
    scrollToMatch(currentMatchIndex);
  }

  function prevMatch() {
    if (totalMatches === 0) return;
    currentMatchIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches;
    markCurrent();
    scrollToMatch(currentMatchIndex);
  }

  function handleFindKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    } else if (event.key === "Escape") {
      closeFind();
    }
  }

  function openFind() {
    findOpen = true;
    tick().then(() => findInputEl?.focus());
  }

  function closeFind() {
    findOpen = false;
    findQuery = "";
    currentMatchIndex = 0;
    clearBodyMarks();
    bodyMatchCount = 0;
  }

  // The title is a <textarea> (so long titles wrap) but should still behave
  // like a single-field title: Enter moves on to the body instead of
  // inserting a line break.
  function handleTitleKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      focusBodyStart();
    }
  }

  function focusBodyStart() {
    const first = bodyEl?.firstElementChild;
    if (!first) return;
    if (first.classList.contains("checklist-block")) {
      focusChecklistItem(first.querySelector(".check-item"), 0);
    } else {
      focusTextBlock(first, false);
    }
  }

  // The title textarea grows to fit its content. This resizes it both when
  // Svelte's own update cycle runs (the `update` hook, fired when the bound
  // `_text` param changes) and directly off the native "input" event (paste
  // included) — the native event always fires after the browser has already
  // applied the new value, whereas waiting only on Svelte's cycle can lag a
  // tick behind a big paste and measure a stale, too-small height.
  function autoResize(node, _text) {
    function resize() {
      node.style.height = "auto";
      node.style.height = node.scrollHeight + "px";
    }
    resize();
    node.addEventListener("input", resize);
    return {
      update: resize,
      destroy() {
        node.removeEventListener("input", resize);
      },
    };
  }

  // ---- Body blocks --------------------------------------------------------

  function resizeTextarea(ta) {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }

  function makeTextBlock(text) {
    const div = document.createElement("div");
    div.className = "block text-block";
    div.contentEditable = "true";
    if (text) {
      div.textContent = text;
    } else {
      div.innerHTML = "<br>";
    }
    return div;
  }

  // A small grip handle used to start a drag (item-level or group-level).
  // Only the handle itself is draggable="true" — never the whole row/block —
  // so normal text selection and editing elsewhere in the row is untouched.
  function makeDragHandle(extraClass) {
    const handle = document.createElement("span");
    handle.className = extraClass ? `drag-handle ${extraClass}` : "drag-handle";
    handle.draggable = true;
    handle.setAttribute("aria-hidden", "true");
    handle.innerHTML =
      '<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">' +
      '<circle cx="2.5" cy="2.5" r="1.5"/><circle cx="7.5" cy="2.5" r="1.5"/>' +
      '<circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/>' +
      '<circle cx="2.5" cy="13.5" r="1.5"/><circle cx="7.5" cy="13.5" r="1.5"/>' +
      "</svg>";
    return handle;
  }

  function makeCheckItem(text, checked = false, itemId = null) {
    const row = document.createElement("div");
    row.className = "check-item";
    if (checked) row.classList.add("checked");
    // A stable id, kept across saves/reloads (see serializeBody's "-@ID"
    // line), so a completed item can only ever earn its credit once, even
    // across sessions.
    row.dataset.itemId = itemId || generateItemId();

    const handle = makeDragHandle();
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "line-checkbox";
    cb.checked = checked;

    // Wraps the textarea with a highlight-layer overlay, same technique as
    // the title, so Find can draw match highlights over this row's text.
    const wrap = document.createElement("div");
    wrap.className = "text-wrap";
    const layer = document.createElement("div");
    layer.className = "highlight-layer";
    layer.setAttribute("aria-hidden", "true");
    const ta = document.createElement("textarea");
    ta.className = "line-text";
    ta.rows = 1;
    ta.value = text;
    // Same one-click "select all, just start typing" behavior as the title.
    ta.addEventListener("focus", () => ta.select());
    wrap.appendChild(layer);
    wrap.appendChild(ta);

    row.appendChild(handle);
    row.appendChild(cb);
    row.appendChild(wrap);
    return row;
  }

  function makeChecklistBlock(items, groupTitle = "") {
    const block = document.createElement("div");
    block.className = "block checklist-block";

    // Header row: a group-level drag handle (moves the whole checklist
    // relative to other blocks) plus an optional title for the group.
    const header = document.createElement("div");
    header.className = "checklist-header";
    const groupHandle = makeDragHandle("group-handle");
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "checklist-title";
    titleInput.placeholder = "List name";
    titleInput.value = groupTitle;
    header.appendChild(groupHandle);
    header.appendChild(titleInput);
    block.appendChild(header);

    for (const it of items) {
      const text = typeof it === "string" ? it : it.text;
      const checked = typeof it === "string" ? false : it.checked;
      const id = typeof it === "string" ? null : it.id;
      block.appendChild(makeCheckItem(text, checked, id));
    }
    return block;
  }

  // Populates the body from the note's saved text, grouping consecutive
  // "- [ ] "/"- [x] " lines into one checklist block and everything else
  // into text blocks. Runs once, when this NoteEditor instance is created
  // (the parent remounts a fresh instance per note via {#key selectedNote.id})
  // — it never re-runs afterward, since the DOM is the source of truth from
  // here on.
  function initBody(node) {
    const rawLines = note.body.length ? note.body.split("\n") : [""];
    let textLines = [];
    let checkItems = [];
    let pendingTitle = "";
    let pendingIds = [];

    const flushText = () => {
      if (textLines.length === 0) return;
      node.appendChild(makeTextBlock(textLines.join("\n")));
      textLines = [];
    };
    const flushChecklist = () => {
      if (checkItems.length === 0 && !pendingTitle) return;
      // Zip each item with its saved id (by position) so completion credit
      // stays tied to the same item across reloads. A note saved before
      // this feature existed (or with a mismatched count) just gets fresh
      // ids — those items simply haven't earned credit yet, same as new
      // ones.
      const withIds = checkItems.map((it, i) => ({ ...it, id: pendingIds[i] || null }));
      node.appendChild(makeChecklistBlock(withIds, pendingTitle));
      checkItems = [];
      pendingTitle = "";
      pendingIds = [];
    };

    for (const raw of rawLines) {
      const titleMatch = /^-# (.*)$/.exec(raw);
      const idsMatch = /^-@ID (.*)$/.exec(raw);
      const match = /^- \[( |x)\] (.*)$/.exec(raw);
      if (titleMatch) {
        // A group title line always starts a fresh checklist group.
        flushText();
        flushChecklist();
        pendingTitle = titleMatch[1];
      } else if (idsMatch) {
        // The id-list line always immediately precedes a group's items (it
        // follows a title line, if any, with nothing in between) — so only
        // flush if some *other* group's items are still pending, never the
        // title that may have just been set for this same group.
        if (checkItems.length > 0) flushChecklist();
        pendingIds = idsMatch[1].split(",").filter(Boolean);
      } else if (match) {
        flushText();
        checkItems.push({ text: match[2], checked: match[1] === "x" });
      } else {
        flushChecklist();
        textLines.push(raw);
      }
    }
    flushText();
    flushChecklist();

    if (node.children.length === 0) {
      node.appendChild(makeTextBlock(""));
    }

    // Now that everything is in the document, size any checklist textarea
    // that was saved with more than one line of text.
    node.querySelectorAll(".line-text").forEach(resizeTextarea);

    // Keep a live copy of the caret's position whenever it's inside one of
    // this note's text-blocks. A click on the toolbar's checklist button
    // moves focus (and can collapse the DOM selection) before its handler
    // ever runs, so by then `window.getSelection()` alone can no longer be
    // trusted to still point at the right spot — this cache is what lets
    // addChecklistGroup() insert the new group exactly at the cursor.
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const container = range.startContainer;
      const el =
        container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
      if (el && node.contains(el) && el.closest(".text-block")) {
        savedTextRange = range.cloneRange();
      }
    };
    document.addEventListener("selectionchange", handleSelectionChange);

    return {
      destroy() {
        document.removeEventListener("selectionchange", handleSelectionChange);
      },
    };
  }

  function serializeBody() {
    if (!bodyEl) return "";
    const out = [];
    for (const block of bodyEl.children) {
      if (block.classList.contains("checklist-block")) {
        const titleVal = block.querySelector(".checklist-title")?.value.trim();
        if (titleVal) out.push(`-# ${titleVal}`);
        const rows = Array.from(block.querySelectorAll(".check-item"));
        if (rows.length > 0) {
          // Written even for a titleless group — this is also the only
          // thing that marks where one checklist group ends and the next
          // begins when neither has a title.
          const ids = rows.map((row) => row.dataset.itemId || generateItemId());
          rows.forEach((row, i) => {
            row.dataset.itemId = ids[i];
          });
          out.push(`-@ID ${ids.join(",")}`);
        }
        rows.forEach((row) => {
          const cb = row.querySelector(".line-checkbox");
          const ta = row.querySelector(".line-text");
          out.push(`- [${cb.checked ? "x" : " "}] ${ta.value}`);
        });
      } else {
        out.push(block.innerText.replace(/\n$/, ""));
      }
    }
    return out.join("\n");
  }

  function computeBodyEmpty() {
    if (!bodyEl) return true;
    for (const block of bodyEl.children) {
      if (block.classList.contains("checklist-block")) {
        if (block.querySelectorAll(".check-item").length > 0) return false;
        if (block.querySelector(".checklist-title")?.value.trim()) return false;
      } else if (block.textContent.trim() !== "") {
        return false;
      }
    }
    return true;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      onChange(
        note.id,
        title,
        serializeBody(),
        tags.join(","),
        Array.from(earnedItemIds).join(",")
      );
    }, 400);
  }

  function finishBodyChange() {
    bodyEmpty = computeBodyEmpty();
    scheduleSave();
  }

  function focusChecklistItem(row, pos) {
    if (!row) return;
    const ta = row.querySelector(".line-text");
    ta.focus();
    const p = pos ?? ta.value.length;
    ta.setSelectionRange(p, p);
  }

  function focusTextBlock(tb, atEnd) {
    if (!tb) return;
    tb.focus();
    const range = document.createRange();
    range.selectNodeContents(tb);
    range.collapse(!atEnd);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function ensureTextBlockAfter(block) {
    const next = block.nextElementSibling;
    if (next && next.classList.contains("text-block")) return next;
    const tb = makeTextBlock("");
    block.after(tb);
    return tb;
  }

  function removeChecklistBlock(block) {
    lastDeletedGroup = {
      title: block.querySelector(".checklist-title")?.value || "",
      items: Array.from(block.querySelectorAll(".check-item")).map((row) => ({
        text: row.querySelector(".line-text").value,
        checked: row.querySelector(".line-checkbox").checked,
        id: row.dataset.itemId,
      })),
      index: Array.from(bodyEl.children).indexOf(block),
    };
    clearTimeout(undoToastTimer);
    undoToastTimer = setTimeout(() => {
      lastDeletedGroup = null;
    }, 8000);

    const textBlock = ensureTextBlockAfter(block);
    block.remove();
    focusTextBlock(textBlock, false);
  }

  // Restores the most recently deleted checklist group at the same position
  // it was removed from (clamped, in case other edits happened since).
  function undoDeleteGroup() {
    if (!lastDeletedGroup) return;
    clearTimeout(undoToastTimer);
    const { title, items, index } = lastDeletedGroup;
    lastDeletedGroup = null;
    const group = makeChecklistBlock(items.length ? items : [""], title);
    const ref = bodyEl.children[Math.min(index, bodyEl.children.length)] || null;
    bodyEl.insertBefore(group, ref);
    finishBodyChange();
  }

  // Ends the checklist right at this row: an empty item is what "exiting"
  // a group looks like, matching how starting one requires the toolbar
  // button rather than any ad-hoc text.
  function exitChecklistAt(row) {
    const block = row.closest(".checklist-block");
    const items = block.querySelectorAll(".check-item");
    if (items.length === 1) {
      removeChecklistBlock(block);
    } else {
      row.remove();
      focusTextBlock(ensureTextBlockAfter(block), false);
    }
  }

  // Tracks which block (and, for a checklist, which row) last had focus, so
  // the toolbar's checklist button knows where to add to.
  function handleBodyFocusIn(event) {
    const target = event.target;
    if (target.classList?.contains("line-text")) {
      activeItem = target.closest(".check-item");
      activeBlock = target.closest(".checklist-block");
    } else if (target.classList?.contains("text-block")) {
      activeItem = null;
      activeBlock = target;
    }
  }

  // The toolbar's checklist button. Checkboxes can only be added this way,
  // as a distinct block (or a new row in the block you're already in) —
  // never inserted loose into the middle of running text.
  function addChecklistGroup() {
    if (activeItem) {
      const newItem = makeCheckItem("");
      activeItem.after(newItem);
      focusChecklistItem(newItem, 0);
    } else {
      const afterBlock = activeBlock || bodyEl.lastElementChild;
      const group = makeChecklistBlock([""]);

      // If the cursor was sitting inside a text-block, split that block's
      // content at the caret so the new group lands exactly there, instead
      // of always after the whole paragraph.
      const splitBlock =
        afterBlock &&
        afterBlock.classList?.contains("text-block") &&
        savedTextRange &&
        afterBlock.contains(savedTextRange.startContainer)
          ? afterBlock
          : null;

      if (splitBlock) {
        const range = savedTextRange.cloneRange();
        range.setEnd(splitBlock, splitBlock.childNodes.length);
        const afterFragment = range.extractContents();

        splitBlock.after(group);
        const trailing = document.createElement("div");
        trailing.className = "block text-block";
        trailing.contentEditable = "true";
        trailing.appendChild(afterFragment);
        if (!trailing.textContent.trim()) {
          trailing.innerHTML = "<br>";
        }
        group.after(trailing);

        // The "before" half can end up empty (cursor was at the very
        // start of the paragraph) — an empty editable div needs a <br>
        // to stay visible/focusable, matching how a plain Enter split
        // would leave it.
        if (!splitBlock.textContent.trim()) {
          splitBlock.innerHTML = "<br>";
        }
      } else if (afterBlock) {
        afterBlock.after(group);
      } else {
        bodyEl.appendChild(group);
      }

      focusChecklistItem(group.querySelector(".check-item"), 0);
      // Credit for creating a new list — not for adding a row to one that
      // already exists (the activeItem branch above), matching "creating a
      // checklist adds credits".
      awardCredits(CHECKLIST_CREATE_CREDITS);
    }
    finishBodyChange();
  }

  // Enter/Backspace inside a checklist row. Typing lives entirely inside
  // the row's own <textarea>, so a checkbox can never be pushed out of
  // place by anything typed or pasted here.
  function handleItemKeydown(event, row) {
    const ta = row.querySelector(".line-text");

    if (event.key === "Enter") {
      event.preventDefault();
      if (ta.value.trim() === "") {
        // An empty item is how you leave the checklist and go back to
        // writing plain text.
        exitChecklistAt(row);
      } else {
        const pos = ta.selectionStart ?? ta.value.length;
        const before = ta.value.slice(0, pos);
        const after = ta.value.slice(pos);
        ta.value = before;
        resizeTextarea(ta);
        const newItem = makeCheckItem(after);
        row.after(newItem);
        focusChecklistItem(newItem, 0);
      }
      finishBodyChange();
      return;
    }

    if (event.key === "Backspace") {
      const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
      if (!atStart) return;
      event.preventDefault();
      // A row with text in it stays a checkbox — only an empty row can be
      // removed this way. This is what keeps checklists as clean, atomic
      // groups instead of something that can be picked apart line by line.
      if (ta.value !== "") return;

      const block = row.closest(".checklist-block");
      const items = Array.from(block.querySelectorAll(".check-item"));
      if (items.length === 1) {
        removeChecklistBlock(block);
      } else {
        const idx = items.indexOf(row);
        const prev = items[idx - 1];
        const next = items[idx + 1];
        row.remove();
        if (prev) {
          focusChecklistItem(prev, prev.querySelector(".line-text").value.length);
        } else {
          focusChecklistItem(next, 0);
        }
      }
      finishBodyChange();
    }
  }

  function handleBodyKeydown(event) {
    if (event.target.classList?.contains("line-text")) {
      handleItemKeydown(event, event.target.closest(".check-item"));
    } else if (event.target.classList?.contains("checklist-title")) {
      if (event.key === "Enter") {
        event.preventDefault();
        event.target.blur();
      }
    }
    // Text blocks: no interception needed — the browser splits/merges
    // paragraphs on Enter/Backspace natively.
  }

  function handleBodyChange(event) {
    const target = event.target;
    if (target.classList?.contains("line-checkbox")) {
      const row = target.closest(".check-item");
      row?.classList.toggle("checked", target.checked);

      if (target.checked && row) {
        const id = row.dataset.itemId;
        // The permanent, one-time-ever flag: once an item's id is in this
        // set it never earns credit again, so unchecking and rechecking
        // (or spamming the box) can't be farmed for repeat credits.
        if (id && !earnedItemIds.has(id)) {
          earnedItemIds.add(id);
          awardCredits(ITEM_COMPLETE_CREDITS);
          // Visual feedback right on the row, distinct from the credit
          // toast — a quick glow so checking something off feels good even
          // before you glance at the credits badge.
          row.classList.add("just-completed");
          row.addEventListener(
            "animationend",
            () => row.classList.remove("just-completed"),
            { once: true }
          );
        }
      }

      finishBodyChange();
    }
  }

  function handleBodyInput(event) {
    if (event.target.classList?.contains("line-text")) {
      resizeTextarea(event.target);
    }
    finishBodyChange();
  }

  // Only text blocks need paste handled specially, to strip whatever rich
  // HTML formatting the source put on the clipboard and keep this a plain
  // text note. A <textarea> (checklist rows) already only ever accepts
  // plain text on paste, natively.
  function handleBodyPaste(event) {
    const target = event.target;
    if (!target.classList?.contains("text-block")) return;
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData)?.getData("text/plain") ?? "";
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    finishBodyChange();
  }

  // Clicking below the last block (in the empty space at the bottom of the
  // note) should let you keep typing, like a normal notepad.
  function handleBodyContainerClick(event) {
    if (event.target !== bodyEl) return;
    const last = bodyEl.lastElementChild;
    if (!last) return;
    if (last.classList.contains("checklist-block")) {
      const items = last.querySelectorAll(".check-item");
      const lastItem = items[items.length - 1];
      if (lastItem) {
        focusChecklistItem(lastItem, lastItem.querySelector(".line-text").value.length);
      }
    } else {
      focusTextBlock(last, true);
    }
  }

  // ---- Drag to reorder ----------------------------------------------------
  //
  // Only the small grip handle is draggable (see makeDragHandle), never the
  // whole row/block, so ordinary editing and text selection is untouched.
  // While dragging, the actual DOM node being moved is repositioned live as
  // the cursor passes each sibling's midpoint — a standard vanilla-JS
  // reorder pattern — so the drop itself needs no extra work beyond
  // persisting the new order.

  // Returns the element in `container` (matching `selector`) that the given
  // vertical position should be inserted *before*, or null to mean "at the
  // end" (i.e. after every remaining sibling).
  function getDragAfterElement(container, y, selector) {
    const candidates = [...container.querySelectorAll(selector)];
    return candidates.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
  }

  function handleBodyDragStart(event) {
    const handle = event.target.closest(".drag-handle");
    if (!handle) return;
    const isGroup = handle.classList.contains("group-handle");
    const el = isGroup ? handle.closest(".block") : handle.closest(".check-item");
    if (!el) return;
    dragState = isGroup
      ? { kind: "block", el }
      : { kind: "item", el, container: el.closest(".checklist-block") };
    event.dataTransfer.effectAllowed = "move";
    // Firefox requires data to be set for the drag to start at all.
    event.dataTransfer.setData("text/plain", "");
    // Let the drag image render before we start moving the node around.
    requestAnimationFrame(() => el.classList.add("dragging"));
  }

  // Safari/WebKit (used on macOS and Linux builds) only allows a drop when
  // dragenter is also cancelled, not just dragover — Chromium-based webviews
  // (Windows) accept just dragover, but cancelling both is harmless there.
  function handleBodyDragEnter(event) {
    if (dragState) event.preventDefault();
  }

  function handleBodyDragOver(event) {
    if (!dragState) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const { kind, el, container } = dragState;
    if (kind === "item") {
      const after = getDragAfterElement(container, event.clientY, ".check-item:not(.dragging)");
      if (after) {
        container.insertBefore(el, after);
      } else {
        container.appendChild(el);
      }
    } else {
      const after = bodyEl
        ? getDragAfterElement(bodyEl, event.clientY, ":scope > .block:not(.dragging)")
        : null;
      if (after) {
        bodyEl.insertBefore(el, after);
      } else {
        bodyEl?.appendChild(el);
      }
    }
  }

  function handleBodyDrop(event) {
    if (!dragState) return;
    event.preventDefault();
  }

  function handleBodyDragEnd() {
    dragState?.el.classList.remove("dragging");
    dragState = null;
    finishBodyChange();
  }

  // ---- Save as template ----------------------------------------------------

  function focusOnMount(node) {
    node.focus();
  }

  function openSaveTemplateModal() {
    templateModalStep = "confirm";
  }

  function cancelTemplateModal() {
    templateModalStep = null;
    templateNameInput = "";
  }

  function proceedToTemplateName() {
    templateNameInput = title.trim();
    templateModalStep = "name";
    tick().then(() => templateNameInputEl?.focus());
  }

  async function saveAsTemplate() {
    const name = templateNameInput.trim();
    if (!name) return;
    await onSaveTemplate?.(name, title, serializeBody(), tags.join(","));
    templateModalStep = null;
    templateNameInput = "";
  }

  function handleTemplateModalKeydown(event) {
    if (event.key === "Escape") {
      cancelTemplateModal();
    } else if (event.key === "Enter" && templateModalStep === "name") {
      event.preventDefault();
      saveAsTemplate();
    }
  }
</script>

<div class="editor">
  <div class="toolbar">
      <div class="credits-badge" title="Credits — earned by creating checklists and completing items">
        <span class="credits-coin">⬡</span>{credits}
        <div class="credit-toasts" aria-hidden="true">
          {#each creditToasts as t (t.id)}
            <span class="credit-toast">+{t.amount}</span>
          {/each}
        </div>
      </div>

      <button
        type="button"
        class="icon-btn"
        title="Settings"
        onclick={openSettings}
      >
        <svg
          class="icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
      </button>

      <button
        type="button"
        class="icon-btn"
        title="Store"
        onclick={openStore}
      >
        <svg
          class="icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 2 3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-3-5Z" />
          <path d="M3 7h18" />
          <path d="M16 11a4 4 0 0 1-8 0" />
        </svg>
      </button>

      <div class="find-row">
        {#if findOpen}
          <div class="find-bar">
            <input
              type="text"
              class="find-input"
              placeholder="Find in note…"
              bind:value={findQuery}
              bind:this={findInputEl}
              oninput={handleFindInput}
              onkeydown={handleFindKeydown}
            />
            <span class="find-count">
              {totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : "0/0"}
            </span>
            <button type="button" class="find-btn" title="Previous match" onclick={prevMatch}>
              ↑
            </button>
            <button type="button" class="find-btn" title="Next match" onclick={nextMatch}>
              ↓
            </button>
            <button type="button" class="find-btn find-close" title="Close" onclick={closeFind}>
              ×
            </button>
          </div>
        {/if}

        <button
          type="button"
          class="icon-btn"
          class:active={findOpen}
          title="Find in note"
          onclick={findOpen ? closeFind : openFind}
        >
          <img src={findIcon} class="icon-img" alt="" />
        </button>
      </div>

      <button
        type="button"
        class="icon-btn"
        title="Save as template"
        onclick={openSaveTemplateModal}
      >
        <svg
          class="icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
      </button>

      <button
        type="button"
        class="icon-btn"
        title="Add checklist"
        onclick={addChecklistGroup}
      >
        <img src={checklistIcon} class="icon-img" alt="" />
      </button>
  </div>

  <div class="scroll-area">
  <div class="title-wrap">
    <div class="highlight-layer" aria-hidden="true">
      {#each titleHighlights as hl (hl.idx)}
        <span
          class="hl-mark"
          class:current={hl.isCurrent}
          style="left: {hl.left}px; width: {hl.width}px;"
        ></span>
      {/each}
    </div>
    <textarea
      class="title-input"
      rows="1"
      placeholder="Title"
      bind:value={title}
      bind:this={titleInputEl}
      use:autoResize={title}
      oninput={scheduleSave}
      onkeydown={handleTitleKeydown}
      onfocus={(e) => e.target.select()}
    ></textarea>
  </div>

  <div class="tags-row">
    {#each tags as tag, index}
      <span class="tag-chip">
        {tag}
        <button
          type="button"
          class="tag-remove"
          title="Remove tag"
          onclick={() => removeTag(index)}
        >
          ×
        </button>
      </span>
    {/each}
    <input
      type="text"
      class="tag-input"
      placeholder={tags.length === 0 ? "Add tags…" : "Add tag…"}
      bind:value={tagInput}
      onkeydown={handleTagKeydown}
      onblur={addTag}
    />
  </div>

  <div class="body-editor-wrap">
    {#if bodyEmpty}
      <span class="body-placeholder">Start writing…</span>
    {/if}
    <div
      class="body-editor"
      bind:this={bodyEl}
      use:initBody
      oninput={handleBodyInput}
      onkeydown={handleBodyKeydown}
      onpaste={handleBodyPaste}
      onchange={handleBodyChange}
      onfocusin={handleBodyFocusIn}
      onclick={handleBodyContainerClick}
      ondragstart={handleBodyDragStart}
      ondragenter={handleBodyDragEnter}
      ondragover={handleBodyDragOver}
      ondrop={handleBodyDrop}
      ondragend={handleBodyDragEnd}
    ></div>
  </div>
  </div>

  {#if lastDeletedGroup}
    <div class="undo-toast">
      <span>Checklist group deleted</span>
      <button type="button" class="undo-btn" onclick={undoDeleteGroup}>Undo</button>
    </div>
  {/if}
</div>

{#if templateModalStep === "confirm"}
  <div
    class="modal-overlay"
    role="button"
    tabindex="-1"
    onclick={cancelTemplateModal}
    onkeydown={handleTemplateModalKeydown}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      use:focusOnMount
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleTemplateModalKeydown}
    >
      <p class="modal-title">Save as template?</p>
      <p class="modal-body">
        This note's title and checklist groups will be saved as a reusable
        template you can start new notes from.
      </p>
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-cancel" onclick={cancelTemplateModal}>
          No
        </button>
        <button type="button" class="modal-btn modal-confirm" onclick={proceedToTemplateName}>
          Yes, save as template
        </button>
      </div>
    </div>
  </div>
{:else if templateModalStep === "name"}
  <div
    class="modal-overlay"
    role="button"
    tabindex="-1"
    onclick={cancelTemplateModal}
    onkeydown={handleTemplateModalKeydown}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleTemplateModalKeydown}
    >
      <p class="modal-title">Name this template</p>
      <input
        type="text"
        class="modal-input"
        placeholder="e.g. Weekly grocery list"
        bind:value={templateNameInput}
        bind:this={templateNameInputEl}
      />
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-cancel" onclick={cancelTemplateModal}>
          Cancel
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          disabled={!templateNameInput.trim()}
          onclick={saveAsTemplate}
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

{#if settingsOpen}
  <div
    class="modal-overlay"
    role="button"
    tabindex="-1"
    onclick={cancelSettings}
    onkeydown={handleSettingsModalKeydown}
  >
    <div
      class="modal settings-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      use:focusOnMount
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleSettingsModalKeydown}
    >
      <p class="modal-title">Settings</p>

      <div class="settings-section">
        <p class="settings-label">Color palette</p>
        <div class="palette-row">
          {#each PALETTES as p (p.id)}
            <button
              type="button"
              class="palette-swatch"
              class:active={pendingTheme === p.id}
              class:locked={!unlockedThemes.includes(p.id)}
              title={unlockedThemes.includes(p.id) ? "" : `Locked — ${p.cost} credits in the Store`}
              onclick={() => selectPendingTheme(p.id)}
            >
              <span class="swatch-dot" style="background: {p.preview};"></span>
              <span class="swatch-label">{p.label}</span>
              {#if !unlockedThemes.includes(p.id)}
                <span class="swatch-lock" aria-hidden="true">🔒</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if PALETTES.some((p) => !unlockedThemes.includes(p.id))}
          <p class="settings-hint">
            🔒 Locked palettes can be unlocked in the
            <button type="button" class="settings-hint-link" onclick={() => { cancelSettings(); openStore(); }}>
              Store
            </button>.
          </p>
        {/if}
      </div>

      <div class="settings-section">
        <p class="settings-label">UI scale — {Math.round(pendingScale * 100)}%</p>
        <input
          type="range"
          class="scale-slider"
          min="0.8"
          max="1.6"
          step="0.05"
          value={pendingScale}
          oninput={handleScaleInput}
        />
      </div>

      <div class="settings-section">
        <p class="settings-label">Manage tags</p>
        {#if allTags.length === 0}
          <p class="settings-empty">No tags yet.</p>
        {:else}
          <ul class="manage-list">
            {#each allTags as tag (tag)}
              <li class="manage-row">
                {#if editingTag === tag}
                  <input
                    type="text"
                    class="manage-input"
                    bind:value={editingTagValue}
                    use:focusOnMount
                    onkeydown={(e) => handleManageTagKeydown(e, tag)}
                  />
                  <button type="button" class="manage-btn" onclick={() => commitTagRename(tag)}>
                    Save
                  </button>
                  <button type="button" class="manage-btn" onclick={cancelTagEdit}>
                    Cancel
                  </button>
                {:else}
                  <span class="manage-name">{tag}</span>
                  <button type="button" class="manage-btn" onclick={() => startTagEdit(tag)}>
                    Rename
                  </button>
                  <button
                    type="button"
                    class="manage-btn manage-btn-danger"
                    onclick={() => onDeleteTag?.(tag)}
                  >
                    Delete
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="settings-section">
        <p class="settings-label">Manage templates</p>
        {#if templates.length === 0}
          <p class="settings-empty">No templates saved yet.</p>
        {:else}
          <ul class="manage-list">
            {#each templates as tpl (tpl.id)}
              <li class="manage-row">
                {#if editingTemplateId === tpl.id}
                  <input
                    type="text"
                    class="manage-input"
                    bind:value={editingTemplateValue}
                    use:focusOnMount
                    onkeydown={(e) => handleManageTemplateKeydown(e, tpl)}
                  />
                  <button
                    type="button"
                    class="manage-btn"
                    onclick={() => commitTemplateRename(tpl)}
                  >
                    Save
                  </button>
                  <button type="button" class="manage-btn" onclick={cancelTemplateEdit}>
                    Cancel
                  </button>
                {:else}
                  <span class="manage-name">{tpl.name}</span>
                  <button
                    type="button"
                    class="manage-btn"
                    onclick={() => startTemplateEdit(tpl)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    class="manage-btn manage-btn-danger"
                    onclick={() => onDeleteTemplate?.(tpl.id)}
                  >
                    Delete
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="modal-actions">
        <button type="button" class="modal-btn modal-cancel" onclick={cancelSettings}>
          Cancel
        </button>
        <button type="button" class="modal-btn modal-confirm" onclick={saveSettings}>
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

{#if storeOpen}
  <div
    class="modal-overlay"
    role="button"
    tabindex="-1"
    onclick={closeStore}
    onkeydown={handleStoreModalKeydown}
  >
    <div
      class="modal store-modal"
      role="dialog"
      tabindex="-1"
      use:focusOnMount
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleStoreModalKeydown}
    >
      <p class="modal-title">Store</p>
      <p class="store-credits">
        <span class="credits-coin">⬡</span>
        {credits} credits
        <!-- Debug "+1000 credits" button lived here for testing purchases —
             hidden per request. To bring it back, restore:
             <button type="button" class="manage-btn store-debug-btn"
               title="Debug: add 1000 credits for testing"
               onclick={() => onEarnCredits?.(1000)}>+1000 (debug)</button> -->
      </p>

      <div class="settings-section">
        <p class="settings-label">Themes</p>
        <ul class="store-list">
          {#each THEMES_CATALOG.filter((t) => t.cost > 0) as t (t.id)}
            <li class="store-row">
              <span class="swatch-dot" style="background: {t.preview};"></span>
              <span class="manage-name">{t.label}</span>
              {#if unlockedThemes.includes(t.id)}
                <span class="store-owned">Unlocked</span>
              {:else}
                <button
                  type="button"
                  class="manage-btn store-buy"
                  disabled={credits < t.cost}
                  onclick={() => buyTheme(t.id)}
                >
                  Buy — {t.cost}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      </div>

      <div class="settings-section">
        <p class="settings-label">Holo-Pets</p>
        <ul class="store-list">
          {#each PETS_CATALOG as p (p.id)}
            <li class="store-row">
              <span class="manage-name">{p.name} <span class="store-blurb">— {p.blurb}</span></span>
              {#if ownedPets.includes(p.id)}
                <span class="store-owned">Owned</span>
              {:else}
                <button
                  type="button"
                  class="manage-btn store-buy"
                  disabled={credits < p.cost}
                  onclick={() => buyPet(p.id)}
                >
                  Buy — {p.cost}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      </div>

      <div class="modal-actions">
        <button type="button" class="modal-btn modal-confirm" onclick={closeStore}>
          Done
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .editor {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    /* No right padding here — the scrollable area (.scroll-area, which now
       holds the whole note: header, title, tags, and body) spans all the
       way to the pane's right edge so its scrollbar sits flush against it,
       rather than floating with a gap of dead space past it. The header,
       title and tags rows inside it add their own right padding so they
       still line up the same as before, clear of the scrollbar. */
    padding: 24px 0 24px 32px;
    background: #1e1e1e;
    color: #e6e6e6;
    box-sizing: border-box;
    /* UI scale (Settings panel slider): scoped to just this note-editing
       surface rather than the whole document — the Settings dialog and
       everything outside .editor render at normal size regardless of this,
       which also means the dialog is never at risk of getting clipped or
       pushed off-screen by a high scale value. */
    zoom: var(--ui-scale, 1);
  }

  /* A vertical stack — Settings, Find, Save-as-template, Checklist, top to
     bottom — floating over the top-right corner of the note (like the old
     "fab" buttons) rather than reserving its own row, so it never pushes
     the title/body down. Hugs the pane's right edge with a small 8px gap. */
  .toolbar {
    position: absolute;
    top: 24px;
    right: 8px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    z-index: 5;
  }

  .find-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .credits-badge {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid #333;
    background: #262626;
    color: #e6c65c;
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .credits-coin {
    color: #e6c65c;
  }

  .credit-toasts {
    position: absolute;
    top: -4px;
    left: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .credit-toast {
    position: absolute;
    left: 0;
    transform: translateX(-50%);
    color: #7dd8cd;
    color: var(--accent-text);
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
    animation: credit-toast-float 1.1s ease-out forwards;
  }

  @keyframes credit-toast-float {
    0% {
      opacity: 0;
      transform: translate(-50%, 4px);
    }
    15% {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -22px);
    }
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 8px;
    border: 1px solid #333;
    background: #262626;
    color: #ccc;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-img {
    width: 18px;
    height: 18px;
    pointer-events: none;
  }

  .icon-svg {
    width: 18px;
    height: 18px;
    pointer-events: none;
  }

  .icon-btn:hover {
    background: #2f2f2f;
    color: #fff;
  }

  .icon-btn.active {
    background: var(--accent-bg);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .title-wrap {
    position: relative;
    box-sizing: border-box;
    padding-right: 32px;
    margin-bottom: 8px;
  }

  .title-input {
    position: relative;
    display: block;
    width: 100%;
    box-sizing: border-box;
    font-size: 1.5rem;
    font-weight: 700;
    font-family: inherit;
    line-height: 1.3;
    border: none;
    background: none;
    color: inherit;
    outline: none;
    padding: 0;
    margin: 0;
    resize: none;
    overflow: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .highlight-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .hl-mark {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(255, 215, 0, 0.35);
    border-radius: 2px;
  }

  .hl-mark.current {
    background: rgba(255, 165, 0, 0.75);
    outline: 1px solid #ffb100;
  }

  .tags-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    padding-right: 32px;
    margin-bottom: 12px;
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px 3px 10px;
    border-radius: 999px;
    background: var(--accent-bg);
    color: var(--accent-text);
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .tag-remove {
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
    padding: 0 2px;
    opacity: 0.7;
  }

  .tag-remove:hover {
    opacity: 1;
  }

  .tag-input {
    border: none;
    background: none;
    color: #ccc;
    outline: none;
    font-size: 0.82rem;
    min-width: 90px;
    flex: 1;
    padding: 3px 2px;
  }

  .find-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid #333;
    background: #161616;
    flex: 1;
    min-width: 0;
  }

  .find-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    color: #e6e6e6;
    outline: none;
    font-size: 0.85rem;
    padding: 2px 4px;
  }

  .find-count {
    font-size: 0.75rem;
    color: #888;
    min-width: 34px;
    text-align: center;
  }

  .find-btn {
    border: none;
    background: none;
    color: #aaa;
    cursor: pointer;
    font-size: 0.95rem;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .find-btn:hover {
    background: #2a2a2a;
    color: #fff;
  }

  .find-close {
    font-size: 1.05rem;
  }

  /* The single scroll container for the whole note — header row, title,
     tags, and body all scroll together as one; nothing stays pinned. */
  .scroll-area {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* Lets a touchscreen swipe up/down to scroll the note — momentum
       scrolling on WebKit, and telling the browser this element only pans
       vertically so it doesn't hesitate waiting to see if a gesture is
       something else. */
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }

  /* Dark scrollbar, scoped to this area so it sits right at the note's own
     right edge instead of a default light/system-colored one. */
  .scroll-area::-webkit-scrollbar {
    width: 10px;
  }

  .scroll-area::-webkit-scrollbar-track {
    background: #1e1e1e;
  }

  .scroll-area::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 6px;
  }

  .scroll-area::-webkit-scrollbar-thumb:hover {
    background: #555;
  }

  .body-editor-wrap {
    position: relative;
  }

  .body-placeholder {
    position: absolute;
    top: 0;
    left: 0;
    color: #666;
    pointer-events: none;
  }

  .body-editor {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    box-sizing: border-box;
    padding-right: 32px;
  }

  :global(.body-editor .text-block) {
    outline: none;
    min-height: 1.5em;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  :global(.body-editor .checklist-block) {
    display: flex;
    flex-direction: column;
    margin: 6px 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: #262626;
  }

  :global(.body-editor .checklist-block.dragging) {
    opacity: 0.4;
  }

  :global(.body-editor .checklist-header) {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }

  :global(.body-editor .checklist-title) {
    flex: 1;
    min-width: 0;
    border: none;
    border-bottom: 1px solid transparent;
    background: none;
    color: var(--accent-text);
    font-weight: 700;
    font-size: 1.15rem;
    font-family: inherit;
    outline: none;
    padding: 3px 2px 4px;
  }

  :global(.body-editor .checklist-title::placeholder) {
    color: #666;
    font-weight: 400;
  }

  :global(.body-editor .checklist-title:focus) {
    border-bottom-color: var(--accent);
  }

  :global(.body-editor .drag-handle) {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 16px;
    color: #666;
    cursor: grab;
    -webkit-user-drag: element;
  }

  /* The grip glyph must never be the drag/pointer target itself — otherwise
     a browser's native "drag this image" behavior for <svg>/<img> content
     can hijack the gesture instead of the handle's own dragstart, which is
     what produced the "no-drop" cursor. */
  :global(.body-editor .drag-handle svg) {
    pointer-events: none;
    -webkit-user-drag: none;
  }

  :global(.body-editor .drag-handle:hover) {
    color: #999;
  }

  :global(.body-editor .drag-handle:active) {
    cursor: grabbing;
  }

  :global(.body-editor .check-item > .drag-handle) {
    margin-top: 6px;
  }

  :global(.body-editor .check-item) {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-height: 28px;
  }

  :global(.body-editor .check-item.dragging) {
    opacity: 0.4;
  }

  :global(.body-editor .line-checkbox) {
    width: 16px;
    height: 16px;
    margin-top: 4px;
    flex-shrink: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }

  :global(.body-editor .check-item .text-wrap) {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  :global(.body-editor .check-item .highlight-layer) {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  :global(.body-editor .line-text) {
    position: relative;
    display: block;
    width: 100%;
    box-sizing: border-box;
    border: none;
    background: none;
    color: inherit;
    outline: none;
    font-size: 1rem;
    line-height: 1.5;
    font-family: inherit;
    padding: 0;
    margin: 0;
    resize: none;
    overflow: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  :global(.body-editor .check-item.checked .line-text) {
    text-decoration: line-through;
    color: #777;
  }

  /* Brief glow when an item earns its one-time completion credit — this
     class is added in handleBodyChange and removed once the animation
     ends, so it can replay the next time a *different* item is checked. */
  :global(.body-editor .check-item.just-completed) {
    animation: item-complete-pulse 0.6s ease;
    border-radius: 6px;
  }

  @keyframes item-complete-pulse {
    0% {
      background: var(--accent-bg);
    }
    100% {
      background: transparent;
    }
  }

  :global(.body-editor mark.hl-mark) {
    background: rgba(255, 215, 0, 0.35);
    border-radius: 2px;
    color: inherit;
  }

  :global(.body-editor mark.hl-mark.current) {
    background: rgba(255, 165, 0, 0.75);
    outline: 1px solid #ffb100;
  }

  :global(.body-editor .item-hl-mark) {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(255, 215, 0, 0.35);
    border-radius: 2px;
  }

  :global(.body-editor .item-hl-mark.current) {
    background: rgba(255, 165, 0, 0.75);
    outline: 1px solid #ffb100;
  }

  ::placeholder {
    color: #666;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    justify-content: center;
    /* flex-start (not center) + the overlay itself scrolling means a modal
       taller than the window is never dead-centered into being partly
       clipped above and below with no way to reach the rest — it just
       starts below the top padding and the overlay scrolls to the rest. */
    align-items: flex-start;
    overflow-y: auto;
    padding: 40px 16px;
    box-sizing: border-box;
    z-index: 100;
  }

  .modal {
    width: 340px;
    max-width: calc(100vw - 48px);
    background: #262626;
    border: 1px solid #3a3a3a;
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

  .modal-input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 18px;
    padding: 7px 10px;
    border-radius: 6px;
    border: 1px solid #3a3a3a;
    background: #1f1f1f;
    color: #e6e6e6;
    font-size: 0.88rem;
    font-family: inherit;
    outline: none;
  }

  .modal-input:focus {
    border-color: var(--accent);
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
    background: #333;
    color: #ccc;
  }

  .modal-cancel:hover {
    background: #3d3d3d;
  }

  .modal-confirm {
    background: var(--accent);
    color: white;
    font-weight: 600;
  }

  .modal-confirm:hover {
    background: var(--accent-hover);
  }

  .modal-confirm:disabled {
    background: #3a3a3a;
    color: #777;
    cursor: default;
  }

  .settings-modal {
    width: 420px;
    max-height: min(640px, calc(100vh - 64px));
    overflow-y: auto;
  }

  .settings-section {
    margin-bottom: 20px;
  }

  .settings-label {
    margin: 0 0 8px;
    font-size: 0.78rem;
    font-weight: 700;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .settings-empty {
    margin: 0;
    font-size: 0.82rem;
    color: #777;
  }

  .palette-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .palette-swatch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid #3a3a3a;
    background: #1f1f1f;
    color: #aaa;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .palette-swatch:hover {
    border-color: #555;
  }

  .palette-swatch.active {
    border-color: var(--accent);
    background: var(--accent-bg);
    color: var(--accent-text);
  }

  .palette-swatch.locked {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .palette-swatch.locked:hover {
    border-color: #3a3a3a;
  }

  .swatch-lock {
    font-size: 0.7rem;
    line-height: 1;
  }

  .swatch-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.25);
  }

  .settings-hint {
    margin: 8px 0 0;
    font-size: 0.72rem;
    color: #888;
  }

  .settings-hint-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent-text);
    text-decoration: underline;
    cursor: pointer;
    font-size: inherit;
  }

  .scale-slider {
    width: 100%;
    accent-color: var(--accent);
  }

  .manage-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 160px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .manage-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .manage-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.85rem;
    color: var(--accent-text);
  }

  .manage-input {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid #3a3a3a;
    background: #1f1f1f;
    color: #e6e6e6;
    font-size: 0.85rem;
    font-family: inherit;
    outline: none;
  }

  .manage-input:focus {
    border-color: var(--accent);
  }

  .manage-btn {
    flex-shrink: 0;
    border: none;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 0.75rem;
    background: #333;
    color: #ccc;
    cursor: pointer;
  }

  .manage-btn:hover {
    background: #3d3d3d;
  }

  .manage-btn-danger:hover {
    background: #4a2323;
    color: #ff8080;
  }

  .store-modal {
    width: 380px;
  }

  .store-credits {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: -4px 0 16px;
    color: #e6c65c;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .store-debug-btn {
    margin-left: auto;
    font-size: 0.68rem;
    font-weight: 400;
    color: #888;
  }

  .store-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .store-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .store-blurb {
    color: #888;
    font-weight: 400;
    font-size: 0.78rem;
  }

  .store-owned {
    font-size: 0.72rem;
    color: var(--accent-text);
  }

  .store-buy {
    white-space: nowrap;
  }

  .store-buy:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .undo-toast {
    position: absolute;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-radius: 8px;
    background: #262626;
    border: 1px solid #3a3a3a;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    color: #e6e6e6;
    font-size: 0.85rem;
    z-index: 20;
  }

  .undo-btn {
    border: none;
    border-radius: 6px;
    padding: 4px 10px;
    background: var(--accent);
    color: white;
    font-weight: 600;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .undo-btn:hover {
    background: var(--accent-hover);
  }
</style>
