// Kriti popup: notes, stats, pins, export, and custom folder management.

let notesState = {};
let historyState = [];
let pinnedFoldersState = [];
let customFoldersState = [];
let folderOrderState = [];
let activeAddWordFolder = null;
const collapsedFolders = {};
let searchQuery = '';
let searchInput = null;
let searchClear = null;
let toastTimer = null;
let activeTab = 'notes';
let draggedWordState = null;
let draggedFolderState = null;

const LANGUAGE_LABELS = {
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  bn: 'Bengali',
  pt: 'Portuguese'
};

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', handleDocumentClick);
  initializeTabs();
  initializeSearch();
  initializeExport();
  initializeNewFolderControls();
  initializeThemeToggle();
  loadData();
});

window.addEventListener('focus', loadData);

function loadData() {
  chrome.storage.local.get(['notes', 'history', 'pinnedFolders', 'customFolders', 'folderOrder'], (result) => {
    const rawNotes = result.notes || {};
    const normalization = normalizeNotes(rawNotes);
    notesState = normalization.notes;
    historyState = Array.isArray(result.history) ? result.history : [];
    pinnedFoldersState = Array.isArray(result.pinnedFolders) ? result.pinnedFolders : [];

    const customNormalization = normalizeCustomFolders(result.customFolders);
    customFoldersState = customNormalization.customFolders;

    const folderTitles = Array.from(new Set([
      ...Object.keys(notesState),
      ...customFoldersState
    ]));
    const folderOrderNormalization = normalizeFolderOrder(result.folderOrder, folderTitles);
    folderOrderState = folderOrderNormalization.folderOrder;

    if (normalization.changed || customNormalization.changed || folderOrderNormalization.changed) {
      chrome.storage.local.set({
        notes: notesState,
        customFolders: customFoldersState,
        folderOrder: folderOrderState
      });
    }

    renderNotes();
    renderStats();
  });
}

function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab || 'notes';
      updateTabUI();
    });
  });
  updateTabUI();
}

function updateTabUI() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });

  const notesView = document.getElementById('notesView');
  const statsView = document.getElementById('statsView');
  if (notesView) notesView.classList.toggle('active', activeTab === 'notes');
  if (statsView) statsView.classList.toggle('active', activeTab === 'stats');
}

function initializeNewFolderControls() {
  const trigger = document.getElementById('newFolderTrigger');
  const inline = document.getElementById('newFolderInline');
  const input = document.getElementById('newFolderInput');
  const confirmBtn = document.getElementById('newFolderConfirm');
  const cancelBtn = document.getElementById('newFolderCancel');

  if (!trigger || !inline || !input || !confirmBtn || !cancelBtn) {
    return;
  }

  const openInline = () => {
    inline.classList.add('visible');
    input.focus();
  };

  const closeInline = () => {
    inline.classList.remove('visible');
    input.value = '';
  };

  const createFolder = () => {
    const name = (input.value || '').trim();
    if (!name) {
      showToast('Folder name is required');
      return;
    }

    if (getFolderMetaMap().has(name)) {
      showToast('Folder already exists');
      return;
    }

    const updatedNotes = cloneNotes(notesState);
    updatedNotes[name] = updatedNotes[name] || [];

    const updatedCustomFolders = [...customFoldersState, name];
    const updatedFolderOrder = normalizeFolderOrder([...folderOrderState, name], Array.from(new Set([
      ...Object.keys(updatedNotes),
      ...updatedCustomFolders
    ]))).folderOrder;

    persistAll({
      notes: updatedNotes,
      customFolders: updatedCustomFolders,
      folderOrder: updatedFolderOrder
    }, () => {
      closeInline();
      showToast('Folder created');
    });
  };

  trigger.addEventListener('click', openInline);
  confirmBtn.addEventListener('click', createFolder);
  cancelBtn.addEventListener('click', closeInline);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      createFolder();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeInline();
    }
  });
}

