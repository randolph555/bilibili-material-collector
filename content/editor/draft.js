// 草稿管理模块
const DraftManager = {
  STORAGE_KEY: 'bm-drafts',
  MAX_DRAFTS: 10,

  // 获取状态引用
  get state() {
    return EditorState;
  },

  // 获取所有草稿
  getAll() {
    return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
  },

  // 保存草稿
  save() {
    const state = this.state;
    
    const draft = {
      id: 'draft-' + Date.now(),
      createTime: Date.now(),
      timeline: state.timeline,
      currentVideo: state.currentVideo
    };

    const drafts = this.getAll();
    drafts.unshift(draft);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(drafts.slice(0, this.MAX_DRAFTS)));

    MaterialUI.showToast('草稿已保存');
    return draft;
  },

  // 加载草稿
  load(draft) {
    const state = this.state;
    
    if (!draft.timeline || !draft.currentVideo) {
      MaterialUI.showToast('草稿数据无效', 'error');
      return false;
    }

    state.timeline = draft.timeline;
    TimelineManager.recalculate();
    TimelineManager.render();
    TimelineManager.updateActiveClipFromPlayhead();

    MaterialUI.showToast('草稿已加载');
    return true;
  },

  // 删除草稿
  delete(index) {
    const drafts = this.getAll();
    drafts.splice(index, 1);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(drafts));
    MaterialUI.showToast('草稿已删除');
  },

  // 显示草稿列表弹窗
  showList() {
    const drafts = this.getAll();

    if (drafts.length === 0) {
      MaterialUI.showToast('暂无保存的草稿', 'info');
      return;
    }

    let modal = document.getElementById('bm-draft-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bm-draft-modal';
      modal.className = 'bm-modal-overlay';
      document.body.appendChild(modal);
    }

    const formatDate = (timestamp) => {
      const date = new Date(timestamp);
      return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    modal.innerHTML = `
      <div class="bm-modal">
        <div class="bm-modal-header">
          <span>选择草稿</span>
          <button class="bm-modal-close" id="bm-close-draft-modal">×</button>
        </div>
        <div class="bm-modal-body">
          <div class="bm-draft-list">
            ${drafts.map((draft, index) => `
              <div class="bm-draft-item" data-index="${index}">
                <div class="bm-draft-info">
                  <div class="bm-draft-title">${draft.currentVideo?.title || '未命名草稿'}</div>
                  <div class="bm-draft-meta">
                    <span>${formatDate(draft.createTime)}</span>
                    <span>·</span>
                    <span>${draft.timeline?.length || 0} 个片段</span>
                  </div>
                </div>
                <div class="bm-draft-actions">
                  <button class="bm-btn bm-btn-sm bm-load-draft-btn" data-index="${index}">加载</button>
                  <button class="bm-btn bm-btn-sm bm-delete-draft-btn" data-index="${index}">删除</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    // 绑定事件
    document.getElementById('bm-close-draft-modal')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal.querySelectorAll('.bm-load-draft-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.load(drafts[index]);
        modal.style.display = 'none';
      });
    });

    modal.querySelectorAll('.bm-delete-draft-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.delete(index);
        this.showList(); // 刷新列表
      });
    });

    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }
};

// 导出
window.DraftManager = DraftManager;
