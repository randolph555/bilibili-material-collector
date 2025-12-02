// 编辑器 UI 模块
const EditorUI = {
  // 获取状态引用
  get state() {
    return EditorState;
  },

  // 创建编辑器面板 HTML
  createPanelHTML(video) {
    return `
      <div class="bm-editor">
        <div class="bm-editor-header">
          <div class="bm-editor-title">
            <span class="bm-editor-back" id="bm-editor-back">←</span>
            编辑工作台 - ${video.title}
          </div>
          <div class="bm-editor-actions">
            <button class="bm-btn" id="bm-load-draft">加载草稿</button>
            <button class="bm-btn" id="bm-download-video" title="下载视频">下载视频</button>
            <button class="bm-btn" id="bm-download-audio" title="下载音频">下载音频</button>
            <button class="bm-btn" id="bm-export-script" title="导出剪辑脚本">导出脚本</button>
            <button class="bm-btn bm-btn-primary" id="bm-save-draft">保存草稿</button>
          </div>
        </div>

        <div class="bm-editor-main">
          <!-- 左侧：素材库 -->
          <div class="bm-editor-sidebar">
            <div class="bm-sidebar-header">
              <div class="bm-sidebar-title">素材库</div>
              <div class="bm-sidebar-tabs">
                <button class="bm-tab active" data-tab="materials">已收藏</button>
                <button class="bm-tab" data-tab="search">搜索</button>
              </div>
            </div>
            <div class="bm-sidebar-content">
              <div class="bm-tab-panel active" id="bm-panel-materials">
                <div class="bm-material-list" id="bm-editor-materials"></div>
              </div>
              <div class="bm-tab-panel" id="bm-panel-search">
                <div class="bm-search-box">
                  <input type="text" id="bm-editor-search-input" placeholder="搜索B站视频...">
                  <button class="bm-btn bm-btn-sm" id="bm-editor-search-btn">搜索</button>
                </div>
                <div class="bm-search-results" id="bm-editor-search-results"></div>
              </div>
            </div>
          </div>

          <!-- 中间：预览区 -->
          <div class="bm-editor-preview">
            <div class="bm-preview-container">
              <div class="bm-player-wrapper" id="bm-player-wrapper">
                <video id="bm-video-player" crossorigin="anonymous"></video>
                <div class="bm-subtitle-display" id="bm-subtitle-display"></div>
                <div class="bm-player-overlay" id="bm-player-overlay">
                  <div class="bm-player-loading">加载中...</div>
                </div>
                <!-- 播放器控制层 - 只保留全屏按钮 -->
                <div class="bm-player-controls" id="bm-player-controls">
                  <div class="bm-player-controls-center">
                    <button class="bm-player-btn bm-player-play-btn" id="bm-player-play-btn" title="播放/暂停">
                      <span class="bm-play-icon">▶</span>
                    </button>
                  </div>
                  <button class="bm-player-fullscreen-btn" id="bm-player-fullscreen-btn" title="全屏">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                  </button>
                </div>
              </div>
              <!-- 播放器下方控制栏 -->
              <div class="bm-player-bar">
                <div class="bm-player-progress-wrapper" id="bm-player-progress-wrapper">
                  <div class="bm-player-progress-bar">
                    <div class="bm-player-progress-played" id="bm-player-progress-played"></div>
                  </div>
                </div>
                <div class="bm-player-bar-row">
                  <span class="bm-player-time" id="bm-player-time">00:00 / 00:00</span>
                  <div class="bm-player-bar-btns">
                    <button class="bm-player-btn-sm" id="bm-player-mute-btn" title="静音">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                    </button>
                    <input type="range" class="bm-volume-slider" id="bm-volume-slider" min="0" max="100" value="100">
                  </div>
                </div>
              </div>
            </div>

            <!-- 轨道信息 -->
            <div class="bm-tracks-info">
              <div class="bm-track-item">
                <span class="bm-track-label">视频轨道</span>
                <div class="bm-track-status" id="bm-video-track-status">
                  <span class="bm-track-icon">🎬</span>
                  <span>未加载</span>
                </div>
              </div>
              <div class="bm-track-item">
                <span class="bm-track-label">音频轨道</span>
                <div class="bm-track-status" id="bm-audio-track-status">
                  <span class="bm-track-icon">🔊</span>
                  <span>未加载</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 右侧：属性面板 -->
          <div class="bm-editor-properties">
            <div class="bm-props-title">素材属性</div>
            <div class="bm-props-content" id="bm-props-content">
              ${this.getVideoPropsHTML(video)}
            </div>
          </div>
        </div>

        <!-- 底部：时间轴 -->
        <div class="bm-editor-timeline">
          <div class="bm-timeline-header">
            <div class="bm-timeline-controls">
              <button class="bm-btn-icon" id="bm-play-btn" title="播放/暂停 (空格)">▶</button>
              <button class="bm-btn-icon" id="bm-stop-btn" title="停止并回到开头">⏹</button>
              <span class="bm-toolbar-divider"></span>
              <button class="bm-btn-icon" id="bm-scissor-btn" title="在播放头位置切割 (C)">✂</button>
              <button class="bm-btn-icon" id="bm-delete-btn" title="删除选中片段 (Delete)">🗑</button>
              <span class="bm-toolbar-divider"></span>
              <button class="bm-btn-icon" id="bm-undo-btn" title="撤销 (Ctrl+Z)">↩</button>
              <button class="bm-btn-icon" id="bm-redo-btn" title="重做 (Ctrl+Y)">↪</button>
              <span class="bm-toolbar-divider"></span>
              <button class="bm-btn-icon" id="bm-add-track-btn" title="添加视频轨道">➕</button>
              <span class="bm-toolbar-divider"></span>
              <button class="bm-btn-icon bm-snap-btn active" id="bm-snap-toggle" title="吸附对齐 (开启)">🧲</button>
            </div>
            <div class="bm-timeline-zoom">
              <button class="bm-btn-icon bm-zoom-btn" id="bm-zoom-out" title="缩小">−</button>
              <span id="bm-zoom-level">100%</span>
              <button class="bm-btn-icon bm-zoom-btn" id="bm-zoom-in" title="放大">+</button>
              <button class="bm-btn-icon bm-zoom-btn" id="bm-zoom-fit" title="适应">⊡</button>
            </div>
            <div class="bm-timeline-info">
              <span id="bm-timeline-duration">00:00</span>
            </div>
          </div>
          <!-- 时间刻度尺 + 轨道 -->
          <div class="bm-timeline-body">
            <div class="bm-timeline-ruler" id="bm-timeline-ruler"></div>
            <div class="bm-timeline-tracks" id="bm-timeline-tracks">
              <!-- 视频轨道会动态生成 -->
              <div class="bm-video-tracks-container" id="bm-video-tracks-container">
                <div class="bm-timeline-track" data-track="video-0">
                  <div class="bm-track-header"><span>V1 视频轨道</span></div>
                  <div class="bm-track-content" id="bm-video-track-0" data-track-index="0"></div>
                </div>
              </div>
              <div class="bm-timeline-track" data-track="audio">
                <div class="bm-track-header">🔊 音频</div>
                <div class="bm-track-content" id="bm-audio-track" data-track-index="0"></div>
              </div>
              <div class="bm-timeline-track" data-track="subtitle">
                <div class="bm-track-header">📝 字幕</div>
                <div class="bm-track-content" id="bm-subtitle-track"></div>
              </div>
            </div>
            <!-- 播放头 -->
            <div class="bm-playhead" id="bm-playhead"></div>
          </div>
        </div>
      </div>
    `;
  },

  // 获取视频属性 HTML
  getVideoPropsHTML(video) {
    return `
      <div class="bm-prop-group">
        <label>标题</label>
        <div class="bm-prop-value">${video.title}</div>
      </div>
      <div class="bm-prop-group">
        <label>UP主</label>
        <div class="bm-prop-value">${video.owner?.name || '未知'}</div>
      </div>
      <div class="bm-prop-group">
        <label>时长</label>
        <div class="bm-prop-value">${BiliAPI.formatDuration(video.duration)}</div>
      </div>
      <div class="bm-prop-group">
        <label>BV号</label>
        <div class="bm-prop-value">${video.bvid}</div>
      </div>
      <div class="bm-prop-group">
        <label>裁剪区间</label>
        <div class="bm-clip-range">
          <input type="text" id="bm-clip-start" placeholder="00:00" value="00:00">
          <span>-</span>
          <input type="text" id="bm-clip-end" placeholder="00:00" value="${BiliAPI.formatDuration(video.duration)}">
        </div>
      </div>
      <div class="bm-prop-group">
        <button class="bm-btn bm-btn-sm" id="bm-set-clip-start">设为起点</button>
        <button class="bm-btn bm-btn-sm" id="bm-set-clip-end">设为终点</button>
      </div>
    `;
  },

  // 更新属性面板
  updatePropertiesPanel(clipId) {
    const state = this.state;
    const propsContent = document.getElementById('bm-props-content');
    if (!propsContent) return;

    const found = state.findClipById(clipId);
    if (!found) {
      // 没有选中片段，显示当前视频信息
      propsContent.innerHTML = this.getVideoPropsHTML(state.currentVideo);
      return;
    }

    const { clip, trackIndex } = found;
    const video = clip.video;
    const clipDuration = TrackManager.getClipDuration(clip);
    const trackName = trackIndex === 0 ? '主轨道' : `轨道 ${trackIndex}`;
    const transform = clip.transform || state.TRANSFORM_PRESETS.fullscreen;

    propsContent.innerHTML = `
      <div class="bm-prop-group">
        <label>所在轨道</label>
        <div class="bm-prop-value">${trackName}</div>
      </div>
      <div class="bm-prop-group">
        <label>片段来源</label>
        <div class="bm-prop-value">${video.title}</div>
      </div>
      <div class="bm-prop-group">
        <label>片段时长</label>
        <div class="bm-prop-value">${BiliAPI.formatDuration(Math.floor(clipDuration))}</div>
      </div>
      <div class="bm-prop-group">
        <label>时间轴位置</label>
        <div class="bm-prop-value">${BiliAPI.formatDuration(Math.floor(clip.timelineStart))}</div>
      </div>
      
      ${trackIndex > 0 ? `
      <div class="bm-prop-divider"></div>
      <div class="bm-prop-group">
        <label>位置预设</label>
        <div class="bm-transform-presets">
          <button class="bm-preset-btn" data-preset="fullscreen" title="全屏">⬜</button>
          <button class="bm-preset-btn" data-preset="pipTopLeft" title="左上">◰</button>
          <button class="bm-preset-btn" data-preset="pipTopRight" title="右上">◳</button>
          <button class="bm-preset-btn" data-preset="pipBottomLeft" title="左下">◱</button>
          <button class="bm-preset-btn" data-preset="pipBottomRight" title="右下">◲</button>
          <button class="bm-preset-btn" data-preset="pipCenter" title="居中">◯</button>
        </div>
      </div>
      <div class="bm-prop-group">
        <label>大小 (${Math.round(transform.scale * 100)}%)</label>
        <input type="range" id="bm-transform-scale" min="10" max="100" value="${transform.scale * 100}" class="bm-slider">
      </div>
      <div class="bm-prop-group">
        <label>透明度 (${Math.round(transform.opacity * 100)}%)</label>
        <input type="range" id="bm-transform-opacity" min="10" max="100" value="${transform.opacity * 100}" class="bm-slider">
      </div>
      ` : ''}
      
      <div class="bm-prop-divider"></div>
      <div class="bm-prop-group">
        <label>轨道操作</label>
        ${trackIndex > 0 ? `
        <button class="bm-btn bm-btn-sm" id="bm-move-to-main">移到主轨道</button>
        ` : `
        <button class="bm-btn bm-btn-sm" id="bm-move-to-overlay">移到叠加轨道</button>
        `}
      </div>
    `;
    
    // 绑定轨道切换按钮
    document.getElementById('bm-move-to-main')?.addEventListener('click', () => {
      state.saveHistory();
      clip.transform = { ...state.TRANSFORM_PRESETS.fullscreen };
      TimelineManager.moveClip(clipId, clip.timelineStart, 0);
      this.updatePropertiesPanel(clipId);
    });
    
    document.getElementById('bm-move-to-overlay')?.addEventListener('click', () => {
      // 确保有叠加轨道
      if (state.tracks.video.length < 2) {
        TimelineManager.addTrack();
      }
      state.saveHistory();
      clip.transform = { ...state.TRANSFORM_PRESETS.pipBottomRight };
      TimelineManager.moveClip(clipId, clip.timelineStart, 1);
      this.updatePropertiesPanel(clipId);
    });
    
    // 绑定预设按钮
    document.querySelectorAll('.bm-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        if (state.TRANSFORM_PRESETS[preset]) {
          state.saveHistory();
          clip.transform = { ...state.TRANSFORM_PRESETS[preset] };
          TimelineManager.render();
          this.updatePropertiesPanel(clipId);
        }
      });
    });
    
    // 绑定滑块
    document.getElementById('bm-transform-scale')?.addEventListener('input', (e) => {
      clip.transform.scale = parseInt(e.target.value) / 100;
      e.target.previousElementSibling.textContent = `大小 (${e.target.value}%)`;
    });
    
    document.getElementById('bm-transform-scale')?.addEventListener('change', () => {
      state.saveHistory();
      TimelineManager.render();
    });
    
    document.getElementById('bm-transform-opacity')?.addEventListener('input', (e) => {
      clip.transform.opacity = parseInt(e.target.value) / 100;
      e.target.previousElementSibling.textContent = `透明度 (${e.target.value}%)`;
    });
    
    document.getElementById('bm-transform-opacity')?.addEventListener('change', () => {
      state.saveHistory();
      TimelineManager.render();
    });
  },

  // 更新多选面板
  updateMultiSelectPanel() {
    const state = this.state;
    const propsContent = document.getElementById('bm-props-content');
    if (!propsContent) return;
    
    const count = state.selectedClipIds.length;
    let totalDuration = 0;
    
    state.selectedClipIds.forEach(clipId => {
      const found = state.findClipById(clipId);
      if (found) {
        totalDuration += found.clip.sourceEnd - found.clip.sourceStart;
      }
    });
    
    propsContent.innerHTML = `
      <div class="bm-prop-group">
        <label>多选模式</label>
        <div class="bm-prop-value bm-multi-select-info">
          已选中 <strong>${count}</strong> 个片段
        </div>
      </div>
      <div class="bm-prop-group">
        <label>总时长</label>
        <div class="bm-prop-value">${BiliAPI.formatDuration(Math.floor(totalDuration))}</div>
      </div>
      <div class="bm-prop-divider"></div>
      <div class="bm-prop-group">
        <label>批量操作</label>
        <button class="bm-btn bm-btn-sm bm-btn-danger" id="bm-delete-selected">删除选中 (${count})</button>
      </div>
      <div class="bm-prop-group">
        <button class="bm-btn bm-btn-sm" id="bm-clear-selection">取消选择</button>
      </div>
    `;
    
    // 绑定按钮事件
    document.getElementById('bm-delete-selected')?.addEventListener('click', () => {
      const result = TimelineManager.deleteSelectedClips();
      if (result.success) {
        this.updatePropertiesPanel(null);
        MaterialUI.showToast(result.message);
      }
    });
    
    document.getElementById('bm-clear-selection')?.addEventListener('click', () => {
      TimelineManager.clearSelection();
      this.updatePropertiesPanel(null);
    });
  },

  // 显示编辑器
  show() {
    const state = this.state;
    let editor = document.getElementById('bm-editor-overlay');
    
    if (!editor) {
      editor = document.createElement('div');
      editor.id = 'bm-editor-overlay';
      document.body.appendChild(editor);
    }

    editor.innerHTML = this.createPanelHTML(state.currentVideo);
    editor.classList.add('open');
  },

  // 隐藏编辑器
  hide() {
    const editor = document.getElementById('bm-editor-overlay');
    if (editor) {
      editor.classList.remove('open');
    }
  }
};

// 导出
window.EditorUI = EditorUI;