function renderNotes() {
  const notesContainer = document.getElementById('notesContainer');
  const emptyState = document.getElementById('emptyState');
  const noResults = document.getElementById('noResults');
  const query = searchQuery.trim();
  const hasQuery = query.length > 0;

  notesContainer.innerHTML = '';
  clearWordDropIndicators();
  clearFolderDropIndicators();

  const folders = getSortedFolders();
  const totalNotes = folders.reduce((sum, folder) => sum + folder.notes.length, 0);

  if (totalNotes === 0 && folders.length === 0) {
    emptyState.style.display = 'block';
    noResults.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  noResults.style.display = 'none';
  let renderedFolderCount = 0;

  folders.forEach((folderMeta) => {
    const pageTitle = folderMeta.title;

    const indexedNotes = folderMeta.notes
      .map((note, index) => ({ ...ensureNoteDefaults(note), _index: index }))
      .sort(sortNotesForFolder);

    let pinnedPosition = 0;
    let nonPinnedPosition = 0;
    indexedNotes.forEach((note) => {
      if (note.pinned) {
        pinnedPosition += 1;
        note._positionLabel = `📌${pinnedPosition}`;
      } else {
        nonPinnedPosition += 1;
        note._positionLabel = String(nonPinnedPosition);
      }
    });

    const folderMatches = hasQuery ? matchesQuery(pageTitle, query) : true;
    const visibleNotes = hasQuery
      ? indexedNotes.filter((note) => folderMatches || noteMatchesQuery(note, query))
      : indexedNotes;

    const shouldShowFolder = hasQuery
      ? (visibleNotes.length > 0 || folderMatches)
      : true;

    if (!shouldShowFolder) {
      return;
    }

    renderedFolderCount += 1;

    const folder = document.createElement('section');
    folder.className = 'folder';
    folder.dataset.pageTitle = pageTitle;
    folder.draggable = true;
    if (isFolderPinned(pageTitle)) {
      folder.classList.add('pinned-folder');
    }
    if (folderMeta.isCustom) {
      folder.classList.add('custom-folder');
    }

    const folderHeader = document.createElement('button');
    folderHeader.type = 'button';
    folderHeader.className = 'folder-header';
    folderHeader.dataset.pageTitle = pageTitle;
    folderHeader.draggable = true;

    folderHeader.addEventListener('dragstart', (event) => {
      handleFolderDragStart(event, pageTitle, folder);
    });
    folderHeader.addEventListener('dragend', () => {
      handleFolderDragEnd(folder);
    });

    folder.addEventListener('dragover', (event) => {
      handleFolderDragOver(event, pageTitle, folder);
    });
    folder.addEventListener('drop', (event) => {
      handleFolderDrop(event, pageTitle, folder);
    });
    folder.addEventListener('dragleave', (event) => {
      if (!folder.contains(event.relatedTarget)) {
        folder.classList.remove('folder-drop-valid', 'folder-drop-invalid', 'folder-drop-before', 'folder-drop-after');
      }
    });

    if (!collapsedFolders[pageTitle]) {
      folderHeader.classList.add('collapsed');
    }

    const chevron = document.createElement('span');
    chevron.className = 'folder-chevron';
    chevron.textContent = '▼';

    const folderDragHandle = document.createElement('span');
    folderDragHandle.className = 'folder-drag-handle';
    folderDragHandle.textContent = '⠿';
    folderDragHandle.setAttribute('aria-hidden', 'true');

    const folderTitle = document.createElement('span');
    folderTitle.className = 'folder-title';
    folderTitle.title = pageTitle || '(Untitled Page)';

    const typeIcon = folderMeta.isCustom ? '📁' : '🌐';
    const displayTitle = pageTitle || '(Untitled Page)';
    const highlightedTitle = hasQuery
      ? highlightMatch(displayTitle, query)
      : escapeHtml(displayTitle);
    folderTitle.innerHTML = `<span class="folder-type-icon">${typeIcon}</span><span>${highlightedTitle}</span>`;

    const folderBadge = document.createElement('span');
    folderBadge.className = 'folder-badge';
    folderBadge.textContent = String(visibleNotes.length);

    folderHeader.appendChild(folderDragHandle);
    folderHeader.appendChild(chevron);
    folderHeader.appendChild(folderTitle);
    folderHeader.appendChild(folderBadge);

    if (isFolderPinned(pageTitle)) {
      const folderPinIcon = document.createElement('span');
      folderPinIcon.className = 'folder-pin-btn pinned';
      folderPinIcon.textContent = '📌';
      folderPinIcon.setAttribute('aria-label', 'Pinned folder');
      folderHeader.appendChild(folderPinIcon);
    }

    const folderMenuWrap = document.createElement('div');
    folderMenuWrap.className = 'menu-wrap folder-menu-wrap';

    const folderMenuBtn = document.createElement('button');
    folderMenuBtn.type = 'button';
    folderMenuBtn.className = 'folder-menu-btn';
    folderMenuBtn.innerHTML = '&#8942;';
    folderMenuBtn.setAttribute('aria-label', 'Folder options');

    const folderMenu = document.createElement('div');
    folderMenu.className = 'menu hidden';

    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'menu-item';
    pinBtn.textContent = isFolderPinned(pageTitle) ? '📌 Unpin folder' : '📌 Pin folder';
    pinBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closeAllMenus();
      toggleFolderPin(pageTitle);
    });
    folderMenu.appendChild(pinBtn);

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'menu-item';
    renameBtn.textContent = 'Rename folder';
    renameBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closeAllMenus();
      renameFolder(pageTitle);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'menu-item delete';
    deleteBtn.textContent = 'Delete folder';
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closeAllMenus();
      deleteFolder(pageTitle);
    });

    folderMenu.appendChild(renameBtn);
    folderMenu.appendChild(deleteBtn);

    folderMenuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const wasHidden = folderMenu.classList.contains('hidden');
      closeAllMenus();
      if (wasHidden) {
        folderMenu.classList.remove('hidden');
      }
    });

    folderMenuWrap.appendChild(folderMenuBtn);
    folderMenuWrap.appendChild(folderMenu);
    folderHeader.appendChild(folderMenuWrap);

    folderHeader.addEventListener('click', () => toggleFolder(pageTitle));

    const notesList = document.createElement('div');
    notesList.className = 'notes-list';
    notesList.dataset.pageTitle = pageTitle;
    if (!collapsedFolders[pageTitle]) {
      notesList.classList.add('hidden');
    }

    notesList.addEventListener('dragover', (event) => {
      handleWordDragOver(event, notesList, pageTitle);
    });
    notesList.addEventListener('drop', (event) => {
      handleWordDrop(event, notesList, pageTitle);
    });
    notesList.addEventListener('dragleave', (event) => {
      if (!notesList.contains(event.relatedTarget)) {
        clearWordDropIndicators();
      }
    });

    if (collapsedFolders[pageTitle]) {
      notesList.appendChild(createAddWordSection(pageTitle));
    }

    if (visibleNotes.length === 0 && folderMeta.isCustom) {
      const emptyHint = document.createElement('div');
      emptyHint.className = 'custom-empty-hint';
      emptyHint.textContent = 'No words yet. Save words here by moving them from other folders';
      notesList.appendChild(emptyHint);
    }

    visibleNotes.forEach((note) => {
      notesList.appendChild(createWordCard(pageTitle, note, query));
    });

    folder.appendChild(folderHeader);
    folder.appendChild(notesList);
    notesContainer.appendChild(folder);
  });

  if (hasQuery && renderedFolderCount === 0) {
    noResults.textContent = `No results for '${query}'`;
    noResults.style.display = 'block';
  }
}

