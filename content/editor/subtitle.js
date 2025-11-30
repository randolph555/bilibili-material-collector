// 字幕管理模块
const SubtitleManager = {
  // 获取状态引用
  get state() {
    return EditorState;
  },

  // 加载字幕
  async load() {
    const state = this.state;
    const video = state.currentVideo;
    
    if (!video.bvid || !video.cid) return;

    const subtitleTrack = document.getElementById('bm-subtitle-track');
    if (!subtitleTrack) return;

    try {
      const result = await BiliAPI.getSubtitle(video.bvid, video.cid);
      if (result.success && result.data) {
        state.subtitleData = result.data.body;
        this.renderTrack();
      } else {
        subtitleTrack.innerHTML = '<div class="bm-track-empty">无字幕</div>';
      }
    } catch (e) {
      console.error('加载字幕失败:', e);
      subtitleTrack.innerHTML = '<div class="bm-track-empty">字幕加载失败</div>';
    }
  },

  // 渲染字幕轨道
  renderTrack() {
    const state = this.state;
    const subtitleTrack = document.getElementById('bm-subtitle-track');
    
    if (!subtitleTrack || !state.subtitleData) return;

    const player = document.getElementById('bm-video-player');
    const duration = player?.duration || state.currentVideo?.duration;
    if (!duration) return;

    let html = '';
    state.subtitleData.forEach((sub, index) => {
      const left = (sub.from / duration) * 100;
      const width = ((sub.to - sub.from) / duration) * 100;
      const text = sub.content.length > 20 ? sub.content.substring(0, 20) + '...' : sub.content;

      html += `
        <div class="bm-subtitle-block"
             data-index="${index}"
             data-from="${sub.from}"
             data-to="${sub.to}"
             style="left: ${left}%; width: ${Math.max(width, 0.5)}%;"
             title="${sub.content}">
          <span class="bm-subtitle-text">${text}</span>
        </div>
      `;
    });

    subtitleTrack.innerHTML = html;
  },

  // 更新字幕显示
  updateDisplay(currentTime) {
    const state = this.state;
    const display = document.getElementById('bm-subtitle-display');
    
    if (!display || !state.subtitleData) return;

    const currentSub = state.subtitleData.find(sub =>
      currentTime >= sub.from && currentTime <= sub.to
    );

    if (currentSub) {
      display.textContent = currentSub.content;
      display.style.opacity = '1';
    } else {
      display.style.opacity = '0';
    }
  },

  // 清除字幕数据
  clear() {
    this.state.subtitleData = null;
    const display = document.getElementById('bm-subtitle-display');
    if (display) display.style.opacity = '0';
  }
};

// 导出
window.SubtitleManager = SubtitleManager;
