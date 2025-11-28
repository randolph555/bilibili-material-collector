// 视频编辑器模块
const VideoEditor = {
  currentVideo: null,
  // 时间轴片段数组，每个片段包含：
  // - id: 唯一标识
  // - video: 视频信息（bvid, cid, title, duration, cover等）
  // - sourceStart: 原视频起始时间
  // - sourceEnd: 原视频结束时间
  // - timelineStart: 在时间轴上的起始位置（自动计算）
  timeline: [],
  timelineDuration: 0, // 时间轴总时长（所有片段时长之和）

  isPlaying: false,
  playerElement: null,
  audioElement: null,
  audioMuted: false,
  selectedClipId: null,
  playheadTime: 0, // 播放头在时间轴上的位置
  trackEventsBindded: false,

  // 撤销/重做
  history: [],
  historyIndex: -1,
  maxHistory: 50,

  // 缓存的媒体数据（按bvid存储）
  mediaCache: {},

  // 打开编辑器
  async openEditor(videoInfo) {
    this.currentVideo = videoInfo;

    // 获取视频播放地址
    const playUrl = await this.getPlayableUrl(videoInfo);
    if (!playUrl) {
      MaterialUI.showToast('无法获取视频地址', 'error');
      return;
    }

    this.currentVideo.playUrl = playUrl;
    this.showEditorPanel();
  },

  // 获取可播放的视频地址
  async getPlayableUrl(videoInfo) {
    try {
      // 先尝试从 API 获取
      const result = await BiliAPI.getPlayUrl(videoInfo.bvid, videoInfo.cid);
      if (result.success && result.data) {
        return result.data;
      }
    } catch (e) {
      console.error('获取播放地址失败:', e);
    }
    return null;
  },

  // 显示编辑器面板
  showEditorPanel() {
    // 创建全屏编辑器
    let editor = document.getElementById('bm-editor-overlay');
    if (!editor) {
      editor = document.createElement('div');
      editor.id = 'bm-editor-overlay';
      document.body.appendChild(editor);
    }

    const video = this.currentVideo;
    editor.innerHTML = `
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
                <video id="bm-video-player" controls crossorigin="anonymous"></video>
                <div class="bm-subtitle-display" id="bm-subtitle-display"></div>
                <div class="bm-player-overlay" id="bm-player-overlay">
                  <div class="bm-player-loading">加载中...</div>
                </div>
              </div>
              <div class="bm-video-info-bar">
                <span id="bm-current-time">00:00</span>
                <span>/</span>
                <span id="bm-total-time">00:00</span>
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
            </div>
            <div class="bm-timeline-info">
              <span id="bm-timeline-duration">00:00</span>
            </div>
          </div>
          <!-- 时间刻度尺 + 轨道 -->
          <div class="bm-timeline-body">
            <div class="bm-timeline-ruler" id="bm-timeline-ruler"></div>
            <div class="bm-timeline-tracks" id="bm-timeline-tracks">
              <div class="bm-timeline-track" data-track="video">
                <div class="bm-track-header">🎬 视频</div>
                <div class="bm-track-content" id="bm-video-track"></div>
              </div>
              <div class="bm-timeline-track" data-track="audio">
                <div class="bm-track-header">🔊 音频</div>
                <div class="bm-track-content" id="bm-audio-track"></div>
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

    editor.classList.add('open');
    this.bindEditorEvents();
    this.initPlayer();
  },

  // 初始化播放器
  async initPlayer() {
    const player = document.getElementById('bm-video-player');
    const overlay = document.getElementById('bm-player-overlay');
    const videoTrackStatus = document.getElementById('bm-video-track-status');
    const audioTrackStatus = document.getElementById('bm-audio-track-status');

    if (!this.currentVideo.playUrl) {
      overlay.innerHTML = '<div class="bm-player-error">无法加载视频</div>';
      return;
    }

    const playData = this.currentVideo.playUrl;

    // B站视频是 DASH 格式，音视频分离
    if (playData.type === 'dash') {
      // 显示轨道信息 - 加载中状态
      if (playData.video) {
        videoTrackStatus.innerHTML = `
          <span class="bm-track-icon">🎬</span>
          <span>${playData.video.width}x${playData.video.height}</span>
          <span class="bm-track-codec">${playData.video.codecs || 'unknown'}</span>
        `;
      }
      if (playData.audio) {
        audioTrackStatus.innerHTML = `
          <span class="bm-track-icon">🔊</span>
          <span>已分离</span>
          <span class="bm-track-codec">AAC</span>
        `;
      }

      // 使用代理方式获取视频流
      try {
        overlay.innerHTML = `
          <div class="bm-player-loading">
            <div class="bm-loading-text">正在加载视频...</div>
            <div class="bm-loading-progress">
              <div class="bm-progress-bar" id="bm-video-progress-bar"></div>
            </div>
            <div class="bm-loading-percent" id="bm-video-progress-text">0%</div>
          </div>
        `;

        // 先移除之前可能存在的监听器
        if (this.progressHandler) {
          window.removeEventListener('bm-media-progress', this.progressHandler);
        }

        // 监听加载进度（使用节流避免刷新过快）
        let lastUpdate = 0;
        this.progressHandler = (event) => {
          const message = event.detail;
          const now = Date.now();
          if (now - lastUpdate < 200) return; // 200ms 节流
          lastUpdate = now;

          const progressBar = document.getElementById(`bm-${message.mediaType}-progress-bar`);
          const progressText = document.getElementById(`bm-${message.mediaType}-progress-text`);
          if (progressBar) progressBar.style.width = `${message.percent}%`;
          if (progressText) progressText.textContent = `${message.percent}% (${this.formatBytes(message.loaded)}/${this.formatBytes(message.total)})`;
        };
        window.addEventListener('bm-media-progress', this.progressHandler);

        // 并行加载视频和音频（传递备用URL和bvid）
        const currentBvid = this.currentVideo.bvid;
        const [videoResult, audioResult] = await Promise.all([
          playData.video ? BiliAPI.fetchMediaAsBlob(playData.video.url, 'video', playData.video.backup, currentBvid) : null,
          playData.audio ? BiliAPI.fetchMediaAsBlob(playData.audio.url, 'audio', playData.audio.backup, currentBvid) : null
        ]);

        // 移除进度监听
        window.removeEventListener('bm-media-progress', this.progressHandler);

        // 保存 blob 用于下载
        if (videoResult) {
          this.videoBlob = videoResult.blob;
          this.videoBlobUrl = videoResult.blobUrl;
        }
        if (audioResult) {
          this.audioBlob = audioResult.blob;
          this.audioBlobUrl = audioResult.blobUrl;
        }

        // 将初始视频加入缓存
        const bvid = this.currentVideo.bvid;
        this.mediaCache[bvid] = {
          videoInfo: this.currentVideo,
          playUrl: playData,
          videoBlobUrl: this.videoBlobUrl,
          videoBlob: this.videoBlob,
          audioBlobUrl: this.audioBlobUrl,
          audioBlob: this.audioBlob
        };
        this.currentPlayingBvid = bvid;

        // 设置视频源
        if (this.videoBlobUrl) {
          player.src = this.videoBlobUrl;
          player.load();
        }

        // 只在首次加载时初始化时间轴
        this.isInitialLoad = true;

        player.onloadedmetadata = () => {
          // 只在首次加载时执行初始化
          if (this.isInitialLoad) {
            this.isInitialLoad = false;
            overlay.style.display = 'none';

            // 更新视频时长（使用实际时长）
            this.currentVideo.duration = player.duration;

            // 初始化时间轴
            this.initTimeline();

            // 更新轨道状态为已加载
            videoTrackStatus.innerHTML = `
              <span class="bm-track-icon">🎬</span>
              <span>${playData.video.width}x${playData.video.height}</span>
              <span class="bm-track-ready">已就绪</span>
            `;

            // 初始化音频分离播放
            if (this.audioBlobUrl) {
              this.initAudioTrack(this.audioBlobUrl, player, true);
            }

            // 加载字幕
            this.loadSubtitle();
          }
        };

        player.onerror = (e) => {
          console.error('视频播放错误:', e);
          overlay.innerHTML = `<div class="bm-player-error">视频加载失败</div>`;
        };

        player.ontimeupdate = () => {
          // 根据当前播放的源时间，更新时间轴时间
          this.onVideoTimeUpdate(player.currentTime);
        };

        // 立即绑定轨道事件（不等待 onloadedmetadata）
        this.bindTrackEvents();

      } catch (e) {
        console.error('加载视频失败:', e);
        // 移除进度监听
        if (this.progressHandler) {
          window.removeEventListener('bm-media-progress', this.progressHandler);
        }
        // 加载失败，提供备选方案
        overlay.innerHTML = `
          <div class="bm-player-error">
            <p>视频加载失败: ${e.message}</p>
            <button class="bm-btn" id="bm-use-iframe">使用B站播放器预览</button>
            <button class="bm-btn" id="bm-copy-video-url">复制视频地址</button>
          </div>
        `;

        document.getElementById('bm-use-iframe')?.addEventListener('click', () => {
          this.useIframePlayer();
        });

        document.getElementById('bm-copy-video-url')?.addEventListener('click', () => {
          navigator.clipboard.writeText(playData.video.url);
          MaterialUI.showToast('视频地址已复制');
        });

        // 即使加载失败也绑定轨道事件
        this.bindTrackEvents();
      }
    }
  },

  // 格式化字节数
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  // 使用 iframe 嵌入 B站播放器
  useIframePlayer() {
    const wrapper = document.getElementById('bm-player-wrapper');
    const video = this.currentVideo;

    wrapper.innerHTML = `
      <iframe
        src="//player.bilibili.com/player.html?bvid=${video.bvid}&page=1&high_quality=1&danmaku=0"
        scrolling="no"
        border="0"
        frameborder="no"
        framespacing="0"
        allowfullscreen="true"
        style="width: 100%; height: 100%;">
      </iframe>
    `;

    // 更新时间轴
    this.generateTimelineRuler(video.duration);
    this.addClipToTimeline(video, 0, video.duration);
    
    // 注意：iframe 模式下轨道点击无法定位播放（跨域限制）
    // 但仍然绑定事件以便后续扩展
    const audioTrackStatus = document.getElementById('bm-audio-track-status');
    if (audioTrackStatus) {
      audioTrackStatus.innerHTML = `
        <span class="bm-track-icon">🔊</span>
        <span>内嵌播放</span>
      `;
    }
  },

  // 生成时间轴刻度
  generateTimelineRuler(duration) {
    const ruler = document.getElementById('bm-timeline-ruler');
    if (!ruler) return;

    const totalSeconds = Math.ceil(duration);
    const interval = totalSeconds > 300 ? 30 : (totalSeconds > 60 ? 10 : 5);

    let html = '';
    for (let i = 0; i <= totalSeconds; i += interval) {
      const percent = (i / totalSeconds) * 100;
      html += `<div class="bm-ruler-mark" style="left: ${percent}%">
        <span>${BiliAPI.formatDuration(i)}</span>
      </div>`;
    }
    ruler.innerHTML = html;
  },

  // 加载字幕
  async loadSubtitle() {
    const video = this.currentVideo;
    if (!video.bvid || !video.cid) return;

    const subtitleTrack = document.getElementById('bm-subtitle-track');
    if (!subtitleTrack) return;

    try {
      const result = await BiliAPI.getSubtitle(video.bvid, video.cid);
      if (result.success && result.data) {
        this.subtitleData = result.data.body;
        this.renderSubtitleTrack();
      } else {
        subtitleTrack.innerHTML = '<div class="bm-track-empty">无字幕</div>';
      }
    } catch (e) {
      console.error('加载字幕失败:', e);
      subtitleTrack.innerHTML = '<div class="bm-track-empty">字幕加载失败</div>';
    }
  },

  // 渲染字幕轨道
  renderSubtitleTrack() {
    const subtitleTrack = document.getElementById('bm-subtitle-track');
    if (!subtitleTrack || !this.subtitleData) return;

    const player = document.getElementById('bm-video-player');
    const duration = player?.duration || this.currentVideo?.duration;
    if (!duration) return;

    let html = '';
    this.subtitleData.forEach((sub, index) => {
      const left = (sub.from / duration) * 100;
      const width = ((sub.to - sub.from) / duration) * 100;
      // 截取字幕文本，避免太长
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

  // 更新视频预览区的字幕显示
  updateSubtitleDisplay(currentTime) {
    const display = document.getElementById('bm-subtitle-display');
    if (!display || !this.subtitleData) return;

    // 找到当前时间对应的字幕
    const currentSub = this.subtitleData.find(sub =>
      currentTime >= sub.from && currentTime <= sub.to
    );

    if (currentSub) {
      display.textContent = currentSub.content;
      display.style.opacity = '1';
    } else {
      display.style.opacity = '0';
    }
  },

  // 添加片段到时间轴
  addClipToTimeline(video, sourceStart, sourceEnd) {
    const clipId = 'clip-' + Date.now();

    // 计算在时间轴上的起始位置（追加到末尾）
    const timelineStart = this.timelineDuration;

    this.timeline.push({
      id: clipId,
      video: video,
      sourceStart: sourceStart,  // 原视频起始时间
      sourceEnd: sourceEnd,      // 原视频结束时间
      timelineStart: timelineStart  // 在时间轴上的位置
    });

    // 重新计算时间轴
    this.recalculateTimeline();
    this.renderTimeline();
  },

  // 重新计算时间轴（更新每个片段的 timelineStart 和总时长）
  recalculateTimeline() {
    let currentTime = 0;
    this.timeline.forEach(clip => {
      clip.timelineStart = currentTime;
      currentTime += (clip.sourceEnd - clip.sourceStart);
    });
    this.timelineDuration = currentTime;

    // 更新时间轴时长显示
    const durationEl = document.getElementById('bm-timeline-duration');
    if (durationEl) {
      durationEl.textContent = BiliAPI.formatDuration(Math.floor(this.timelineDuration));
    }
  },

  // 初始化时间轴（用当前视频）
  initTimeline() {
    this.timeline = [];
    this.timelineDuration = 0;
    this.playheadTime = 0;
    this.history = [];
    this.historyIndex = -1;

    if (this.currentVideo) {
      // 添加初始片段（不保存历史，因为这是初始状态）
      const clipId = 'clip-' + Date.now();
      this.timeline.push({
        id: clipId,
        video: this.currentVideo,
        sourceStart: 0,
        sourceEnd: this.currentVideo.duration,
        timelineStart: 0
      });
      this.recalculateTimeline();
      this.renderTimeline();

      // 保存初始状态到历史
      this.saveHistory();
    }
  },

  // 渲染时间轴上的所有片段
  renderTimeline() {
    const videoTrack = document.getElementById('bm-video-track');
    const audioTrack = document.getElementById('bm-audio-track');
    if (!videoTrack || !audioTrack) return;

    const duration = this.timelineDuration || 1;

    // 生成时间刻度尺
    this.generateTimelineRuler(duration);

    // 为不同视频分配不同的基础色相
    const videoHueMap = {};
    let hueIndex = 0;
    const hueStep = 60; // 每个视频相差60度色相
    this.timeline.forEach(clip => {
      const bvid = clip.video.bvid;
      if (!(bvid in videoHueMap)) {
        videoHueMap[bvid] = (hueIndex * hueStep) % 360;
        hueIndex++;
      }
    });

    // 构建视频轨道 HTML
    let videoHtml = '';
    this.timeline.forEach(clip => {
      const clipDuration = clip.sourceEnd - clip.sourceStart;
      const left = (clip.timelineStart / duration) * 100;
      const width = (clipDuration / duration) * 100;
      const isSelected = clip.id === this.selectedClipId;
      const baseHue = videoHueMap[clip.video.bvid];

      // 生成帧预览色块（同一视频使用相近色相）
      const frameCount = Math.min(Math.ceil(clipDuration / 2), 20);
      let framesHtml = '';
      for (let i = 0; i < frameCount; i++) {
        const hue = (baseHue + (i * 5) % 30) % 360; // 在基础色相附近变化
        framesHtml += `<div class="bm-frame-block" style="background: hsl(${hue}, 60%, 40%);"></div>`;
      }

      // 显示视频标题（截取前10个字符）
      const videoTitle = clip.video.title?.substring(0, 10) || '未知';

      videoHtml += `
        <div class="bm-timeline-clip ${isSelected ? 'selected' : ''}"
             id="${clip.id}"
             data-bvid="${clip.video.bvid}"
             data-timeline-start="${clip.timelineStart}"
             data-source-start="${clip.sourceStart}"
             data-source-end="${clip.sourceEnd}"
             style="left: ${left}%; width: ${width}%;"
             title="${clip.video.title}">
          <div class="bm-clip-frames">${framesHtml}</div>
          <div class="bm-clip-video-title">${videoTitle}</div>
          <div class="bm-clip-time-range">
            ${BiliAPI.formatDuration(Math.floor(clip.sourceStart))} - ${BiliAPI.formatDuration(Math.floor(clip.sourceEnd))}
          </div>
        </div>
      `;
    });

    // 构建音频轨道 HTML
    let audioHtml = '';
    this.timeline.forEach(clip => {
      const clipDuration = clip.sourceEnd - clip.sourceStart;
      const left = (clip.timelineStart / duration) * 100;
      const width = (clipDuration / duration) * 100;
      const isSelected = clip.id === this.selectedClipId;

      // 生成模拟波形
      const barCount = Math.min(Math.ceil(clipDuration * 2), 60);
      let waveHtml = '';
      for (let i = 0; i < barCount; i++) {
        const seed = (clip.sourceStart * 100 + i * 7) % 100;
        const height = 20 + (seed % 60);
        waveHtml += `<div class="bm-wave-bar" style="height: ${height}%;"></div>`;
      }

      audioHtml += `
        <div class="bm-timeline-clip bm-audio-clip ${isSelected ? 'selected' : ''}"
             id="${clip.id}-audio"
             data-clip-id="${clip.id}"
             style="left: ${left}%; width: ${width}%;">
          <div class="bm-clip-waveform">${waveHtml}</div>
        </div>
      `;
    });

    videoTrack.innerHTML = videoHtml;
    audioTrack.innerHTML = audioHtml;

    // 更新播放头位置
    this.updatePlayhead();
  },

  // 选中片段
  selectClip(clipId) {
    // 取消之前的选中
    if (this.selectedClipId) {
      const oldClip = document.getElementById(this.selectedClipId);
      if (oldClip) oldClip.classList.remove('selected');
      const oldAudioClip = document.getElementById(this.selectedClipId + '-audio');
      if (oldAudioClip) oldAudioClip.classList.remove('selected');
    }

    this.selectedClipId = clipId;

    // 选中新片段
    const newClip = document.getElementById(clipId);
    if (newClip) newClip.classList.add('selected');
    const newAudioClip = document.getElementById(clipId + '-audio');
    if (newAudioClip) newAudioClip.classList.add('selected');

    // 更新属性面板
    this.updatePropertiesPanel(clipId);
  },

  // 更新属性面板
  updatePropertiesPanel(clipId) {
    const propsContent = document.getElementById('bm-props-content');
    if (!propsContent) return;

    const clip = this.timeline.find(c => c.id === clipId);
    if (!clip) {
      // 没有选中片段，显示当前视频信息
      const video = this.currentVideo;
      propsContent.innerHTML = `
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
      `;
      return;
    }

    const video = clip.video;
    const clipDuration = clip.sourceEnd - clip.sourceStart;

    propsContent.innerHTML = `
      <div class="bm-prop-group">
        <label>片段来源</label>
        <div class="bm-prop-value">${video.title}</div>
      </div>
      <div class="bm-prop-group">
        <label>UP主</label>
        <div class="bm-prop-value">${video.owner?.name || '未知'}</div>
      </div>
      <div class="bm-prop-group">
        <label>BV号</label>
        <div class="bm-prop-value">${video.bvid}</div>
      </div>
      <div class="bm-prop-group">
        <label>原视频时长</label>
        <div class="bm-prop-value">${BiliAPI.formatDuration(video.duration)}</div>
      </div>
      <div class="bm-prop-group">
        <label>片段区间</label>
        <div class="bm-prop-value">
          ${BiliAPI.formatDuration(Math.floor(clip.sourceStart))} - ${BiliAPI.formatDuration(Math.floor(clip.sourceEnd))}
        </div>
      </div>
      <div class="bm-prop-group">
        <label>片段时长</label>
        <div class="bm-prop-value">${BiliAPI.formatDuration(Math.floor(clipDuration))}</div>
      </div>
      <div class="bm-prop-group">
        <label>时间轴位置</label>
        <div class="bm-prop-value">${BiliAPI.formatDuration(Math.floor(clip.timelineStart))}</div>
      </div>
    `;
  },

  // 在播放头位置切割片段
  cutAtPlayhead() {
    if (this.timeline.length === 0) {
      MaterialUI.showToast('时间轴为空', 'error');
      return;
    }

    // 找到播放头位置所在的片段
    const result = this.timelineToSource(this.playheadTime);
    if (!result) {
      MaterialUI.showToast('当前位置没有可切割的片段', 'error');
      return;
    }

    const clip = result.clip;
    const cutSourceTime = result.sourceTime;

    // 确保切割点在合理范围内（至少保留0.5秒）
    if (cutSourceTime - clip.sourceStart < 0.5 || clip.sourceEnd - cutSourceTime < 0.5) {
      MaterialUI.showToast('切割位置太靠近片段边缘', 'error');
      return;
    }

    // 保存历史
    this.saveHistory();

    // 创建两个新片段
    const newClip1 = {
      id: 'clip-' + Date.now(),
      video: clip.video,
      sourceStart: clip.sourceStart,
      sourceEnd: cutSourceTime,
      timelineStart: 0 // 会在 recalculate 中更新
    };

    const newClip2 = {
      id: 'clip-' + (Date.now() + 1),
      video: clip.video,
      sourceStart: cutSourceTime,
      sourceEnd: clip.sourceEnd,
      timelineStart: 0
    };

    // 替换原片段
    const clipIndex = this.timeline.findIndex(c => c.id === clip.id);
    this.timeline.splice(clipIndex, 1, newClip1, newClip2);

    // 重新计算时间轴
    this.recalculateTimeline();
    this.renderTimeline();

    // 选中后面的片段
    this.selectClip(newClip2.id);

    MaterialUI.showToast(`已在 ${BiliAPI.formatDuration(Math.floor(cutSourceTime))} 处切割`);
  },

  // 删除选中的片段
  deleteSelectedClip() {
    if (!this.selectedClipId) {
      MaterialUI.showToast('请先选中要删除的片段', 'error');
      return;
    }

    // 从 timeline 中移除
    const clipIndex = this.timeline.findIndex(c => c.id === this.selectedClipId);
    if (clipIndex === -1) return;

    // 保存历史
    this.saveHistory();

    const deletedClip = this.timeline[clipIndex];
    this.timeline.splice(clipIndex, 1);
    this.selectedClipId = null;

    // 重新计算时间轴
    this.recalculateTimeline();

    // 调整播放头位置（如果超出范围）
    if (this.playheadTime > this.timelineDuration) {
      this.playheadTime = this.timelineDuration;
    }

    // 重新渲染
    this.renderTimeline();

    MaterialUI.showToast(`已删除片段 ${BiliAPI.formatDuration(Math.floor(deletedClip.sourceStart))} - ${BiliAPI.formatDuration(Math.floor(deletedClip.sourceEnd))}`);
  },

  // 更新播放头位置（基于时间轴时间）
  updatePlayhead() {
    const playhead = document.getElementById('bm-playhead');
    const tracksContainer = document.getElementById('bm-timeline-tracks');
    if (!playhead || !tracksContainer || this.timelineDuration <= 0) return;

    const trackContent = tracksContainer.querySelector('.bm-track-content');
    if (!trackContent) return;

    const percent = (this.playheadTime / this.timelineDuration) * 100;
    // 60px 是轨道头部宽度
    playhead.style.left = `calc(60px + (100% - 60px) * ${percent / 100})`;
  },

  // 时间轴时间 → 原视频时间（找到对应的片段和源时间）
  timelineToSource(timelineTime) {
    for (const clip of this.timeline) {
      const clipDuration = clip.sourceEnd - clip.sourceStart;
      const clipEnd = clip.timelineStart + clipDuration;

      if (timelineTime >= clip.timelineStart && timelineTime < clipEnd) {
        const offsetInClip = timelineTime - clip.timelineStart;
        return {
          clip: clip,
          sourceTime: clip.sourceStart + offsetInClip
        };
      }
    }
    // 超出范围，返回最后一个片段的结束
    if (this.timeline.length > 0) {
      const lastClip = this.timeline[this.timeline.length - 1];
      return { clip: lastClip, sourceTime: lastClip.sourceEnd };
    }
    return null;
  },

  // 原视频时间 → 时间轴时间
  sourceToTimeline(clip, sourceTime) {
    const offsetInClip = sourceTime - clip.sourceStart;
    return clip.timelineStart + offsetInClip;
  },

  // 跳转到时间轴指定时间
  async seekToTimelineTime(timelineTime) {
    // 限制范围
    timelineTime = Math.max(0, Math.min(timelineTime, this.timelineDuration));
    this.playheadTime = timelineTime;

    // 找到对应的源时间
    const result = this.timelineToSource(timelineTime);
    if (result) {
      const clip = result.clip;
      const bvid = clip.video.bvid;

      // 检查是否需要切换视频源
      if (this.currentPlayingBvid !== bvid) {
        // 需要切换到另一个视频
        const cache = this.mediaCache[bvid];
        if (cache) {
          await this.switchToVideoSource(bvid);
        } else {
          // 如果是初始视频（打开编辑器时加载的），使用当前的 blob
          if (bvid === this.currentVideo.bvid) {
            this.currentPlayingBvid = bvid;
          } else {
            console.warn('视频未缓存，无法切换:', bvid);
          }
        }
      }

      const player = document.getElementById('bm-video-player');
      if (player) {
        player.currentTime = result.sourceTime;
      }
      if (this.audioElement) {
        this.audioElement.currentTime = result.sourceTime;
      }
    }

    this.updatePlayhead();
    this.updateTimeDisplay();
  },

  // 更新时间显示
  updateTimeDisplay() {
    const currentTimeEl = document.getElementById('bm-current-time');
    if (currentTimeEl) {
      currentTimeEl.textContent = BiliAPI.formatDuration(Math.floor(this.playheadTime));
    }
  },

  // 视频播放时间更新回调
  onVideoTimeUpdate(sourceTime) {
    const player = document.getElementById('bm-video-player');
    if (!player) return;

    // 找到当前正在播放的片段（基于播放头位置）
    const currentClip = this.getCurrentPlayingClip();
    if (!currentClip) return;

    const currentBvid = this.currentPlayingBvid || this.currentVideo?.bvid;

    // 检查当前源时间是否在当前片段的有效范围内
    if (currentClip.video.bvid === currentBvid &&
        sourceTime >= currentClip.sourceStart && sourceTime < currentClip.sourceEnd) {
      // 正常播放，更新播放头
      this.playheadTime = this.sourceToTimeline(currentClip, sourceTime);
      this.updatePlayhead();
      this.updateTimeDisplay();
      this.updateSubtitleDisplay(sourceTime);
    } else if (!player.paused) {
      // 播放到了当前片段之外，需要跳到下一个片段
      this.handlePlaybackOutOfClip();
    }
  },

  // 获取当前播放头位置对应的片段
  getCurrentPlayingClip() {
    for (const clip of this.timeline) {
      const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
      if (this.playheadTime >= clip.timelineStart && this.playheadTime < clipEnd) {
        return clip;
      }
    }
    // 如果播放头在最后，返回最后一个片段
    if (this.timeline.length > 0 && this.playheadTime >= this.timelineDuration) {
      return this.timeline[this.timeline.length - 1];
    }
    return this.timeline[0] || null;
  },

  // 处理播放超出当前片段的情况
  async handlePlaybackOutOfClip() {
    const player = document.getElementById('bm-video-player');
    if (!player || player.paused) return;

    // 获取当前片段
    const currentClip = this.getCurrentPlayingClip();
    if (!currentClip) return;

    // 计算当前片段在时间轴上的结束位置
    const currentClipEnd = currentClip.timelineStart + (currentClip.sourceEnd - currentClip.sourceStart);

    // 按 timelineStart 排序
    const sortedClips = [...this.timeline].sort((a, b) => a.timelineStart - b.timelineStart);

    // 找到当前片段的索引
    const currentIndex = sortedClips.findIndex(c => c.id === currentClip.id);

    // 获取下一个片段
    const nextClip = sortedClips[currentIndex + 1];

    if (nextClip) {
      // 更新播放头到下一个片段的开始
      this.playheadTime = nextClip.timelineStart;

      // 检查是否需要切换视频源
      const nextBvid = nextClip.video.bvid;
      const currentBvid = this.currentPlayingBvid || this.currentVideo?.bvid;

      if (nextBvid !== currentBvid) {
        // 需要切换到另一个视频
        const cache = this.mediaCache[nextBvid];
        if (cache) {
          // 暂停当前播放
          player.pause();
          if (this.audioElement) this.audioElement.pause();

          // 切换视频源
          await this.switchToVideoSource(nextBvid);

          // 设置时间到下一个片段的源起始位置
          player.currentTime = nextClip.sourceStart;
          if (this.audioElement) this.audioElement.currentTime = nextClip.sourceStart;

          // 恢复播放
          player.play().catch(() => {});
          if (this.audioElement) this.audioElement.play().catch(() => {});
        } else {
          console.warn('下一个片段的视频未缓存:', nextBvid);
          // 跳过这个片段
          this.playheadTime = nextClip.timelineStart + (nextClip.sourceEnd - nextClip.sourceStart);
          this.handlePlaybackOutOfClip();
          return;
        }
      } else {
        // 同一个视频，跳转到下一个片段的源起始位置
        player.currentTime = nextClip.sourceStart;
        if (this.audioElement) {
          this.audioElement.currentTime = nextClip.sourceStart;
        }
      }

      this.updatePlayhead();
      this.updateTimeDisplay();
    } else {
      // 没有下一个片段了，停止播放
      player.pause();
      if (this.audioElement) {
        this.audioElement.pause();
      }
      document.getElementById('bm-play-btn').textContent = '▶';

      // 回到开头
      if (sortedClips.length > 0) {
        await this.seekToTimelineTime(0);
      }
    }
  },

  // 初始化音频轨道（分离播放）
  initAudioTrack(audioUrl, videoPlayer, isBlob = false) {
    // 创建独立的音频元素
    let audio = document.getElementById('bm-audio-player');
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'bm-audio-player';
      audio.style.display = 'none';
      document.body.appendChild(audio);
    }

    this.audioElement = audio;
    audio.src = audioUrl;
    audio.load();

    // 更新音频轨道状态
    const audioTrackStatus = document.getElementById('bm-audio-track-status');
    if (audioTrackStatus) {
      audioTrackStatus.innerHTML = `
        <span class="bm-track-icon">🔊</span>
        <span class="bm-track-ready">${isBlob ? '已就绪' : '已分离'}</span>
        <button class="bm-btn-icon bm-audio-mute-btn" id="bm-toggle-audio" title="静音/取消静音音频">🔊</button>
      `;

      document.getElementById('bm-toggle-audio')?.addEventListener('click', () => {
        this.audioMuted = !this.audioMuted;
        audio.muted = this.audioMuted;
        document.getElementById('bm-toggle-audio').textContent = this.audioMuted ? '🔇' : '🔊';
      });
    }

    // 视频播放时同步音频
    videoPlayer.addEventListener('play', () => {
      audio.currentTime = videoPlayer.currentTime;
      audio.play().catch(() => {});
    });

    videoPlayer.addEventListener('pause', () => {
      audio.pause();
    });

    videoPlayer.addEventListener('seeked', () => {
      audio.currentTime = videoPlayer.currentTime;
    });

    // 定期同步音视频时间（防止漂移）
    this.syncInterval = setInterval(() => {
      if (!videoPlayer.paused && Math.abs(audio.currentTime - videoPlayer.currentTime) > 0.1) {
        audio.currentTime = videoPlayer.currentTime;
      }
    }, 1000);

    // 静音视频原生音频（因为是纯视频流，可能没有音频）
    videoPlayer.muted = false;
  },

  // 点击轨道/刻度尺定位到时间轴时间
  async seekToPosition(e, element) {
    if (this.timelineDuration <= 0) return;

    // 检查是否点击了片段
    const clipEl = e.target.closest('.bm-timeline-clip');
    if (clipEl) {
      // 获取真实的 clip id（音频轨道的 id 带 -audio 后缀）
      let clipId = clipEl.id;
      if (clipId.endsWith('-audio')) {
        clipId = clipEl.dataset.clipId || clipId.replace('-audio', '');
      }
      this.selectClip(clipId);

      // 跳转到片段在时间轴上的起始位置
      const clip = this.timeline.find(c => c.id === clipId);
      if (clip) {
        await this.seekToTimelineTime(clip.timelineStart);
      }
      return;
    }

    // 计算点击位置对应的时间轴时间
    const rect = element.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const timelineTime = percent * this.timelineDuration;

    await this.seekToTimelineTime(timelineTime);
  },

  // 绑定轨道点击事件
  bindTrackEvents() {
    // 防止重复绑定
    if (this.trackEventsBindded) return;
    this.trackEventsBindded = true;

    const videoTrack = document.getElementById('bm-video-track');
    const audioTrack = document.getElementById('bm-audio-track');
    const subtitleTrack = document.getElementById('bm-subtitle-track');
    const ruler = document.getElementById('bm-timeline-ruler');
    const tracksContainer = document.getElementById('bm-timeline-tracks');

    // 通用点击处理
    const handleClick = (e) => {
      this.seekToPosition(e, e.currentTarget);
    };

    // 绑定所有轨道
    [videoTrack, audioTrack, subtitleTrack].forEach(track => {
      if (track) {
        track.addEventListener('click', handleClick);
        track.style.cursor = 'pointer';
      }
    });

    // 刻度尺点击
    if (ruler) {
      ruler.addEventListener('click', handleClick);
      ruler.style.cursor = 'pointer';
    }
  },

  // 绑定编辑器事件
  bindEditorEvents() {
    // 返回按钮
    document.getElementById('bm-editor-back')?.addEventListener('click', () => {
      this.closeEditor();
    });

    // 素材库 Tab 切换
    document.querySelectorAll('.bm-sidebar-tabs .bm-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.bm-sidebar-tabs .bm-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.bm-tab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`bm-panel-${tabName}`)?.classList.add('active');
      });
    });

    // 加载已收藏素材
    this.loadMaterialsList();

    // 搜索功能
    document.getElementById('bm-editor-search-btn')?.addEventListener('click', () => {
      this.searchVideos();
    });
    document.getElementById('bm-editor-search-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.searchVideos();
    });

    // 播放/暂停
    document.getElementById('bm-play-btn')?.addEventListener('click', () => {
      const player = document.getElementById('bm-video-player');
      if (player) {
        if (player.paused) {
          player.play();
          document.getElementById('bm-play-btn').textContent = '⏸';
        } else {
          player.pause();
          document.getElementById('bm-play-btn').textContent = '▶';
        }
      }
    });

    // 停止
    document.getElementById('bm-stop-btn')?.addEventListener('click', () => {
      const player = document.getElementById('bm-video-player');
      if (player) {
        player.pause();
        player.currentTime = 0;
        document.getElementById('bm-play-btn').textContent = '▶';
      }
    });

    // 剪刀工具 - 直接在播放头位置切割
    document.getElementById('bm-scissor-btn')?.addEventListener('click', () => {
      this.cutAtPlayhead();
    });

    // 删除按钮
    document.getElementById('bm-delete-btn')?.addEventListener('click', () => {
      this.deleteSelectedClip();
    });

    // 撤销按钮
    document.getElementById('bm-undo-btn')?.addEventListener('click', () => {
      this.undo();
    });

    // 重做按钮
    document.getElementById('bm-redo-btn')?.addEventListener('click', () => {
      this.redo();
    });

    // 键盘事件处理
    this.keydownHandler = (e) => {
      // ESC 关闭编辑器
      if (e.key === 'Escape') {
        this.closeEditor();
        return;
      }

      // 以下快捷键在输入框中不生效
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      const player = document.getElementById('bm-video-player');

      // Ctrl/Cmd + Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }

      // Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
        return;
      }

      // Delete/Backspace 删除选中片段
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelectedClip();
        return;
      }

      // C 键在播放头位置切割
      if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          this.cutAtPlayhead();
        }
        return;
      }

      // 空格键播放/暂停
      if (e.key === ' ') {
        e.preventDefault();
        document.getElementById('bm-play-btn')?.click();
        return;
      }

      // J 键 - 后退 5 秒
      if (e.key === 'j' || e.key === 'J') {
        if (player) {
          player.currentTime = Math.max(0, player.currentTime - 5);
          if (this.audioElement) this.audioElement.currentTime = player.currentTime;
        }
        return;
      }

      // K 键 - 暂停/播放
      if (e.key === 'k' || e.key === 'K') {
        document.getElementById('bm-play-btn')?.click();
        return;
      }

      // L 键 - 前进 5 秒
      if (e.key === 'l' || e.key === 'L') {
        if (player) {
          player.currentTime = Math.min(player.duration, player.currentTime + 5);
          if (this.audioElement) this.audioElement.currentTime = player.currentTime;
        }
        return;
      }

      // 左方向键 - 后退 1 帧（约 0.04 秒）
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (player) {
          const step = e.shiftKey ? 1 : 0.04; // Shift 按住时 1 秒
          player.currentTime = Math.max(0, player.currentTime - step);
          if (this.audioElement) this.audioElement.currentTime = player.currentTime;
        }
        return;
      }

      // 右方向键 - 前进 1 帧
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (player) {
          const step = e.shiftKey ? 1 : 0.04;
          player.currentTime = Math.min(player.duration, player.currentTime + step);
          if (this.audioElement) this.audioElement.currentTime = player.currentTime;
        }
        return;
      }

      // Home 键 - 跳到开头
      if (e.key === 'Home') {
        e.preventDefault();
        if (player) {
          player.currentTime = 0;
          if (this.audioElement) this.audioElement.currentTime = 0;
        }
        return;
      }

      // End 键 - 跳到结尾
      if (e.key === 'End') {
        e.preventDefault();
        if (player) {
          player.currentTime = player.duration;
          if (this.audioElement) this.audioElement.currentTime = player.duration;
        }
        return;
      }

      // I 键 - 设置入点
      if (e.key === 'i' || e.key === 'I') {
        document.getElementById('bm-set-clip-start')?.click();
        return;
      }

      // O 键 - 设置出点
      if (e.key === 'o' || e.key === 'O') {
        document.getElementById('bm-set-clip-end')?.click();
        return;
      }
    };
    document.addEventListener('keydown', this.keydownHandler);

    // 设置裁剪起点
    document.getElementById('bm-set-clip-start')?.addEventListener('click', () => {
      const player = document.getElementById('bm-video-player');
      if (player) {
        document.getElementById('bm-clip-start').value =
          BiliAPI.formatDuration(Math.floor(player.currentTime));
      }
    });

    // 设置裁剪终点
    document.getElementById('bm-set-clip-end')?.addEventListener('click', () => {
      const player = document.getElementById('bm-video-player');
      if (player) {
        document.getElementById('bm-clip-end').value =
          BiliAPI.formatDuration(Math.floor(player.currentTime));
      }
    });

    // 保存草稿
    document.getElementById('bm-save-draft')?.addEventListener('click', () => {
      this.saveDraft();
    });

    // 加载草稿
    document.getElementById('bm-load-draft')?.addEventListener('click', () => {
      this.showDraftList();
    });

    // 下载视频
    document.getElementById('bm-download-video')?.addEventListener('click', () => {
      this.downloadMedia('video');
    });

    // 下载音频
    document.getElementById('bm-download-audio')?.addEventListener('click', () => {
      this.downloadMedia('audio');
    });

    // 导出脚本
    document.getElementById('bm-export-script')?.addEventListener('click', () => {
      this.exportScript();
    });
  },

  // 导出剪辑脚本
  exportScript() {
    if (this.timeline.length === 0) {
      MaterialUI.showToast('时间轴为空，无法导出', 'error');
      return;
    }

    const video = this.currentVideo;
    const safeTitle = video.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 30);

    // 生成 FFmpeg 命令
    let ffmpegScript = `# FFmpeg 剪辑脚本\n`;
    ffmpegScript += `# 视频: ${video.title}\n`;
    ffmpegScript += `# BV号: ${video.bvid}\n`;
    ffmpegScript += `# 生成时间: ${new Date().toLocaleString()}\n\n`;

    // 排序片段
    const sortedClips = [...this.timeline].sort((a, b) => a.startTime - b.startTime);

    // 生成每个片段的裁剪命令
    ffmpegScript += `# 步骤1: 裁剪各片段\n`;
    sortedClips.forEach((clip, index) => {
      const start = this.formatFFmpegTime(clip.startTime);
      const duration = this.formatFFmpegTime(clip.endTime - clip.startTime);
      ffmpegScript += `ffmpeg -i "${safeTitle}_video.mp4" -i "${safeTitle}_audio.m4a" -ss ${start} -t ${duration} -c copy "clip_${index + 1}.mp4"\n`;
    });

    ffmpegScript += `\n# 步骤2: 创建合并列表\n`;
    ffmpegScript += `echo "# 片段列表" > filelist.txt\n`;
    sortedClips.forEach((clip, index) => {
      ffmpegScript += `echo "file 'clip_${index + 1}.mp4'" >> filelist.txt\n`;
    });

    ffmpegScript += `\n# 步骤3: 合并所有片段\n`;
    ffmpegScript += `ffmpeg -f concat -safe 0 -i filelist.txt -c copy "${safeTitle}_final.mp4"\n`;

    ffmpegScript += `\n# 步骤4: 清理临时文件（可选）\n`;
    sortedClips.forEach((clip, index) => {
      ffmpegScript += `rm clip_${index + 1}.mp4\n`;
    });
    ffmpegScript += `rm filelist.txt\n`;

    // 生成 EDL 格式（可导入到其他剪辑软件）
    let edlContent = `TITLE: ${video.title}\n`;
    edlContent += `FCM: NON-DROP FRAME\n\n`;
    sortedClips.forEach((clip, index) => {
      const inTime = this.formatEDLTime(clip.startTime);
      const outTime = this.formatEDLTime(clip.endTime);
      edlContent += `${String(index + 1).padStart(3, '0')}  001      V     C        ${inTime} ${outTime} ${inTime} ${outTime}\n`;
    });

    // 生成 JSON 格式（完整数据）
    const jsonData = {
      title: video.title,
      bvid: video.bvid,
      duration: video.duration,
      exportTime: new Date().toISOString(),
      clips: sortedClips.map(clip => ({
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.endTime - clip.startTime
      }))
    };

    // 显示导出弹窗
    this.showExportModal(ffmpegScript, edlContent, JSON.stringify(jsonData, null, 2));
  },

  // 格式化 FFmpeg 时间
  formatFFmpegTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = (seconds % 60).toFixed(3);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.padStart(6, '0')}`;
  },

  // 格式化 EDL 时间
  formatEDLTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30); // 假设 30fps
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  },

  // 显示导出弹窗
  showExportModal(ffmpegScript, edlContent, jsonContent) {
    let modal = document.getElementById('bm-export-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bm-export-modal';
      modal.className = 'bm-modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="bm-modal bm-export-modal">
        <div class="bm-modal-header">
          <span>导出剪辑脚本</span>
          <button class="bm-modal-close" id="bm-close-export-modal">×</button>
        </div>
        <div class="bm-modal-body">
          <div class="bm-export-tabs">
            <button class="bm-export-tab active" data-format="ffmpeg">FFmpeg 脚本</button>
            <button class="bm-export-tab" data-format="edl">EDL 格式</button>
            <button class="bm-export-tab" data-format="json">JSON 数据</button>
          </div>
          <div class="bm-export-content">
            <textarea id="bm-export-text" readonly>${ffmpegScript}</textarea>
          </div>
          <div class="bm-export-actions">
            <button class="bm-btn" id="bm-copy-export">复制到剪贴板</button>
            <button class="bm-btn bm-btn-primary" id="bm-download-export">下载文件</button>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    const contents = { ffmpeg: ffmpegScript, edl: edlContent, json: jsonContent };
    const extensions = { ffmpeg: 'sh', edl: 'edl', json: 'json' };
    let currentFormat = 'ffmpeg';

    // Tab 切换
    modal.querySelectorAll('.bm-export-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.bm-export-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFormat = tab.dataset.format;
        document.getElementById('bm-export-text').value = contents[currentFormat];
      });
    });

    // 关闭
    document.getElementById('bm-close-export-modal')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // 复制
    document.getElementById('bm-copy-export')?.addEventListener('click', () => {
      navigator.clipboard.writeText(contents[currentFormat]);
      MaterialUI.showToast('已复制到剪贴板');
    });

    // 下载
    document.getElementById('bm-download-export')?.addEventListener('click', () => {
      const blob = new Blob([contents[currentFormat]], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentVideo.bvid}_edit.${extensions[currentFormat]}`;
      a.click();
      URL.revokeObjectURL(url);
      MaterialUI.showToast('文件已下载');
    });

    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  },

  // 显示草稿列表
  showDraftList() {
    const drafts = JSON.parse(localStorage.getItem('bm-drafts') || '[]');

    if (drafts.length === 0) {
      MaterialUI.showToast('暂无保存的草稿', 'info');
      return;
    }

    // 创建草稿列表弹窗
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
        this.loadDraft(drafts[index]);
        modal.style.display = 'none';
      });
    });

    modal.querySelectorAll('.bm-delete-draft-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.deleteDraft(index);
        this.showDraftList(); // 刷新列表
      });
    });

    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  },

  // 加载草稿
  loadDraft(draft) {
    if (!draft.timeline || !draft.currentVideo) {
      MaterialUI.showToast('草稿数据无效', 'error');
      return;
    }

    // 恢复时间轴
    this.timeline = draft.timeline;
    const duration = this.currentVideo?.duration || draft.currentVideo.duration;
    this.renderTimeline(duration);

    MaterialUI.showToast('草稿已加载');
  },

  // 删除草稿
  deleteDraft(index) {
    const drafts = JSON.parse(localStorage.getItem('bm-drafts') || '[]');
    drafts.splice(index, 1);
    localStorage.setItem('bm-drafts', JSON.stringify(drafts));
    MaterialUI.showToast('草稿已删除');
  },

  // 下载媒体文件
  downloadMedia(type) {
    const blob = type === 'video' ? this.videoBlob : this.audioBlob;
    if (!blob) {
      MaterialUI.showToast(`${type === 'video' ? '视频' : '音频'}尚未加载完成`, 'error');
      return;
    }

    const video = this.currentVideo;
    const safeTitle = video.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
    const ext = type === 'video' ? 'mp4' : 'm4a';
    const filename = `${safeTitle}_${video.bvid}.${ext}`;

    BiliAPI.downloadBlob(blob, filename);
    MaterialUI.showToast(`开始下载${type === 'video' ? '视频' : '音频'}: ${filename}`);
  },

  // 保存历史（用于撤销）
  saveHistory() {
    // 删除当前位置之后的历史
    this.history = this.history.slice(0, this.historyIndex + 1);

    // 保存当前状态
    this.history.push({
      timeline: JSON.parse(JSON.stringify(this.timeline)),
      selectedClipId: this.selectedClipId
    });

    // 限制历史长度
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this.historyIndex = this.history.length - 1;
  },

  // 撤销
  undo() {
    if (this.historyIndex <= 0) {
      MaterialUI.showToast('没有可撤销的操作', 'info');
      return;
    }

    this.historyIndex--;
    const state = this.history[this.historyIndex];
    this.timeline = JSON.parse(JSON.stringify(state.timeline));
    this.selectedClipId = state.selectedClipId;
    this.recalculateTimeline();
    this.renderTimeline();
    MaterialUI.showToast('已撤销');
  },

  // 重做
  redo() {
    if (this.historyIndex >= this.history.length - 1) {
      MaterialUI.showToast('没有可重做的操作', 'info');
      return;
    }

    this.historyIndex++;
    const state = this.history[this.historyIndex];
    this.timeline = JSON.parse(JSON.stringify(state.timeline));
    this.selectedClipId = state.selectedClipId;
    this.recalculateTimeline();
    this.renderTimeline();
    MaterialUI.showToast('已重做');
  },

  // 保存草稿
  async saveDraft() {
    const draft = {
      id: 'draft-' + Date.now(),
      createTime: Date.now(),
      timeline: this.timeline,
      currentVideo: this.currentVideo
    };

    // 存储到 localStorage
    const drafts = JSON.parse(localStorage.getItem('bm-drafts') || '[]');
    drafts.unshift(draft);
    localStorage.setItem('bm-drafts', JSON.stringify(drafts.slice(0, 10))); // 最多保存10个草稿

    MaterialUI.showToast('草稿已保存');
  },

  // 加载已收藏素材列表
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
          <button class="bm-btn-icon bm-add-to-timeline" data-bvid="${item.bvid}" title="添加到时间轴">+</button>
        </div>
      `).join('');

      // 绑定添加按钮事件
      container.querySelectorAll('.bm-add-to-timeline').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const bvid = btn.dataset.bvid;
          const material = materials.find(m => m.bvid === bvid);
          if (material) {
            await this.addVideoToTimeline(material);
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
          <button class="bm-btn-icon bm-add-search-to-timeline" data-bvid="${item.bvid}" title="添加到时间轴">+</button>
        </div>
      `).join('');

      // 绑定添加按钮事件
      container.querySelectorAll('.bm-add-search-to-timeline').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const bvid = btn.dataset.bvid;
          const video = result.list.find(v => v.bvid === bvid);
          if (video) {
            // addVideoToTimeline 内部会获取完整信息
            await this.addVideoToTimeline(video);
          }
        });
      });
    } catch (e) {
      console.error('搜索失败:', e);
      container.innerHTML = '<div class="bm-error">搜索失败</div>';
    }
  },

  // 添加视频到时间轴
  async addVideoToTimeline(videoInfo) {
    // 检查是否已经有这个视频的缓存
    const bvid = videoInfo.bvid;

    if (!this.mediaCache[bvid]) {
      // 需要先下载视频
      MaterialUI.showToast('正在加载视频...', 'info');

      try {
        // 如果没有 cid，先获取完整视频信息
        let fullVideoInfo = videoInfo;
        if (!videoInfo.cid) {
          try {
            fullVideoInfo = await BiliAPI.getVideoInfo(bvid);
          } catch (e) {
            console.error('获取视频信息失败:', e);
            MaterialUI.showToast('获取视频信息失败', 'error');
            return;
          }
        }

        // 获取播放地址
        const playUrl = await this.getPlayableUrl(fullVideoInfo);
        console.log('=== 导入视频调试信息 ===');
        console.log('视频信息:', fullVideoInfo);
        console.log('播放地址:', playUrl);
        console.log('视频URL:', playUrl?.video?.url);
        console.log('备用URL:', playUrl?.video?.backup);
        if (!playUrl || playUrl.type !== 'dash') {
          MaterialUI.showToast('无法获取视频地址', 'error');
          return;
        }

        // 更新 videoInfo 为完整信息
        videoInfo = fullVideoInfo;

        // 显示加载进度
        const loadingToast = document.createElement('div');
        loadingToast.className = 'bm-loading-toast';
        loadingToast.innerHTML = `
          <div class="bm-loading-content">
            <div class="bm-loading-title">加载: ${videoInfo.title.substring(0, 20)}...</div>
            <div class="bm-loading-progress-bar">
              <div class="bm-loading-progress" id="bm-add-video-progress"></div>
            </div>
            <div class="bm-loading-percent" id="bm-add-video-percent">0%</div>
          </div>
        `;
        document.body.appendChild(loadingToast);

        // 监听加载进度
        const addProgressHandler = (event) => {
          const message = event.detail;
          if (message.mediaType === 'video') {
            const progressBar = document.getElementById('bm-add-video-progress');
            const percentText = document.getElementById('bm-add-video-percent');
            if (progressBar) progressBar.style.width = `${message.percent}%`;
            if (percentText) percentText.textContent = `${message.percent}%`;
          }
        };
        window.addEventListener('bm-media-progress', addProgressHandler);

        let videoResult = null;
        let audioResult = null;
        try {
          // 下载视频和音频（传递备用URL和bvid）
          [videoResult, audioResult] = await Promise.all([
            playUrl.video ? BiliAPI.fetchMediaAsBlob(playUrl.video.url, 'video', playUrl.video.backup, bvid) : null,
            playUrl.audio ? BiliAPI.fetchMediaAsBlob(playUrl.audio.url, 'audio', playUrl.audio.backup, bvid) : null
          ]);
        } finally {
          // 无论成功失败都移除进度监听和提示
          window.removeEventListener('bm-media-progress', addProgressHandler);
          loadingToast.remove();
        }

        // 缓存媒体数据
        this.mediaCache[bvid] = {
          videoInfo: videoInfo,
          playUrl: playUrl,
          videoBlobUrl: videoResult?.blobUrl,
          videoBlob: videoResult?.blob,
          audioBlobUrl: audioResult?.blobUrl,
          audioBlob: audioResult?.blob
        };

      } catch (e) {
        console.error('加载视频失败:', e);
        MaterialUI.showToast('加载视频失败: ' + e.message, 'error');
        return;
      }
    }

    // 保存历史
    this.saveHistory();

    // 添加到时间轴
    const clipId = 'clip-' + Date.now();
    const duration = videoInfo.duration || 60;

    this.timeline.push({
      id: clipId,
      video: videoInfo,
      sourceStart: 0,
      sourceEnd: duration,
      timelineStart: this.timelineDuration
    });

    // 重新计算时间轴
    this.recalculateTimeline();
    this.renderTimeline();

    MaterialUI.showToast(`已添加: ${videoInfo.title.substring(0, 20)}...`);
  },

  // 切换到指定视频的媒体源
  async switchToVideoSource(bvid) {
    const cache = this.mediaCache[bvid];
    if (!cache) {
      console.error('视频未缓存:', bvid);
      return false;
    }

    const player = document.getElementById('bm-video-player');
    if (!player) return false;

    // 记录当前播放状态
    const wasPlaying = !player.paused;

    // 切换视频源
    if (cache.videoBlobUrl && player.src !== cache.videoBlobUrl) {
      // 等待视频加载完成
      await new Promise((resolve) => {
        const onLoaded = () => {
          player.removeEventListener('loadeddata', onLoaded);
          resolve();
        };
        player.addEventListener('loadeddata', onLoaded);
        player.src = cache.videoBlobUrl;
        player.load();
      });
    }

    // 切换音频源
    if (this.audioElement && cache.audioBlobUrl && this.audioElement.src !== cache.audioBlobUrl) {
      await new Promise((resolve) => {
        const onLoaded = () => {
          this.audioElement.removeEventListener('loadeddata', onLoaded);
          resolve();
        };
        this.audioElement.addEventListener('loadeddata', onLoaded);
        this.audioElement.src = cache.audioBlobUrl;
        this.audioElement.load();
      });
    }

    // 更新当前视频引用
    this.currentPlayingBvid = bvid;

    // 如果之前在播放，继续播放
    if (wasPlaying) {
      try {
        await player.play();
        if (this.audioElement) await this.audioElement.play();
      } catch (e) {
        console.error('恢复播放失败:', e);
      }
    }

    return true;
  },

  // 关闭编辑器
  closeEditor() {
    const editor = document.getElementById('bm-editor-overlay');
    if (editor) {
      editor.classList.remove('open');
    }
    // 停止视频播放
    const player = document.getElementById('bm-video-player');
    if (player) {
      player.pause();
      player.src = '';
    }
    // 停止并清理音频
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }
    // 清理同步定时器
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    // 释放 Blob URL
    if (this.videoBlobUrl) {
      URL.revokeObjectURL(this.videoBlobUrl);
      this.videoBlobUrl = null;
      this.videoBlob = null;
    }
    if (this.audioBlobUrl) {
      URL.revokeObjectURL(this.audioBlobUrl);
      this.audioBlobUrl = null;
      this.audioBlob = null;
    }
    // 释放所有缓存的 Blob URL
    for (const bvid in this.mediaCache) {
      const cache = this.mediaCache[bvid];
      if (cache.videoBlobUrl) URL.revokeObjectURL(cache.videoBlobUrl);
      if (cache.audioBlobUrl) URL.revokeObjectURL(cache.audioBlobUrl);
    }
    // 移除播放头
    const playhead = document.getElementById('bm-playhead');
    if (playhead) {
      playhead.remove();
    }
    // 移除键盘事件监听
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }
    // 移除进度监听
    if (this.progressHandler) {
      window.removeEventListener('bm-media-progress', this.progressHandler);
    }
    // 重置状态
    this.selectedClipId = null;
    this.playheadTime = 0;
    this.trackEventsBindded = false;
    this.subtitleData = null;
    this.timeline = [];
    this.timelineDuration = 0;
    this.history = [];
    this.historyIndex = -1;
    this.mediaCache = {};
    this.currentPlayingBvid = null;
    this.isInitialLoad = true;
  }
};

// 导出到全局
window.VideoEditor = VideoEditor;