function createWordCard(pageTitle, note, query = '') {
  const card = document.createElement('article');
  card.className = 'word-card';
  card.draggable = true;
  card.dataset.pageTitle = pageTitle;
  card.dataset.noteTimestamp = note.timestamp || '';
  card.dataset.word = note.word || '';
  card.dataset.noteIndex = String(note._index);
  card.dataset.notePinned = note.pinned ? 'true' : 'false';

  card.addEventListener('dragstart', (event) => {
    handleWordDragStart(event, pageTitle, note._index, !!note.pinned, card);
  });
  card.addEventListener('dragend', () => {
    handleWordDragEnd(card);
  });

  const top = document.createElement('div');
  top.className = 'word-top';

  const word = document.createElement('div');
  word.className = 'word-title';
  word.innerHTML = query
    ? highlightMatch(note.word || 'Untitled Word', query)
    : escapeHtml(note.word || 'Untitled Word');

  const dragHandle = document.createElement('span');
  dragHandle.className = 'word-drag-handle';
  dragHandle.textContent = '⠿';
  dragHandle.setAttribute('aria-hidden', 'true');

  const positionBadge = document.createElement('span');
  positionBadge.className = 'word-position-badge';
  positionBadge.textContent = note._positionLabel || '';
  positionBadge.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'min-width:22px',
    'height:22px',
    'padding:0 6px',
    'border-radius:999px',
    'background:#e5e7eb',
    'color:#6b7280',
    'font-size:11px',
    'font-weight:700',
    'line-height:1',
    'margin-right:8px',
    'flex-shrink:0'
  ].join(';');

  const menuWrap = document.createElement('div');
  menuWrap.className = 'menu-wrap';

  const topActions = document.createElement('div');
  topActions.className = 'word-top-actions';

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'menu-btn';
  menuBtn.innerHTML = '&#8942;';
  menuBtn.setAttribute('aria-label', 'Open note options');

  const menu = document.createElement('div');
  menu.className = 'menu hidden';

  const pinButton = document.createElement('button');
  pinButton.type = 'button';
  pinButton.className = 'menu-item';
  pinButton.textContent = note.pinned ? 'Unpin' : 'Pin';
  pinButton.addEventListener('click', (event) => {
    event.stopPropagation();
    closeAllMenus();
    toggleWordPin(pageTitle, note._index);
  });

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'menu-item';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    closeAllMenus();
    enterEditMode(card, pageTitle, note);
  });

  const moveButton = document.createElement('button');
  moveButton.type = 'button';
  moveButton.className = 'menu-item';
  moveButton.textContent = 'Move to...';

  const moveList = document.createElement('div');
  moveList.className = 'move-list hidden';

  const otherFolders = getSortedFolders()
    .map((folder) => folder.title)
    .filter((title) => title !== pageTitle);

  if (otherFolders.length === 0) {
    const noFolder = document.createElement('div');
    noFolder.className = 'menu-item disabled';
    noFolder.textContent = 'No other folders';
    moveList.appendChild(noFolder);
  } else {
    const folderMetaMap = getFolderMetaMap();
    otherFolders.forEach((targetTitle) => {
      const targetButton = document.createElement('button');
      targetButton.type = 'button';
      targetButton.className = 'menu-item';
      const targetMeta = folderMetaMap.get(targetTitle);
      const icon = targetMeta && targetMeta.isCustom ? '📁' : '🌐';
      targetButton.textContent = `${icon} ${targetTitle}`;
      targetButton.addEventListener('click', (event) => {
        event.stopPropagation();
        moveWord(pageTitle, targetTitle, note._index);
      });
      moveList.appendChild(targetButton);
    });
  }

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'menu-item delete';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    deleteWord(pageTitle, note._index, note.word || 'this word');
  });

  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = !menu.classList.contains('hidden');
    closeAllMenus();
    if (!isOpen) menu.classList.remove('hidden');
  });

  moveButton.addEventListener('click', (event) => {
    event.stopPropagation();
    moveList.classList.toggle('hidden');
  });

  menu.appendChild(editButton);
  menu.appendChild(pinButton);
  menu.appendChild(moveButton);
  menu.appendChild(moveList);
  menu.appendChild(deleteButton);

  menuWrap.appendChild(menuBtn);
  menuWrap.appendChild(menu);
  top.appendChild(dragHandle);
  top.appendChild(positionBadge);
  top.appendChild(word);

  const noteType = String(note.type || '').toLowerCase();
  if (noteType === 'word' || noteType === 'phrase' || noteType === 'sentence') {
    const typeBadge = document.createElement('span');
    typeBadge.className = `word-type-badge ${noteType}`;
    if (noteType === 'word') {
      typeBadge.textContent = 'Word';
    } else if (noteType === 'phrase') {
      typeBadge.textContent = 'Phrase';
    } else {
      typeBadge.textContent = 'Sentence';
    }
    topActions.appendChild(typeBadge);
  }

  topActions.appendChild(menuWrap);
  top.appendChild(topActions);

  const cleanDef = (note.definition || '').replace(/^Definition:\s*/i, '').trim();
  const definition = createMetaLine('Definition:', cleanDef || 'Not available', query);
  const transLangLabel = note.translationLang ? (LANGUAGE_LABELS[note.translationLang] || note.translationLang.toUpperCase()) : null;
  const transLineLabel = transLangLabel ? `Translation (${transLangLabel}):` : 'Translation:';
  const translation = createMetaLine(transLineLabel, note.translation || 'Not available', query);
  const personalNotesText = (note.personalNotes || '').trim();
  const personalNotes = personalNotesText ? createPersonalNotesLine(personalNotesText, query) : null;

  const timestamp = document.createElement('div');
  timestamp.className = 'timestamp';
  timestamp.textContent = formatDate(note.timestamp);

  if (note.pinned) {
    const pinIcon = document.createElement('span');
    pinIcon.className = 'word-pin-indicator';
    pinIcon.textContent = '📌';
    pinIcon.title = 'Pinned in this folder';
    card.appendChild(pinIcon);
  }

  card.appendChild(top);
  card.appendChild(definition);
  card.appendChild(translation);
  if (personalNotes) {
    card.appendChild(personalNotes);
  }
  card.appendChild(timestamp);

  return card;
}

function createMetaLine(label, value, query = '') {
  const line = document.createElement('div');
  line.className = 'meta';

  const strong = document.createElement('strong');
  strong.textContent = label;

  const span = document.createElement('span');
  span.innerHTML = query ? highlightMatch(value, query) : escapeHtml(value);

  line.appendChild(strong);
  line.appendChild(span);
  return line;
}

function createPersonalNotesLine(value, query = '') {
  const line = document.createElement('div');
  line.className = 'meta personal-note';

  const icon = document.createElement('span');
  icon.className = 'personal-note-icon';
  icon.textContent = '📝';

  const text = document.createElement('span');
  text.innerHTML = query ? highlightMatch(value, query) : escapeHtml(value);

  line.appendChild(icon);
  line.appendChild(text);
  return line;
}

