/**
 * EditorCore - 编辑器核心
 * 
 * 整合 TimeController 和 TrackManager，提供统一的编辑器接口
 * 
 * 职责：
 * 1. 协调时间控制和轨道管理
 * 2. 管理撤销/重做历史
 * 3. 提供高级编辑操作
 * 4. 与旧系统的桥接
 */
const EditorCore = {
  // ========== 状态 ==========
  _tracks: null,
  _history: [],
  _historyIndex: -1,
  _maxHistory: 50,
  _selectedClipIds: [],
  _initialized: false,

  // ========== 初始化 ==========
  
  init() {
    if (this._initialized) return;
    
    // 初始化时间控制器
    TimeController.init();
    
    // 初始化轨道
    this._tracks = TrackManager.createEmptyTracks();
    this._history = [];
    this._historyIndex = -1;
    this._selectedClipIds = [];
    
    // 监听轨道变化，自动更新时长
    TrackManager.on(TrackManager.Events.TRACKS_CHANGED, ({ tracks }) => {
      this._tracks = tracks;
      this._updateDuration();
    });
    
    this._initialized = true;
    console.log('[EditorCore] 初始化完成');
  },

  reset() {
    TimeController.init();
    this._tracks = TrackManager.createEmptyTracks();
    this._history = [];
    this._historyIndex = -1;
    this._selectedClipIds = [];
  },

  // ========== 轨道操作 ==========

  get tracks() {
    return this._tracks;
  },

  addVideoTrack() {
    this._saveHistory();
    this._tracks = TrackManager.addVideoTrack(this._tracks);
    return this._tracks.video.length - 1;
  },

  removeVideoTrack(trackIndex) {
    this._saveHistory();
    const result = TrackManager.removeVideoTrack(this._tracks, trackIndex);
    if (result.success) {
      this._tracks = result.tracks;
      this._updateDuration();
    }
    return result;
  },

  // ========== 片段操作 ==========

  /**
   * 添加片段到轨道
   */
  addClip(video, sourceStart, sourceEnd, trackIndex = 0, options = {}) {
    this._saveHistory();
    
    // 计算 timelineStart
    let timelineStart;
    if (trackIndex === 0) {
      // 主轨道：追加到末尾
      const track = this._tracks.video[0] || [];
      if (track.length > 0) {
        const lastClip = track[track.length - 1];
        timelineStart = lastClip.timelineStart + (lastClip.sourceEnd - lastClip.sourceStart);
      } else {
        timelineStart = 0;
      }
    } else {
      // 叠加轨道：放在播放头位置
      timelineStart = options.timelineStart ?? TimeController.currentTime;
    }
    
    const clip = TrackManager.createClip(video, sourceStart, sourceEnd, timelineStart, options);
    this._tracks = TrackManager.addClip(this._tracks, trackIndex, clip);
    this._updateDuration();
    
    return clip;
  },

  /**
   * 删除片段
   */
  removeClip(clipId) {
    this._saveHistory();
    const result = TrackManager.removeClip(this._tracks, clipId);
    if (result.success) {
      this._tracks = result.tracks;
      this._updateDuration();
      this._selectedClipIds = this._selectedClipIds.filter(id => id !== clipId);
    }
    return result;
  },

  /**
   * 删除所有选中的片段
   */
  removeSelectedClips() {
    if (this._selectedClipIds.length === 0) {
      return { success: false, message: '没有选中的片段' };
    }
    
    this._saveHistory();
    
    let deletedCount = 0;
    const clipIds = [...this._selectedClipIds];
    
    clipIds.forEach(clipId => {
      const result = TrackManager.removeClip(this._tracks, clipId);
      if (result.success) {
        this._tracks = result.tracks;
        deletedCount++;
      }
    });
    
    this._selectedClipIds = [];
    this._updateDuration();
    
    return { success: true, deletedCount };
  },

  /**
   * 移动片段
   */
  moveClip(clipId, newTimelineStart, newTrackIndex = null) {
    this._saveHistory();
    const result = TrackManager.moveClip(this._tracks, clipId, newTimelineStart, newTrackIndex);
    if (result.success) {
      this._tracks = result.tracks;
      this._updateDuration();
    }
    return result;
  },

  /**
   * 在播放头位置切割片段
   */
  cutAtPlayhead() {
    const currentTime = TimeController.currentTime;
    
    // 优先切割选中的片段
    let clipToCut = null;
    
    if (this._selectedClipIds.length > 0) {
      const found = TrackManager.findClipById(this._tracks, this._selectedClipIds[0]);
      if (found) {
        const { clip } = found;
        const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
        if (currentTime >= clip.timelineStart && currentTime < clipEnd) {
          clipToCut = clip;
        }
      }
    }
    
    // 如果没有选中片段或播放头不在选中片段内，查找播放头位置的片段
    if (!clipToCut) {
      const activeClips = TrackManager.getActiveClipsAtTime(this._tracks, currentTime);
      if (activeClips.length > 0) {
        clipToCut = activeClips[0].clip;
      }
    }
    
    if (!clipToCut) {
      return { success: false, message: '当前位置没有可切割的片段' };
    }
    
    this._saveHistory();
    const result = TrackManager.splitClip(this._tracks, clipToCut.id, currentTime);
    
    if (result.success) {
      this._tracks = result.tracks;
      this._updateDuration();
    }
    
    return result;
  },

  // ========== 选择操作 ==========

  selectClip(clipId, addToSelection = false) {
    if (addToSelection) {
      if (this._selectedClipIds.includes(clipId)) {
        this._selectedClipIds = this._selectedClipIds.filter(id => id !== clipId);
      } else {
        this._selectedClipIds.push(clipId);
      }
    } else {
      this._selectedClipIds = clipId ? [clipId] : [];
    }
  },

  clearSelection() {
    this._selectedClipIds = [];
  },

  get selectedClipIds() {
    return [...this._selectedClipIds];
  },

  get selectedClipId() {
    return this._selectedClipIds[this._selectedClipIds.length - 1] || null;
  },

  // ========== 时间控制（代理到 TimeController）==========

  get currentTime() {
    return TimeController.currentTime;
  },

  get contentDuration() {
    return TimeController.contentDuration;
  },

  get timelineDuration() {
    return TimeController.timelineDuration;
  },

  get isPlaying() {
    return TimeController.isPlaying;
  },

  play() {
    TimeController.play();
  },

  pause() {
    TimeController.pause();
  },

  stop() {
    TimeController.stop();
  },

  togglePlay() {
    TimeController.togglePlay();
  },

  seek(time) {
    TimeController.seek(time);
  },

  seekBy(delta) {
    TimeController.seekBy(delta);
  },

  // ========== 查询方法 ==========

  /**
   * 获取当前时间点的活动片段
   */
  getActiveClips() {
    return TrackManager.getActiveClipsAtTime(this._tracks, TimeController.currentTime);
  },

  /**
   * 获取指定轨道在当前时间的片段
   */
  getCurrentClip(trackIndex = 0) {
    return TrackManager.getClipAtTime(this._tracks, trackIndex, TimeController.currentTime);
  },

  /**
   * 根据ID查找片段
   */
  findClipById(clipId) {
    return TrackManager.findClipById(this._tracks, clipId);
  },

  // ========== 撤销/重做 ==========

  _saveHistory() {
    // 删除当前位置之后的历史
    this._history = this._history.slice(0, this._historyIndex + 1);
    
    // 保存当前状态
    this._history.push({
      tracks: JSON.parse(JSON.stringify(this._tracks)),
      selectedClipIds: [...this._selectedClipIds]
    });
    
    // 限制历史长度
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
    
    this._historyIndex = this._history.length - 1;
  },

  undo() {
    if (this._historyIndex <= 0) return false;
    
    this._historyIndex--;
    const state = this._history[this._historyIndex];
    this._tracks = JSON.parse(JSON.stringify(state.tracks));
    this._selectedClipIds = [...state.selectedClipIds];
    this._updateDuration();
    
    return true;
  },

  redo() {
    if (this._historyIndex >= this._history.length - 1) return false;
    
    this._historyIndex++;
    const state = this._history[this._historyIndex];
    this._tracks = JSON.parse(JSON.stringify(state.tracks));
    this._selectedClipIds = [...state.selectedClipIds];
    this._updateDuration();
    
    return true;
  },

  canUndo() {
    return this._historyIndex > 0;
  },

  canRedo() {
    return this._historyIndex < this._history.length - 1;
  },

  // ========== 内部方法 ==========

  _updateDuration() {
    TimeController.recalculateDuration(this._tracks.video);
  },

  // ========== 事件订阅（代理）==========

  onTimeUpdate(callback) {
    return TimeController.on(TimeController.Events.TIME_UPDATE, callback);
  },

  onPlayStateChange(callback) {
    return TimeController.on(TimeController.Events.PLAY_STATE_CHANGE, callback);
  },

  onDurationChange(callback) {
    return TimeController.on(TimeController.Events.DURATION_CHANGE, callback);
  },

  onPlaybackEnd(callback) {
    return TimeController.on(TimeController.Events.PLAYBACK_END, callback);
  },

  onTracksChange(callback) {
    return TrackManager.on(TrackManager.Events.TRACKS_CHANGED, callback);
  },

  // ========== 与旧系统桥接 ==========

  /**
   * 同步到旧的 EditorState（过渡期使用）
   */
  syncToLegacyState() {
    if (typeof EditorState === 'undefined') return;
    
    EditorState.tracks = this._tracks;
    EditorState.playheadTime = TimeController.currentTime;
    EditorState.contentDuration = TimeController.contentDuration;
    EditorState.timelineDuration = TimeController.timelineDuration;
    EditorState.isPlaying = TimeController.isPlaying;
    EditorState.selectedClipId = this.selectedClipId;
    EditorState.selectedClipIds = this._selectedClipIds;
  },

  /**
   * 从旧的 EditorState 同步（过渡期使用）
   */
  syncFromLegacyState() {
    if (typeof EditorState === 'undefined') return;
    
    this._tracks = EditorState.tracks || TrackManager.createEmptyTracks();
    TimeController._currentTime = EditorState.playheadTime || 0;
    TimeController._contentDuration = EditorState.contentDuration || 0;
    TimeController._timelineDuration = EditorState.timelineDuration || 0;
    TimeController._isPlaying = EditorState.isPlaying || false;
    this._selectedClipIds = EditorState.selectedClipIds || [];
  }
};

// 导出
window.EditorCore = EditorCore;

console.log('[Core] EditorCore 已加载');
