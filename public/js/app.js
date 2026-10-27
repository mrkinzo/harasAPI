/**
 * Haras Imperial - Client Application
 * Design Minimalista Preto e Branco
 * Sessao persistente no localhost, CRUD no MySQL e integracao com a API Equides.
 */

class HarasApp {
  constructor() {
    this.token = localStorage.getItem('haras_token') || null;
    this.currentUser = null;
    this.horses = [];
    this.stats = null;
    this.listViewMode = 'grid'; // 'grid' ou 'table'
    this.filterDebounceTimer = null;
    this.horseToDelete = null;

    this.init();
  }

  // --- INICIALIZACAO E PERSISTENCIA DE SESSAO ---
  async init() {
    const isLoginPage = window.location.pathname.endsWith('/login.html');
    if (!this.token && !isLoginPage) {
      window.location.href = '/login.html';
      return;
    }

    if (this.token) {
      await this.verifySession();
    }
  }

  async verifySession() {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        this.currentUser = data.user;
        this.setupPage();
      } else {
        this.logout();
      }
    } catch (err) {
      console.warn('Falha na verificacao de sessao:', err);
      this.logout();
    }
  }

  setupPage() {
    const navAvatar = document.getElementById('navAvatar');
    const navUserName = document.getElementById('navUserName');
    const dashboardGreeting = document.getElementById('dashboardGreeting');

    if (navAvatar && this.currentUser) {
      navAvatar.textContent = (this.currentUser.name || 'H').charAt(0).toUpperCase();
    }
    if (navUserName && this.currentUser) {
      navUserName.textContent = this.currentUser.name;
    }
    if (dashboardGreeting && this.currentUser) {
      dashboardGreeting.textContent = `Bem-vindo, ${this.currentUser.name}. Sistema conectado ao banco de dados.`;
    }

    if (document.getElementById('statTotalHorses')) {
      this.loadStats();
      this.loadDashboardRecent();
    }

    if (document.getElementById('horsesCardsContainer')) {
      this.loadHorses();
    }

    if (document.getElementById('stallsBarnGrid')) {
      this.loadStalls();
    }

    if (document.getElementById('apiResultsGrid')) {
      const q = document.getElementById('apiSearchQuery');
      this.quickSearchApi(q ? q.value : 'qab');
    }
  }

  logout() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('haras_token');
    localStorage.removeItem('haras_user');
    window.location.href = '/login.html';
  }

  setListViewMode(mode) {
    this.listViewMode = mode;
    const btnGrid = document.getElementById('btnToggleGrid');
    const btnTable = document.getElementById('btnToggleTable');
    const cardsContainer = document.getElementById('horsesCardsContainer');
    const tableContainer = document.getElementById('horsesTableContainer');

    if (btnGrid) btnGrid.classList.toggle('active', mode === 'grid');
    if (btnTable) btnTable.classList.toggle('active', mode === 'table');
    if (cardsContainer) cardsContainer.style.display = mode === 'grid' ? 'grid' : 'none';
    if (tableContainer) tableContainer.style.display = mode === 'table' ? 'block' : 'none';
  }

  // --- STATS API ---
  async loadStats() {
    try {
      const res = await fetch('/api/horses/stats', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (!res.ok) return;
      this.stats = await res.json();

      const elTotal = document.getElementById('statTotalHorses');
      const elBays = document.getElementById('statOccupiedBays');
      const elBreeds = document.getElementById('statTotalBreeds');
      const elAge = document.getElementById('statAverageAge');

      if (elTotal) elTotal.textContent = this.stats.totalHorses;
      if (elBays) elBays.textContent = this.stats.occupiedBays;
      if (elBreeds) elBreeds.textContent = this.stats.topBreeds.length;
      if (elAge) elAge.innerHTML = `${this.stats.averageAge} <span style="font-size: 0.9rem; font-weight: normal;">anos</span>`;
    } catch (err) {
      console.error('Erro ao carregar estatisticas:', err);
    }
  }

  async loadDashboardRecent() {
    try {
      const res = await fetch('/api/horses?sort=id_desc', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const container = document.getElementById('dashboardRecentGrid');
      if (!container) return;

      const recent = (data.horses || []).slice(0, 3);
      if (recent.length === 0) {
        container.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem; color: var(--text-muted); background: var(--bg-subtle); border: 1px dashed var(--border-strong);">
            Nenhum cavalo cadastrado ainda no banco de dados. Clique em "Novo Cavalo" para comecar.
          </div>
        `;
        return;
      }
      container.innerHTML = recent.map(h => this.buildHorseCardHtml(h)).join('');
    } catch (err) {
      console.error('Erro ao carregar cavalos recentes:', err);
    }
  }

  // --- CRUD: READ HORSES ---
  async loadHorses() {
    try {
      const searchInput = document.getElementById('filterSearch');
      const raceSelect = document.getElementById('filterRace');
      const sexeSelect = document.getElementById('filterSexe');
      const sortSelect = document.getElementById('filterSort');

      const params = new URLSearchParams();
      if (searchInput && searchInput.value.trim()) params.set('q', searchInput.value.trim());
      if (raceSelect && raceSelect.value) params.set('race', raceSelect.value);
      if (sexeSelect && sexeSelect.value) params.set('sexe', sexeSelect.value);
      if (sortSelect && sortSelect.value) params.set('sort', sortSelect.value);

      const res = await fetch(`/api/horses?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (!res.ok) {
        if (res.status === 401) this.logout();
        return;
      }

      const data = await res.json();
      this.horses = data.horses || [];

      this.populateRaceOptions();
      this.renderHorsesCards();
      this.renderHorsesTable();
    } catch (err) {
      console.error('Erro ao carregar cavalos:', err);
    }
  }

  async loadStalls() {
    try {
      const res = await fetch('/api/horses?sort=baia_asc', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      this.horses = data.horses || [];
      this.renderStallsBarn();
    } catch (err) {
      console.error('Erro ao carregar baias:', err);
    }
  }

  debounceFilter() {
    clearTimeout(this.filterDebounceTimer);
    this.filterDebounceTimer = setTimeout(() => this.loadHorses(), 300);
  }

  populateRaceOptions() {
    const raceSelect = document.getElementById('filterRace');
    if (!raceSelect) return;

    const currentVal = raceSelect.value;
    const uniqueRaces = [...new Set(this.horses.map(h => h.race).filter(Boolean))].sort();

    raceSelect.innerHTML = '<option value="">Todas as Racas</option>';
    uniqueRaces.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      if (r === currentVal) opt.selected = true;
      raceSelect.appendChild(opt);
    });
  }

  // --- RENDER HORSES CARDS (PRETO E BRANCO) ---
  renderHorsesCards() {
    const container = document.getElementById('horsesCardsContainer');
    const emptyState = document.getElementById('horsesEmptyState');
    if (!container) return;

    if (this.horses.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    container.innerHTML = this.horses.map(horse => this.buildHorseCardHtml(horse)).join('');
  }

  buildHorseCardHtml(horse) {
    const currentYear = new Date().getFullYear();
    const age = horse.annee_naissance ? `${currentYear - horse.annee_naissance} anos (${horse.annee_naissance})` : 'Nao informado';

    return `
      <div class="horse-card" data-id="${horse.id}">
        <div class="card-stall-banner">
          <div class="baia-badge">
            ${horse.baia}
          </div>
          <span class="status-pill">${horse.status || 'Ativo'}</span>
        </div>

        <div class="card-body">
          <h3 class="horse-title">${this.escapeHtml(horse.nom)}</h3>
          <div class="horse-race">
            ${this.escapeHtml(horse.race)}
          </div>

          <div class="horse-attributes">
            <div class="attr-item">
              <span class="attr-label">Sexo</span>
              <span class="attr-value">${this.translateGender(horse.sexe)}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Idade / Ano</span>
              <span class="attr-value">${age}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Score</span>
              <span class="attr-value">${horse.score !== null ? Number(horse.score).toFixed(2) : '1.00'}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">ID DB</span>
              <span class="attr-value">#${horse.id}</span>
            </div>
          </div>

          <p class="horse-obs">${horse.observacoes ? this.escapeHtml(horse.observacoes) : 'Sem anotacoes complementares.'}</p>

          <div class="card-footer-actions">
            <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;" onclick="app.viewHorseDetails(${horse.id})">
              Ver Ficha
            </button>
            <div style="display: flex; gap: 0.35rem;">
              <button class="btn-icon edit" title="Editar Cavalo" onclick="app.openHorseModal(${horse.id})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
              <button class="btn-icon delete" title="Excluir Cavalo" onclick="app.confirmDeleteHorse(${horse.id})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- RENDER HORSES TABLE ---
  renderHorsesTable() {
    const tbody = document.getElementById('horsesTableBody');
    if (!tbody) return;

    tbody.innerHTML = this.horses.map(h => {
      return `
        <tr>
          <td><span class="baia-badge">${h.baia}</span></td>
          <td><strong>${this.escapeHtml(h.nom)}</strong></td>
          <td>${this.escapeHtml(h.race)}</td>
          <td>${this.translateGender(h.sexe)}</td>
          <td>${h.annee_naissance || '-'}</td>
          <td><span class="status-pill">${h.status || 'Ativo'}</span></td>
          <td>${h.score !== null ? Number(h.score).toFixed(2) : '1.00'}</td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 0.35rem;">
              <button class="btn-icon" title="Ver Detalhes" onclick="app.viewHorseDetails(${h.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              </button>
              <button class="btn-icon edit" title="Editar" onclick="app.openHorseModal(${h.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              </button>
              <button class="btn-icon delete" title="Excluir" onclick="app.confirmDeleteHorse(${h.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --- RENDER STALLS / BAIAS BARN MAP ---
  renderStallsBarn() {
    const container = document.getElementById('stallsBarnGrid');
    if (!container) return;

    const occupiedMap = new Map();
    let maxId = 0;
    this.horses.forEach(h => {
      occupiedMap.set(h.id, h);
      if (h.id > maxId) maxId = h.id;
    });

    const totalSlots = Math.max(6, maxId + 2);
    let html = '';

    for (let slotId = 1; slotId <= totalSlots; slotId++) {
      const horse = occupiedMap.get(slotId);
      if (horse) {
        html += `
          <div class="stall-box occupied">
            <div>
              <div class="stall-top">
                <span class="stall-number-plaque">BAIA #${slotId}</span>
                <span class="status-pill">Ocupada</span>
              </div>
              <div class="stall-horse-info">
                <h4>${this.escapeHtml(horse.nom)}</h4>
                <p>${this.escapeHtml(horse.race)} | ${this.translateGender(horse.sexe)}</p>
                <p style="margin-top: 0.35rem; font-size: 0.75rem;">Status: ${horse.status || 'Ativo'}</p>
              </div>
            </div>
            <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.75rem; color: var(--text-muted);">ID #${horse.id}</span>
              <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.3rem 0.6rem;" onclick="app.viewHorseDetails(${horse.id})">
                Inspecionar
              </button>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="stall-box empty">
            <div class="stall-number-plaque" style="color: var(--text-muted); margin-bottom: 0.5rem;">BAIA #${slotId}</div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">Disponivel / Vaga</p>
            <a class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; text-decoration: none;" href="/cavalos.html?novo=true">
              + Alocar
            </a>
          </div>
        `;
      }
    }

    container.innerHTML = html;
  }

  // --- CRUD: CREATE / UPDATE MODAL ---
  openHorseModal(horseId = null) {
    const form = document.getElementById('formHorse');
    if (!form) return;
    form.reset();

    if (horseId) {
      const horse = this.horses.find(h => h.id === horseId);
      if (!horse) return;

      document.getElementById('horseModalTitleText').textContent = `Editar Cavalo: ${horse.nom}`;
      document.getElementById('horseEditId').value = horse.id;
      document.getElementById('horseApiId').value = horse.api_id || '';
      document.getElementById('horseNom').value = horse.nom;
      document.getElementById('horseRace').value = horse.race;
      document.getElementById('horseSexe').value = horse.sexe;
      document.getElementById('horseBirthYear').value = horse.annee_naissance || '';
      document.getElementById('horseStatus').value = horse.status || 'Ativo';
      document.getElementById('horseScore').value = horse.score !== null ? horse.score : 1.0;
      document.getElementById('horseObservacoes').value = horse.observacoes || '';
      document.getElementById('stallNoticeDescription').textContent = `Este animal permanecera na ${horse.baia} (ID #${horse.id}).`;
    } else {
      document.getElementById('horseModalTitleText').textContent = 'Cadastrar Novo Cavalo';
      document.getElementById('horseEditId').value = '';
      document.getElementById('horseApiId').value = '';
      document.getElementById('horseScore').value = '1.0';
      document.getElementById('stallNoticeDescription').textContent = 'Ao salvar, este animal recebera automaticamente a respectiva Baia vinculada ao seu proximo ID no banco de dados.';
    }

    const backdrop = document.getElementById('horseModalBackdrop');
    if (backdrop) backdrop.classList.add('active');
  }

  closeHorseModal() {
    const backdrop = document.getElementById('horseModalBackdrop');
    if (backdrop) backdrop.classList.remove('active');
  }

  async handleHorseSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('horseEditId').value;
    const isEdit = Boolean(editId);

    const payload = {
      nom: document.getElementById('horseNom').value.trim(),
      race: document.getElementById('horseRace').value.trim(),
      sexe: document.getElementById('horseSexe').value,
      annee_naissance: document.getElementById('horseBirthYear').value || null,
      status: document.getElementById('horseStatus').value,
      score: document.getElementById('horseScore').value || 1.0,
      observacoes: document.getElementById('horseObservacoes').value.trim(),
      api_id: document.getElementById('horseApiId').value || null
    };

    try {
      const url = isEdit ? `/api/horses/${editId}` : '/api/horses';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        return this.toast(data.error || 'Erro ao salvar animal', 'error');
      }

      this.toast(data.message || 'Registro gravado com sucesso no banco de dados!', 'success');
      this.closeHorseModal();

      if (window.location.pathname.endsWith('/equides.html')) {
        setTimeout(() => {
          window.location.href = '/cavalos.html';
        }, 1200);
        return;
      }

      await this.loadHorses();
    } catch (err) {
      this.toast('Falha ao comunicar com o servidor', 'error');
    }
  }

  // --- CRUD: DELETE MODAL ---
  confirmDeleteHorse(horseId) {
    const horse = this.horses.find(h => h.id === horseId);
    if (!horse) return;

    this.horseToDelete = horse;
    document.getElementById('deleteHorseName').textContent = horse.nom;
    document.getElementById('deleteHorseBaia').textContent = horse.baia;

    document.getElementById('btnConfirmDelete').onclick = () => this.executeDeleteHorse();
    document.getElementById('deleteModalBackdrop').classList.add('active');
  }

  closeDeleteModal() {
    this.horseToDelete = null;
    document.getElementById('deleteModalBackdrop').classList.remove('active');
  }

  async executeDeleteHorse() {
    if (!this.horseToDelete) return;
    try {
      const res = await fetch(`/api/horses/${this.horseToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        return this.toast(data.error || 'Erro ao excluir cavalo', 'error');
      }

      this.toast(data.message || 'Cavalo excluido com sucesso.', 'info');
      this.closeDeleteModal();
      await this.loadHorses();
    } catch (err) {
      this.toast('Falha ao excluir cavalo', 'error');
    }
  }

  // --- HORSE DETAILS MODAL ---
  async viewHorseDetails(horseId) {
    let horse = this.horses.find(h => h.id === horseId);
    if (!horse) {
      try {
        const res = await fetch(`/api/horses/${horseId}`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (res.ok) {
          const d = await res.json();
          horse = d.horse;
        }
      } catch {}
    }
    if (!horse) return;

    const currentYear = new Date().getFullYear();
    const age = horse.annee_naissance ? `${currentYear - horse.annee_naissance} anos` : 'Nao registrado';

    const content = `
      <div style="background: var(--bg-subtle); border: 1px solid var(--border-strong); padding: 1.25rem; margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
          <div>
            <span class="baia-badge" style="font-size: 0.85rem; padding: 0.25rem 0.6rem;">
              ${horse.baia}
            </span>
            <h2 style="font-size: 1.4rem; margin-top: 0.5rem; text-transform: uppercase;">${this.escapeHtml(horse.nom)}</h2>
          </div>
          <span class="status-pill" style="font-size: 0.8rem; padding: 0.2rem 0.6rem;">
            ${horse.status || 'Ativo'}
          </span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; margin-top: 1rem;">
          <div>
            <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Raca Oficial</span>
            <div style="font-size: 0.95rem; font-weight: 700;">${this.escapeHtml(horse.race)}</div>
          </div>
          <div>
            <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Sexo / Categoria</span>
            <div style="font-size: 0.95rem; font-weight: 700;">${this.translateGender(horse.sexe)}</div>
          </div>
          <div>
            <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Ano / Idade</span>
            <div style="font-size: 0.95rem; font-weight: 700;">${horse.annee_naissance || '-'} (${age})</div>
          </div>
          <div>
            <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Score Genealogico</span>
            <div style="font-size: 0.95rem; font-weight: 700;">${horse.score !== null ? Number(horse.score).toFixed(3) : '1.000'}</div>
          </div>
        </div>

        ${horse.api_id ? `
          <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-subtle); font-size: 0.8rem;">
            <strong>Registro Oficial da API:</strong> <code>${this.escapeHtml(horse.api_id)}</code>
          </div>
        ` : ''}
      </div>

      <div style="margin-bottom: 1rem;">
        <h4 style="font-size: 0.85rem; text-transform: uppercase; margin-bottom: 0.4rem;">Anotacoes & Ficha Medica:</h4>
        <div style="background: var(--bg-main); border: 1px solid var(--border-strong); padding: 0.85rem; font-size: 0.85rem; line-height: 1.5;">
          ${horse.observacoes ? this.escapeHtml(horse.observacoes) : 'Nenhuma observacao informada.'}
        </div>
      </div>
    `;

    document.getElementById('horseDetailsContent').innerHTML = content;
    const btnEdit = document.getElementById('btnEditFromDetails');
    if (btnEdit) {
      btnEdit.onclick = () => {
        this.closeDetailsModal();
        this.openHorseModal(horse.id);
      };
    }
    document.getElementById('horseDetailsModalBackdrop').classList.add('active');
  }

  closeDetailsModal() {
    const backdrop = document.getElementById('horseDetailsModalBackdrop');
    if (backdrop) backdrop.classList.remove('active');
  }

  // --- EQUIDES API SEARCH & IMPORT ---
  quickSearchApi(term) {
    const q = document.getElementById('apiSearchQuery');
    if (q) q.value = term;
    this.searchEquidesApi();
  }

  async searchEquidesApi(e) {
    if (e) e.preventDefault();
    const queryInput = document.getElementById('apiSearchQuery');
    if (!queryInput) return;
    const query = queryInput.value.trim();
    if (!query) return;

    const btn = document.getElementById('btnApiSearch');
    const container = document.getElementById('apiResultsGrid');
    const countLabel = document.getElementById('apiResultCount');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'Consultando...';
    }
    if (countLabel) countLabel.textContent = 'Buscando registros na base...';

    try {
      const res = await fetch(`/api/equides/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      const results = data.resultats || [];
      if (countLabel) countLabel.textContent = `${results.length} registros encontrados para "${query}"`;

      if (results.length === 0) {
        if (container) {
          container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
              <div class="empty-state-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <h3>Nenhum resultado na API Equides</h3>
              <p>Tente buscar por termos como "qab", "camargue", "arabe" ou "poney".</p>
            </div>
          `;
        }
        return;
      }

      if (container) {
        container.innerHTML = results.map(item => `
          <div class="api-result-card">
            <div>
              <div class="api-result-header">
                <span class="api-official-id">ID: ${item.id}</span>
                <span style="font-size: 0.75rem; font-weight: 700;">Score: ${item.score ? Number(item.score).toFixed(2) : '1.0'}</span>
              </div>
              <h4 style="font-size: 1.05rem; font-weight: 800; text-transform: uppercase; margin-bottom: 0.35rem;">
                ${this.escapeHtml(item.nom)}
              </h4>
              <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.75rem;">
                ${this.escapeHtml(item.race)}
              </div>
              <div style="display: flex; gap: 1rem; font-size: 0.8rem; margin-bottom: 1rem;">
                <span><strong>Sexo:</strong> ${this.translateGender(item.sexe)}</span>
                <span><strong>Nasc:</strong> ${item.annee_naissance || 'N/A'}</span>
              </div>
            </div>
            <button class="btn btn-primary btn-block" style="font-size: 0.8rem; padding: 0.55rem 0.85rem;" onclick='app.importFromApi(${JSON.stringify(item)})'>
              Importar para Minhas Baias
            </button>
          </div>
        `).join('');
      }

    } catch (err) {
      if (countLabel) countLabel.textContent = 'Erro ao consultar API';
      this.toast('Nao foi possivel obter resposta da API', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Pesquisar';
      }
    }
  }

  importFromApi(apiItem) {
    this.openHorseModal();
    document.getElementById('horseModalTitleText').textContent = 'Confirmar Importacao para o Haras';
    document.getElementById('horseNom').value = apiItem.nom || '';
    document.getElementById('horseRace').value = apiItem.race || '';
    document.getElementById('horseSexe').value = apiItem.sexe || 'Male';
    document.getElementById('horseBirthYear').value = apiItem.annee_naissance || '';
    document.getElementById('horseScore').value = apiItem.score !== undefined ? apiItem.score : 1.0;
    document.getElementById('horseApiId').value = apiItem.id || '';
    document.getElementById('horseObservacoes').value = `Importado do Registro Oficial Equides. API ID: ${apiItem.id}`;
    
    this.toast(`Dados de "${apiItem.nom}" carregados. Salve para alocar na proxima Baia.`, 'info');
  }

  // --- HELPERS ---
  translateGender(sexe) {
    if (!sexe) return 'Indefinido';
    const s = sexe.toLowerCase();
    if (s === 'male') return 'Macho (Garanhao)';
    if (s === 'femelle') return 'Femea (Egua)';
    if (s === 'hongre') return 'Castrado (Hongre)';
    return sexe;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }
}

// Inicializa no carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
  window.app = new HarasApp();
});