function createAddWordSection(pageTitle) {
  const wrapper = document.createElement('div');
  wrapper.className = 'add-word-section';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'add-word-trigger';
  trigger.textContent = 'Add word +';
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    activeAddWordFolder = activeAddWordFolder === pageTitle ? null : pageTitle;
    renderNotes();
  });

  wrapper.appendChild(trigger);

  if (activeAddWordFolder !== pageTitle) {
    return wrapper;
  }

  const form = document.createElement('div');
  form.className = 'add-word-form visible';

  const wordInput = document.createElement('input');
  wordInput.type = 'text';
  wordInput.className = 'add-word-input';
  wordInput.placeholder = 'Type a word and press Enter to fetch its meaning...';

  const wordHint = document.createElement('div');
  wordHint.className = 'add-word-hint';
  wordHint.style.cssText = 'font-size:11px;color:#6b7280;margin:-4px 0 6px;min-height:16px;';

  const DEFINITION_PLACEHOLDER = 'Definition (optional - auto-fetched if empty)';

  const definitionInput = document.createElement('textarea');
  definitionInput.className = 'add-word-textarea';
  definitionInput.placeholder = DEFINITION_PLACEHOLDER;

  const notesInput = document.createElement('textarea');
  notesInput.className = 'add-word-textarea';
  notesInput.placeholder = 'Your personal notes...';

  const actions = document.createElement('div');
  actions.className = 'add-word-actions';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'add-word-btn add';
  addButton.textContent = 'Add';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'add-word-btn cancel';
  cancelButton.textContent = 'Cancel';

  cancelButton.addEventListener('click', (event) => {
    event.stopPropagation();
    activeAddWordFolder = null;
    renderNotes();
  });

  addButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    await addWordToFolder(pageTitle, {
      word: wordInput.value,
      definition: definitionInput.value,
      personalNotes: notesInput.value
    }, addButton);
  });

  [wordInput, definitionInput, notesInput].forEach((field) => {
    field.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  });

  const checkDuplicateWord = (rawWord) => {
    const normalizedWord = String(rawWord || '').trim().toLowerCase();
    if (!normalizedWord) {
      return { inCurrent: false, inOther: [] };
    }

    const foundInFolders = [];
    Object.entries(notesState || {}).forEach(([folderName, folderNotes]) => {
      const list = Array.isArray(folderNotes) ? folderNotes : [];
      const hasMatch = list.some((note) => String(note && note.word ? note.word : '').trim().toLowerCase() === normalizedWord);
      if (hasMatch) {
        foundInFolders.push(folderName);
      }
    });

    return {
      inCurrent: foundInFolders.includes(pageTitle),
      inOther: foundInFolders.filter((folderName) => folderName !== pageTitle)
    };
  };

  const applyDuplicateHint = (rawWord) => {
    const duplicate = checkDuplicateWord(rawWord);
    if (duplicate.inCurrent) {
      wordHint.textContent = 'This word already exists in this folder';
      wordHint.style.color = '#dc2626';
      addButton.disabled = true;
      return duplicate;
    }

    addButton.disabled = false;
    if (duplicate.inOther.length > 0) {
      wordHint.textContent = `This word exists in: ${duplicate.inOther.join(', ')}`;
      wordHint.style.color = '#a16207';
      return duplicate;
    }

    wordHint.textContent = '';
    wordHint.style.color = '#6b7280';
    return duplicate;
  };

  wordInput.addEventListener('input', () => {
    applyDuplicateHint(wordInput.value);
  });

  wordInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelButton.click();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const word = wordInput.value.trim();
      if (!word) {
        return;
      }

      const duplicate = applyDuplicateHint(word);
      if (duplicate.inCurrent) {
        return;
      }

      // If definition is already filled in, just move focus
      if (definitionInput.value.trim()) {
        notesInput.focus();
        return;
      }

      wordHint.textContent = 'Fetching...';
      wordHint.style.color = '#6b7280';
      definitionInput.placeholder = 'Fetching definition...';
      definitionInput.disabled = true;
      wordInput.disabled = true;

      const definition = await fetchWordDefinition(word);

      wordInput.disabled = false;
      definitionInput.disabled = false;
      definitionInput.placeholder = DEFINITION_PLACEHOLDER;

      if (definition && definition !== 'Not found') {
        definitionInput.value = definition;
        if (duplicate.inOther.length > 0) {
          wordHint.textContent = `This word exists in: ${duplicate.inOther.join(', ')}`;
          wordHint.style.color = '#a16207';
        } else {
          wordHint.textContent = '';
          wordHint.style.color = '#6b7280';
        }
        notesInput.focus();
      } else {
        wordHint.textContent = 'Definition not found — you can enter it manually';
        wordHint.style.color = '#6b7280';
        definitionInput.focus();
      }
    }
  });

  actions.appendChild(addButton);
  actions.appendChild(cancelButton);

  form.appendChild(wordInput);
  form.appendChild(wordHint);
  form.appendChild(definitionInput);
  form.appendChild(notesInput);
  form.appendChild(actions);
  wrapper.appendChild(form);

  window.setTimeout(() => {
    if (wordInput.isConnected) {
      wordInput.focus();
    }
  }, 0);

  return wrapper;
}

async function addWordToFolder(pageTitle, values, addButton) {
  const word = String(values.word || '').trim();
  const personalNotes = String(values.personalNotes || '').trim();
  let definition = String(values.definition || '').trim();
  const normalizedWord = word.toLowerCase();

  if (!word) {
    showToast('Word is required');
    return;
  }

  const foldersWithDuplicate = Object.entries(notesState || {})
    .filter(([, list]) => Array.isArray(list) && list.some((note) => String(note && note.word ? note.word : '').trim().toLowerCase() === normalizedWord))
    .map(([title]) => title);

  if (foldersWithDuplicate.includes(pageTitle)) {
    showToast('This word already exists in this folder');
    return;
  }

  const otherDuplicates = foldersWithDuplicate.filter((title) => title !== pageTitle);
  if (otherDuplicates.length > 0) {
    showToast(`Word also exists in: ${otherDuplicates.join(', ')}`);
  }

  if (addButton) {
    addButton.disabled = true;
    addButton.textContent = 'Adding...';
  }

  try {
    if (!definition) {
      definition = await fetchWordDefinition(word);
    }

    const updatedNotes = cloneNotes(notesState);
    if (!updatedNotes[pageTitle]) {
      updatedNotes[pageTitle] = [];
    }

    updatedNotes[pageTitle].push({
      word,
      definition,
      translation: '',
      personalNotes,
      pinned: false,
      pinnedAt: null,
      timestamp: new Date().toISOString()
    });

    activeAddWordFolder = null;
    persistNotes(updatedNotes);
    showToast('Word added!');
  } catch (error) {
    showToast('Could not add word');
  } finally {
    if (addButton && addButton.isConnected) {
      addButton.disabled = false;
      addButton.textContent = 'Add';
    }
  }
}

async function fetchWordDefinition(word) {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) {
      throw new Error('Definition unavailable');
    }

    const data = await response.json();
    const definition = extractDefinitionFromResponse(data);
    return definition || 'Not found';
  } catch (error) {
    return 'Not found';
  }
}

function extractDefinitionFromResponse(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  const entry = data[0];
  if (!entry || !Array.isArray(entry.meanings) || entry.meanings.length === 0) {
    return '';
  }

  const firstMeaning = entry.meanings[0];
  if (!firstMeaning || !Array.isArray(firstMeaning.definitions) || firstMeaning.definitions.length === 0) {
    return '';
  }

  const firstDefinition = firstMeaning.definitions[0];
  return firstDefinition && firstDefinition.definition
    ? String(firstDefinition.definition).trim()
    : '';
}

