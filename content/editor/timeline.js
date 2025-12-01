// 时间轴管理模块 - 支持多轨道和拖拽
const TimelineManager = {
  // 获取状态引用
  get state() {
    return EditorState;
  },

  // 初始化时间轴（用当前视频）
  init() {
    const state = this.state;
    state.tracks = {
      video: [[]], // 默认只有1个主轨道
      audio: [[]]
    };
    state.timelineDuration = 0;
    state.playheadTime = 0;
    state.history = [];
    state.historyIndex = -1;
    state.activeClip = null;
    state.activeClips = [];
    state.isPlaying = false;
    state.selectedTrackIndex = 0;

    if (state.currentVideo) {
      const clipId = 'clip-' + Date.now();
      const initialClip = {
        id: clipId,
        video: state.currentVideo,
        sourceStart: 0,
        sourceEnd: state.currentVideo.duration,
        timelineStart: 0,
        transform: { ...state.TRANSFORM_PRESETS.fullscreen },
        color: this.generateClipColor(clipId) // 初始化时就分配颜色
      };
      state.tracks.video[0].push(initialClip);
      this.recalculate();
      this.render(true); // 初始化时立即渲染
      state.activeClip = initialClip;
      state.saveHistory();
    }
  },

  // 颜色计数器 - 确保每个新片段获得不同颜色
  colorIndex: 0,
  
  // 预定义的鲜艳颜色列表 - 颜色跨度大，视觉区分明显
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
  
  // 生成片段颜色 - 顺序分配，确保每个片段颜色不同
  generateClipColor(clipId) {
    const color = this.CLIP_COLORS[this.colorIndex % this.CLIP_COLORS.length];
    this.colorIndex++;
    return { ...color };
  },

  // 重新计算时间轴
  // 重新计算时间轴
  // 规则：
  // - contentDuration = 所有轨道中最长片段的结束时间（真正的视频总时长，播放到这里停止）
  // - timelineDuration = contentDuration + 额外空间（方便用户操作，但不会播放超出内容的部分）
  recalculate() {
    const state = this.state;
    
    // 1. 计算所有轨道的最大结束时间（这是真正的内容时长）
    let contentEnd = 0;
    state.tracks.video.forEach(track => {
      track.forEach(clip => {
        const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
        contentEnd = Math.max(contentEnd, clipEnd);
      });
    });
    
    // 2. 保存内容时长（播放结束判断用这个）
    // 所有轨道最长的那段视频结束 = 整个视频的总时长
    state.contentDuration = contentEnd || 0;
    
    // 3. 时间轴可视范围 = 内容时长 + 额外空间（方便用户拖拽操作）
    const extraSpace = Math.max(10, contentEnd * 0.2);
    state.timelineDuration = Math.max(contentEnd + extraSpace, 30);

    // 4. 更新时间轴时长显示（显示真正的内容时长）
    const durationEl = document.getElementById('bm-timeline-duration');
    if (durationEl) {
      durationEl.textContent = BiliAPI.formatDuration(Math.floor(contentEnd));
    }
  },

  // 添加片段到指定轨道
  addClip(video, sourceStart, sourceEnd, trackIndex = 0) {
    const state = this.state;
    const clipId = 'clip-' + Date.now();

    // 确保轨道存在
    while (state.tracks.video.length <= trackIndex) {
      state.tracks.video.push([]);
    }

    const track = state.tracks.video[trackIndex];
    
    // 计算 timelineStart
    let timelineStart;
    if (trackIndex === 0) {
      // 主轨道：追加到末尾
      if (track.length > 0) {
        const lastClip = track[track.length - 1];
        timelineStart = lastClip.timelineStart + (lastClip.sourceEnd - lastClip.sourceStart);
      } else {
        timelineStart = 0;
      }
    } else {
      // 叠加轨道：放在播放头位置
      timelineStart = state.playheadTime;
    }

    // 非主轨道默认使用画中画预设（居中）
    const defaultTransform = trackIndex === 0 
      ? { ...state.TRANSFORM_PRESETS.fullscreen }
      : { ...state.TRANSFORM_PRESETS.pipCenter };

    const newClip = {
      id: clipId,
      video: video,
      sourceStart: sourceStart,
      sourceEnd: sourceEnd,
      timelineStart: timelineStart,
      transform: defaultTransform,
      color: this.generateClipColor(clipId) // 新视频立即分配颜色
    };
    
    track.push(newClip);
    this.recalculate();
    this.render();
    
    return newClip;
  },

  // 移动片段到新位置
  moveClip(clipId, newTimelineStart, newTrackIndex = null) {
    const state = this.state;
    const found = state.findClipById(clipId);
    
    if (!found) return false;

    const { clip, trackIndex, clipIndex } = found;
    const trackChanged = newTrackIndex !== null && newTrackIndex !== trackIndex;
    
    // 如果要移动到不同轨道
    if (trackChanged) {
      // 从原轨道移除
      state.tracks.video[trackIndex].splice(clipIndex, 1);
      
      // 确保目标轨道存在
      while (state.tracks.video.length <= newTrackIndex) {
        state.tracks.video.push([]);
      }
      
      // 添加到新轨道
      clip.timelineStart = Math.max(0, newTimelineStart);
      state.tracks.video[newTrackIndex].push(clip);
    } else {
      // 同一轨道内移动 - 所有轨道都可以自由定位
      clip.timelineStart = Math.max(0, newTimelineStart);
    }

    this.recalculate();
    
    // 性能优化：如果轨道没变，只更新单个片段位置
    if (!trackChanged) {
      this.updateClipPosition(clipId);
    } else {
      // 轨道变了，需要完整渲染
      this.render();
    }
    return true;
  },
  
  // 性能优化：只更新单个片段的位置，不重新渲染整个时间轴
  updateClipPosition(clipId) {
    const state = this.state;
    const found = state.findClipById(clipId);
    if (!found) return;
    
    const { clip } = found;
    const clipEl = document.getElementById(clipId);
    if (!clipEl) return;
    
    const duration = state.timelineDuration || 1;
    const clipDuration = clip.sourceEnd - clip.sourceStart;
    const left = (clip.timelineStart / duration) * 100;
    const width = (clipDuration / duration) * 100;
    
    clipEl.style.left = `${left}%`;
    clipEl.style.width = `${width}%`;
    
    // 更新 data 属性
    clipEl.dataset.timelineStart = clip.timelineStart;
    
    this.updatePlayhead();
  },

  // 在播放头位置切割片段（优先切割选中的片段）
  cutAtPlayhead() {
    const state = this.state;
    const playheadTime = state.playheadTime;
    
    let clipToCut = null;
    let trackIndex = -1;
    let sourceTime = 0;
    
    // 优先使用选中的片段
    if (state.selectedClipId) {
      const found = state.findClipById(state.selectedClipId);
      if (found) {
        const { clip, trackIndex: tIndex } = found;
        const clipDuration = clip.sourceEnd - clip.sourceStart;
        const clipEnd = clip.timelineStart + clipDuration;
        
        // 检查播放头是否在选中片段范围内
        if (playheadTime >= clip.timelineStart && playheadTime < clipEnd) {
          clipToCut = clip;
          trackIndex = tIndex;
          sourceTime = clip.sourceStart + (playheadTime - clip.timelineStart);
        }
      }
    }
    
    // 如果没有选中片段或播放头不在选中片段内，则按播放头位置查找
    if (!clipToCut) {
      for (let i = 0; i < state.tracks.video.length; i++) {
        const track = state.tracks.video[i];
        for (const clip of track) {
          const clipDuration = clip.sourceEnd - clip.sourceStart;
          const clipEnd = clip.timelineStart + clipDuration;
          
          if (playheadTime >= clip.timelineStart && playheadTime < clipEnd) {
            const offsetInClip = playheadTime - clip.timelineStart;
            clipToCut = clip;
            trackIndex = i;
            sourceTime = clip.sourceStart + offsetInClip;
            break;
          }
        }
        if (clipToCut) break;
      }
    }
    
    if (!clipToCut) {
      return { success: false, message: '当前位置没有可切割的片段' };
    }

    if (sourceTime - clipToCut.sourceStart < 0.5 || clipToCut.sourceEnd - sourceTime < 0.5) {
      return { success: false, message: '切割位置太靠近片段边缘' };
    }

    state.saveHistory();

    const track = state.tracks.video[trackIndex];
    const clipIndex = track.findIndex(c => c.id === clipToCut.id);
    
    // 计算切割后两个片段的时间轴位置
    const originalTimelineStart = clipToCut.timelineStart;
    const firstClipDuration = sourceTime - clipToCut.sourceStart;
    
    // 前半段保持原颜色，后半段分配新颜色
    const originalColor = clipToCut.color || this.generateClipColor(clipToCut.id);
    const newClip2Id = 'clip-' + (Date.now() + 1);
    
    const newClip1 = {
      id: 'clip-' + Date.now(),
      video: clipToCut.video,
      sourceStart: clipToCut.sourceStart,
      sourceEnd: sourceTime,
      timelineStart: originalTimelineStart,
      transform: clipToCut.transform ? { ...clipToCut.transform } : undefined,
      color: { ...originalColor } // 前半段保持原颜色
    };

    const newClip2 = {
      id: newClip2Id,
      video: clipToCut.video,
      sourceStart: sourceTime,
      sourceEnd: clipToCut.sourceEnd,
      timelineStart: originalTimelineStart + firstClipDuration,
      transform: clipToCut.transform ? { ...clipToCut.transform } : undefined,
      color: this.generateClipColor(newClip2Id) // 后半段分配新颜色
    };

    track.splice(clipIndex, 1, newClip1, newClip2);

    this.recalculate();
    this.render();
    this.updateActiveClipFromPlayhead();

    return { 
      success: true, 
      message: `已在 ${BiliAPI.formatDuration(Math.floor(sourceTime))} 处切割`,
      newClip: newClip2
    };
  },

  // 删除片段
  deleteClip(clipId) {
    const state = this.state;
    const found = state.findClipById(clipId);
    
    if (!found) {
      return { success: false, message: '片段不存在' };
    }

    state.saveHistory();

    const { clip, trackIndex, clipIndex } = found;
    state.tracks.video[trackIndex].splice(clipIndex, 1);

    if (state.selectedClipId === clipId) {
      state.selectedClipId = null;
    }

    this.recalculate();

    if (state.playheadTime > state.timelineDuration) {
      state.playheadTime = Math.max(0, state.timelineDuration - 0.01);
    }

    this.updateActiveClipFromPlayhead();
    this.render();

    return { 
      success: true, 
      message: `已删除片段`,
      deletedClip: clip
    };
  },

  // 选中片段（支持多选）
  selectClip(clipId, trackIndex = null, addToSelection = false) {
    const state = this.state;
    
    if (addToSelection) {
      // 多选模式（Shift+点击）
      if (state.selectedClipIds.includes(clipId)) {
        // 已选中则取消选中
        state.selectedClipIds = state.selectedClipIds.filter(id => id !== clipId);
        const clipEl = document.getElementById(clipId);
        if (clipEl) clipEl.classList.remove('selected');
        
        // 更新主选中项
        state.selectedClipId = state.selectedClipIds[state.selectedClipIds.length - 1] || null;
      } else {
        // 添加到选中列表
        state.selectedClipIds.push(clipId);
        state.selectedClipId = clipId;
        const clipEl = document.getElementById(clipId);
        if (clipEl) clipEl.classList.add('selected');
      }
    } else {
      // 单选模式
      // 取消之前的选中
      document.querySelectorAll('.bm-timeline-clip.selected').forEach(el => {
        el.classList.remove('selected');
      });

      state.selectedClipId = clipId;
      state.selectedClipIds = clipId ? [clipId] : [];
      
      // 选中新片段
      const newClip = document.getElementById(clipId);
      if (newClip) newClip.classList.add('selected');
      // 注意：跳转逻辑由 handleTrackClick 处理，这里不重复跳转
    }
    
    if (trackIndex !== null) {
      state.selectedTrackIndex = trackIndex;
    }
  },
  
  // 清除所有选中
  clearSelection() {
    const state = this.state;
    document.querySelectorAll('.bm-timeline-clip.selected').forEach(el => {
      el.classList.remove('selected');
    });
    state.selectedClipId = null;
    state.selectedClipIds = [];
  },
  
  // 删除所有选中的片段
  deleteSelectedClips() {
    const state = this.state;
    if (state.selectedClipIds.length === 0) {
      return { success: false, message: '没有选中的片段' };
    }
    
    state.saveHistory();
    
    let deletedCount = 0;
    const clipIds = [...state.selectedClipIds]; // 复制数组避免修改时出错
    
    clipIds.forEach(clipId => {
      const found = state.findClipById(clipId);
      if (found) {
        const { trackIndex, clipIndex } = found;
        state.tracks.video[trackIndex].splice(clipIndex, 1);
        deletedCount++;
      }
    });
    
    state.selectedClipId = null;
    state.selectedClipIds = [];
    
    this.recalculate();
    
    if (state.playheadTime > state.timelineDuration) {
      state.playheadTime = Math.max(0, state.timelineDuration - 0.01);
    }
    
    this.updateActiveClipFromPlayhead();
    this.render();
    
    return { 
      success: true, 
      message: `已删除 ${deletedCount} 个片段`,
      deletedCount
    };
  },

  // 时间轴时间 → 原视频时间（只查主轨道）
  timelineToSource(timelineTime) {
    const state = this.state;
    const track = state.tracks.video[0];
    
    for (const clip of track) {
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
    
    if (track.length > 0) {
      const lastClip = track[track.length - 1];
      return { clip: lastClip, sourceTime: lastClip.sourceEnd };
    }
    return null;
  },

  // 原视频时间 → 时间轴时间
  sourceToTimeline(clip, sourceTime) {
    const offsetInClip = sourceTime - clip.sourceStart;
    return clip.timelineStart + offsetInClip;
  },

  // 获取当前播放头位置对应的片段（主轨道）
  getCurrentClip() {
    const state = this.state;
    const track = state.tracks.video[0];
    
    for (const clip of track) {
      const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
      if (state.playheadTime >= clip.timelineStart && state.playheadTime < clipEnd) {
        return clip;
      }
    }
    
    if (track.length > 0 && state.playheadTime >= state.timelineDuration) {
      return track[track.length - 1];
    }
    return track[0] || null;
  },
  
  // 获取当前时间点所有轨道的活动片段（用于多轨道同时播放）
  // 返回数组，按轨道索引排序，索引越大层级越高（显示在上面）
  getActiveClipsAtTime(timelineTime) {
    const state = this.state;
    const activeClips = [];
    
    state.tracks.video.forEach((track, trackIndex) => {
      for (const clip of track) {
        const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
        if (timelineTime >= clip.timelineStart && timelineTime < clipEnd) {
          const offsetInClip = timelineTime - clip.timelineStart;
          activeClips.push({
            clip: clip,
            trackIndex: trackIndex,
            sourceTime: clip.sourceStart + offsetInClip
          });
          break; // 每个轨道只取一个片段
        }
      }
    });
    
    return activeClips;
  },

  // 获取排序后的片段列表（主轨道）
  getSortedClips() {
    return [...this.state.tracks.video[0]].sort((a, b) => a.timelineStart - b.timelineStart);
  },

  // 获取下一个片段
  getNextClip(currentClip) {
    const sortedClips = this.getSortedClips();
    const currentIndex = sortedClips.findIndex(c => c.id === currentClip.id);
    return sortedClips[currentIndex + 1] || null;
  },

  // 根据播放头位置更新活动片段
  updateActiveClipFromPlayhead() {
    const state = this.state;
    const track = state.tracks.video[0];
    
    if (track.length === 0) {
      state.activeClip = null;
      return;
    }
    
    if (state.playheadTime > state.timelineDuration) {
      state.playheadTime = Math.max(0, state.timelineDuration - 0.01);
    }
    
    const result = this.timelineToSource(state.playheadTime);
    if (result) {
      state.activeClip = result.clip;
    } else {
      state.activeClip = track[0];
    }
  },

  // 设置时间轴缩放
  setZoom(zoom) {
    const state = this.state;
    // 限制缩放范围
    zoom = Math.max(0.25, Math.min(4, zoom));
    state.timelineZoom = zoom;
    
    // 更新显示
    const zoomLevel = document.getElementById('bm-zoom-level');
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
    }
    
    // 更新时间轴宽度
    this.applyZoom();
    this.updatePlayhead();
  },
  
  // 应用缩放到时间轴
  applyZoom() {
    const state = this.state;
    const tracksContainer = document.getElementById('bm-timeline-tracks');
    const ruler = document.getElementById('bm-timeline-ruler');
    
    if (!tracksContainer) return;
    
    const zoomWidth = `${state.timelineZoom * 100}%`;
    
    // 设置轨道内容宽度
    document.querySelectorAll('.bm-track-content').forEach(track => {
      track.style.width = zoomWidth;
    });
    
    // 设置刻度尺宽度
    if (ruler) {
      ruler.style.width = `calc(${zoomWidth} - 60px)`;
    }
  },

  // 更新播放头位置显示
  updatePlayhead() {
    const state = this.state;
    const playhead = document.getElementById('bm-playhead');
    const trackContent = document.querySelector('.bm-track-content');
    
    if (!playhead || !trackContent || state.timelineDuration <= 0) return;

    // 播放头位置百分比
    const percent = (state.playheadTime / state.timelineDuration) * 100;
    // 使用 CSS calc，和轨道内容对齐
    playhead.style.left = `calc(60px + ${percent}%)`;
  },

  // 生成时间轴刻度 - 像手表刻度
  // 小刻度(1秒): 短线 | 中刻度(5秒): 中线 | 大刻度(10秒): 长线+数字
  generateRuler(duration) {
    const ruler = document.getElementById('bm-timeline-ruler');
    if (!ruler) return;

    const totalSeconds = Math.ceil(duration);
    
    let html = '';
    for (let i = 0; i <= totalSeconds; i++) {
      const percent = (i / totalSeconds) * 100;
      
      let markClass = 'minor'; // 默认小刻度
      let showLabel = false;
      
      if (i % 10 === 0) {
        markClass = 'major'; // 10秒大刻度
        showLabel = true;
      } else if (i % 5 === 0) {
        markClass = 'medium'; // 5秒中刻度
      }
      
      html += `<div class="bm-ruler-mark ${markClass}" style="left: ${percent}%">
        ${showLabel ? `<span>${BiliAPI.formatDuration(i)}</span>` : ''}
      </div>`;
    }
    ruler.innerHTML = html;
  },

  // 渲染单个轨道的片段
  renderTrackClips(track, trackIndex, duration, videoHueMap, isAudio = false) {
    const state = this.state;
    let html = '';

    track.forEach(clip => {
      const clipDuration = clip.sourceEnd - clip.sourceStart;
      const left = (clip.timelineStart / duration) * 100;
      const width = (clipDuration / duration) * 100;
      const isSelected = clip.id === state.selectedClipId;
      const baseHue = videoHueMap[clip.video.bvid] || 0;

      if (isAudio) {
        // 音频轨道
        const barCount = Math.min(Math.ceil(clipDuration * 2), 60);
        let waveHtml = '';
        for (let i = 0; i < barCount; i++) {
          const seed = (clip.sourceStart * 100 + i * 7) % 100;
          const height = 20 + (seed % 60);
          waveHtml += `<div class="bm-wave-bar" style="height: ${height}%;"></div>`;
        }

        html += `
          <div class="bm-timeline-clip bm-audio-clip ${isSelected ? 'selected' : ''}"
               id="${clip.id}-audio"
               data-clip-id="${clip.id}"
               data-track-index="${trackIndex}"
               draggable="true"
               style="left: ${left}%; width: ${width}%;">
            <div class="bm-clip-waveform">${waveHtml}</div>
          </div>
        `;
      } else {
        // 视频轨道 - 纯色背景，无标题
        const isPip = trackIndex > 0;
        
        // 如果片段没有颜色（旧数据兼容），分配一个
        if (!clip.color) {
          clip.color = this.generateClipColor(clip.id);
        }
        const { hue, saturation, lightness } = clip.color;

        html += `
          <div class="bm-timeline-clip ${isSelected ? 'selected' : ''} ${isPip ? 'bm-pip-clip' : ''}"
               id="${clip.id}"
               data-bvid="${clip.video.bvid}"
               data-track-index="${trackIndex}"
               data-timeline-start="${clip.timelineStart}"
               data-source-start="${clip.sourceStart}"
               data-source-end="${clip.sourceEnd}"
               draggable="true"
               style="left: ${left}%; width: ${width}%; background: linear-gradient(135deg, hsl(${hue}, ${saturation}%, ${lightness + 8}%), hsl(${hue}, ${saturation}%, ${lightness}%));"
               title="${clip.video.title}">
            <div class="bm-clip-drag-handle bm-clip-handle-left"></div>
            <div class="bm-clip-drag-handle bm-clip-handle-right"></div>
          </div>
        `;
      }
    });

    return html;
  },

  // 渲染防抖定时器
  _renderTimer: null,
  
  // 渲染时间轴（带防抖）
  render(immediate = false) {
    // 如果需要立即渲染，取消之前的定时器
    if (immediate) {
      if (this._renderTimer) {
        cancelAnimationFrame(this._renderTimer);
        this._renderTimer = null;
      }
      this._doRender();
      return;
    }
    
    // 使用 requestAnimationFrame 防抖
    if (this._renderTimer) return;
    
    this._renderTimer = requestAnimationFrame(() => {
      this._doRender();
      this._renderTimer = null;
    });
  },
  
  // 实际渲染逻辑
  _doRender() {
    const state = this.state;
    const duration = state.timelineDuration || 1;

    // 生成时间刻度尺
    this.generateRuler(duration);

    // 为不同视频分配不同的基础色相
    const videoHueMap = {};
    let hueIndex = 0;
    const hueStep = 60;
    
    state.tracks.video.forEach(track => {
      track.forEach(clip => {
        const bvid = clip.video.bvid;
        if (!(bvid in videoHueMap)) {
          videoHueMap[bvid] = (hueIndex * hueStep) % 360;
          hueIndex++;
        }
      });
    });

    // 动态生成视频轨道 DOM
    this.renderVideoTracks();

    // 渲染视频轨道内容
    state.tracks.video.forEach((track, trackIndex) => {
      const trackEl = document.getElementById(`bm-video-track-${trackIndex}`);
      if (trackEl) {
        trackEl.innerHTML = this.renderTrackClips(track, trackIndex, duration, videoHueMap, false);
      }
    });

    // 渲染音频轨道
    const audioTrack = document.getElementById('bm-audio-track');
    if (audioTrack && state.tracks.audio[0]) {
      const audioClips = state.tracks.video[0].map(clip => ({ ...clip }));
      audioTrack.innerHTML = this.renderTrackClips(audioClips, 0, duration, videoHueMap, true);
    }

    this.updatePlayhead();
    this.bindDragEvents();
  },
  
  // 动态渲染视频轨道 DOM
  renderVideoTracks() {
    const state = this.state;
    const container = document.getElementById('bm-video-tracks-container');
    if (!container) return;
    
    // 检查现有轨道数量
    const existingTracks = container.querySelectorAll('.bm-timeline-track');
    const neededTracks = state.tracks.video.length;
    
    // 如果轨道数量不匹配，重新生成
    if (existingTracks.length !== neededTracks) {
      let html = '';
      for (let i = 0; i < neededTracks; i++) {
        const trackName = `V${i + 1} 视频轨道`;
        html += `
          <div class="bm-timeline-track ${i > 0 ? 'bm-overlay-track' : ''}" data-track="video-${i}">
            <div class="bm-track-header">
              <span>${trackName}</span>
              ${i > 0 ? `<button class="bm-track-remove-btn" data-track-index="${i}" title="删除轨道">×</button>` : ''}
            </div>
            <div class="bm-track-content" id="bm-video-track-${i}" data-track-index="${i}"></div>
          </div>
        `;
      }
      container.innerHTML = html;
      
      // 绑定删除轨道按钮
      container.querySelectorAll('.bm-track-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const trackIndex = parseInt(btn.dataset.trackIndex);
          this.removeTrack(trackIndex);
        });
      });
    }
  },
  
  // 添加新视频轨道
  addTrack() {
    const state = this.state;
    state.saveHistory();
    const newIndex = state.addVideoTrack();
    this.render();
    MaterialUI.showToast(`已添加视频轨道 ${newIndex + 1}`);
    return newIndex;
  },
  
  // 删除视频轨道
  removeTrack(trackIndex) {
    const state = this.state;
    if (trackIndex === 0) {
      MaterialUI.showToast('不能删除主轨道', 'error');
      return false;
    }
    
    const track = state.tracks.video[trackIndex];
    if (track && track.length > 0) {
      if (!confirm(`轨道 V${trackIndex + 1} 上有 ${track.length} 个片段，确定删除吗？`)) {
        return false;
      }
    }
    
    state.saveHistory();
    state.removeVideoTrack(trackIndex);
    this.recalculate();
    this.render();
    MaterialUI.showToast(`已删除 V${trackIndex + 1} 视频轨道`);
    return true;
  },

  // 绑定拖拽事件（使用事件委托优化性能）
  bindDragEvents() {
    const container = document.getElementById('bm-video-tracks-container');
    if (!container || container._dragEventsBound) return;
    
    // 使用事件委托，只在容器上绑定一次
    container.addEventListener('dragstart', (e) => {
      const clipEl = e.target.closest('.bm-timeline-clip[draggable="true"]');
      if (clipEl) this.onDragStart(e);
    });
    
    container.addEventListener('dragend', (e) => {
      const clipEl = e.target.closest('.bm-timeline-clip');
      if (clipEl) this.onDragEnd(e);
    });
    
    container.addEventListener('dragover', (e) => {
      const trackEl = e.target.closest('.bm-track-content');
      if (trackEl) this.onDragOver(e);
    });
    
    container.addEventListener('drop', (e) => {
      const trackEl = e.target.closest('.bm-track-content');
      if (trackEl) this.onDrop(e);
    });
    
    container.addEventListener('dragleave', (e) => {
      const trackEl = e.target.closest('.bm-track-content');
      if (trackEl) this.onDragLeave(e);
    });
    
    container._dragEventsBound = true;
    
    // 裁剪手柄事件也使用委托
    this.bindTrimHandlesDelegate(container);
  },
  
  // 使用事件委托绑定裁剪手柄
  bindTrimHandlesDelegate(container) {
    if (container._trimEventsBound) return;
    
    container.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.bm-clip-drag-handle');
      if (handle) this.onTrimStart(e);
    });
    
    container._trimEventsBound = true;
  },
  
  // 裁剪开始
  onTrimStart(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const handle = e.target;
    const clipEl = handle.closest('.bm-timeline-clip');
    if (!clipEl) return;
    
    const clipId = clipEl.id;
    const isLeft = handle.classList.contains('bm-clip-handle-left');
    const found = this.state.findClipById(clipId);
    if (!found) return;
    
    const { clip, trackIndex } = found;
    const trackEl = clipEl.closest('.bm-track-content');
    if (!trackEl) return;
    
    // 保存裁剪状态
    this.trimState = {
      clipId,
      clip,
      trackIndex,
      isLeft,
      trackRect: trackEl.getBoundingClientRect(),
      originalSourceStart: clip.sourceStart,
      originalSourceEnd: clip.sourceEnd,
      originalTimelineStart: clip.timelineStart,
      minDuration: 0.5 // 最小片段时长
    };
    
    // 添加全局事件监听
    document.addEventListener('mousemove', this.onTrimMove);
    document.addEventListener('mouseup', this.onTrimEnd);
    
    // 添加裁剪中的样式
    clipEl.classList.add('trimming');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  },
  
  // 裁剪移动
  onTrimMove: function(e) {
    const tm = TimelineManager;
    if (!tm.trimState) return;
    
    const { clipId, clip, trackIndex, isLeft, trackRect, originalSourceStart, originalSourceEnd, originalTimelineStart, minDuration } = tm.trimState;
    const state = tm.state;
    
    // 计算鼠标在轨道中的位置
    // trackRect.width 已经是缩放后的实际宽度，代表整个 timelineDuration
    const mouseX = e.clientX - trackRect.left;
    const percent = Math.max(0, Math.min(1, mouseX / trackRect.width));
    let mouseTime = percent * state.timelineDuration;
    
    // 应用吸附
    if (state.snapEnabled) {
      const snapPoints = tm.getSnapPoints(clipId, trackIndex);
      for (const point of snapPoints) {
        if (Math.abs(mouseTime - point.time) < state.snapThreshold) {
          mouseTime = point.time;
          tm.showSnapIndicator(point.time, 0, 'trim');
          break;
        }
      }
    }
    
    const originalDuration = originalSourceEnd - originalSourceStart;
    
    if (isLeft) {
      // 拖拽左边缘 - 调整入点
      if (trackIndex === 0) {
        // 主轨道：调整 sourceStart，timelineStart 会自动重算
        const maxSourceStart = originalSourceEnd - minDuration;
        const timeDelta = mouseTime - originalTimelineStart;
        let newSourceStart = originalSourceStart + timeDelta;
        newSourceStart = Math.max(0, Math.min(maxSourceStart, newSourceStart));
        clip.sourceStart = newSourceStart;
      } else {
        // 叠加轨道：同时调整 sourceStart 和 timelineStart
        const maxTimelineStart = originalTimelineStart + originalDuration - minDuration;
        let newTimelineStart = Math.max(0, Math.min(maxTimelineStart, mouseTime));
        const timeDelta = newTimelineStart - originalTimelineStart;
        clip.timelineStart = newTimelineStart;
        clip.sourceStart = Math.min(originalSourceEnd - minDuration, originalSourceStart + timeDelta);
      }
    } else {
      // 拖拽右边缘 - 调整出点
      const clipEnd = trackIndex === 0 ? originalTimelineStart + originalDuration : clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
      const timeDelta = mouseTime - clipEnd;
      let newSourceEnd = originalSourceEnd + timeDelta;
      
      // 限制范围
      const minSourceEnd = clip.sourceStart + minDuration;
      const maxSourceEnd = clip.video.duration || originalSourceEnd + 60; // 不能超过原视频时长
      newSourceEnd = Math.max(minSourceEnd, Math.min(maxSourceEnd, newSourceEnd));
      clip.sourceEnd = newSourceEnd;
    }
    
    // 重新计算
    tm.recalculate();
    
    // 性能优化：裁剪时只更新单个片段，不重新渲染整个时间轴
    tm.updateClipPosition(clipId);
    
    // 更新属性面板（使用防抖）
    if (!tm._updatePropsTimer) {
      tm._updatePropsTimer = setTimeout(() => {
        EditorUI.updatePropertiesPanel(clipId);
        tm._updatePropsTimer = null;
      }, 50);
    }
  },
  
  // 裁剪结束
  onTrimEnd: function(e) {
    const tm = TimelineManager;
    if (!tm.trimState) return;
    
    const { clipId, originalSourceStart, originalSourceEnd, originalTimelineStart } = tm.trimState;
    const found = tm.state.findClipById(clipId);
    
    // 隐藏吸附指示器
    tm.hideSnapIndicator();
    
    // 检查是否有实际变化
    if (found) {
      const { clip } = found;
      const hasChanged = clip.sourceStart !== originalSourceStart || 
                        clip.sourceEnd !== originalSourceEnd ||
                        clip.timelineStart !== originalTimelineStart;
      if (hasChanged) {
        // 保存历史（在变化之后）
        tm.state.saveHistory();
      }
    }
    
    // 移除全局事件监听
    document.removeEventListener('mousemove', tm.onTrimMove);
    document.removeEventListener('mouseup', tm.onTrimEnd);
    
    // 移除裁剪中的样式
    const clipEl = document.getElementById(clipId);
    if (clipEl) {
      clipEl.classList.remove('trimming');
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    tm.trimState = null;
    
    // 更新活动片段
    tm.updateActiveClipFromPlayhead();
  },

  // 拖拽开始
  onDragStart(e) {
    const clipEl = e.target.closest('.bm-timeline-clip');
    if (!clipEl) return;

    let clipId = clipEl.id;
    if (clipId.endsWith('-audio')) {
      clipId = clipEl.dataset.clipId;
    }

    const trackIndex = parseInt(clipEl.dataset.trackIndex) || 0;
    
    e.dataTransfer.setData('text/plain', JSON.stringify({
      clipId,
      trackIndex,
      offsetX: e.offsetX
    }));
    
    e.dataTransfer.effectAllowed = 'move';
    clipEl.classList.add('dragging');
    
    this.state.dragState = { clipId, trackIndex };
  },

  // 拖拽结束
  onDragEnd(e) {
    const clipEl = e.target.closest('.bm-timeline-clip');
    if (clipEl) {
      clipEl.classList.remove('dragging');
    }
    
    document.querySelectorAll('.bm-track-content').forEach(el => {
      el.classList.remove('drag-over');
    });
    
    this.state.dragState = null;
  },

  // 拖拽经过
  onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const trackEl = e.target.closest('.bm-track-content');
    if (trackEl) {
      trackEl.classList.add('drag-over');
    }
  },

  // 拖拽离开
  onDragLeave(e) {
    const trackEl = e.target.closest('.bm-track-content');
    if (trackEl) {
      trackEl.classList.remove('drag-over');
    }
  },

  // 放置
  onDrop(e) {
    e.preventDefault();
    
    const trackEl = e.target.closest('.bm-track-content');
    if (!trackEl) return;

    trackEl.classList.remove('drag-over');
    this.hideSnapIndicator();

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const { clipId, trackIndex: sourceTrackIndex, offsetX } = data;
      
      // 计算新的时间轴位置
      // 轨道宽度 = timelineDuration * timelineZoom（CSS 中设置的）
      // 所以：时间 = (鼠标位置 / 轨道宽度) * timelineDuration * timelineZoom / timelineZoom
      //          = (鼠标位置 / 轨道宽度) * timelineDuration
      const rect = trackEl.getBoundingClientRect();
      const dropX = e.clientX - rect.left - (offsetX || 0);
      const percent = Math.max(0, dropX / rect.width);
      let newTimelineStart = percent * this.state.timelineDuration;

      // 获取目标轨道索引
      const targetTrackIndex = parseInt(trackEl.dataset.trackIndex) || 0;
      
      // 应用吸附
      if (this.state.snapEnabled) {
        const found = this.state.findClipById(clipId);
        if (found) {
          const clipDuration = found.clip.sourceEnd - found.clip.sourceStart;
          newTimelineStart = this.applySnap(newTimelineStart, clipDuration, clipId, targetTrackIndex);
        }
      }

      // 保存历史
      this.state.saveHistory();

      // 移动片段
      this.moveClip(clipId, newTimelineStart, targetTrackIndex);

    } catch (err) {
      console.error('拖放失败:', err);
    }
  },
  
  // 获取所有吸附点
  getSnapPoints(excludeClipId = null, trackIndex = null) {
    const state = this.state;
    const points = [];
    
    // 添加播放头位置
    points.push({ time: state.playheadTime, type: 'playhead' });
    
    // 添加时间轴起点和终点
    points.push({ time: 0, type: 'start' });
    points.push({ time: state.timelineDuration, type: 'end' });
    
    // 添加所有片段的边缘
    state.tracks.video.forEach((track, tIndex) => {
      track.forEach(clip => {
        if (clip.id === excludeClipId) return;
        
        const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
        points.push({ time: clip.timelineStart, type: 'clip-start', trackIndex: tIndex });
        points.push({ time: clipEnd, type: 'clip-end', trackIndex: tIndex });
      });
    });
    
    return points;
  },
  
  // 应用吸附
  applySnap(timelineStart, clipDuration, excludeClipId, trackIndex) {
    const state = this.state;
    if (!state.snapEnabled) return timelineStart;
    
    const snapPoints = this.getSnapPoints(excludeClipId, trackIndex);
    const clipEnd = timelineStart + clipDuration;
    const threshold = state.snapThreshold;
    
    let snappedStart = timelineStart;
    let minDiff = threshold;
    let snapType = null;
    
    // 检查片段起点的吸附
    for (const point of snapPoints) {
      const diff = Math.abs(timelineStart - point.time);
      if (diff < minDiff) {
        minDiff = diff;
        snappedStart = point.time;
        snapType = 'start-to-' + point.type;
      }
    }
    
    // 检查片段终点的吸附
    for (const point of snapPoints) {
      const diff = Math.abs(clipEnd - point.time);
      if (diff < minDiff) {
        minDiff = diff;
        snappedStart = point.time - clipDuration;
        snapType = 'end-to-' + point.type;
      }
    }
    
    // 显示吸附指示器
    if (snapType) {
      this.showSnapIndicator(snappedStart, clipDuration, snapType);
    }
    
    return Math.max(0, snappedStart);
  },
  
  // 显示吸附指示器
  showSnapIndicator(timelineStart, clipDuration, snapType) {
    let indicator = document.getElementById('bm-snap-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'bm-snap-indicator';
      indicator.className = 'bm-snap-indicator';
      document.querySelector('.bm-timeline-body')?.appendChild(indicator);
    }
    
    const state = this.state;
    const percent = (timelineStart / state.timelineDuration) * 100 * state.timelineZoom;
    
    indicator.style.left = `calc(60px + (100% - 60px) * ${percent / 100})`;
    indicator.style.display = 'block';
    indicator.classList.add('active');
    
    // 短暂显示后隐藏
    setTimeout(() => this.hideSnapIndicator(), 500);
  },
  
  // 隐藏吸附指示器
  hideSnapIndicator() {
    const indicator = document.getElementById('bm-snap-indicator');
    if (indicator) {
      indicator.classList.remove('active');
      indicator.style.display = 'none';
    }
  }
};

// 导出
window.TimelineManager = TimelineManager;