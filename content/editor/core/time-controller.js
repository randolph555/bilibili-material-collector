/**
 * TimeController - 统一时间控制器
 * 
 * 核心职责：
 * 1. 管理播放时间（单一时间源）
 * 2. 计算内容时长
 * 3. 协调播放器、时间轴、进度条的同步
 * 4. 提供事件订阅机制
 * 
 * 设计原则：
 * - 单一职责：只管时间，不管UI渲染
 * - 事件驱动：状态变化通过事件通知
 * - 向后兼容：可与现有 EditorState 共存
 */
const TimeController = {
  // ========== 核心状态 ==========
  _currentTime: 0,        // 当前播放位置（秒）
  _contentDuration: 0,    // 内容总时长（所有轨道最长结束点）
  _timelineDuration: 0,   // 时间轴可视范围（含额外空间）
  _isPlaying: false,      // 播放状态
  _playbackRate: 1,       // 播放速率
  
  // ========== 事件系统 ==========
  _listeners: {},
  
  // 事件类型
  Events: {
    TIME_UPDATE: 'timeUpdate',           // 时间变化
    DURATION_CHANGE: 'durationChange',   // 时长变化
    PLAY_STATE_CHANGE: 'playStateChange', // 播放状态变化
    SEEK: 'seek',                         // 跳转
    PLAYBACK_END: 'playbackEnd',         // 播放结束
  },

  // ========== 初始化 ==========
  init() {
    this._currentTime = 0;
    this._contentDuration = 0;
    this._timelineDuration = 0;
    this._isPlaying = false;
    this._playbackRate = 1;
    this._listeners = {};
    this._animationId = null;
    this._lastFrameTime = 0;
  },

  // ========== 时间属性（getter/setter）==========
  
  get currentTime() {
    return this._currentTime;
  },
  
  set currentTime(value) {
    const oldTime = this._currentTime;
    // 限制在有效范围内
    this._currentTime = Math.max(0, Math.min(value, this._contentDuration));
    
    if (oldTime !== this._currentTime) {
      this._emit(this.Events.TIME_UPDATE, {
        currentTime: this._currentTime,
        previousTime: oldTime
      });
    }
  },

  get contentDuration() {
    return this._contentDuration;
  },

  set contentDuration(value) {
    const oldDuration = this._contentDuration;
    this._contentDuration = Math.max(0, value);
    
    // 如果当前时间超出新时长，调整到末尾
    if (this._currentTime > this._contentDuration) {
      this._currentTime = this._contentDuration;
    }
    
    if (oldDuration !== this._contentDuration) {
      this._emit(this.Events.DURATION_CHANGE, {
        contentDuration: this._contentDuration,
        timelineDuration: this._timelineDuration
      });
    }
  },

  get timelineDuration() {
    return this._timelineDuration;
  },

  set timelineDuration(value) {
    this._timelineDuration = Math.max(0, value);
  },

  get isPlaying() {
    return this._isPlaying;
  },

  get playbackRate() {
    return this._playbackRate;
  },

  set playbackRate(value) {
    this._playbackRate = Math.max(0.25, Math.min(4, value));
  },

  // ========== 播放控制 ==========
  
  play() {
    if (this._isPlaying) return;
    
    // 如果在结尾，从头开始
    if (this._currentTime >= this._contentDuration) {
      this._currentTime = 0;
    }
    
    this._isPlaying = true;
    this._lastFrameTime = performance.now();
    this._startPlaybackLoop();
    
    this._emit(this.Events.PLAY_STATE_CHANGE, { isPlaying: true });
  },

  pause() {
    if (!this._isPlaying) return;
    
    this._isPlaying = false;
    this._stopPlaybackLoop();
    
    this._emit(this.Events.PLAY_STATE_CHANGE, { isPlaying: false });
  },

  stop() {
    this.pause();
    this.seek(0);
  },

  togglePlay() {
    if (this._isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  },

  seek(time) {
    const oldTime = this._currentTime;
    this._currentTime = Math.max(0, Math.min(time, this._contentDuration));
    
    this._emit(this.Events.SEEK, {
      currentTime: this._currentTime,
      previousTime: oldTime
    });
    
    // 同时触发 timeUpdate
    this._emit(this.Events.TIME_UPDATE, {
      currentTime: this._currentTime,
      previousTime: oldTime
    });
  },

  // 相对跳转
  seekBy(delta) {
    this.seek(this._currentTime + delta);
  },

  // 跳转到百分比位置
  seekToPercent(percent) {
    this.seek(percent * this._contentDuration);
  },

  // ========== 播放循环 ==========
  
  _startPlaybackLoop() {
    const loop = () => {
      if (!this._isPlaying) return;
      
      const now = performance.now();
      const delta = (now - this._lastFrameTime) / 1000 * this._playbackRate;
      this._lastFrameTime = now;
      
      const newTime = this._currentTime + delta;
      
      // 检查是否到达结尾
      if (newTime >= this._contentDuration) {
        this._currentTime = this._contentDuration;
        this._isPlaying = false;
        
        this._emit(this.Events.TIME_UPDATE, { currentTime: this._currentTime });
        this._emit(this.Events.PLAYBACK_END, { currentTime: this._currentTime });
        this._emit(this.Events.PLAY_STATE_CHANGE, { isPlaying: false });
        return;
      }
      
      this._currentTime = newTime;
      this._emit(this.Events.TIME_UPDATE, { currentTime: this._currentTime });
      
      this._animationId = requestAnimationFrame(loop);
    };
    
    this._animationId = requestAnimationFrame(loop);
  },

  _stopPlaybackLoop() {
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
  },

  // ========== 时长计算 ==========
  
  /**
   * 根据轨道数据重新计算时长
   * @param {Array} tracks - 轨道数组 [track1, track2, ...]
   */
  recalculateDuration(tracks) {
    let maxEnd = 0;
    
    tracks.forEach(track => {
      track.forEach(clip => {
        const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
        maxEnd = Math.max(maxEnd, clipEnd);
      });
    });
    
    this.contentDuration = maxEnd;
    
    // 时间轴可视范围 = 内容时长 + 额外空间
    const extraSpace = Math.max(10, maxEnd * 0.2);
    this.timelineDuration = Math.max(maxEnd + extraSpace, 30);
    
    return {
      contentDuration: this._contentDuration,
      timelineDuration: this._timelineDuration
    };
  },

  // ========== 事件系统 ==========
  
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
    
    // 返回取消订阅函数
    return () => this.off(event, callback);
  },

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  },

  once(event, callback) {
    const wrapper = (data) => {
      callback(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  },

  _emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        console.error(`[TimeController] Event handler error:`, e);
      }
    });
  },

  // ========== 工具方法 ==========
  
  /**
   * 获取当前时间的百分比位置
   */
  getProgress() {
    if (this._contentDuration <= 0) return 0;
    return this._currentTime / this._contentDuration;
  },

  /**
   * 格式化时间显示
   */
  formatTime(seconds) {
    if (!seconds || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

};

// 导出
window.TimeController = TimeController;

console.log('[Core] TimeController 已加载');