function enterEditMode(card, pageTitle, note) {
  if (!card) {
    return;
  }

  card.classList.add('edit-mode');
  card.innerHTML = '';

  const fields = document.createElement('div');
  fields.className = 'edit-fields';

  const wordInput = document.createElement('input');
  wordInput.className = 'edit-input';
  wordInput.type = 'text';
  wordInput.placeholder = 'Word';
  wordInput.value = note.word || '';

  const definitionInput = document.createElement('textarea');
  definitionInput.className = 'edit-textarea';
  definitionInput.placeholder = 'Definition';
  definitionInput.value = note.definition || '';

  const translationInput = document.createElement('textarea');
  translationInput.className = 'edit-textarea';
  translationInput.placeholder = 'Translation';
  translationInput.value = note.translation || '';

  const personalNotesInput = document.createElement('textarea');
  personalNotesInput.className = 'edit-textarea';
  personalNotesInput.placeholder = 'Personal notes';
  personalNotesInput.value = note.personalNotes || '';

  const actions = document.createElement('div');
  actions.className = 'edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'edit-btn save';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'edit-btn cancel';
  cancelBtn.textContent = 'Cancel';

  saveBtn.addEventListener('click', () => {
    const updated = cloneNotes(notesState);
    if (!updated[pageTitle] || !updated[pageTitle][note._index]) {
      renderNotes();
      return;
    }

    updated[pageTitle][note._index] = {
      ...updated[pageTitle][note._index],
      word: (wordInput.value || '').trim() || 'Untitled Word',
      definition: (definitionInput.value || '').trim(),
      translation: (translationInput.value || '').trim(),
      personalNotes: (personalNotesInput.value || '').trim()
    };

    persistNotes(updated);
  });

  cancelBtn.addEventListener('click', () => {
    renderNotes();
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  fields.appendChild(wordInput);
  fields.appendChild(definitionInput);
  fields.appendChild(translationInput);
  fields.appendChild(personalNotesInput);
  fields.appendChild(actions);

  card.appendChild(fields);

  wordInput.focus();
}

// ─── Stats ───────────────────────────────────────────────────────────────────
function renderStats() {
  setText('totalLookupsValue', String(historyState.length));
  setText('totalSavedValue',   String(getTotalSavedWords()));

  const wordStats = buildWordStats(historyState);
  const topWords  = [...wordStats.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const topWord   = topWords[0];
  setText('mostLookedUpValue', topWord ? topWord.word : '-');
  setText('mostLookedUpSub',   topWord ? `${topWord.count} lookups` : 'No history yet');
  renderTopWords(topWords);

  const langStats = buildLanguageStats(historyState);
  const topLang   = [...langStats.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topLang) {
    const label = LANGUAGE_LABELS[topLang[0]] || String(topLang[0]).toUpperCase();
    setText('mostLanguageValue', label);
    setText('mostLanguageSub',   `${topLang[1]} lookups`);
  } else {
    setText('mostLanguageValue', '-');
    setText('mostLanguageSub',   'No language data');
  }

  const weekStats = getWeeklyHistoryCounts(historyState);
  setText('weekStatsValue', `${weekStats.thisWeek} / ${weekStats.lastWeek}`);
}

function renderTopWords(topWords) {
  const chart = document.getElementById('topWordsChart');
  if (!chart) return;
  chart.innerHTML = '';
  if (!topWords.length) {
    const empty = document.createElement('div');
    empty.className = 'stats-empty';
    empty.textContent = 'Look up some words first';
    chart.appendChild(empty);
    return;
  }
  const maxCount = Math.max(...topWords.map((w) => w.count), 1);
  topWords.forEach((item) => {
    const row   = document.createElement('div');  row.className   = 'chart-row';
    const word  = document.createElement('div');  word.className  = 'chart-word';  word.textContent = item.word;
    const track = document.createElement('div');  track.className = 'chart-track';
    const fill  = document.createElement('div');  fill.className  = 'chart-fill';
    fill.style.width = `${Math.max(8, Math.round((item.count / maxCount) * 100))}%`;
    const cnt   = document.createElement('div');  cnt.className   = 'chart-count'; cnt.textContent  = String(item.count);
    track.appendChild(fill);
    row.append(word, track, cnt);
    chart.appendChild(row);
  });
}

function getTotalSavedWords() {
  return Object.values(notesState).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
}

function buildWordStats(history) {
  const map = new Map();
  history.forEach((e) => {
    const key = String(e.word || '').trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, { word: String(e.word).trim(), count: 0 });
    map.get(key).count += 1;
  });
  return map;
}

function buildLanguageStats(history) {
  const map = new Map();
  history.forEach((e) => {
    const key = String(e.language || '').trim().toLowerCase();
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function getWeeklyHistoryCounts(history) {
  const now = Date.now(), dayMs = 86400000;
  let thisWeek = 0, lastWeek = 0;
  history.forEach((e) => {
    const diff = now - new Date(e.timestamp).getTime();
    if (diff >= 0 && diff < 7  * dayMs) thisWeek  += 1;
    if (diff >= 7  * dayMs && diff < 14 * dayMs) lastWeek += 1;
  });
  return { thisWeek, lastWeek };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getFolderMetaMap() {
  const map = new Map();

  Object.keys(notesState).forEach((title) => {
    map.set(title, {
      title,
      isCustom: customFoldersState.includes(title),
      notes: Array.isArray(notesState[title]) ? notesState[title] : []
    });
  });

  customFoldersState.forEach((title) => {
    if (!map.has(title)) {
      map.set(title, {
        title,
        isCustom: true,
        notes: []
      });
    }
  });

  return map;
}

function getSortedFolders() {
  const orderLookup = new Map(folderOrderState.map((title, index) => [title, index]));

  return Array.from(getFolderMetaMap().values()).sort((a, b) => {
    const aPinned = isFolderPinned(a.title);
    const bPinned = isFolderPinned(b.title);
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    const aOrder = orderLookup.has(a.title) ? orderLookup.get(a.title) : Number.MAX_SAFE_INTEGER;
    const bOrder = orderLookup.has(b.title) ? orderLookup.get(b.title) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.title.localeCompare(b.title);
  });
}

function toggleFolder(pageTitle) {
  collapsedFolders[pageTitle] = !collapsedFolders[pageTitle];
  closeAllMenus();
  renderNotes();
}

function deleteWord(pageTitle, noteIndex, wordLabel) {
  const confirmed = confirm(`Delete "${wordLabel}" from this folder?`);
  if (!confirmed) {
    return;
  }

  const updated = cloneNotes(notesState);
  if (!updated[pageTitle] || !updated[pageTitle][noteIndex]) {
    return;
  }

  updated[pageTitle].splice(noteIndex, 1);
  if (updated[pageTitle].length === 0 && !customFoldersState.includes(pageTitle)) {
    delete updated[pageTitle];
  }

  persistNotes(updated);
}

function moveWord(fromTitle, toTitle, noteIndex) {
  if (fromTitle === toTitle) {
    return;
  }

  const updated = cloneNotes(notesState);
  if (!updated[fromTitle] || !updated[fromTitle][noteIndex]) {
    return;
  }

  const [note] = updated[fromTitle].splice(noteIndex, 1);
  if (!updated[toTitle]) {
    updated[toTitle] = [];
  }
  updated[toTitle].push(note);

  if (updated[fromTitle].length === 0 && !customFoldersState.includes(fromTitle)) {
    delete updated[fromTitle];
  }

  persistNotes(updated);
}

function handleWordDragStart(event, sourceFolder, sourceIndex, sourcePinned, card) {
  if (draggedFolderState) {
    event.preventDefault();
    return;
  }

  draggedWordState = {
    sourceFolder,
    sourceIndex,
    sourcePinned: !!sourcePinned
  };

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'word',
      sourceFolder,
      sourceIndex
    }));
  }

  if (card) {
    card.classList.add('dragging-card');
  }
}

function handleWordDragEnd(card) {
  if (card) {
    card.classList.remove('dragging-card');
  }
  draggedWordState = null;
  clearWordDropIndicators();
}

function handleWordDragOver(event, notesList, targetFolder) {
  if (!draggedWordState || draggedFolderState) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const candidate = getWordDropCandidate(notesList, event.clientY);
  const valid = isValidWordDrop(candidate, targetFolder);

  clearWordDropIndicators();
  renderWordDropIndicators(notesList, candidate, valid);

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = valid ? 'move' : 'none';
  }
}

function handleWordDrop(event, notesList, targetFolder) {
  if (!draggedWordState || draggedFolderState) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const candidate = getWordDropCandidate(notesList, event.clientY);
  const valid = isValidWordDrop(candidate, targetFolder);
  if (!valid) {
    showToast('Cannot drop here due to pin rules');
    clearWordDropIndicators();
    return;
  }

  applyWordDrop(targetFolder, candidate);
  clearWordDropIndicators();
}

function getWordDropCandidate(notesList, clientY) {
  const cards = Array.from(notesList.querySelectorAll('.word-card')).filter((card) => !card.classList.contains('dragging-card'));
  let displayIndex = cards.length;

  for (let i = 0; i < cards.length; i += 1) {
    const rect = cards[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      displayIndex = i;
      break;
    }
  }

  return { cards, displayIndex };
}

function isValidWordDrop(candidate, targetFolder) {
  if (!draggedWordState) {
    return false;
  }

  const pinnedCount = candidate.cards.filter((card) => card.dataset.notePinned === 'true').length;
  if (draggedWordState.sourcePinned) {
    return candidate.displayIndex <= pinnedCount;
  }
  return candidate.displayIndex >= pinnedCount;
}

function renderWordDropIndicators(notesList, candidate, valid) {
  notesList.classList.add(valid ? 'drop-zone-valid' : 'drop-zone-invalid');

  if (candidate.cards.length === 0) {
    notesList.classList.add(valid ? 'drop-empty-valid' : 'drop-empty-invalid');
    return;
  }

  if (candidate.displayIndex >= candidate.cards.length) {
    candidate.cards[candidate.cards.length - 1].classList.add(valid ? 'drop-after-valid' : 'drop-after-invalid');
    return;
  }

  candidate.cards[candidate.displayIndex].classList.add(valid ? 'drop-before-valid' : 'drop-before-invalid');
}

function clearWordDropIndicators() {
  document.querySelectorAll('.notes-list').forEach((list) => {
    list.classList.remove('drop-zone-valid', 'drop-zone-invalid', 'drop-empty-valid', 'drop-empty-invalid');
  });
  document.querySelectorAll('.word-card').forEach((card) => {
    card.classList.remove('drop-before-valid', 'drop-before-invalid', 'drop-after-valid', 'drop-after-invalid');
  });
}

function applyWordDrop(targetFolder, candidate) {
  const sourceFolder = draggedWordState.sourceFolder;
  const sourceIndex = draggedWordState.sourceIndex;

  const updated = cloneNotes(notesState);
  if (!updated[sourceFolder] || !updated[sourceFolder][sourceIndex]) {
    return;
  }

  const sourceList = updated[sourceFolder];
  const targetList = updated[targetFolder] || [];
  const [movedNote] = sourceList.splice(sourceIndex, 1);

  let targetInsertIndex;
  if (candidate.displayIndex >= candidate.cards.length) {
    targetInsertIndex = targetList.length;
  } else {
    targetInsertIndex = Number(candidate.cards[candidate.displayIndex].dataset.noteIndex);
    if (Number.isNaN(targetInsertIndex)) {
      targetInsertIndex = targetList.length;
    }
  }

  if (sourceFolder === targetFolder && targetInsertIndex > sourceIndex) {
    targetInsertIndex -= 1;
  }

  if (!updated[targetFolder]) {
    updated[targetFolder] = [];
  }

  updated[targetFolder].splice(Math.max(0, targetInsertIndex), 0, movedNote);

  if (updated[sourceFolder].length === 0 && !customFoldersState.includes(sourceFolder)) {
    delete updated[sourceFolder];
  }

  persistNotes(updated);
}

function handleFolderDragStart(event, folderTitle, folderElement) {
  if (draggedWordState) {
    event.preventDefault();
    return;
  }

  draggedFolderState = { folderTitle };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'folder',
      folderTitle
    }));
  }

  if (folderElement) {
    folderElement.classList.add('dragging-folder');
  }
}

