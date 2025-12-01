/**
 * TrackManager - 轨道管理器
 * 
 * 核心职责：
 * 1. 管理多轨道结构
 * 2. 片段的增删改查
 * 3. 轨道操作（添加、删除、排序）
 * 4. 提供查询接口（获取某时间点的活动片段等）
 * 
 * 设计原则：
 * - 数据与UI分离：只管数据，不管渲染
 * - 不可变更新：修改返回新对象，便于撤销/重做
 * - 事件通知：数据变化通过事件通知
 */
const TrackManager = {
  // ========== 事件系统 ==========
  _listeners: {},
  
  Events: {
    TRACK_ADDED: 'trackAdded',
    TRACK_REMOVED: 'trackRemoved',
    CLIP_ADDED: 'clipAdded',
    CLIP_REMOVED: 'clipRemoved',
    CLIP_UPDATED: 'clipUpdated',
    CLIP_MOVED: 'clipMoved',
    TRACKS_CHANGED: 'tracksChanged',  // 通用变化事件
  },

  // ========== 颜色管理 ==========
  _colorIndex: 0,
  
  CLIP_COLORS: [
    // 第一轮：主要颜色，跨度大
    { hue: 0, saturation: 75, lightness: 55 },     // 红
    { hue: 120, saturation: 65, lightness: 45 },   // 绿
    { hue: 210, saturation: 75, lightness: 55 },   // 蓝
    { hue: 45, saturation: 85, lightness: 55 },    // 橙黄
    { hue: 280, saturation: 65, lightness: 60 },   // 紫
    { hue: 170, saturation: 70, lightness: 45 },   // 青
    { hue: 330, saturation: 70, lightness: 60 },   // 粉红
    { hue: 60, saturation: 70, lightness: 50 },    // 黄
    // 第二轮：次要颜色
    { hue: 15, saturation: 80, lightness: 55 },    // 橙红
    { hue: 150, saturation: 60, lightness: 48 },   // 青绿
    { hue: 240, saturation: 60, lightness: 60 },   // 蓝紫
    { hue: 30, saturation: 85, lightness: 52 },    // 橙
    { hue: 300, saturation: 55, lightness: 58 },   // 洋红
    { hue: 90, saturation: 55, lightness: 48 },    // 黄绿
    { hue: 195, saturation: 70, lightness: 50 },   // 天蓝
    { hue: 350, saturation: 70, lightness: 58 },   // 玫红
    // 第三轮：更多变体
    { hue: 5, saturation: 85, lightness: 50 },     // 深红
    { hue: 135, saturation: 55, lightness: 42 },   // 深绿
    { hue: 225, saturation: 65, lightness: 52 },   // 钴蓝
    { hue: 55, saturation: 80, lightness: 48 },    // 金黄
    { hue: 265, saturation: 60, lightness: 55 },   // 蓝紫
    { hue: 180, saturation: 60, lightness: 45 },   // 蓝青
    { hue: 315, saturation: 65, lightness: 55 },   // 粉紫
    { hue: 75, saturation: 60, lightness: 45 },    // 草绿
    // 第四轮：补充颜色
    { hue: 20, saturation: 75, lightness: 58 },    // 珊瑚
    { hue: 160, saturation: 55, lightness: 50 },   // 薄荷
    { hue: 250, saturation: 55, lightness: 58 },   // 薰衣草
    { hue: 40, saturation: 80, lightness: 50 },    // 琥珀
    { hue: 290, saturation: 50, lightness: 55 },   // 兰花紫
    { hue: 105, saturation: 50, lightness: 45 },   // 橄榄绿
    { hue: 200, saturation: 65, lightness: 55 },   // 天空蓝
    { hue: 340, saturation: 75, lightness: 55 },   // 玫瑰红
  ],

  generateClipColor() {
    const color = this.CLIP_COLORS[this._colorIndex % this.CLIP_COLORS.length];
    this._colorIndex++;
    return { ...color };
  },

  generateClipId() {
    return 'clip-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  },

  // ========== 轨道操作 ==========

  /**
   * 创建空轨道结构
   */
  createEmptyTracks() {
    return {
      video: [[]],  // 默认1个主视频轨道
      audio: [[]]   // 默认1个音频轨道
    };
  },

  /**
   * 添加视频轨道
   */
  addVideoTrack(tracks) {
    const newTracks = this._cloneTracks(tracks);
    newTracks.video.push([]);
    
    this._emit(this.Events.TRACK_ADDED, { 
      type: 'video', 
      index: newTracks.video.length - 1 
    });
    this._emit(this.Events.TRACKS_CHANGED, { tracks: newTracks });
    
    return newTracks;
  },

  /**
   * 删除视频轨道（不能删除主轨道）
   */
  removeVideoTrack(tracks, trackIndex) {
    if (trackIndex === 0 || trackIndex >= tracks.video.length) {
      return { success: false, tracks, message: '不能删除主轨道' };
    }
    
    const newTracks = this._cloneTracks(tracks);
    const removedTrack = newTracks.video.splice(trackIndex, 1)[0];
    
    this._emit(this.Events.TRACK_REMOVED, { 
      type: 'video', 
      index: trackIndex,
      clips: removedTrack
    });
    this._emit(this.Events.TRACKS_CHANGED, { tracks: newTracks });
    
    return { success: true, tracks: newTracks };
  },

  // ========== 片段操作 ==========

  /**
   * 创建新片段
   */
  createClip(video, sourceStart, sourceEnd, timelineStart, options = {}) {
    const clipId = this.generateClipId();
    return {
      id: clipId,
      video: video,
      sourceStart: sourceStart,
      sourceEnd: sourceEnd,
      timelineStart: timelineStart,
      transform: options.transform || null,
      color: options.color || this.generateClipColor()
    };
  },

  /**
   * 添加片段到轨道
   */
  addClip(tracks, trackIndex, clip) {
    const newTracks = this._cloneTracks(tracks);
    
    // 确保轨道存在
    while (newTracks.video.length <= trackIndex) {
      newTracks.video.push([]);
    }
    
    newTracks.video[trackIndex].push(clip);
    
    this._emit(this.Events.CLIP_ADDED, { clip, trackIndex });
    this._emit(this.Events.TRACKS_CHANGED, { tracks: newTracks });
    
    return newTracks;
  },

  /**
   * 删除片段
   */
  removeClip(tracks, clipId) {
    const found = this.findClipById(tracks, clipId);
    if (!found) {
      return { success: false, tracks, message: '片段不存在' };
    }
    
    const newTracks = this._cloneTracks(tracks);
    const { trackIndex, clipIndex } = found;
    const removedClip = newTracks.video[trackIndex].splice(clipIndex, 1)[0];
    
    this._emit(this.Events.CLIP_REMOVED, { clip: removedClip, trackIndex });
    this._emit(this.Events.TRACKS_CHANGED, { tracks: newTracks });
    
    return { success: true, tracks: newTracks, clip: removedClip };
  },

  /**
   * 更新片段属性
   */
  updateClip(tracks, clipId, updates) {
    const found = this.findClipById(tracks, clipId);
    if (!found) return tracks;
    
    const newTracks = this._cloneTracks(tracks);
    const { trackIndex, clipIndex } = found;
    const clip = newTracks.video[trackIndex][clipIndex];
    
    Object.assign(clip, updates);
    
    this._emit(this.Events.CLIP_UPDATED, { clip, trackIndex, updates });
    this._emit(this.Events.TRACKS_CHANGED, { tracks: newTracks });
    
    return newTracks;
  },

  /**
   * 移动片段到新位置/轨道
   */
  moveClip(tracks, clipId, newTimelineStart, newTrackIndex = null) {
    const found = this.findClipById(tracks, clipId);
    if (!found) return { success: false, tracks };
    
    const newTracks = this._cloneTracks(tracks);
    const { clip, trackIndex, clipIndex } = found;
    const targetTrackIndex = newTrackIndex !== null ? newTrackIndex : trackIndex;
    
    // 如果轨道变了
    if (targetTrackIndex !== trackIndex) {
      // 从原轨道移除
      newTracks.video[trackIndex].splice(clipIndex, 1);
      
      // 确保目标轨道存在
      while (newTracks.video.length <= targetTrackIndex) {
        newTracks.video.push([]);
      }
      
      // 添加到新轨道
      const movedClip = { ...clip, timelineStart: Math.max(0, newTimelineStart) };
      newTracks.video[targetTrackIndex].push(movedClip);
    } else {
      // 同轨道内移动
      newTracks.video[trackIndex][clipIndex].timelineStart = Math.max(0, newTimelineStart);
    }
    
    this._emit(this.Events.CLIP_MOVED, { 
      clipId, 
      fromTrack: trackIndex, 
      toTrack: targetTrackIndex,
      newTimelineStart 
    });
    this._emit(this.Events.TRACKS_CHANGED, { tracks: newTracks });
    
    return { success: true, tracks: newTracks };
  },

  /**
   * 切割片段
   */
  splitClip(tracks, clipId, splitTime) {
    const found = this.findClipById(tracks, clipId);
    if (!found) return { success: false, tracks, message: '片段不存在' };
    
    const { clip, trackIndex, clipIndex } = found;
    const clipDuration = clip.sourceEnd - clip.sourceStart;
    const clipEnd = clip.timelineStart + clipDuration;
    
    // 检查切割点是否在片段范围内
    if (splitTime <= clip.timelineStart || splitTime >= clipEnd) {
      return { success: false, tracks, message: '切割点不在片段范围内' };
    }
    
    // 计算源视频中的切割点
    const sourceTime = clip.sourceStart + (splitTime - clip.timelineStart);
    
    // 检查是否太靠近边缘
    if (sourceTime - clip.sourceStart < 0.5 || clip.sourceEnd - sourceTime < 0.5) {
      return { success: false, tracks, message: '切割位置太靠近片段边缘' };
    }
    
    const newTracks = this._cloneTracks(tracks);
    
    // 创建两个新片段
    const clip1 = {
      ...clip,
      id: this.generateClipId(),
      sourceEnd: sourceTime,
      color: clip.color // 保持原颜色
    };
    
    const clip2 = {
      ...clip,
      id: this.generateClipId(),
      sourceStart: sourceTime,
      timelineStart: splitTime,
      color: this.generateClipColor() // 新颜色
    };
    
    // 替换原片段
    newTracks.video[trackIndex].splice(clipIndex, 1, clip1, clip2);
    
    this._emit(this.Events.TRACKS_CHANGED, { tracks: newTracks });
    
    return { 
      success: true, 
      tracks: newTracks, 
      clip1, 
      clip2,
      message: `已在 ${splitTime.toFixed(2)}s 处切割`
    };
  },

  // ========== 查询方法 ==========

  /**
   * 根据ID查找片段
   */
  findClipById(tracks, clipId) {
    for (let trackIndex = 0; trackIndex < tracks.video.length; trackIndex++) {
      const track = tracks.video[trackIndex];
      const clipIndex = track.findIndex(c => c.id === clipId);
      if (clipIndex !== -1) {
        return { 
          clip: track[clipIndex], 
          trackIndex, 
          clipIndex 
        };
      }
    }
    return null;
  },

  /**
   * 获取指定时间点的活动片段（所有轨道）
   */
  getActiveClipsAtTime(tracks, time) {
    const activeClips = [];
    
    tracks.video.forEach((track, trackIndex) => {
      for (const clip of track) {
        const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
        if (time >= clip.timelineStart && time < clipEnd) {
          const sourceTime = clip.sourceStart + (time - clip.timelineStart);
          activeClips.push({
            clip,
            trackIndex,
            sourceTime
          });
          break; // 每个轨道只取一个
        }
      }
    });
    
    return activeClips;
  },

  /**
   * 获取指定轨道在指定时间的片段
   */
  getClipAtTime(tracks, trackIndex, time) {
    const track = tracks.video[trackIndex];
    if (!track) return null;
    
    for (const clip of track) {
      const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
      if (time >= clip.timelineStart && time < clipEnd) {
        return clip;
      }
    }
    return null;
  },

  /**
   * 获取所有片段（扁平化）
   */
  getAllClips(tracks) {
    const clips = [];
    tracks.video.forEach((track, trackIndex) => {
      track.forEach(clip => {
        clips.push({ ...clip, trackIndex });
      });
    });
    return clips;
  },

  /**
   * 计算内容总时长
   */
  calculateContentDuration(tracks) {
    let maxEnd = 0;
    tracks.video.forEach(track => {
      track.forEach(clip => {
        const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
        maxEnd = Math.max(maxEnd, clipEnd);
      });
    });
    return maxEnd;
  },

  /**
   * 获取吸附点（用于拖拽对齐）
   */
  getSnapPoints(tracks, excludeClipId = null) {
    const points = [{ time: 0, type: 'start' }];
    
    tracks.video.forEach((track, trackIndex) => {
      track.forEach(clip => {
        if (clip.id === excludeClipId) return;
        
        const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
        points.push({ time: clip.timelineStart, type: 'clipStart', clipId: clip.id });
        points.push({ time: clipEnd, type: 'clipEnd', clipId: clip.id });
      });
    });
    
    return points.sort((a, b) => a.time - b.time);
  },

  // ========== 内部方法 ==========

  _cloneTracks(tracks) {
    return {
      video: tracks.video.map(track => track.map(clip => ({ ...clip }))),
      audio: tracks.audio.map(track => track.map(clip => ({ ...clip })))
    };
  },

  // ========== 事件系统 ==========
  
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  },

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  },

  _emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        console.error(`[TrackManager] Event handler error:`, e);
      }
    });
  }
};

// 导出
window.TrackManager = TrackManager;

console.log('[Core] TrackManager 已加载');
