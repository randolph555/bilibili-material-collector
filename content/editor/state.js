/**
 * EditorState - 编辑器状态（兼容层）
 * 
 * 重构后：作为薄层，实际逻辑委托给 EditorCore
 * 保留原有接口，确保旧代码兼容
 */
const EditorState = {
  // ========== 视频信息 ==========
  currentVideo: null,
  currentPlayingBvid: null,
  
  // ========== 媒体缓存 ==========
  // { bvid: { videoInfo, playUrl, videoBlobUrl, audioBlobUrl, ... } }
  mediaCache: {},
  
  // ========== UI 配置 ==========
  timelineZoom: 1,
  snapEnabled: true,
  snapThreshold: 0.5,
  
  // ========== UI 状态 ==========
  isInitialLoad: true,
  trackEventsBindded: false,
  subtitleData: null,
  audioMuted: false,
  dragState: null,
  
  // ========== 轨道预设 ==========
  TRANSFORM_PRESETS: {
    fullscreen: { x: 50, y: 50, scale: 1, opacity: 1, centered: true },
    pipTopLeft: { x: 5, y: 5, scale: 0.1, opacity: 1, centered: false },
    pipTopRight: { x: 85, y: 5, scale: 0.1, opacity: 1, centered: false },
    pipBottomLeft: { x: 5, y: 85, scale: 0.1, opacity: 1, centered: false },
    pipBottomRight: { x: 85, y: 85, scale: 0.1, opacity: 1, centered: false },
    pipCenter: { x: 50, y: 50, scale: 0.1, opacity: 1, centered: true }
  },

  // ========== 代理到 EditorCore 的属性 ==========
  
  get tracks() {
    return EditorCore.tracks;
  },
  set tracks(val) {
    EditorCore._tracks = val;
  },
  
  // 兼容旧代码
  get timeline() {
    return this.tracks.video[0] || [];
  },
  set timeline(val) {
    this.tracks.video[0] = val;
  },
  
  get timelineDuration() {
    return TimeController.timelineDuration;
  },
  set timelineDuration(val) {
    TimeController.timelineDuration = val;
  },
  
  get contentDuration() {
    return TimeController.contentDuration;
  },
  set contentDuration(val) {
    TimeController.contentDuration = val;
  },
  
  get isPlaying() {
    return TimeController.isPlaying;
  },
  set isPlaying(val) {
    // 注意：不建议直接设置 isPlaying，应该使用 play()/pause() 方法
    // 这里保留是为了兼容旧代码，但只在必要时使用
    if (val && !TimeController.isPlaying) {
      // 如果要设置为播放，应该调用 play()
      console.warn('[EditorState] 不建议直接设置 isPlaying=true，请使用 CompositorPlayer.play()');
    } else if (!val && TimeController.isPlaying) {
      // 如果要设置为暂停，调用 pause()
      TimeController.pause();
    }
  },
  
  get playheadTime() {
    return TimeController.currentTime;
  },
  set playheadTime(val) {
    // 使用 seek 方法来设置时间，这样会触发事件并限制范围
    // 但为了避免在播放中触发不必要的 seek 事件，直接设置内部值
    TimeController._currentTime = Math.max(0, Math.min(val, TimeController.contentDuration || val));
  },
  
  get selectedClipId() {
    return EditorCore.selectedClipId;
  },
  set selectedClipId(val) {
    if (val) {
      EditorCore._selectedClipIds = [val];
    } else {
      EditorCore._selectedClipIds = [];
    }
  },
  
  get selectedClipIds() {
    return EditorCore.selectedClipIds;
  },
  set selectedClipIds(val) {
    EditorCore._selectedClipIds = val || [];
  },
  
  // 活动片段（当前播放位置的片段）
  get activeClip() {
    const clips = EditorCore.getActiveClips();
    return clips.length > 0 ? clips[0].clip : null;
  },
  set activeClip(val) {
    // 兼容旧代码，实际不需要手动设置
  },
  
  // ========== 代理到 EditorCore 的历史方法 ==========
  
  get history() {
    return EditorCore._history;
  },
  set history(val) {
    EditorCore._history = val;
  },
  
  get historyIndex() {
    return EditorCore._historyIndex;
  },
  set historyIndex(val) {
    EditorCore._historyIndex = val;
  },
  
  get maxHistory() {
    return EditorCore._maxHistory;
  },

  // ========== 初始化 ==========
  
  init() {
    EditorCore.init();
    this.reset();
  },

  reset() {
    EditorCore.reset();
    this.currentVideo = null;
    this.currentPlayingBvid = null;
    this.mediaCache = {};
    this.timelineZoom = 1;
    this.snapEnabled = true;
    this.snapThreshold = 0.5;
    this.isInitialLoad = true;
    this.trackEventsBindded = false;
    this.subtitleData = null;
    this.audioMuted = false;
    this.dragState = null;
  },

  // ========== 代理方法 ==========
  
  addVideoTrack() {
    return EditorCore.addVideoTrack();
  },
  
  removeVideoTrack(trackIndex) {
    return EditorCore.removeVideoTrack(trackIndex).success;
  },
  
  getVideoTrackCount() {
    return this.tracks.video.length;
  },
  
  getAllVideoClips() {
    return TrackManager.getAllClips(this.tracks);
  },
  
  findClipById(clipId) {
    return TrackManager.findClipById(this.tracks, clipId);
  },

  saveHistory() {
    EditorCore._saveHistory();
  },

  undo() {
    return EditorCore.undo();
  },

  redo() {
    return EditorCore.redo();
  },

  canUndo() {
    return EditorCore.canUndo();
  },

  canRedo() {
    return EditorCore.canRedo();
  }
};

// 导出
window.EditorState = EditorState;