function handleFolderDragEnd(folderElement) {
  if (folderElement) {
    folderElement.classList.remove('dragging-folder');
  }
  draggedFolderState = null;
  clearFolderDropIndicators();
}

function handleFolderDragOver(event, targetTitle, folderElement) {
  if (!draggedFolderState || draggedWordState) {
    return;
  }

  event.preventDefault();

  if (draggedFolderState.folderTitle === targetTitle) {
    folderElement.classList.remove('folder-drop-valid', 'folder-drop-invalid', 'folder-drop-before', 'folder-drop-after');
    return;
  }

  const rect = folderElement.getBoundingClientRect();
  const placeAfter = event.clientY > rect.top + rect.height / 2;
  const valid = canDropFolder(draggedFolderState.folderTitle, targetTitle, placeAfter);

  clearFolderDropIndicators();
  folderElement.classList.add(valid ? 'folder-drop-valid' : 'folder-drop-invalid');
  folderElement.classList.add(placeAfter ? 'folder-drop-after' : 'folder-drop-before');

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = valid ? 'move' : 'none';
  }
}

function handleFolderDrop(event, targetTitle, folderElement) {
  if (!draggedFolderState || draggedWordState) {
    return;
  }

  event.preventDefault();
  if (draggedFolderState.folderTitle === targetTitle) {
    clearFolderDropIndicators();
    return;
  }

  const rect = folderElement.getBoundingClientRect();
  const placeAfter = event.clientY > rect.top + rect.height / 2;
  const sourceTitle = draggedFolderState.folderTitle;

  if (!canDropFolder(sourceTitle, targetTitle, placeAfter)) {
    showToast('Pinned folders stay at the top');
    clearFolderDropIndicators();
    return;
  }

  const reordered = reorderFolderOrder(sourceTitle, targetTitle, placeAfter);
  if (reordered) {
    persistAll({ folderOrder: reordered });
  }

  clearFolderDropIndicators();
}

function getEffectiveFolderOrder() {
  const titles = Array.from(getFolderMetaMap().keys());
  return normalizeFolderOrder(folderOrderState, titles).folderOrder;
}

