// UI 注入和面板管理
const MaterialUI = {
  panel: null,
  isOpen: false,
  currentTab: 'current', // current, library, search

  // 初始化 UI
  init() {
    this.createPanel();
    this.createFloatButton();
    this.bindEvents();
  },

  // 创建悬浮按钮
  createFloatButton() {
    const btn = document.createElement('div');
    btn.id = 'bili-material-float-btn';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
    `;
    btn.title = '素材收集助手';
    document.body.appendChild(btn);

    btn.addEventListener('click', () => this.toggle());
  },

  // 创建主面板
  createPanel() {
    const panel = document.createElement('div');
    panel.id = 'bili-material-panel';
    panel.innerHTML = `
      <div class="bm-panel-header">
        <div class="bm-panel-title">B站素材助手</div>
        <div class="bm-panel-actions">
          <button class="bm-btn-icon" id="bm-export-btn" title="导出数据">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          </button>
          <button class="bm-btn-icon" id="bm-close-btn" title="关闭">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>
      <div class="bm-panel-tabs">
        <button class="bm-tab active" data-tab="current">当前视频</button>
        <button class="bm-tab" data-tab="library">素材库 <span id="bm-lib-count">0</span></button>
        <button class="bm-tab" data-tab="search">搜索</button>
      </div>
      <div class="bm-panel-content">
        <div class="bm-tab-content active" id="bm-tab-current"></div>
        <div class="bm-tab-content" id="bm-tab-library"></div>
        <div class="bm-tab-content" id="bm-tab-search"></div>
      </div>
    `;
    document.body.appendChild(panel);
    this.panel = panel;
  },

  // 绑定事件
  bindEvents() {
    // 关闭按钮
    document.getElementById('bm-close-btn').addEventListener('click', () => this.close());

    // 导出按钮
    document.getElementById('bm-export-btn').addEventListener('click', () => this.exportData());

    // Tab 切换
    this.panel.querySelectorAll('.bm-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.currentTarget.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // 监听来自 background 的消息
    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === 'TOGGLE_PANEL') {
        this.toggle();
      }
    });
  },

  // 切换 Tab
  switchTab(tabName) {
    this.currentTab = tabName;

    // 更新 tab 按钮状态
    this.panel.querySelectorAll('.bm-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // 更新内容区域
    this.panel.querySelectorAll('.bm-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `bm-tab-${tabName}`);
    });

    // 加载对应内容
    if (tabName === 'current') {
      this.loadCurrentVideo();
    } else if (tabName === 'library') {
      this.loadLibrary();
    } else if (tabName === 'search') {
      this.loadSearchPanel();
    }
  },

  // 加载当前视频信息
  async loadCurrentVideo() {
    const container = document.getElementById('bm-tab-current');
    const bvid = BiliAPI.extractBvid(location.href);

    if (!bvid) {
      container.innerHTML = '<div class="bm-empty">请在视频页面使用</div>';
      return;
    }

    container.innerHTML = '<div class="bm-loading">加载中...</div>';

    try {
      // 优先从页面获取，失败则调用 API
      let videoInfo = BiliAPI.getVideoInfoFromPage();
      if (!videoInfo.bvid) {
        videoInfo = await BiliAPI.getVideoInfo(bvid);
      }

      const isSaved = await MaterialStorage.isMaterialSaved(bvid);

      container.innerHTML = `
        <div class="bm-video-card">
          <div class="bm-video-cover">
            <img src="${videoInfo.cover}" alt="${videoInfo.title}">
            <span class="bm-video-duration">${BiliAPI.formatDuration(videoInfo.duration)}</span>
          </div>
          <div class="bm-video-info">
            <div class="bm-video-title">${videoInfo.title}</div>
            <div class="bm-video-author">UP: ${videoInfo.owner?.name || '未知'}</div>
            <div class="bm-video-stats">
              <span>播放 ${BiliAPI.formatNumber(videoInfo.stat?.view)}</span>
              <span>点赞 ${BiliAPI.formatNumber(videoInfo.stat?.like)}</span>
              <span>收藏 ${BiliAPI.formatNumber(videoInfo.stat?.favorite)}</span>
            </div>
          </div>
        </div>
        <div class="bm-actions">
          <button class="bm-btn bm-btn-primary" id="bm-save-btn" ${isSaved ? 'disabled' : ''}>
            ${isSaved ? '已收藏' : '收藏到素材库'}
          </button>
          <button class="bm-btn" id="bm-edit-btn">编辑视频</button>
        </div>
        <div class="bm-video-tags" id="bm-video-tags">
          <div class="bm-tag-label">添加标签:</div>
          <input type="text" class="bm-tag-input" id="bm-tag-input" placeholder="输入标签后回车">
          <div class="bm-tags-list" id="bm-tags-list"></div>
        </div>
      `;

      // 绑定收藏按钮
      document.getElementById('bm-save-btn').addEventListener('click', async () => {
        await this.saveCurrentVideo(videoInfo);
      });

      // 绑定编辑按钮
      document.getElementById('bm-edit-btn').addEventListener('click', async () => {
        VideoEditor.openEditor(videoInfo);
      });

      // 绑定标签输入
      document.getElementById('bm-tag-input').addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && e.target.value.trim()) {
          await MaterialStorage.addTag(e.target.value.trim());
          e.target.value = '';
          this.loadTags();
        }
      });

      this.loadTags();

    } catch (error) {
      container.innerHTML = `<div class="bm-error">加载失败: ${error.message}</div>`;
    }
  },

  // 加载标签列表
  async loadTags() {
    const container = document.getElementById('bm-tags-list');
    if (!container) return;

    const tags = await MaterialStorage.getAllTags();
    container.innerHTML = tags.map(tag => `
      <span class="bm-tag" style="background: ${tag.color}">${tag.name}</span>
    `).join('');
  },

  // 保存当前视频
  async saveCurrentVideo(videoInfo) {
    try {
      await MaterialStorage.addMaterial(videoInfo);
      const btn = document.getElementById('bm-save-btn');
      btn.textContent = '已收藏';
      btn.disabled = true;
      this.updateLibraryCount();
      this.showToast('收藏成功');
    } catch (error) {
      this.showToast('收藏失败: ' + error.message, 'error');
    }
  },

  // 下载视频
  async downloadVideo(videoInfo) {
    const btn = document.getElementById('bm-download-btn');
    btn.textContent = '获取下载地址...';
    btn.disabled = true;

    try {
      const result = await BiliAPI.getPlayUrl(videoInfo.bvid, videoInfo.cid);

      if (result.success && result.data) {
        const { data } = result;

        if (data.type === 'dash' && data.video) {
          // 下载视频流
          const filename = `${videoInfo.title.replace(/[\\/:*?"<>|]/g, '_')}.mp4`;
          chrome.runtime.sendMessage({
            type: 'DOWNLOAD_VIDEO',
            url: data.video.url,
            filename: filename,
            referer: 'https://www.bilibili.com/'
          });
          this.showToast('开始下载视频（仅画面）');
        } else if (data.type === 'flv') {
          const filename = `${videoInfo.title.replace(/[\\/:*?"<>|]/g, '_')}.flv`;
          chrome.runtime.sendMessage({
            type: 'DOWNLOAD_VIDEO',
            url: data.url,
            filename: filename,
            referer: 'https://www.bilibili.com/'
          });
          this.showToast('开始下载视频');
        }
      } else {
        throw new Error('获取下载地址失败');
      }
    } catch (error) {
      this.showToast('下载失败: ' + error.message, 'error');
    } finally {
      btn.textContent = '下载视频';
      btn.disabled = false;
    }
  },

  // 加载素材库
  async loadLibrary() {
    const container = document.getElementById('bm-tab-library');
    container.innerHTML = '<div class="bm-loading">加载中...</div>';

    try {
      const materials = await MaterialStorage.getAllMaterials({ sortBy: 'addTime', order: 'desc' });

      if (materials.length === 0) {
        container.innerHTML = '<div class="bm-empty">素材库为空，去收藏一些视频吧</div>';
        return;
      }

      container.innerHTML = `
        <div class="bm-library-header">
          <input type="text" class="bm-search-input" id="bm-lib-search" placeholder="搜索素材...">
        </div>
        <div class="bm-library-list" id="bm-library-list">
          ${materials.map(m => this.renderMaterialItem(m)).join('')}
        </div>
      `;

      // 搜索功能
      document.getElementById('bm-lib-search').addEventListener('input', async (e) => {
        const keyword = e.target.value.trim();
        const filtered = await MaterialStorage.getAllMaterials({
          sortBy: 'addTime',
          order: 'desc',
          search: keyword
        });
        document.getElementById('bm-library-list').innerHTML =
          filtered.map(m => this.renderMaterialItem(m)).join('');
        this.bindLibraryItemEvents();
      });

      this.bindLibraryItemEvents();

    } catch (error) {
      container.innerHTML = `<div class="bm-error">加载失败: ${error.message}</div>`;
    }
  },

  // 渲染素材项
  renderMaterialItem(material) {
    return `
      <div class="bm-material-item" data-bvid="${material.bvid}">
        <div class="bm-material-cover">
          <img src="${material.cover}" alt="${material.title}">
          <span class="bm-video-duration">${BiliAPI.formatDuration(material.duration)}</span>
        </div>
        <div class="bm-material-info">
          <div class="bm-material-title">${material.title}</div>
          <div class="bm-material-author">UP: ${material.owner?.name || '未知'}</div>
          <div class="bm-material-meta">
            <span>播放 ${BiliAPI.formatNumber(material.stat?.view)}</span>
            <span>收藏于 ${new Date(material.addTime).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="bm-material-actions">
          <button class="bm-btn-icon bm-open-btn" title="打开视频">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
          </button>
          <button class="bm-btn-icon bm-delete-btn" title="删除">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `;
  },

  // 绑定素材库项目事件
  bindLibraryItemEvents() {
    document.querySelectorAll('.bm-material-item').forEach(item => {
      const bvid = item.dataset.bvid;

      item.querySelector('.bm-open-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(`https://www.bilibili.com/video/${bvid}`, '_blank');
      });

      item.querySelector('.bm-delete-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确定删除这个素材吗？')) {
          await MaterialStorage.removeMaterial(bvid);
          item.remove();
          this.updateLibraryCount();
          this.showToast('已删除');
        }
      });

      item.addEventListener('click', () => {
        window.open(`https://www.bilibili.com/video/${bvid}`, '_blank');
      });
    });
  },

  // 加载搜索面板
  loadSearchPanel() {
    const container = document.getElementById('bm-tab-search');
    container.innerHTML = `
      <div class="bm-search-header">
        <input type="text" class="bm-search-input" id="bm-search-keyword" placeholder="搜索B站视频...">
        <button class="bm-btn bm-btn-primary" id="bm-search-btn">搜索</button>
      </div>
      <div class="bm-search-results" id="bm-search-results"></div>
    `;

    const searchBtn = document.getElementById('bm-search-btn');
    const searchInput = document.getElementById('bm-search-keyword');

    const doSearch = async () => {
      const keyword = searchInput.value.trim();
      if (!keyword) return;

      const resultsContainer = document.getElementById('bm-search-results');
      resultsContainer.innerHTML = '<div class="bm-loading">搜索中...</div>';

      try {
        const result = await BiliAPI.searchVideos(keyword);
        if (result.list.length === 0) {
          resultsContainer.innerHTML = '<div class="bm-empty">没有找到相关视频</div>';
          return;
        }

        resultsContainer.innerHTML = result.list.map(video => `
          <div class="bm-search-item" data-bvid="${video.bvid}">
            <div class="bm-material-cover">
              <img src="${video.cover}" alt="${video.title}">
              <span class="bm-video-duration">${video.duration}</span>
              <div class="bm-cover-play" data-video='${JSON.stringify(video).replace(/'/g, "\\'")}'>▶</div>
            </div>
            <div class="bm-material-info">
              <div class="bm-material-title">${video.title}</div>
              <div class="bm-material-author">UP: ${video.owner?.name || '未知'}</div>
              <div class="bm-material-meta">
                <span>播放 ${BiliAPI.formatNumber(video.stat?.view)}</span>
              </div>
            </div>
            <div class="bm-material-actions">
              <button class="bm-btn-sm bm-quick-save" data-video='${JSON.stringify(video).replace(/'/g, "\\'")}'>收藏</button>
              <button class="bm-btn-sm bm-quick-edit" data-video='${JSON.stringify(video).replace(/'/g, "\\'")}'>编辑</button>
            </div>
          </div>
        `).join('');

        // 绑定快速收藏
        resultsContainer.querySelectorAll('.bm-quick-save').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const videoData = JSON.parse(btn.dataset.video);
            await MaterialStorage.addMaterial(videoData);
            btn.textContent = '已收藏';
            btn.disabled = true;
            this.updateLibraryCount();
            this.showToast('收藏成功');
          });
        });

        // 绑定快速编辑
        resultsContainer.querySelectorAll('.bm-quick-edit').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const videoData = JSON.parse(btn.dataset.video);
            // 需要获取 cid
            try {
              const fullInfo = await BiliAPI.getVideoInfo(videoData.bvid);
              VideoEditor.openEditor(fullInfo);
            } catch (err) {
              this.showToast('获取视频信息失败', 'error');
            }
          });
        });

        // 绑定封面播放按钮
        resultsContainer.querySelectorAll('.bm-cover-play').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const videoData = JSON.parse(btn.dataset.video);
            try {
              const fullInfo = await BiliAPI.getVideoInfo(videoData.bvid);
              VideoEditor.openEditor(fullInfo);
            } catch (err) {
              this.showToast('获取视频信息失败', 'error');
            }
          });
        });

        // 点击打开视频
        resultsContainer.querySelectorAll('.bm-search-item').forEach(item => {
          item.addEventListener('click', (e) => {
            // 如果点击的是按钮区域，不跳转
            if (e.target.closest('.bm-material-actions') || e.target.closest('.bm-cover-play')) return;
            window.open(`https://www.bilibili.com/video/${item.dataset.bvid}`, '_blank');
          });
        });

      } catch (error) {
        resultsContainer.innerHTML = `<div class="bm-error">搜索失败: ${error.message}</div>`;
      }
    };

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
  },

  // 更新素材库数量
  async updateLibraryCount() {
    const count = await MaterialStorage.getMaterialCount();
    document.getElementById('bm-lib-count').textContent = count;
  },

  // 导出数据
  async exportData() {
    try {
      const data = await MaterialStorage.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bili-materials-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('导出成功');
    } catch (error) {
      this.showToast('导出失败: ' + error.message, 'error');
    }
  },

  // 显示提示
  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `bm-toast bm-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  },

  // 打开面板
  open() {
    this.panel.classList.add('open');
    this.isOpen = true;
    this.switchTab(this.currentTab);
    this.updateLibraryCount();
  },

  // 关闭面板
  close() {
    this.panel.classList.remove('open');
    this.isOpen = false;
  },

  // 切换面板
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
};

// 导出到全局
window.MaterialUI = MaterialUI;
