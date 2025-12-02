// 时间轴管理模块 - 支持多轨道和拖拽
const TimelineManager = {
  // 获取状态引用
  get state() {
    return EditorState;
  },

  // 初始化时间轴（用当前视频）
  init() {
    const state = this.state;
    
    // 初始化核心模块
    EditorCore.init();
    
    // 重置颜色计数器
    TrackManager._colorIndex = 0;

    if (state.currentVideo) {
      // 添加初始片段
      const clip = EditorCore.addClip(
        state.currentVideo,
        0,
        state.currentVideo.duration,
        0,
        { transform: { ...state.TRANSFORM_PRESETS.fullscreen } }
      );
      
      this.recalculate();
      this.render(true);
      EditorCore._saveHistory();
    }
  },

  // 生成片段颜色 - 委托给 TrackManager
  generateClipColor(clipId) {
    return TrackManager.generateClipColor();
  },

  // 重新计算时间轴
  // 重新计算时间轴 - 委托给 TimeController
  recalculate() {
    const state = this.state;
    
    // 使用 TimeController 统一计算时长
    const result = TimeController.recalculateDuration(state.tracks.video);
    
    // 更新时间轴时长显示
    const durationEl = document.getElementById('bm-timeline-duration');
    if (durationEl) {
      durationEl.textContent = BiliAPI.formatDuration(Math.floor(result.contentDuration));
    }
  },

  // 添加片段到指定轨道 - 委托给 EditorCore
  addClip(video, sourceStart, sourceEnd, trackIndex = 0) {
    const state = this.state;
    
    // 非主轨道默认使用画中画预设
    const defaultTransform = trackIndex === 0 
      ? { ...state.TRANSFORM_PRESETS.fullscreen }
      : { ...state.TRANSFORM_PRESETS.pipCenter };

    const newClip = EditorCore.addClip(video, sourceStart, sourceEnd, trackIndex, {
      transform: defaultTransform
    });
    
    this.recalculate();
    this.render();
    
    return newClip;
  },

  // 移动片段到新位置 - 委托给 EditorCore
  moveClip(clipId, newTimelineStart, newTrackIndex = null) {
    const found = this.state.findClipById(clipId);
    if (!found) return false;
    
    const { trackIndex } = found;
    const trackChanged = newTrackIndex !== null && newTrackIndex !== trackIndex;
    
    const result = EditorCore.moveClip(clipId, newTimelineStart, newTrackIndex);
    if (!result.success) return false;
    
    this.recalculate();
    
    // 性能优化：如果轨道没变，只更新单个片段位置
    if (!trackChanged) {
      this.updateClipPosition(clipId);
    } else {
      this.render();
    }
    return true;
  },
  
  // 性能优化：只更新单个片段的位置，不重新渲染整个时间轴
  updateClipPosition(clipId) {
    const state = this.state;
    const duration = state.timelineDuration || 1;
    
    // 格式化时长
    const formatDur = (d) => {
      const m = Math.floor(d / 60);
      const s = Math.floor(d % 60);
      return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
    };
    
    // 更新所有片段的位置和宽度（因为 timelineDuration 可能变了）
    document.querySelectorAll('.bm-timeline-clip').forEach(clipEl => {
      const id = clipEl.id;
      if (id.endsWith('-audio')) return; // 跳过音频片段
      
      const found = state.findClipById(id);
      if (!found) return;
      
      const { clip } = found;
      const clipDuration = TrackManager.getClipDuration(clip);
      const left = (clip.timelineStart / duration) * 100;
      const width = (clipDuration / duration) * 100;
      
      clipEl.style.left = `${left}%`;
      clipEl.style.width = `${width}%`;
      clipEl.dataset.timelineStart = clip.timelineStart;
      
      // 更新时长标签和拉伸状态（使用原始时长）
      const originalDuration = clip.originalDuration || (clip.sourceEnd - clip.sourceStart);
      const isStretched = Math.abs(clipDuration - originalDuration) > 0.1;
      
      // 更新拉伸样式
      clipEl.classList.toggle('stretched', isStretched);
      
      // 更新时长标签
      const label = clipEl.querySelector('.bm-clip-duration-label');
      if (label) {
        label.textContent = isStretched 
          ? `${formatDur(clipDuration)} (源${formatDur(originalDuration)})`
          : formatDur(clipDuration);
      }
    });
    
    this.updatePlayhead();
  },

  // 在播放头位置切割片段 - 委托给 EditorCore
  cutAtPlayhead() {
    const state = this.state;
    const playheadTime = state.playheadTime;
    
    // 查找要切割的片段
    let clipToCut = null;
    
    // 优先使用选中的片段
    if (state.selectedClipId) {
      const found = state.findClipById(state.selectedClipId);
      if (found) {
        const { clip } = found;
        const clipEnd = TrackManager.getClipEnd(clip);
        if (playheadTime >= clip.timelineStart && playheadTime < clipEnd) {
          clipToCut = clip;
        }
      }
    }
    
    // 如果没有选中片段，查找播放头位置的片段
    if (!clipToCut) {
      const activeClips = TrackManager.getActiveClipsAtTime(state.tracks, playheadTime);
      if (activeClips.length > 0) {
        clipToCut = activeClips[0].clip;
      }
    }
    
    if (!clipToCut) {
      return { success: false, message: '当前位置没有可切割的片段' };
    }

    // 保存历史（在修改之前）
    state.saveHistory();
    
    // 使用 TrackManager 切割
    const result = TrackManager.splitClip(state.tracks, clipToCut.id, playheadTime);
    if (!result.success) return result;
    
    // 更新 EditorCore 的 tracks
    EditorCore._tracks = result.tracks;

    this.recalculate();
    this.render();
    this.updateActiveClipFromPlayhead();

    return { success: true, message: result.message, newClip: result.clip2 };
  },

  // 删除片段 - 委托给 EditorCore
  deleteClip(clipId) {
    const state = this.state;
    if (!state.findClipById(clipId)) {
      return { success: false, message: '片段不存在' };
    }

    const result = EditorCore.removeClip(clipId);
    if (!result.success) return result;
    
    if (state.selectedClipId === clipId) {
      state.selectedClipId = null;
    }

    this.recalculate();

    if (state.playheadTime > state.timelineDuration) {
      state.playheadTime = Math.max(0, state.timelineDuration - 0.01);
    }

    this.updateActiveClipFromPlayhead();
    this.render();

    return { success: true, message: `已删除片段`, deletedClip: result.clip };
  },

  // 选中片段（支持多选）- 数据委托给 EditorCore，UI 在这里处理
  selectClip(clipId, trackIndex = null, addToSelection = false) {
    const state = this.state;
    
    if (addToSelection) {
      // 多选模式
      EditorCore.selectClip(clipId, true);
      const clipEl = document.getElementById(clipId);
      if (clipEl) {
        clipEl.classList.toggle('selected', state.selectedClipIds.includes(clipId));
      }
    } else {
      // 单选模式 - 先清除 UI
      document.querySelectorAll('.bm-timeline-clip.selected').forEach(el => {
        el.classList.remove('selected');
      });
      EditorCore.selectClip(clipId, false);
      const clipEl = document.getElementById(clipId);
      if (clipEl) clipEl.classList.add('selected');
    }
    
    if (trackIndex !== null) {
      state.selectedTrackIndex = trackIndex;
    }
  },
  
  // 清除所有选中
  clearSelection() {
    document.querySelectorAll('.bm-timeline-clip.selected').forEach(el => {
      el.classList.remove('selected');
    });
    EditorCore.clearSelection();
  },
  
  // 删除所有选中的片段 - 委托给 EditorCore
  deleteSelectedClips() {
    const state = this.state;
    if (state.selectedClipIds.length === 0) {
      return { success: false, message: '没有选中的片段' };
    }
    
    state.saveHistory();
    let deletedCount = 0;
    const clipIds = [...state.selectedClipIds];
    
    // 直接操作 EditorCore._tracks
    clipIds.forEach(clipId => {
      const result = TrackManager.removeClip(EditorCore._tracks, clipId);
      if (result.success) {
        EditorCore._tracks = result.tracks;
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
    
    return { success: true, message: `已删除 ${deletedCount} 个片段`, deletedCount };
  },

  // 获取当前播放头位置对应的片段（主轨道）- 委托给 TrackManager
  getCurrentClip() {
    const clip = TrackManager.getClipAtTime(this.state.tracks, 0, this.state.playheadTime);
    if (clip) return clip;
    // 兜底：播放头超出时返回最后一个，否则返回第一个
    const track = this.state.tracks.video[0];
    if (track.length > 0 && this.state.playheadTime >= this.state.timelineDuration) {
      return track[track.length - 1];
    }
    return track[0] || null;
  },
  
  // 获取当前时间点所有轨道的活动片段 - 委托给 TrackManager
  getActiveClipsAtTime(timelineTime) {
    return TrackManager.getActiveClipsAtTime(this.state.tracks, timelineTime);
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

  // 根据播放头位置更新活动片段 - 使用 TrackManager
  updateActiveClipFromPlayhead() {
    const state = this.state;
    if (state.playheadTime > state.timelineDuration) {
      state.playheadTime = Math.max(0, state.timelineDuration - 0.01);
    }
    // activeClip 的 getter 已经自动从 EditorCore.getActiveClips() 获取
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
      ruler.style.width = `calc(${zoomWidth} - 70px)`;
    }
  },

  // 更新播放头位置显示
  updatePlayhead() {
    const playhead = document.getElementById('bm-playhead');
    const trackContent = document.querySelector('.bm-track-content');
    
    const duration = TimeController.timelineDuration;
    if (!playhead || !trackContent || duration <= 0) return;

    // 播放头位置百分比 - 使用 TimeController
    const percent = (TimeController.currentTime / duration) * 100;
    playhead.style.left = `calc(70px + ${percent}%)`;
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
      const clipDuration = TrackManager.getClipDuration(clip);
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
        
        // 格式化时长
        const formatDur = (d) => {
          const m = Math.floor(d / 60);
          const s = Math.floor(d % 60);
          return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
        };

        html += `
          <div class="bm-timeline-clip bm-audio-clip ${isSelected ? 'selected' : ''}"
               id="${clip.id}-audio"
               data-clip-id="${clip.id}"
               data-track-index="${trackIndex}"
               draggable="true"
               style="left: ${left}%; width: ${width}%;">
            <div class="bm-clip-waveform">${waveHtml}</div>
            <span class="bm-clip-duration-label">${formatDur(clipDuration)}</span>
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
        
        // 检查是否被拉伸（使用原始时长）
        const originalDuration = clip.originalDuration || (clip.sourceEnd - clip.sourceStart);
        const displayDuration = clipDuration;
        const isStretched = Math.abs(displayDuration - originalDuration) > 0.1;
        
        // 格式化时长显示
        const formatDur = (d) => {
          const m = Math.floor(d / 60);
          const s = Math.floor(d % 60);
          return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
        };
        
        // 时长标签：显示时长 / 原始时长（如果不同）
        let durationLabel = formatDur(displayDuration);
        if (isStretched) {
          durationLabel = `${formatDur(displayDuration)} (源${formatDur(originalDuration)})`;
        }

        html += `
          <div class="bm-timeline-clip ${isSelected ? 'selected' : ''} ${isPip ? 'bm-pip-clip' : ''} ${isStretched ? 'stretched' : ''}"
               id="${clip.id}"
               data-bvid="${clip.video.bvid}"
               data-track-index="${trackIndex}"
               data-timeline-start="${clip.timelineStart}"
               data-source-start="${clip.sourceStart}"
               data-source-end="${clip.sourceEnd}"
               draggable="true"
               style="left: ${left}%; width: ${width}%; background: linear-gradient(135deg, hsl(${hue}, ${saturation}%, ${lightness + 8}%), hsl(${hue}, ${saturation}%, ${lightness}%));"
               title="${clip.video.title} | ${durationLabel}${isStretched ? ' (双击恢复)' : ''}">
            <div class="bm-clip-drag-handle bm-clip-handle-left" draggable="false"></div>
            <span class="bm-clip-duration-label">${durationLabel}</span>
            <div class="bm-clip-drag-handle bm-clip-handle-right" draggable="false"></div>
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
  
  // 动态渲染轨道 DOM
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
        // 主轨道 vs 子轨道命名
        const trackName = i === 0 ? '主轨道' : `轨道 ${i}`;
        const isMain = i === 0;
        html += `
          <div class="bm-timeline-track ${isMain ? 'bm-main-track' : 'bm-sub-track'}" data-track="video-${i}">
            <div class="bm-track-header">
              <span>${trackName}</span>
              ${!isMain ? `<button class="bm-track-remove-btn" data-track-index="${i}" title="删除轨道">×</button>` : ''}
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
  
  // 添加新轨道 - 委托给 EditorCore
  addTrack() {
    const newIndex = EditorCore.addVideoTrack();
    this.render();
    MaterialUI.showToast(`已添加轨道 ${newIndex}`);
    return newIndex;
  },
  
  // 删除轨道 - 委托给 EditorCore
  removeTrack(trackIndex) {
    if (trackIndex === 0) {
      MaterialUI.showToast('不能删除主轨道', 'error');
      return false;
    }
    
    const track = this.state.tracks.video[trackIndex];
    if (track && track.length > 0) {
      if (!confirm(`轨道 ${trackIndex} 上有 ${track.length} 个元素，确定删除吗？`)) {
        return false;
      }
    }
    
    const result = EditorCore.removeVideoTrack(trackIndex);
    if (!result.success) return false;
    
    this.recalculate();
    this.render();
    MaterialUI.showToast(`已删除轨道 ${trackIndex}`);
    return true;
  },

  // 绑定交互事件
  bindDragEvents() {
    const container = document.getElementById('bm-video-tracks-container');
    if (!container) return;
    
    // 拖拽事件委托给 TimelineDrag
    TimelineDrag.bindEvents(container);
    
    // 裁剪手柄事件
    this.bindTrimEvents(container);
  },
  
  // 绑定裁剪手柄事件
  bindTrimEvents(container) {
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
      originalDisplayDuration: clip.displayDuration || (clip.sourceEnd - clip.sourceStart),
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
    
    const { clipId, clip, trackIndex, isLeft, trackRect, originalSourceStart, originalSourceEnd, originalTimelineStart, originalDisplayDuration, minDuration } = tm.trimState;
    const state = tm.state;
    
    // 计算鼠标在轨道中的位置
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
    
    if (isLeft) {
      // 拖拽左边缘 - 调整入点和显示时长
      const newTimelineStart = Math.max(0, mouseTime);
      const timeDelta = newTimelineStart - originalTimelineStart;
      
      // 更新 timelineStart 和 displayDuration
      clip.timelineStart = newTimelineStart;
      clip.displayDuration = Math.max(minDuration, originalDisplayDuration - timeDelta);
      
      // 保存原始时长（首次裁剪时记录）
      if (clip.originalDuration == null) {
        clip.originalDuration = clip.sourceEnd - clip.sourceStart;
      }
      // 注意：不再修改 sourceStart，保持原始源范围
    } else {
      // 拖拽右边缘 - 调整显示时长（可以拉长超过源时长，循环播放）
      const newDisplayDuration = Math.max(minDuration, mouseTime - clip.timelineStart);
      clip.displayDuration = newDisplayDuration;
      
      // 保存原始时长（首次裁剪时记录）
      if (clip.originalDuration == null) {
        clip.originalDuration = clip.sourceEnd - clip.sourceStart;
      }
      // 注意：不再修改 sourceEnd，保持原始源范围用于循环播放
    }
    
    // 显示时间提示
    tm.showTrimTooltip(clip, mouseTime);
    
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
    
    // 隐藏吸附指示器和时间提示
    tm.hideSnapIndicator();
    tm.hideTrimTooltip();
    
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

  // 显示裁剪时间提示
  showTrimTooltip(clip, mouseTime) {
    let tooltip = document.getElementById('bm-trim-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'bm-trim-tooltip';
      tooltip.className = 'bm-trim-tooltip';
      document.body.appendChild(tooltip);
    }
    
    const displayDuration = TrackManager.getClipDuration(clip);
    const sourceDuration = clip.sourceEnd - clip.sourceStart;
    const isLooping = displayDuration > sourceDuration;
    
    // 格式化时间
    const formatTime = (t) => {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const ms = Math.floor((t % 1) * 10);
      return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
    };
    
    // 显示详细信息帮助理解
    let text = `显示: ${formatTime(displayDuration)} | 源: ${formatTime(sourceDuration)}`;
    if (isLooping) {
      text += ` | 循环 ${(displayDuration / sourceDuration).toFixed(1)}x`;
    }
    
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    
    // 跟随鼠标
    const rect = document.getElementById('bm-video-tracks-container')?.getBoundingClientRect();
    if (rect) {
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${rect.top - 30}px`;
    }
  },
  
  // 隐藏裁剪时间提示
  hideTrimTooltip() {
    const tooltip = document.getElementById('bm-trim-tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  },

  // 吸附相关方法委托给 TimelineDrag（保持原接口兼容）
  getSnapPoints(excludeClipId = null, trackIndex = null) {
    return TimelineDrag.getSnapPoints(excludeClipId);
  },
  
  applySnap(timelineStart, clipDuration, excludeClipId, trackIndex = null) {
    return TimelineDrag.applySnap(timelineStart, clipDuration, excludeClipId);
  },
  
  showSnapIndicator(timelineStart, clipDuration = 0, snapType = null) {
    TimelineDrag.showSnapIndicator(timelineStart);
  },
  
  hideSnapIndicator() {
    TimelineDrag.hideSnapIndicator();
  }
};

// 导出
window.TimelineManager = TimelineManager;