function canDropFolder(sourceTitle, targetTitle, placeAfter) {
  const currentOrder = getEffectiveFolderOrder();
  const orderWithoutSource = currentOrder.filter((title) => title !== sourceTitle);
  const targetIndex = orderWithoutSource.indexOf(targetTitle);
  if (targetIndex === -1) {
    return false;
  }

  const insertIndex = placeAfter ? targetIndex + 1 : targetIndex;
  const pinnedCount = orderWithoutSource.filter((title) => isFolderPinned(title)).length;

  if (isFolderPinned(sourceTitle)) {
    return insertIndex <= pinnedCount;
  }
  return insertIndex >= pinnedCount;
}

function reorderFolderOrder(sourceTitle, targetTitle, placeAfter) {
  const currentOrder = getEffectiveFolderOrder();
  const orderWithoutSource = currentOrder.filter((title) => title !== sourceTitle);
  const targetIndex = orderWithoutSource.indexOf(targetTitle);
  if (targetIndex === -1) {
    return null;
  }

  const insertIndex = placeAfter ? targetIndex + 1 : targetIndex;
  orderWithoutSource.splice(insertIndex, 0, sourceTitle);
  return orderWithoutSource;
}

function clearFolderDropIndicators() {
  document.querySelectorAll('.folder').forEach((folder) => {
    folder.classList.remove('folder-drop-valid', 'folder-drop-invalid', 'folder-drop-before', 'folder-drop-after', 'dragging-folder');
  });
}

function renameFolder(oldTitle) {
  const nextName = (prompt('Rename folder', oldTitle) || '').trim();
  if (!nextName || nextName === oldTitle) {
    return;
  }

  if (getFolderMetaMap().has(nextName)) {
    showToast('Folder already exists');
    return;
  }

  const updatedNotes = cloneNotes(notesState);
  const movingNotes = updatedNotes[oldTitle] || [];
  delete updatedNotes[oldTitle];
  updatedNotes[nextName] = movingNotes;

  const updatedCustomFolders = customFoldersState.includes(oldTitle)
    ? customFoldersState.map((name) => (name === oldTitle ? nextName : name))
    : customFoldersState;
  const updatedPinnedFolders = pinnedFoldersState.map((name) => (name === oldTitle ? nextName : name));
  const updatedFolderOrder = folderOrderState.map((name) => (name === oldTitle ? nextName : name));

  persistAll({
    notes: updatedNotes,
    customFolders: updatedCustomFolders,
    pinnedFolders: updatedPinnedFolders,
    folderOrder: updatedFolderOrder
  }, () => {
    showToast('Folder renamed');
  });
}

function deleteFolder(folderTitle) {
  const wordCount = Array.isArray(notesState[folderTitle]) ? notesState[folderTitle].length : 0;
  const confirmMsg = wordCount > 0
    ? `Delete folder "${folderTitle}" and all ${wordCount} word${wordCount !== 1 ? 's' : ''} in it?`
    : `Delete folder "${folderTitle}"?`;
  const confirmed = confirm(confirmMsg);
  if (!confirmed) {
    return;
  }

  const updatedNotes = cloneNotes(notesState);
  delete updatedNotes[folderTitle];

  const updatedCustomFolders = customFoldersState.filter((name) => name !== folderTitle);
  const updatedPinnedFolders = pinnedFoldersState.filter((name) => name !== folderTitle);
  const updatedFolderOrder = folderOrderState.filter((name) => name !== folderTitle);

  persistAll({
    notes: updatedNotes,
    customFolders: updatedCustomFolders,
    pinnedFolders: updatedPinnedFolders,
    folderOrder: updatedFolderOrder
  }, () => {
    showToast('Folder deleted');
  });
}

function persistNotes(updatedNotes) {
  persistAll({ notes: updatedNotes });
}

function persistAll(partial, callback) {
  const payload = {};
  const nextNotes = partial.notes || notesState;
  const nextCustomFolders = partial.customFolders || customFoldersState;

  const folderTitles = Array.from(new Set([
    ...Object.keys(nextNotes || {}),
    ...nextCustomFolders
  ]));
  const folderOrderNormalization = normalizeFolderOrder(partial.folderOrder || folderOrderState, folderTitles);

  if (partial.notes) {
    payload.notes = partial.notes;
  }
  if (partial.customFolders) {
    payload.customFolders = partial.customFolders;
  }
  if (partial.pinnedFolders) {
    payload.pinnedFolders = partial.pinnedFolders;
  }
  payload.folderOrder = folderOrderNormalization.folderOrder;

  chrome.storage.local.set(payload, () => {
    if (payload.notes) {
      notesState = payload.notes;
    }
    if (payload.customFolders) {
      customFoldersState = payload.customFolders;
    }
    if (payload.pinnedFolders) {
      pinnedFoldersState = payload.pinnedFolders;
    }
    folderOrderState = payload.folderOrder;

    closeAllMenus();
    renderNotes();

    if (typeof callback === 'function') {
      callback();
    }
  });
}

function toggleFolderPin(pageTitle) {
  let nextPinned = Array.isArray(pinnedFoldersState) ? [...pinnedFoldersState] : [];
  if (nextPinned.includes(pageTitle)) {
    nextPinned = nextPinned.filter((title) => title !== pageTitle);
  } else {
    // Newly pinned folders should appear at the top of pinned folders.
    nextPinned = [pageTitle, ...nextPinned];
  }
  persistAll({ pinnedFolders: nextPinned });
}

function isFolderPinned(pageTitle) {
  return pinnedFoldersState.includes(pageTitle);
}

function toggleWordPin(pageTitle, noteIndex) {
  const updated = cloneNotes(notesState);
  if (!updated[pageTitle] || !updated[pageTitle][noteIndex]) {
    return;
  }

  const note = ensureNoteDefaults(updated[pageTitle][noteIndex]);
  const willPin = !note.pinned;
  updated[pageTitle][noteIndex] = {
    ...note,
    pinned: willPin,
    pinnedAt: willPin ? new Date().toISOString() : null
  };

  persistNotes(updated);
}

function sortNotesForFolder(a, b) {
  const aPinned = !!a.pinned;
  const bPinned = !!b.pinned;
  if (aPinned !== bPinned) {
    return aPinned ? -1 : 1;
  }

  return (a._index || 0) - (b._index || 0);
}

function ensureNoteDefaults(note) {
  return {
    ...note,
    personalNotes: note && typeof note.personalNotes === 'string' ? note.personalNotes : '',
    pinned: !!(note && note.pinned),
    pinnedAt: note && note.pinnedAt ? note.pinnedAt : null
  };
}

function normalizeNotes(notes) {
  const normalized = {};
  let changed = false;

  Object.keys(notes || {}).forEach((title) => {
    const list = Array.isArray(notes[title]) ? notes[title] : [];
    normalized[title] = list.map((item) => {
      const withDefaults = ensureNoteDefaults(item || {});
      if (withDefaults.personalNotes !== (item && item.personalNotes) ||
          withDefaults.pinned !== !!(item && item.pinned) ||
          withDefaults.pinnedAt !== ((item && item.pinnedAt) || null)) {
        changed = true;
      }
      return withDefaults;
    });
  });

  return { notes: normalized, changed };
}

