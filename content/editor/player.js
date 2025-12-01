// 播放器控制模块 - 简化版
// 主要负责：初始化、加载视频、UI更新
// 播放控制完全委托给 CompositorPlayer
const PlayerController = {
  videoElement: null,
  audioElement: null,
  syncInterval: null,

  get state() {
    return EditorState;
  },

  // 初始化播放器
  async init() {
    const state = this.state;
    const player = document.getElementById('bm-video-player');
    const overlay = document.getElementById('bm-player-overlay');
    const videoTrackStatus = document.getElementById('bm-video-track-status');
    const audioTrackStatus = document.getElementById('bm-audio-track-status');

    this.videoElement = player;

    if (!state.currentVideo.playUrl) {
      overlay.innerHTML = '<div class="bm-player-error">无法加载视频</div>';
      return;
    }

    const playData = state.currentVideo.playUrl;

    if (playData.type === 'dash') {
      await this.initDashPlayer(playData, player, overlay, videoTrackStatus, audioTrackStatus);
    }
  },

  // 初始化 DASH 播放器
  async initDashPlayer(playData, player, overlay, videoTrackStatus, audioTrackStatus) {
    const state = this.state;

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

      this.setupProgressListener();

      const currentBvid = state.currentVideo.bvid;
      const [videoResult, audioResult] = await Promise.all([
        playData.video ? BiliAPI.fetchMediaAsBlob(playData.video.url, 'video', playData.video.backup, currentBvid) : null,
        playData.audio ? BiliAPI.fetchMediaAsBlob(playData.audio.url, 'audio', playData.audio.backup, currentBvid) : null
      ]);

      this.removeProgressListener();

      // 缓存媒体数据
      state.mediaCache[currentBvid] = {
        videoInfo: state.currentVideo,
        playUrl: playData,
        videoBlobUrl: videoResult?.blobUrl,
        videoBlob: videoResult?.blob,
        audioBlobUrl: audioResult?.blobUrl,
        audioBlob: audioResult?.blob
      };
      state.currentPlayingBvid = currentBvid;

      if (videoResult?.blobUrl) {
        player.src = videoResult.blobUrl;
        player.load();
      }

      state.isInitialLoad = true;

      player.onloadedmetadata = () => {
        if (state.isInitialLoad) {
          state.isInitialLoad = false;
          overlay.style.display = 'none';

          state.currentVideo.duration = player.duration;

          // 初始化时间轴
          TimelineManager.init();

          videoTrackStatus.innerHTML = `
            <span class="bm-track-icon">🎬</span>
            <span>${playData.video.width}x${playData.video.height}</span>
            <span class="bm-track-ready">已就绪</span>
          `;

          // 初始化音频
          if (audioResult?.blobUrl) {
            this.initAudioTrack(audioResult.blobUrl, player);
          }
          
          // 同步 CompositorPlayer 的状态
          if (typeof CompositorPlayer !== 'undefined') {
            CompositorPlayer.mainLoadedBvid = currentBvid;
            CompositorPlayer.mainVideo = player;
            CompositorPlayer.mainAudio = this.audioElement;
          }

          SubtitleManager.load();
        }
      };

      player.onerror = (e) => {
        console.error('视频播放错误:', e);
        overlay.innerHTML = `<div class="bm-player-error">视频加载失败</div>`;
      };

      // 不再监听 timeupdate，播放控制完全由 CompositorPlayer 处理

    } catch (e) {
      console.error('加载视频失败:', e);
      this.removeProgressListener();
      this.showLoadError(overlay, playData, e.message);
    }
  },

  setupProgressListener() {
    let lastUpdate = 0;
    this.progressHandler = (event) => {
      const message = event.detail;
      const now = Date.now();
      if (now - lastUpdate < 200) return;
      lastUpdate = now;

      const progressBar = document.getElementById(`bm-${message.mediaType}-progress-bar`);
      const progressText = document.getElementById(`bm-${message.mediaType}-progress-text`);
      if (progressBar) progressBar.style.width = `${message.percent}%`;
      if (progressText) {
        progressText.textContent = `${message.percent}% (${this.formatBytes(message.loaded)}/${this.formatBytes(message.total)})`;
      }
    };
    window.addEventListener('bm-media-progress', this.progressHandler);
  },

  removeProgressListener() {
    if (this.progressHandler) {
      window.removeEventListener('bm-media-progress', this.progressHandler);
      this.progressHandler = null;
    }
  },

  showLoadError(overlay, playData, errorMessage) {
    overlay.innerHTML = `
      <div class="bm-player-error">
        <p>视频加载失败: ${errorMessage}</p>
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
  },

  useIframePlayer() {
    const state = this.state;
    const wrapper = document.getElementById('bm-player-wrapper');
    const video = state.currentVideo;

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

    TimelineManager.generateRuler(video.duration);
    TimelineManager.addClip(video, 0, video.duration);
  },

  // 初始化音频轨道
  initAudioTrack(audioUrl, videoPlayer) {
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

    const audioTrackStatus = document.getElementById('bm-audio-track-status');
    if (audioTrackStatus) {
      audioTrackStatus.innerHTML = `
        <span class="bm-track-icon">🔊</span>
        <span class="bm-track-ready">已就绪</span>
        <button class="bm-btn-icon bm-audio-mute-btn" id="bm-toggle-audio" title="静音/取消静音">🔊</button>
      `;

      document.getElementById('bm-toggle-audio')?.addEventListener('click', () => {
        this.state.audioMuted = !this.state.audioMuted;
        audio.muted = this.state.audioMuted;
        document.getElementById('bm-toggle-audio').textContent = this.state.audioMuted ? '🔇' : '🔊';
      });
    }

    // 主视频静音，只用分离的音频轨道播放声音
    videoPlayer.muted = true;
  },

  // 切换播放/暂停 - 使用 TimeController 统一控制
  async togglePlay() {
    if (!TimeController.isPlaying) {
      // 播放结束后从头播放
      if (TimeController.currentTime >= TimeController.contentDuration) {
        TimeController.seek(0);
      }
      
      if (typeof CompositorPlayer !== 'undefined') {
        await CompositorPlayer.play();
      }
      
      document.getElementById('bm-play-btn').textContent = '⏸';
    } else {
      if (typeof CompositorPlayer !== 'undefined') {
        CompositorPlayer.pause();
      }
      
      document.getElementById('bm-play-btn').textContent = '▶';
    }
  },

  // 停止播放 - 委托给 CompositorPlayer
  async stop() {
    const state = this.state;
    state.isPlaying = false;
    
    if (typeof CompositorPlayer !== 'undefined') {
      CompositorPlayer.stop();
    }
    
    document.getElementById('bm-play-btn').textContent = '▶';
  },

  // 跳转 - 委托给 CompositorPlayer
  async seekToTime(timelineTime) {
    if (typeof CompositorPlayer !== 'undefined') {
      await CompositorPlayer.seekTo(timelineTime);
    }
  },

  // 更新时间显示和进度条 - 使用 TimeController
  updateTimeDisplay() {
    const currentTime = TimeController.currentTime;
    // 使用内容时长（所有轨道最长结束点），不是时间轴可视范围
    const duration = TimeController.contentDuration || 1;
    
    // 更新底部时间显示
    const currentTimeEl = document.getElementById('bm-current-time');
    if (currentTimeEl) {
      currentTimeEl.textContent = TimeController.formatTime(currentTime);
    }
    
    // 更新播放器内时间显示
    const playerTimeEl = document.getElementById('bm-player-time');
    if (playerTimeEl) {
      playerTimeEl.textContent = `${TimeController.formatTime(currentTime)} / ${TimeController.formatTime(duration)}`;
    }
    
    // 更新进度条 - 基于内容时长
    const progressEl = document.getElementById('bm-player-progress-played');
    if (progressEl) {
      const percent = Math.min(100, (currentTime / duration) * 100);
      progressEl.style.width = `${percent}%`;
    }
  },

  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  cleanup() {
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
    }
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (typeof CompositorPlayer !== 'undefined') {
      CompositorPlayer.cleanup();
    }
    this.removeProgressListener();
  }
};

window.PlayerController = PlayerController;
