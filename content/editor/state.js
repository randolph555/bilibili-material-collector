// 编辑器状态管理模块
const EditorState = {
  // 当前编辑的视频
  currentVideo: null,
  
  // 多轨道结构
  // tracks: { video: [track1, track2, ...], audio: [...] }
  // 每个 track 是一个片段数组
  // 片段属性: { id, video, sourceStart, sourceEnd, timelineStart, transform }
  // transform: { x, y, scale, opacity } 用于画中画效果
  tracks: {
    video: [[]], // 默认只有1个主视频轨道，用户可添加更多
    audio: [[]]  // 1个音频轨道
  },
  
  // 轨道预设位置 (x, y 是百分比位置，scale 是大小比例)
  TRANSFORM_PRESETS: {
    fullscreen: { x: 50, y: 50, scale: 1, opacity: 1, centered: true },
    pipTopLeft: { x: 5, y: 5, scale: 0.1, opacity: 1, centered: false },
    pipTopRight: { x: 85, y: 5, scale: 0.1, opacity: 1, centered: false },
    pipBottomLeft: { x: 5, y: 85, scale: 0.1, opacity: 1, centered: false },
    pipBottomRight: { x: 85, y: 85, scale: 0.1, opacity: 1, centered: false },
    pipCenter: { x: 50, y: 50, scale: 0.1, opacity: 1, centered: true }
  },
  
  // 兼容旧代码：主时间轴指向 video track 0
  get timeline() {
    return this.tracks.video[0] || [];
  },
  set timeline(val) {
    this.tracks.video[0] = val;
  },
  
  timelineDuration: 0,
  timelineZoom: 1, // 时间轴缩放比例 (0.5 - 4)
  snapEnabled: true, // 吸附对齐开关
  snapThreshold: 0.5, // 吸附阈值（秒）
  mainTrackDuration: 0, // 主轨道时长（播放结束判断用）
  
  // 播放状态
  isPlaying: false,
  playheadTime: 0,
  activeClip: null,
  currentPlayingBvid: null,
  
  // 选中状态
  selectedClipId: null,
  selectedClipIds: [], // 多选支持
  
  // 媒体缓存 { bvid: { videoInfo, playUrl, videoBlobUrl, audioBlobUrl, ... } }
  mediaCache: {},
  
  // 撤销/重做历史
  history: [],
  historyIndex: -1,
  maxHistory: 50,
  
  // UI 状态
  isInitialLoad: true,
  trackEventsBindded: false,
  
  // 字幕数据
  subtitleData: null,
  
  // 音频状态
  audioMuted: false,

  // 初始化状态
  init() {
    this.reset();
  },

  // 重置所有状态
  reset() {
    this.currentVideo = null;
    this.tracks = {
      video: [[]], // 默认只有1个主轨道
      audio: [[]]
    };
    this.timelineDuration = 0;
    this.mainTrackDuration = 0;
    this.timelineZoom = 1;
    this.snapEnabled = true;
    this.snapThreshold = 0.5;
    this.isPlaying = false;
    this.playheadTime = 0;
    this.activeClip = null;
    this.activeClips = []; // 当前时间点所有轨道的活动片段
    this.currentPlayingBvid = null;
    this.selectedClipId = null;
    this.selectedClipIds = [];
    this.selectedTrackIndex = 0;
    this.mediaCache = {};
    this.history = [];
    this.historyIndex = -1;
    this.isInitialLoad = true;
    this.trackEventsBindded = false;
    this.subtitleData = null;
    this.audioMuted = false;
    this.dragState = null;
  },
  
  // 添加新视频轨道
  addVideoTrack() {
    this.tracks.video.push([]);
    return this.tracks.video.length - 1;
  },
  
  // 删除视频轨道（不能删除主轨道）
  removeVideoTrack(trackIndex) {
    if (trackIndex === 0 || trackIndex >= this.tracks.video.length) {
      return false;
    }
    this.tracks.video.splice(trackIndex, 1);
    return true;
  },
  
  // 获取视频轨道数量
  getVideoTrackCount() {
    return this.tracks.video.length;
  },
  
  // 获取所有视频轨道的片段（扁平化）
  getAllVideoClips() {
    const clips = [];
    this.tracks.video.forEach((track, trackIndex) => {
      track.forEach(clip => {
        clips.push({ ...clip, trackIndex });
      });
    });
    return clips;
  },
  
  // 根据 clipId 找到片段及其轨道
  findClipById(clipId) {
    for (let trackIndex = 0; trackIndex < this.tracks.video.length; trackIndex++) {
      const track = this.tracks.video[trackIndex];
      const clipIndex = track.findIndex(c => c.id === clipId);
      if (clipIndex !== -1) {
        return { clip: track[clipIndex], trackIndex, clipIndex };
      }
    }
    return null;
  },

  // 保存历史（用于撤销）
  saveHistory() {
    // 删除当前位置之后的历史
    this.history = this.history.slice(0, this.historyIndex + 1);

    // 保存当前状态（包括所有轨道）
    this.history.push({
      tracks: JSON.parse(JSON.stringify(this.tracks)),
      selectedClipId: this.selectedClipId,
      selectedTrackIndex: this.selectedTrackIndex
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
      return false;
    }

    this.historyIndex--;
    const state = this.history[this.historyIndex];
    this.tracks = JSON.parse(JSON.stringify(state.tracks));
    this.selectedClipId = state.selectedClipId;
    this.selectedTrackIndex = state.selectedTrackIndex || 0;
    return true;
  },

  // 重做
  redo() {
    if (this.historyIndex >= this.history.length - 1) {
      return false;
    }

    this.historyIndex++;
    const state = this.history[this.historyIndex];
    this.tracks = JSON.parse(JSON.stringify(state.tracks));
    this.selectedClipId = state.selectedClipId;
    this.selectedTrackIndex = state.selectedTrackIndex || 0;
    return true;
  },

  // 检查是否可以撤销
  canUndo() {
    return this.historyIndex > 0;
  },

  // 检查是否可以重做
  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }
};

// 导出
window.EditorState = EditorState;
