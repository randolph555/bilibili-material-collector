// 事件绑定模块
const EditorEvents = {
  keydownHandler: null,

  // 获取状态引用
  get state() {
    return EditorState;
  },

  // 绑定所有编辑器事件
  bindAll() {
    this.bindHeaderEvents();
    this.bindSidebarEvents();
    this.bindTimelineEvents();
    this.bindKeyboardEvents();
    this.bindTrackEvents();
    this.bindPlayerControlEvents();
  },

  // 绑定头部按钮事件
  bindHeaderEvents() {
    // 返回按钮
    document.getElementById('bm-editor-back')?.addEventListener('click', () => {
      VideoEditor.close();
    });

    // 保存草稿
    document.getElementById('bm-save-draft')?.addEventListener('click', () => {
      DraftManager.save();
    });

    // 加载草稿
    document.getElementById('bm-load-draft')?.addEventListener('click', () => {
      DraftManager.showList();
    });

    // 下载视频
    document.getElementById('bm-download-video')?.addEventListener('click', () => {
      MediaLoader.download('video');
    });

    // 下载音频
    document.getElementById('bm-download-audio')?.addEventListener('click', () => {
      MediaLoader.download('audio');
    });

    // 导出脚本
    document.getElementById('bm-export-script')?.addEventListener('click', () => {
      ExportManager.exportScript();
    });
  },

  // 绑定侧边栏事件
  bindSidebarEvents() {
    // Tab 切换
    document.querySelectorAll('.bm-sidebar-tabs .bm-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.bm-sidebar-tabs .bm-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.bm-tab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`bm-panel-${tabName}`)?.classList.add('active');
      });
    });

    // 加载素材列表
    this.loadMaterialsList();

    // 搜索功能
    document.getElementById('bm-editor-search-btn')?.addEventListener('click', () => {
      this.searchVideos();
    });
    document.getElementById('bm-editor-search-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.searchVideos();
    });
  },

  // 绑定时间轴控制事件
  bindTimelineEvents() {
    // 播放/暂停
    document.getElementById('bm-play-btn')?.addEventListener('click', () => {
      PlayerController.togglePlay();
    });

    // 停止
    document.getElementById('bm-stop-btn')?.addEventListener('click', () => {
      PlayerController.stop();
    });

    // 切割
    document.getElementById('bm-scissor-btn')?.addEventListener('click', () => {
      const result = TimelineManager.cutAtPlayhead();
      if (result.success) {
        TimelineManager.selectClip(result.newClip.id);
        EditorUI.updatePropertiesPanel(result.newClip.id);
        MaterialUI.showToast(result.message);
      } else {
        MaterialUI.showToast(result.message, 'error');
      }
    });

    // 删除
    document.getElementById('bm-delete-btn')?.addEventListener('click', () => {
      const state = this.state;
      if (state.selectedClipIds.length === 0 && !state.selectedClipId) {
        MaterialUI.showToast('请先选中要删除的片段', 'error');
        return;
      }
      
      // 多选删除
      if (state.selectedClipIds.length > 1) {
        const result = TimelineManager.deleteSelectedClips();
        if (result.success) {
          EditorUI.updatePropertiesPanel(null);
          MaterialUI.showToast(result.message);
        }
      } else {
        // 单个删除
        const result = TimelineManager.deleteClip(state.selectedClipId);
        if (result.success) {
          EditorUI.updatePropertiesPanel(null);
          MaterialUI.showToast(result.message);
        }
      }
    });

    // 撤销
    document.getElementById('bm-undo-btn')?.addEventListener('click', () => {
      if (this.state.undo()) {
        TimelineManager.recalculate();
        TimelineManager.render(true); // 撤销时立即渲染
        TimelineManager.updateActiveClipFromPlayhead();
        MaterialUI.showToast('已撤销');
      } else {
        MaterialUI.showToast('没有可撤销的操作', 'info');
      }
    });

    // 重做
    document.getElementById('bm-redo-btn')?.addEventListener('click', () => {
      if (this.state.redo()) {
        TimelineManager.recalculate();
        TimelineManager.render(true); // 重做时立即渲染
        TimelineManager.updateActiveClipFromPlayhead();
        MaterialUI.showToast('已重做');
      } else {
        MaterialUI.showToast('没有可重做的操作', 'info');
      }
    });
    
    // 添加轨道
    document.getElementById('bm-add-track-btn')?.addEventListener('click', () => {
      TimelineManager.addTrack();
      // 重新绑定轨道事件
      this.state.trackEventsBindded = false;
      this.bindTrackEvents();
    });
    
    // 时间轴缩放
    document.getElementById('bm-zoom-in')?.addEventListener('click', () => {
      TimelineManager.setZoom(this.state.timelineZoom * 1.5);
    });
    
    document.getElementById('bm-zoom-out')?.addEventListener('click', () => {
      TimelineManager.setZoom(this.state.timelineZoom / 1.5);
    });
    
    document.getElementById('bm-zoom-fit')?.addEventListener('click', () => {
      TimelineManager.setZoom(1);
    });
    
    // 吸附开关
    document.getElementById('bm-snap-toggle')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      this.state.snapEnabled = !this.state.snapEnabled;
      btn.classList.toggle('active', this.state.snapEnabled);
      btn.title = `吸附对齐 (${this.state.snapEnabled ? '开启' : '关闭'})`;
      MaterialUI.showToast(`吸附对齐已${this.state.snapEnabled ? '开启' : '关闭'}`);
    });

    // 设置裁剪起点 - 使用 TimeController 获取时间轴时间
    document.getElementById('bm-set-clip-start')?.addEventListener('click', () => {
      document.getElementById('bm-clip-start').value =
        BiliAPI.formatDuration(Math.floor(TimeController.currentTime));
    });

    // 设置裁剪终点 - 使用 TimeController 获取时间轴时间
    document.getElementById('bm-set-clip-end')?.addEventListener('click', () => {
      document.getElementById('bm-clip-end').value =
        BiliAPI.formatDuration(Math.floor(TimeController.currentTime));
    });
  },

  // 绑定轨道点击事件（使用事件委托，支持动态轨道）
  bindTrackEvents() {
    const state = this.state;
    if (state.trackEventsBindded) return;
    state.trackEventsBindded = true;

    // 使用事件委托，绑定到时间轴容器
    const timelineBody = document.querySelector('.bm-timeline-body');
    if (timelineBody) {
      timelineBody.addEventListener('click', async (e) => {
        // 检查是否点击了轨道内容或刻度尺
        const trackContent = e.target.closest('.bm-track-content');
        const ruler = e.target.closest('#bm-timeline-ruler');
        
        if (trackContent || ruler) {
          await this.handleTrackClick(e, trackContent || ruler);
        }
      });
      
      // 时间轴滚轮缩放
      timelineBody.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? 0.8 : 1.25;
          TimelineManager.setZoom(state.timelineZoom * delta);
        }
      }, { passive: false });
    }
    
    // 播放头拖动
    this.bindPlayheadDrag();
  },

  // 处理轨道点击
  async handleTrackClick(e, element) {
    const state = this.state;
    if (state.timelineDuration <= 0) return;

    const clipEl = e.target.closest('.bm-timeline-clip');
    if (clipEl) {
      let clipId = clipEl.id;
      if (clipId.endsWith('-audio')) {
        clipId = clipEl.dataset.clipId || clipId.replace('-audio', '');
      }
      
      const trackIndex = parseInt(clipEl.dataset.trackIndex) || 0;
      const addToSelection = e.shiftKey; // Shift键多选
      
      TimelineManager.selectClip(clipId, trackIndex, addToSelection);
      
      // 多选时显示多选信息，单选时显示片段属性
      if (state.selectedClipIds.length > 1) {
        EditorUI.updateMultiSelectPanel();
      } else {
        EditorUI.updatePropertiesPanel(clipId);
      }

      // 计算点击在片段内的位置（仅单选时跳转）
      if (!addToSelection) {
        const found = state.findClipById(clipId);
        if (found) {
          const clip = found.clip;
          const clipRect = clipEl.getBoundingClientRect();
          const clickXInClip = e.clientX - clipRect.left;
          const percentInClip = Math.max(0, Math.min(1, clickXInClip / clipRect.width));
          const clipDuration = clip.sourceEnd - clip.sourceStart;
          const timeInClip = percentInClip * clipDuration;
          const timelineTime = clip.timelineStart + timeInClip;
          
          await PlayerController.seekToTime(timelineTime);
        }
      }
      return;
    }

    // 点击空白区域 - 清除选中
    TimelineManager.clearSelection();
    EditorUI.updatePropertiesPanel(null);
    
    // 用轨道内容计算时间（更精确）
    const trackContent = document.querySelector('.bm-track-content');
    if (!trackContent) return;
    
    const rect = trackContent.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const timelineTime = percent * state.timelineDuration;

    await PlayerController.seekToTime(timelineTime);
  },

  // 绑定播放头拖动
  bindPlayheadDrag() {
    const playhead = document.getElementById('bm-playhead');
    if (!playhead) return;
    
    let isDragging = false;
    
    playhead.style.cursor = 'ew-resize';
    playhead.style.pointerEvents = 'auto';
    
    const onMouseDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    };
    
    const onMouseMove = async (e) => {
      if (!isDragging) return;
      
      const trackContent = document.querySelector('.bm-track-content');
      if (!trackContent) return;
      
      const rect = trackContent.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const timelineTime = percent * this.state.timelineDuration;
      
      await PlayerController.seekToTime(timelineTime);
    };
    
    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    
    playhead.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  },

  // 剪贴板（用于复制粘贴）
  clipboard: null,

  // 绑定键盘事件
  bindKeyboardEvents() {
    this.keydownHandler = (e) => {
      // ESC 关闭编辑器
      if (e.key === 'Escape') {
        VideoEditor.close();
        return;
      }

      // 输入框中不响应快捷键
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Ctrl/Cmd + Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('bm-undo-btn')?.click();
        return;
      }

      // Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        document.getElementById('bm-redo-btn')?.click();
        return;
      }
      
      // Ctrl/Cmd + C 复制片段
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        this.copySelectedClip();
        return;
      }
      
      // Ctrl/Cmd + V 粘贴片段
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        this.pasteClip();
        return;
      }
      
      // Ctrl/Cmd + D 复制并粘贴（快速复制）
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        this.duplicateSelectedClip();
        return;
      }

      // Delete/Backspace 删除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        document.getElementById('bm-delete-btn')?.click();
        return;
      }

      // C 键切割（不带修饰键）
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        document.getElementById('bm-scissor-btn')?.click();
        return;
      }

      // 空格键播放/暂停
      if (e.key === ' ') {
        e.preventDefault();
        document.getElementById('bm-play-btn')?.click();
        return;
      }

      // J 键后退 5 秒 - 使用 TimeController 统一控制
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        const newTime = Math.max(0, TimeController.currentTime - 5);
        PlayerController.seekToTime(newTime);
        return;
      }

      // K 键暂停/播放
      if (e.key === 'k' || e.key === 'K') {
        document.getElementById('bm-play-btn')?.click();
        return;
      }

      // L 键前进 5 秒 - 使用 TimeController 统一控制
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        const newTime = Math.min(TimeController.contentDuration, TimeController.currentTime + 5);
        PlayerController.seekToTime(newTime);
        return;
      }

      // 左方向键后退 - 使用 TimeController 统一控制
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.04; // Shift: 1秒, 普通: 1帧(约0.04秒)
        const newTime = Math.max(0, TimeController.currentTime - step);
        PlayerController.seekToTime(newTime);
        return;
      }

      // 右方向键前进 - 使用 TimeController 统一控制
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.04;
        const newTime = Math.min(TimeController.contentDuration, TimeController.currentTime + step);
        PlayerController.seekToTime(newTime);
        return;
      }

      // Home 键跳到开头
      if (e.key === 'Home') {
        e.preventDefault();
        PlayerController.seekToTime(0);
        return;
      }

      // End 键跳到结尾（内容结束点）
      if (e.key === 'End') {
        e.preventDefault();
        PlayerController.seekToTime(this.state.contentDuration || 0);
        return;
      }

      // I 键设置入点
      if (e.key === 'i' || e.key === 'I') {
        document.getElementById('bm-set-clip-start')?.click();
        return;
      }

      // O 键设置出点
      if (e.key === 'o' || e.key === 'O') {
        document.getElementById('bm-set-clip-end')?.click();
        return;
      }
    };

    document.addEventListener('keydown', this.keydownHandler);
  },

  // 加载素材列表
  async loadMaterialsList() {
    const container = document.getElementById('bm-editor-materials');
    if (!container) return;

    container.innerHTML = '<div class="bm-loading">加载中...</div>';

    try {
      const materials = await MaterialStorage.getAllMaterials({ sortBy: 'addTime', order: 'desc' });
      if (materials.length === 0) {
        container.innerHTML = '<div class="bm-empty">暂无收藏素材</div>';
        return;
      }

      container.innerHTML = materials.map(item => `
        <div class="bm-material-item" data-bvid="${item.bvid}">
          <div class="bm-material-cover">
            <img src="${item.cover}" alt="${item.title}">
            <span class="bm-material-duration">${BiliAPI.formatDuration(item.duration)}</span>
          </div>
          <div class="bm-material-info">
            <div class="bm-material-title" title="${item.title}">${item.title}</div>
            <div class="bm-material-meta">${item.owner?.name || '未知UP主'}</div>
          </div>
          <div class="bm-material-btns">
            <button class="bm-btn-icon bm-add-to-timeline" data-bvid="${item.bvid}" title="添加到主轨道">+</button>
            <button class="bm-btn-icon bm-add-to-pip" data-bvid="${item.bvid}" title="添加到画中画">🖼️</button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.bm-add-to-timeline').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const bvid = btn.dataset.bvid;
          const material = materials.find(m => m.bvid === bvid);
          if (material) {
            await MediaLoader.addToTimeline(material, 0);
          }
        });
      });
      
      container.querySelectorAll('.bm-add-to-pip').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const bvid = btn.dataset.bvid;
          const material = materials.find(m => m.bvid === bvid);
          if (material) {
            await MediaLoader.addToTimeline(material, 1);
          }
        });
      });
    } catch (e) {
      console.error('加载素材列表失败:', e);
      container.innerHTML = '<div class="bm-error">加载失败</div>';
    }
  },

  // 搜索视频
  async searchVideos() {
    const input = document.getElementById('bm-editor-search-input');
    const container = document.getElementById('bm-editor-search-results');
    if (!input || !container) return;

    const keyword = input.value.trim();
    if (!keyword) {
      MaterialUI.showToast('请输入搜索关键词', 'error');
      return;
    }

    container.innerHTML = '<div class="bm-loading">搜索中...</div>';

    try {
      const result = await BiliAPI.searchVideos(keyword, 1, 20);
      if (result.list.length === 0) {
        container.innerHTML = '<div class="bm-empty">未找到相关视频</div>';
        return;
      }

      container.innerHTML = result.list.map(item => `
        <div class="bm-search-item" data-bvid="${item.bvid}">
          <div class="bm-search-cover">
            <img src="${item.cover}" alt="${item.title}">
            <span class="bm-search-duration">${item.duration}</span>
          </div>
          <div class="bm-search-info">
            <div class="bm-search-title" title="${item.title}">${item.title}</div>
            <div class="bm-search-meta">
              <span>${item.owner?.name || '未知'}</span>
              <span>·</span>
              <span>${BiliAPI.formatNumber(item.stat?.view)}播放</span>
            </div>
          </div>
          <div class="bm-material-btns">
            <button class="bm-btn-icon bm-add-search-to-timeline" data-bvid="${item.bvid}" title="添加到主轨道">+</button>
            <button class="bm-btn-icon bm-add-search-to-pip" data-bvid="${item.bvid}" title="添加到画中画">🖼️</button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.bm-add-search-to-timeline').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const bvid = btn.dataset.bvid;
          const video = result.list.find(v => v.bvid === bvid);
          if (video) {
            await MediaLoader.addToTimeline(video, 0);
          }
        });
      });
      
      container.querySelectorAll('.bm-add-search-to-pip').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const bvid = btn.dataset.bvid;
          const video = result.list.find(v => v.bvid === bvid);
          if (video) {
            await MediaLoader.addToTimeline(video, 1);
          }
        });
      });
    } catch (e) {
      console.error('搜索失败:', e);
      container.innerHTML = '<div class="bm-error">搜索失败</div>';
    }
  },

  // 复制选中的片段
  copySelectedClip() {
    const state = this.state;
    if (!state.selectedClipId) {
      MaterialUI.showToast('请先选中要复制的片段', 'info');
      return;
    }
    
    const found = state.findClipById(state.selectedClipId);
    if (!found) return;
    
    const { clip, trackIndex } = found;
    
    // 深拷贝片段数据（不包括 id）
    this.clipboard = {
      video: clip.video,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceEnd,
      transform: clip.transform ? { ...clip.transform } : null,
      trackIndex: trackIndex
    };
    
    MaterialUI.showToast('已复制片段');
  },
  
  // 粘贴片段
  pasteClip() {
    const state = this.state;
    if (!this.clipboard) {
      MaterialUI.showToast('剪贴板为空', 'info');
      return;
    }
    
    state.saveHistory();
    
    const { video, sourceStart, sourceEnd, transform, trackIndex } = this.clipboard;
    
    // 在播放头位置粘贴
    const newClipId = 'clip-' + Date.now();
    const newClip = {
      id: newClipId,
      video: video,
      sourceStart: sourceStart,
      sourceEnd: sourceEnd,
      timelineStart: state.playheadTime,
      transform: transform ? { ...transform } : { ...state.TRANSFORM_PRESETS.fullscreen },
      color: TimelineManager.generateClipColor(newClipId) // 粘贴时分配新颜色
    };
    
    // 确保目标轨道存在
    while (state.tracks.video.length <= trackIndex) {
      state.tracks.video.push([]);
    }
    
    state.tracks.video[trackIndex].push(newClip);
    
    TimelineManager.recalculate();
    TimelineManager.render();
    TimelineManager.selectClip(newClip.id, trackIndex);
    EditorUI.updatePropertiesPanel(newClip.id);
    
    MaterialUI.showToast('已粘贴片段');
  },
  
  // 快速复制（复制并粘贴到末尾）
  duplicateSelectedClip() {
    const state = this.state;
    if (!state.selectedClipId) {
      MaterialUI.showToast('请先选中要复制的片段', 'info');
      return;
    }
    
    const found = state.findClipById(state.selectedClipId);
    if (!found) return;
    
    state.saveHistory();
    
    const { clip, trackIndex } = found;
    const clipDuration = clip.sourceEnd - clip.sourceStart;
    
    // 创建新片段
    const newClipId = 'clip-' + Date.now();
    const newClip = {
      id: newClipId,
      video: clip.video,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceEnd,
      timelineStart: trackIndex === 0 ? state.timelineDuration : clip.timelineStart + clipDuration + 0.5,
      transform: clip.transform ? { ...clip.transform } : { ...state.TRANSFORM_PRESETS.fullscreen },
      color: TimelineManager.generateClipColor(newClipId) // 复制时分配新颜色
    };
    
    state.tracks.video[trackIndex].push(newClip);
    
    TimelineManager.recalculate();
    TimelineManager.render();
    TimelineManager.selectClip(newClip.id, trackIndex);
    EditorUI.updatePropertiesPanel(newClip.id);
    
    MaterialUI.showToast('已复制片段');
  },

  // 绑定播放器控制层事件
  bindPlayerControlEvents() {
    const wrapper = document.getElementById('bm-player-wrapper');
    const controls = document.getElementById('bm-player-controls');
    const playBtn = document.getElementById('bm-player-play-btn');
    const muteBtn = document.getElementById('bm-player-mute-btn');
    const volumeSlider = document.getElementById('bm-volume-slider');
    const fullscreenBtn = document.getElementById('bm-player-fullscreen-btn');
    const progressWrapper = document.getElementById('bm-player-progress-wrapper');
    
    if (!controls) return;
    
    // 点击播放器区域播放/暂停
    wrapper?.addEventListener('click', (e) => {
      if (e.target.closest('.bm-player-controls-bottom')) return;
      if (e.target.closest('.bm-player-btn')) return;
      if (e.target.closest('.bm-pip-container')) return; // 不干扰画中画点击
      PlayerController.togglePlay();
      this.updatePlayerControlsUI();
    });
    
    // 播放按钮
    playBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      PlayerController.togglePlay();
      this.updatePlayerControlsUI();
    });
    
    // 进度条点击跳转 - 基于内容时长
    progressWrapper?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const rect = progressWrapper.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const targetTime = percent * (this.state.contentDuration || 1);
      await PlayerController.seekToTime(targetTime);
    });
    
    // 静音按钮
    muteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const audio = PlayerController.audioElement;
      if (audio) {
        audio.muted = !audio.muted;
        muteBtn.textContent = audio.muted ? '🔇' : '🔊';
      }
    });
    
    // 音量滑块
    volumeSlider?.addEventListener('input', (e) => {
      const audio = PlayerController.audioElement;
      if (audio) {
        audio.volume = e.target.value / 100;
        muteBtn.textContent = audio.volume === 0 ? '🔇' : '🔊';
      }
    });
    
    // 全屏按钮
    fullscreenBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        wrapper?.requestFullscreen();
      }
    });
    
    // 监听全屏变化，退出全屏时调整画中画位置
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        // 退出全屏，延迟调整画中画位置（等待布局完成）
        setTimeout(() => {
          if (typeof CompositorPlayer !== 'undefined') {
            CompositorPlayer.adjustPipPositions();
          }
        }, 100);
      }
    });
    
    // 鼠标移入显示控制层
    wrapper?.addEventListener('mouseenter', () => {
      controls.classList.add('visible');
    });
    
    // 鼠标移出隐藏控制层（延迟）
    wrapper?.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!this.state.isPlaying) return;
        controls.classList.remove('visible');
      }, 2000);
    });
  },
  
  // 更新播放器控制层 UI
  updatePlayerControlsUI() {
    const playBtn = document.getElementById('bm-player-play-btn');
    const playIcon = playBtn?.querySelector('.bm-play-icon');
    if (playIcon) {
      playIcon.textContent = this.state.isPlaying ? '⏸' : '▶';
    }
  },

  // 清理事件监听
  cleanup() {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    this.clipboard = null;
  }
};

// 导出
window.EditorEvents = EditorEvents;
