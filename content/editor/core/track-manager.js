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

  // ========== 元素类型 ==========
  ElementTypes: {
    VIDEO: 'video',
    IMAGE: 'image',
    TEXT: 'text',
    STICKER: 'sticker'
  },

  // ========== 片段操作 ==========

  /**
   * 创建新片段（元素）
   * 
   * @param {Object} source - 源数据（视频对象、图片URL、文字内容等）
   * @param {number} sourceStart - 源起始时间（视频用）
   * @param {number} sourceEnd - 源结束时间（视频用）
   * @param {number} timelineStart - 时间轴起始位置
   * @param {Object} options - 可选参数
   * @param {string} options.type - 元素类型：video/image/text/sticker
   * @param {number} options.displayDuration - 显示时长（可以和源时长不同，用于拉伸）
   */
  createClip(source, sourceStart, sourceEnd, timelineStart, options = {}) {
    const clipId = this.generateClipId();
    const type = options.type || this.ElementTypes.VIDEO;
    const sourceDuration = sourceEnd - sourceStart;
    
    return {
      id: clipId,
      type: type,
      // 视频相关
      video: type === this.ElementTypes.VIDEO ? source : null,
      sourceStart: sourceStart,
      sourceEnd: sourceEnd,
      // 通用
      source: source, // 统一的源数据引用
      timelineStart: timelineStart,
      displayDuration: options.displayDuration || sourceDuration, // 显示时长，默认等于源时长
      transform: options.transform || null,
      color: options.color || this.generateClipColor(),
      // 拉伸模式（视频用）：'loop' 循环 | 'stretch' 变速 | 'freeze' 定格
      stretchMode: options.stretchMode || 'loop'
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
    const clipDuration = this.getClipDuration(clip);
    const clipEnd = clip.timelineStart + clipDuration;
    
    // 检查切割点是否在片段范围内
    if (splitTime <= clip.timelineStart || splitTime >= clipEnd) {
      return { success: false, tracks, message: '切割点不在片段范围内' };
    }
    
    // 计算源视频中的切割点（考虑拉伸比例）
    const sourceDuration = clip.sourceEnd - clip.sourceStart;
    const ratio = sourceDuration / clipDuration; // 源时长/显示时长
    const offsetInClip = splitTime - clip.timelineStart;
    const sourceTime = clip.sourceStart + (offsetInClip * ratio);
    
    // 检查是否太靠近边缘
    if (sourceTime - clip.sourceStart < 0.5 || clip.sourceEnd - sourceTime < 0.5) {
      return { success: false, tracks, message: '切割位置太靠近片段边缘' };
    }
    
    const newTracks = this._cloneTracks(tracks);
    
    // 计算切割后的显示时长
    const duration1 = offsetInClip;
    const duration2 = clipDuration - offsetInClip;
    
    // 创建两个新片段
    const clip1 = {
      ...clip,
      id: this.generateClipId(),
      sourceEnd: sourceTime,
      displayDuration: duration1,
      color: clip.color
    };
    
    const clip2 = {
      ...clip,
      id: this.generateClipId(),
      sourceStart: sourceTime,
      timelineStart: splitTime,
      displayDuration: duration2,
      color: this.generateClipColor()
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
   * 获取片段的显示时长（兼容新旧数据）
   */
  getClipDuration(clip) {
    // 优先使用 displayDuration，兼容旧数据用 sourceEnd - sourceStart
    // 使用 != null 而不是 ||，避免 displayDuration 为 0 时的问题
    return clip.displayDuration != null ? clip.displayDuration : (clip.sourceEnd - clip.sourceStart);
  },

  /**
   * 获取片段在时间轴上的结束时间
   */
  getClipEnd(clip) {
    return clip.timelineStart + this.getClipDuration(clip);
  },

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
        const clipEnd = this.getClipEnd(clip);
        if (time >= clip.timelineStart && time < clipEnd) {
          // 计算源时间（考虑拉伸和循环）
          const sourceTime = this.getSourceTimeAtPlayhead(clip, time);
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
   * 获取播放头位置对应的源时间（处理循环播放）
   */
  getSourceTimeAtPlayhead(clip, playheadTime) {
    const offsetInClip = playheadTime - clip.timelineStart;
    const sourceDuration = clip.sourceEnd - clip.sourceStart;
    const displayDuration = this.getClipDuration(clip);
    
    // 如果没有拉伸或刚好等于源时长，直接计算
    if (displayDuration <= sourceDuration) {
      const ratio = sourceDuration / displayDuration;
      return clip.sourceStart + (offsetInClip * ratio);
    }
    
    // 拉伸了（displayDuration > sourceDuration），需要循环播放
    // 在 sourceStart 到 sourceEnd 范围内循环
    const loopOffset = offsetInClip % sourceDuration;
    const sourceTime = clip.sourceStart + loopOffset;
    
    // 确保在有效范围内
    return Math.max(clip.sourceStart, Math.min(clip.sourceEnd - 0.01, sourceTime));
  },

  /**
   * 获取指定轨道在指定时间的片段
   */
  getClipAtTime(tracks, trackIndex, time) {
    const track = tracks.video[trackIndex];
    if (!track) return null;
    
    for (const clip of track) {
      const clipEnd = this.getClipEnd(clip);
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
        const clipEnd = this.getClipEnd(clip);
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
    
    tracks.video.forEach((track) => {
      track.forEach(clip => {
        if (clip.id === excludeClipId) return;
        
        const clipEnd = this.getClipEnd(clip);
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
