// 多轨道视频合成播放器
// 核心逻辑：主视频全屏 + 叠加轨道画中画
const CompositorPlayer = {
  mainVideo: null,
  mainAudio: null,
  mainLoadedBvid: null, // 当前主视频加载的 bvid
  pipElements: {},
  isPlaying: false,
  // 事件订阅取消函数
  _unsubscribeTimeUpdate: null,
  _unsubscribePlaybackEnd: null,

  get state() {
    return EditorState;
  },

  init() {
    // 只在没有设置时才获取元素引用
    if (!this.mainVideo) {
      this.mainVideo = document.getElementById('bm-video-player');
    }
    if (!this.mainAudio) {
      this.mainAudio = document.getElementById('bm-audio-player');
    }
  },

  // 加载主视频源
  async loadMainSource(bvid) {
    if (this.mainLoadedBvid === bvid) return true;
    
    const cache = this.state.mediaCache[bvid];
    if (!cache?.videoBlobUrl) {
      console.warn('[Compositor] 视频未缓存:', bvid);
      return false;
    }

    console.log('[Compositor] 切换主视频:', bvid);
    
    return new Promise(resolve => {
      const onLoaded = () => {
        this.mainVideo.removeEventListener('loadeddata', onLoaded);
        this.mainLoadedBvid = bvid;
        this.state.currentPlayingBvid = bvid;
        resolve(true);
      };
      this.mainVideo.addEventListener('loadeddata', onLoaded);
      this.mainVideo.src = cache.videoBlobUrl;
      
      if (this.mainAudio && cache.audioBlobUrl) {
        this.mainAudio.src = cache.audioBlobUrl;
      }
    });
  },

  // 播放中切换主视频（异步但不阻塞播放循环）
  async switchMainVideo(clip, currentTime) {
    const bvid = clip.video.bvid;
    const cache = this.state.mediaCache[bvid];
    
    if (!cache?.videoBlobUrl) {
      console.warn('[Compositor] 视频未缓存:', bvid);
      return;
    }
    
    // 先暂停当前视频
    this.mainVideo.pause();
    if (this.mainAudio) this.mainAudio.pause();
    
    // 切换源
    this.mainVideo.src = cache.videoBlobUrl;
    if (this.mainAudio && cache.audioBlobUrl) {
      this.mainAudio.src = cache.audioBlobUrl;
    }
    
    // 等待视频可以播放
    await new Promise(resolve => {
      const onCanPlay = () => {
        this.mainVideo.removeEventListener('canplay', onCanPlay);
        resolve();
      };
      this.mainVideo.addEventListener('canplay', onCanPlay);
      // 超时保护
      setTimeout(resolve, 2000);
    });
    
    // 设置正确的播放位置
    const sourceTime = clip.sourceStart + (currentTime - clip.timelineStart);
    this.mainVideo.currentTime = sourceTime;
    if (this.mainAudio) this.mainAudio.currentTime = sourceTime;
    
    // 更新状态
    this.mainLoadedBvid = bvid;
    this.state.currentPlayingBvid = bvid;
    
    // 继续播放
    if (this.isPlaying) {
      this.mainVideo.play().catch(() => {});
      if (this.mainAudio) this.mainAudio.play().catch(() => {});
    }
  },

  // 创建画中画视频元素
  createPipElement(trackIndex) {
    if (this.pipElements[trackIndex]) return this.pipElements[trackIndex];

    const wrapper = document.getElementById('bm-player-wrapper');
    if (!wrapper) {
      console.error('[PIP] 找不到 bm-player-wrapper');
      return null;
    }

    const container = document.createElement('div');
    container.className = 'bm-pip-container';
    container.dataset.trackIndex = trackIndex;
    
    // 轨道对应的颜色（和时间轴片段颜色一致）
    const trackColors = [
      '#e74c3c', // V1 红色（主轨道）
      '#2ecc71', // V2 绿色
      '#3498db', // V3 蓝色
      '#f39c12', // V4 橙色
      '#9b59b6', // V5 紫色
      '#1abc9c', // V6 青色
      '#e91e63', // V7 粉色
    ];
    const borderColor = trackColors[trackIndex] || '#3498db';
    
    // 简洁的样式 - 默认 25% 宽度
    Object.assign(container.style, {
      position: 'absolute',
      left: '10px',
      top: '10px',
      width: '10%',
      aspectRatio: '16/9',
      zIndex: String(200 + trackIndex),
      display: 'none',
      border: `2px solid ${borderColor}`,
      borderRadius: '4px',
      overflow: 'visible',
      background: '#000',
      cursor: 'grab',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
    });

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    Object.assign(video.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      pointerEvents: 'none' // 让点击穿透到容器
    });

    container.appendChild(video);
    
    // 添加四角缩放手柄
    ['top-left', 'top-right', 'bottom-left', 'bottom-right'].forEach(corner => {
      const handle = document.createElement('div');
      handle.className = `pip-resize-handle ${corner}`;
      container.appendChild(handle);
    });
    wrapper.appendChild(container);

    this.pipElements[trackIndex] = { container, video, loadedBvid: null };
    console.log(`[PIP] 创建画中画 trackIndex=${trackIndex}`);
    return this.pipElements[trackIndex];
  },

  // 加载画中画视频源
  async loadPipSource(trackIndex, bvid) {
    const pip = this.createPipElement(trackIndex);
    if (!pip) return false;
    if (pip.loadedBvid === bvid) return true;

    const cache = this.state.mediaCache[bvid];
    if (!cache?.videoBlobUrl) {
      console.warn(`[PIP] 视频未缓存: ${bvid}`);
      return false;
    }

    pip.video.src = cache.videoBlobUrl;
    pip.loadedBvid = bvid;
    
    // 等待视频可以播放
    return new Promise(resolve => {
      pip.video.oncanplay = () => resolve(true);
      pip.video.onerror = () => resolve(false);
      // 超时保护
      setTimeout(() => resolve(true), 3000);
    });
  },

  // 播放 - 使用 TimeController 统一控制
  async play() {
    const currentTime = TimeController.currentTime;

    // 查找当前时间的主轨道片段
    const mainClip = this.getClipAtTime(0, currentTime);
    
    if (mainClip) {
      // 确保加载正确的视频源
      await this.loadMainSource(mainClip.video.bvid);
      
      // 计算源时间
      const sourceTime = mainClip.sourceStart + (currentTime - mainClip.timelineStart);
      
      this.mainVideo.currentTime = sourceTime;
      if (this.mainAudio) this.mainAudio.currentTime = sourceTime;
      
      this.mainVideo.play().catch(() => {});
      if (this.mainAudio) this.mainAudio.play().catch(() => {});
      
      this.currentClipId = mainClip.id;
    } else {
      this.currentClipId = null;
    }

    // 画中画 - 检查所有叠加轨道
    const state = this.state;
    for (let i = 1; i < state.tracks.video.length; i++) {
      const clip = this.getClipAtTime(i, currentTime);
      const pip = this.pipElements[i];
      
      if (clip) {
        // 有片段，显示画中画
        await this.loadPipSource(i, clip.video.bvid);
        if (pip) {
          const sourceTime = clip.sourceStart + (currentTime - clip.timelineStart);
          pip.video.currentTime = sourceTime;
          pip.container.style.display = 'block';
          this.applyTransform(i, clip.transform);
          pip.video.play().catch(() => {});
        }
      } else if (pip) {
        // 没有片段，隐藏画中画
        pip.container.style.display = 'none';
        pip.video.pause();
      }
    }

    this.isPlaying = true;
    
    // 先订阅事件，再启动 TimeController
    this.startPlaybackLoop();
    
    // 启动 TimeController 的播放循环
    TimeController.play();
    
    TimelineManager.updatePlayhead();
  },

  // 暂停 - 同时暂停 TimeController 和视频元素
  pause() {
    this.isPlaying = false;
    
    // 暂停 TimeController
    TimeController.pause();
    
    // 取消事件订阅
    this._unsubscribeAll();
    
    // 暂停所有视频元素
    this.mainVideo?.pause();
    this.mainAudio?.pause();
    Object.values(this.pipElements).forEach(pip => pip.video?.pause());
  },

  // 停止 - 暂停并回到起点
  stop() {
    this.pause();
    // 只调用 seekTo，它内部会处理 TimeController.seek
    this.seekTo(0);
  },

  // 跳转到指定时间轴时间 - 使用 TimeController
  async seekTo(timelineTime) {
    // 确保元素引用存在
    if (!this.mainVideo) {
      this.mainVideo = document.getElementById('bm-video-player');
    }
    if (!this.mainAudio) {
      this.mainAudio = document.getElementById('bm-audio-player');
    }
    
    // 使用 TimeController 进行跳转（会自动限制范围）
    TimeController.seek(timelineTime);
    const targetTime = TimeController.currentTime;
    
    // 先停止播放循环
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.isPlaying = false;
      TimeController.pause();
      this._unsubscribeAll();
    }

    // 主视频 - 查找该时间点的片段
    const mainClip = this.getClipAtTime(0, targetTime);
    if (mainClip && this.mainVideo) {
      // 切换视频源（如果需要）
      if (this.mainLoadedBvid !== mainClip.video.bvid) {
        await this.loadMainSource(mainClip.video.bvid);
      }
      
      // 计算源视频时间：片段源起点 + (时间轴时间 - 片段时间轴起点)
      const sourceTime = mainClip.sourceStart + (targetTime - mainClip.timelineStart);
      
      // 确保源时间在有效范围内
      const clampedSourceTime = Math.max(mainClip.sourceStart, Math.min(mainClip.sourceEnd, sourceTime));
      
      this.mainVideo.currentTime = clampedSourceTime;
      if (this.mainAudio) this.mainAudio.currentTime = clampedSourceTime;
      
      // 更新当前片段ID
      this.currentClipId = mainClip.id;
    }

    // 画中画轨道
    const state = this.state;
    for (let i = 1; i < state.tracks.video.length; i++) {
      const clip = this.getClipAtTime(i, targetTime);
      const pip = this.pipElements[i];
      
      if (clip) {
        await this.loadPipSource(i, clip.video.bvid);
        if (pip) {
          const sourceTime = clip.sourceStart + (targetTime - clip.timelineStart);
          pip.video.currentTime = Math.max(0, sourceTime);
          pip.container.style.display = 'block';
          this.applyTransform(i, clip.transform);
        }
      } else if (pip) {
        pip.container.style.display = 'none';
      }
    }

    TimelineManager.updatePlayhead();
    PlayerController.updateTimeDisplay();

    // 恢复播放
    if (wasPlaying) {
      await this.play();
    }
  },

  // 播放循环 - 完全由 TimeController 驱动
  startPlaybackLoop() {
    // 取消之前的订阅，避免重复订阅
    this._unsubscribeAll();
    
    // 订阅时间更新事件 - TimeController 会驱动时间前进
    this._unsubscribeTimeUpdate = TimeController.on(TimeController.Events.TIME_UPDATE, ({ currentTime }) => {
      this._onTimeUpdate(currentTime);
    });
    
    // 订阅播放结束事件
    this._unsubscribePlaybackEnd = TimeController.on(TimeController.Events.PLAYBACK_END, () => {
      this.isPlaying = false;
      document.getElementById('bm-play-btn').textContent = '▶';
      TimelineManager.updatePlayhead();
      PlayerController.updateTimeDisplay();
    });
    
    // 注意：不在这里调用 TimeController.play()
    // 因为 play() 方法已经负责启动 TimeController
  },
  
  // 取消所有事件订阅
  _unsubscribeAll() {
    if (this._unsubscribeTimeUpdate) {
      this._unsubscribeTimeUpdate();
      this._unsubscribeTimeUpdate = null;
    }
    if (this._unsubscribePlaybackEnd) {
      this._unsubscribePlaybackEnd();
      this._unsubscribePlaybackEnd = null;
    }
  },
  
  // 时间更新回调
  _onTimeUpdate(currentTime) {
    if (!this.isPlaying) return;
    
    const state = this.state;

    // 主轨道处理
    const mainClip = this.getClipAtTime(0, currentTime);
    
    if (mainClip) {
      // 主轨道有片段：播放视频
      this.hideBackground();
      
      // 检查是否需要切换片段
      if (mainClip.id !== this.currentClipId) {
        this.currentClipId = mainClip.id;
        
        // 检查是否需要切换视频源（不同的视频）
        if (mainClip.video.bvid !== this.mainLoadedBvid) {
          this.switchMainVideo(mainClip, currentTime);
        } else {
          // 同一个视频，只需要跳转时间
          const sourceTime = mainClip.sourceStart + (currentTime - mainClip.timelineStart);
          this.mainVideo.currentTime = sourceTime;
          if (this.mainAudio) this.mainAudio.currentTime = sourceTime;
        }
      }
      
      if (this.mainVideo.paused) {
        this.mainVideo.play().catch(() => {});
        if (this.mainAudio) this.mainAudio.play().catch(() => {});
      }
    } else {
      // 主轨道空隙：显示黑屏
      this.showBackground('gap');
      this.mainVideo.pause();
      if (this.mainAudio) this.mainAudio.pause();
      this.currentClipId = null;
    }

    // 更新画中画
    this.updatePipVisibility(currentTime);

    // 更新 UI
    TimelineManager.updatePlayhead();
    PlayerController.updateTimeDisplay();
  },
  
  // 显示背景（主轨道空隙时显示黑色）
  showBackground(type) {
    if (!this.backgroundEl) {
      this.backgroundEl = document.createElement('div');
      this.backgroundEl.id = 'bm-player-background';
      this.backgroundEl.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        z-index: 5;
        display: none;
        pointer-events: none;
      `;
      const wrapper = document.getElementById('bm-player-wrapper');
      if (wrapper) wrapper.appendChild(this.backgroundEl);
    }
    
    // 主轨道空隙：黑色背景
    this.backgroundEl.style.background = '#000';
    this.backgroundEl.style.display = 'block';
  },
  
  // 隐藏背景
  hideBackground() {
    if (this.backgroundEl) {
      this.backgroundEl.style.display = 'none';
    }
  },

  // 更新画中画显示状态
  updatePipVisibility(timelineTime) {
    const state = this.state;
    
    for (let i = 1; i < state.tracks.video.length; i++) {
      const clip = this.getClipAtTime(i, timelineTime);
      let pip = this.pipElements[i];

      if (clip) {
        // 有片段，确保画中画显示
        if (!pip || pip.container.style.display === 'none') {
          this.activatePip(i, clip, timelineTime);
          pip = this.pipElements[i]; // 重新获取
        }
        if (pip) {
          this.applyTransform(i, clip.transform);
        }
      } else if (pip) {
        if (pip.container.style.display !== 'none') {
          pip.container.style.display = 'none';
          pip.video.pause();
        }
      }
    }
  },

  // 激活画中画
  async activatePip(trackIndex, clip, timelineTime) {
    await this.loadPipSource(trackIndex, clip.video.bvid);
    const pip = this.pipElements[trackIndex];
    if (!pip) return;

    const sourceTime = clip.sourceStart + (timelineTime - clip.timelineStart);
    pip.video.currentTime = sourceTime;
    pip.container.style.display = 'block';
    pip.video.play().catch(() => {});
  },

  // 获取指定轨道在指定时间的片段
  getClipAtTime(trackIndex, timelineTime) {
    const track = this.state.tracks.video[trackIndex];
    if (!track || track.length === 0) return null;

    for (const clip of track) {
      const clipDuration = clip.sourceEnd - clip.sourceStart;
      const clipEnd = clip.timelineStart + clipDuration;
      
      // 在片段范围内 [start, end)
      if (timelineTime >= clip.timelineStart && timelineTime < clipEnd) {
        return clip;
      }
    }
    
    return null;
  },
  
  // 应用画中画位置/大小（只在首次显示时应用）
  applyTransform(trackIndex, transform, forceApply = false) {
    const pip = this.pipElements[trackIndex];
    if (!pip) return;

    // 如果已经有用户设置的位置，不覆盖（除非强制）
    if (!forceApply && pip.userPositioned) {
      return;
    }

    const wrapper = document.getElementById('bm-player-wrapper');
    if (!wrapper) return;
    
    const wrapperWidth = wrapper.offsetWidth;
    const wrapperHeight = wrapper.offsetHeight;
    
    // 默认值：10% 宽度，16:9 比例，左上角位置
    const t = transform || { x: 10, y: 10, scale: 0.1, opacity: 1, centered: false };
    
    // 计算像素尺寸
    const width = wrapperWidth * t.scale;
    const height = width * 9 / 16;
    
    // 计算位置（像素）
    let left, top;
    if (t.centered) {
      left = (wrapperWidth * t.x / 100) - width / 2;
      top = (wrapperHeight * t.y / 100) - height / 2;
    } else {
      left = wrapperWidth * t.x / 100;
      top = wrapperHeight * t.y / 100;
    }
    
    // 确保不超出边界
    left = Math.max(0, Math.min(wrapperWidth - width, left));
    top = Math.max(0, Math.min(wrapperHeight - height, top));
    
    // 应用样式
    pip.container.style.width = width + 'px';
    pip.container.style.height = height + 'px';
    pip.container.style.left = left + 'px';
    pip.container.style.top = top + 'px';
    pip.container.style.right = 'auto';
    pip.container.style.bottom = 'auto';
    pip.container.style.transform = 'none';
    pip.container.style.opacity = t.opacity;
  },
  
  // 标记画中画已被用户定位
  markUserPositioned(trackIndex) {
    const pip = this.pipElements[trackIndex];
    if (pip) {
      pip.userPositioned = true;
    }
  },
  
  // 重置用户定位标记
  resetUserPositioned(trackIndex) {
    const pip = this.pipElements[trackIndex];
    if (pip) {
      pip.userPositioned = false;
    }
  },
  
  // 调整所有画中画位置（退出全屏时调用）
  adjustPipPositions() {
    const wrapper = document.getElementById('bm-player-wrapper');
    if (!wrapper) return;
    
    const wrapperWidth = wrapper.offsetWidth;
    const wrapperHeight = wrapper.offsetHeight;
    
    Object.values(this.pipElements).forEach(pip => {
      if (!pip || pip.container.style.display === 'none') return;
      
      const container = pip.container;
      let left = parseFloat(container.style.left) || 0;
      let top = parseFloat(container.style.top) || 0;
      const width = container.offsetWidth;
      const height = container.offsetHeight;
      
      // 确保不超出边界
      let needsAdjust = false;
      
      if (left + width > wrapperWidth) {
        left = Math.max(0, wrapperWidth - width);
        needsAdjust = true;
      }
      if (top + height > wrapperHeight) {
        top = Math.max(0, wrapperHeight - height);
        needsAdjust = true;
      }
      if (left < 0) {
        left = 0;
        needsAdjust = true;
      }
      if (top < 0) {
        top = 0;
        needsAdjust = true;
      }
      
      if (needsAdjust) {
        container.style.left = left + 'px';
        container.style.top = top + 'px';
      }
    });
  },

  // 清理
  cleanup() {
    this.pause();
    this._unsubscribeAll();
    this.mainLoadedBvid = null;
    Object.values(this.pipElements).forEach(pip => {
      pip.video?.pause();
      pip.container?.remove();
    });
    this.pipElements = {};
    
    // 隐藏背景
    this.hideBackground();
  }
};

window.CompositorPlayer = CompositorPlayer;
