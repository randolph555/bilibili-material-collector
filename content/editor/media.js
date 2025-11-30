// 媒体加载管理模块
const MediaLoader = {
  // 获取状态引用
  get state() {
    return EditorState;
  },

  // 获取可播放的视频地址
  async getPlayableUrl(videoInfo) {
    try {
      const result = await BiliAPI.getPlayUrl(videoInfo.bvid, videoInfo.cid);
      if (result.success && result.data) {
        return result.data;
      }
    } catch (e) {
      console.error('获取播放地址失败:', e);
    }
    return null;
  },

  // 加载视频到缓存
  async loadVideo(videoInfo, showProgress = true) {
    const state = this.state;
    const bvid = videoInfo.bvid;

    // 已缓存则直接返回
    if (state.mediaCache[bvid]) {
      return state.mediaCache[bvid];
    }

    // 获取完整视频信息
    let fullVideoInfo = videoInfo;
    if (!videoInfo.cid) {
      try {
        fullVideoInfo = await BiliAPI.getVideoInfo(bvid);
      } catch (e) {
        console.error('获取视频信息失败:', e);
        throw new Error('获取视频信息失败');
      }
    }

    // 获取播放地址
    const playUrl = await this.getPlayableUrl(fullVideoInfo);
    if (!playUrl || playUrl.type !== 'dash') {
      throw new Error('无法获取视频地址');
    }

    let loadingToast = null;
    let progressHandler = null;

    if (showProgress) {
      // 显示加载进度
      loadingToast = document.createElement('div');
      loadingToast.className = 'bm-loading-toast';
      loadingToast.innerHTML = `
        <div class="bm-loading-content">
          <div class="bm-loading-title">加载: ${fullVideoInfo.title.substring(0, 20)}...</div>
          <div class="bm-loading-progress-bar">
            <div class="bm-loading-progress" id="bm-add-video-progress"></div>
          </div>
          <div class="bm-loading-percent" id="bm-add-video-percent">0%</div>
        </div>
      `;
      document.body.appendChild(loadingToast);

      progressHandler = (event) => {
        const message = event.detail;
        if (message.mediaType === 'video') {
          const progressBar = document.getElementById('bm-add-video-progress');
          const percentText = document.getElementById('bm-add-video-percent');
          if (progressBar) progressBar.style.width = `${message.percent}%`;
          if (percentText) percentText.textContent = `${message.percent}%`;
        }
      };
      window.addEventListener('bm-media-progress', progressHandler);
    }

    try {
      // 下载视频和音频
      const [videoResult, audioResult] = await Promise.all([
        playUrl.video ? BiliAPI.fetchMediaAsBlob(playUrl.video.url, 'video', playUrl.video.backup, bvid) : null,
        playUrl.audio ? BiliAPI.fetchMediaAsBlob(playUrl.audio.url, 'audio', playUrl.audio.backup, bvid) : null
      ]);

      // 缓存媒体数据
      const cache = {
        videoInfo: fullVideoInfo,
        playUrl: playUrl,
        videoBlobUrl: videoResult?.blobUrl,
        videoBlob: videoResult?.blob,
        audioBlobUrl: audioResult?.blobUrl,
        audioBlob: audioResult?.blob
      };

      state.mediaCache[bvid] = cache;
      return cache;

    } finally {
      if (progressHandler) {
        window.removeEventListener('bm-media-progress', progressHandler);
      }
      if (loadingToast) {
        loadingToast.remove();
      }
    }
  },

  // 切换到指定视频的媒体源
  async switchSource(bvid) {
    const state = this.state;
    const cache = state.mediaCache[bvid];
    
    if (!cache) {
      console.error('视频未缓存:', bvid);
      return false;
    }

    const player = PlayerController.videoElement;
    if (!player) return false;

    const wasPlaying = !player.paused;

    // 切换视频源
    if (cache.videoBlobUrl && player.src !== cache.videoBlobUrl) {
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
    const audio = PlayerController.audioElement;
    if (audio && cache.audioBlobUrl && audio.src !== cache.audioBlobUrl) {
      await new Promise((resolve) => {
        const onLoaded = () => {
          audio.removeEventListener('loadeddata', onLoaded);
          resolve();
        };
        audio.addEventListener('loadeddata', onLoaded);
        audio.src = cache.audioBlobUrl;
        audio.load();
      });
    }

    state.currentPlayingBvid = bvid;

    if (wasPlaying) {
      try {
        await player.play();
        if (audio) await audio.play();
      } catch (e) {
        console.error('恢复播放失败:', e);
      }
    }

    return true;
  },

  // 添加视频到时间轴
  async addToTimeline(videoInfo, trackIndex = 0) {
    const state = this.state;
    const bvid = videoInfo.bvid;

    // 加载视频
    let cache = state.mediaCache[bvid];
    if (!cache) {
      MaterialUI.showToast('正在加载视频...', 'info');
      try {
        cache = await this.loadVideo(videoInfo);
        videoInfo = cache.videoInfo;
      } catch (e) {
        MaterialUI.showToast('加载视频失败: ' + e.message, 'error');
        return null;
      }
    }

    // 保存历史
    state.saveHistory();

    // 添加到时间轴
    const duration = videoInfo.duration || 60;
    const newClip = TimelineManager.addClip(videoInfo, 0, duration, trackIndex);

    // 如果当前没有活动片段，设置第一个片段为活动片段
    if (!state.activeClip && state.tracks.video[0].length > 0) {
      state.activeClip = state.tracks.video[0][0];
    }
    
    // 预加载到合成播放器
    if (typeof CompositorPlayer !== 'undefined') {
      CompositorPlayer.ensureVideoLoaded(bvid).catch(() => {});
    }

    const trackName = `V${trackIndex + 1} 视频轨道`;
    MaterialUI.showToast(`已添加到${trackName}: ${videoInfo.title.substring(0, 20)}...`);
    return newClip;
  },
  
  // 添加到画中画轨道
  async addToPipTrack(videoInfo) {
    return this.addToTimeline(videoInfo, 1);
  },

  // 下载媒体文件
  download(type) {
    const state = this.state;
    const cache = state.mediaCache[state.currentVideo?.bvid];
    const blob = type === 'video' ? cache?.videoBlob : cache?.audioBlob;
    
    if (!blob) {
      MaterialUI.showToast(`${type === 'video' ? '视频' : '音频'}尚未加载完成`, 'error');
      return;
    }

    const video = state.currentVideo;
    const safeTitle = video.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
    const ext = type === 'video' ? 'mp4' : 'm4a';
    const filename = `${safeTitle}_${video.bvid}.${ext}`;

    BiliAPI.downloadBlob(blob, filename);
    MaterialUI.showToast(`开始下载${type === 'video' ? '视频' : '音频'}: ${filename}`);
  },

  // 释放所有缓存的 Blob URL
  releaseAll() {
    const state = this.state;
    for (const bvid in state.mediaCache) {
      const cache = state.mediaCache[bvid];
      if (cache.videoBlobUrl) URL.revokeObjectURL(cache.videoBlobUrl);
      if (cache.audioBlobUrl) URL.revokeObjectURL(cache.audioBlobUrl);
    }
    state.mediaCache = {};
  }
};

// 导出
window.MediaLoader = MediaLoader;