function normalizeCustomFolders(customFolders) {
  const input = Array.isArray(customFolders) ? customFolders : [];
  const normalized = [];
  const seen = new Set();
  let changed = false;

  input.forEach((item) => {
    const name = String(item || '').trim();
    if (!name || seen.has(name)) {
      changed = true;
      return;
    }
    seen.add(name);
    normalized.push(name);
    if (name !== item) {
      changed = true;
    }
  });

  return { customFolders: normalized, changed };
}

function normalizeFolderOrder(folderOrder, folderTitles) {
  const input = Array.isArray(folderOrder) ? folderOrder : [];
  const titles = Array.from(new Set((folderTitles || []).map((item) => String(item || '').trim()).filter(Boolean)));

  const allowed = new Set(titles);
  const seen = new Set();
  const normalized = [];
  let changed = !Array.isArray(folderOrder);

  input.forEach((item) => {
    const title = String(item || '').trim();
    if (!title || !allowed.has(title) || seen.has(title)) {
      changed = true;
      return;
    }
    if (title !== item) {
      changed = true;
    }
    seen.add(title);
    normalized.push(title);
  });

  titles.forEach((title) => {
    if (!seen.has(title)) {
      normalized.push(title);
      changed = true;
    }
  });

  return { folderOrder: normalized, changed };
}

function cloneNotes(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

function closeAllMenus() {
  const menus = document.querySelectorAll('.menu');
  menus.forEach((menu) => menu.classList.add('hidden'));

  const moveLists = document.querySelectorAll('.move-list');
  moveLists.forEach((list) => list.classList.add('hidden'));
}

function handleDocumentClick(event) {
  if (!event.target.closest('.menu-wrap')) {
    closeAllMenus();
  }
}

function initializeSearch() {
  searchInput = document.getElementById('searchInput');
  searchClear = document.getElementById('searchClear');
  if (!searchInput || !searchClear) {
    return;
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value || '';
    toggleSearchClear();
    renderNotes();
  });

  searchClear.addEventListener('click', () => {
    searchQuery = '';
    searchInput.value = '';
    toggleSearchClear();
    renderNotes();
    searchInput.focus();
  });

  toggleSearchClear();
}

function initializeExport() {
  const exportBtn = document.getElementById('exportBtn');
  if (!exportBtn) {
    return;
  }

  exportBtn.addEventListener('click', exportNotesAsCsv);
}

function exportNotesAsCsv() {
  const rows = [];

  Object.keys(notesState).forEach((folderTitle) => {
    const notes = notesState[folderTitle] || [];
    notes.forEach((note) => {
      rows.push([
        note.word || '',
        note.definition || '',
        note.translation || '',
        note.personalNotes || '',
        folderTitle || '(Untitled Page)',
        note.timestamp || ''
      ]);
    });
  });

  if (rows.length === 0) {
    showToast('Nothing to export');
    return;
  }

  const header = ['Word', 'Definition', 'Translation', 'Personal Notes', 'Folder', 'Date Saved'];
  const csvLines = [header, ...rows].map((row) => row.map(toCsvCell).join(','));
  const csvContent = csvLines.join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const datePart = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `kriti-notes-${datePart}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast('Downloaded!');
}

function toCsvCell(value) {
  const text = String(value || '');
  const escaped = text.replace(/"/g, '""');
  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add('visible');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2000);
}

function toggleSearchClear() {
  if (!searchClear || !searchInput) {
    return;
  }
  searchClear.classList.toggle('visible', searchInput.value.trim().length > 0);
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────
// Cycles through: system → light → dark → system …
const THEME_CYCLE = ['system', 'light', 'dark'];

function initializeThemeToggle() {
  const btn = document.getElementById('btnTheme');
  if (!btn) return;

  // Determine starting theme (saved in settings or fallback to 'system')
  let currentTheme = 'system';
  if (window.electronAPI && window.electronAPI.getSettings) {
    window.electronAPI.getSettings().then((s) => {
      if (s && s.theme) currentTheme = s.theme;
      updateThemeIcon(btn, currentTheme);
    }).catch(() => {});
  } else {
    updateThemeIcon(btn, currentTheme);
  }

  btn.addEventListener('click', () => {
    const idx = THEME_CYCLE.indexOf(currentTheme);
    currentTheme = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];

    if (window.electronAPI) {
      window.electronAPI.setTheme(currentTheme);
      // Persist in settings
      window.electronAPI.getSettings().then((s) => {
        window.electronAPI.setSettings(Object.assign({}, s || {}, { theme: currentTheme }));
      }).catch(() => {});
    }
    updateThemeIcon(btn, currentTheme);
  });
}

function updateThemeIcon(btn, theme) {
  const sun  = document.getElementById('themeIconSun');
  const moon = document.getElementById('themeIconMoon');
  const auto = document.getElementById('themeIconAuto');
  if (!sun || !moon || !auto) return;

  sun.style.display  = theme === 'light'  ? '' : 'none';
  moon.style.display = theme === 'dark'   ? '' : 'none';
  auto.style.display = theme === 'system' ? '' : 'none';

  const labels = { system: 'Theme: Auto', light: 'Theme: Light', dark: 'Theme: Dark' };
  btn.title = labels[theme] || 'Toggle theme';
}

function noteMatchesQuery(note, query) {
  return matchesQuery(note.word, query) ||
    matchesQuery(note.definition, query) ||
    matchesQuery(note.translation, query) ||
    matchesQuery(note.personalNotes, query);
}

function matchesQuery(value, query) {
  return String(value || '').toLowerCase().includes(query.toLowerCase());
}

function highlightMatch(text, query) {
  const source = String(text || '');
  if (!query) {
    return escapeHtml(source);
  }

  const regex = new RegExp(`(${escapeRegExp(query)})`, 'ig');
  return source
    .split(regex)
    .map((part) => {
      if (part.toLowerCase() === query.toLowerCase()) {
        return `<mark class="search-hit">${escapeHtml(part)}</mark>`;
      }
      return escapeHtml(part);
    })
    .join('');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value || '');
  return div.innerHTML;
}

function formatDate(isoString) {
  if (!isoString) {
    return 'Unknown time';
  }

  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;

    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);

    if (mins < 1) {
      return 'just now';
    }
    if (mins < 60) {
      return `${mins}m ago`;
    }
    if (hours < 24) {
      return `${hours}h ago`;
    }
    if (days < 7) {
      return `${days}d ago`;
    }
    return date.toLocaleString();
  } catch (error) {
    return 'Unknown time';
  }
}
