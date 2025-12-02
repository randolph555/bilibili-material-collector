/**
 * TimelineDrag - 时间轴拖拽系统
 * 
 * 职责：
 * 1. 片段拖拽移动（跨轨道）
 * 2. 吸附对齐计算
 * 3. 吸附指示器显示
 * 
 * 独立模块，不涉及剪辑功能逻辑
 */
const TimelineDrag = {
  // 获取状态引用
  get state() {
    return EditorState;
  },

  // ========== 事件绑定 ==========
  
  /**
   * 绑定拖拽事件（使用事件委托）
   */
  bindEvents(container) {
    if (!container || container._dragEventsBound) return;
    
    container.addEventListener('dragstart', (e) => {
      // 如果点击的是裁剪手柄，不触发拖拽
      if (e.target.closest('.bm-clip-drag-handle')) {
        e.preventDefault();
        return;
      }
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
  },

  // ========== 拖拽事件处理 ==========

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
    
    // 拖动开始时，立即显示当前轨道所有片段结尾处的吸附线
    this.showAllSnapLines(trackIndex, clipId);
  },

  onDragEnd(e) {
    const clipEl = e.target.closest('.bm-timeline-clip');
    if (clipEl) {
      clipEl.classList.remove('dragging');
    }
    
    document.querySelectorAll('.bm-track-content').forEach(el => {
      el.classList.remove('drag-over');
    });
    
    // 清除吸附高亮
    this.highlightSnappedClip(null, false);
    this.highlightSnapLine(null, false);
    this.hideSnapIndicator();
    
    this.state.dragState = null;
  },

  onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const dragState = this.state.dragState;
    if (!dragState) return;
    
    // 获取原轨道
    const sourceTrack = document.querySelector(`.bm-track-content[data-track-index="${dragState.trackIndex}"]`);
    if (!sourceTrack) return;
    
    const sourceRect = sourceTrack.getBoundingClientRect();
    
    // 默认使用原轨道
    let targetTrack = sourceTrack;
    let crossingTrack = false;
    
    // 只有当鼠标明显离开原轨道（超出边界15px以上）才考虑切换
    const margin = 15;
    if (e.clientY < sourceRect.top - margin || e.clientY > sourceRect.bottom + margin) {
      // 找目标轨道
      const allTracks = document.querySelectorAll('.bm-track-content');
      allTracks.forEach(track => {
        if (track === sourceTrack) return;
        const rect = track.getBoundingClientRect();
        // 必须在轨道中心50%区域内才切换
        const centerTop = rect.top + rect.height * 0.25;
        const centerBottom = rect.bottom - rect.height * 0.25;
        if (e.clientY >= centerTop && e.clientY <= centerBottom) {
          targetTrack = track;
          crossingTrack = true;
        }
      });
    }
    
    // 只有跨轨道时才显示高亮，同轨道内移动不显示
    document.querySelectorAll('.bm-track-content').forEach(track => {
      track.classList.remove('drag-over');
    });
    if (crossingTrack) {
      targetTrack.classList.add('drag-over');
    }
    
    // 记录目标轨道索引
    dragState.targetTrackIndex = parseInt(targetTrack.dataset.trackIndex) || dragState.trackIndex;
    
    const trackRect = targetTrack.getBoundingClientRect();
    
    // 实时检测吸附并高亮
    if (!this.state.snapEnabled) return;
    
    const found = this.state.findClipById(dragState.clipId);
    if (!found) return;
    
    const clipDuration = TrackManager.getClipDuration(found.clip);
    
    // 用鼠标位置计算目标时间
    const mousePercent = (e.clientX - trackRect.left) / trackRect.width;
    const mouseTime = Math.max(0, mousePercent * this.state.timelineDuration);
    
    // 检测吸附
    const snapResult = this.checkSnap(mouseTime, clipDuration, dragState.clipId);
    
    if (snapResult.snapped) {
      // 高亮吸附线和目标片段
      this.highlightSnapLine(snapResult.targetClipId, true);
      this.highlightSnappedClip(snapResult.targetClipId, true);
      dragState.snappedTo = snapResult.snappedStart;
    } else {
      this.highlightSnapLine(null, false);
      this.highlightSnappedClip(null, false);
      dragState.snappedTo = null;
    }
  },

  onDragLeave(e) {
    const trackEl = e.target.closest('.bm-track-content');
    if (trackEl) {
      trackEl.classList.remove('drag-over');
    }
  },

  onDrop(e) {
    e.preventDefault();
    
    // 清除所有轨道高亮
    document.querySelectorAll('.bm-track-content').forEach(el => {
      el.classList.remove('drag-over');
    });

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const { clipId, offsetX } = data;
      const dragState = this.state.dragState;
      
      // 使用 onDragOver 中计算的目标轨道
      const targetTrackIndex = dragState?.targetTrackIndex ?? dragState?.trackIndex ?? 0;
      
      // 获取目标轨道元素
      const trackEl = document.querySelector(`.bm-track-content[data-track-index="${targetTrackIndex}"]`);
      if (!trackEl) return;
      
      let newTimelineStart;
      
      // 如果当前处于吸附状态，直接用吸附位置
      if (dragState && dragState.snappedTo !== null && dragState.snappedTo !== undefined) {
        newTimelineStart = dragState.snappedTo;
      } else {
        // 否则用鼠标位置计算（考虑拖拽偏移）
        const rect = trackEl.getBoundingClientRect();
        const dropX = e.clientX - rect.left - (offsetX || 0);
        const percent = Math.max(0, dropX / rect.width);
        newTimelineStart = percent * this.state.timelineDuration;
      }

      // 保存历史
      this.state.saveHistory();

      // 移动片段
      TimelineManager.moveClip(clipId, newTimelineStart, targetTrackIndex);

    } catch (err) {
      console.error('拖放失败:', err);
    }
    
    // 清理
    this.hideSnapIndicator();
  },

  // ========== 吸附系统 ==========
  
  /**
   * 获取所有吸附点
   */
  getSnapPoints(excludeClipId = null) {
    const state = this.state;
    const points = [];
    
    // 播放头位置
    points.push({ time: state.playheadTime, type: 'playhead' });
    
    // 时间轴起点和终点
    points.push({ time: 0, type: 'start' });
    points.push({ time: state.timelineDuration, type: 'end' });
    
    // 所有片段的边缘
    state.tracks.video.forEach((track, tIndex) => {
      track.forEach(clip => {
        if (clip.id === excludeClipId) return;
        
        const clipEnd = TrackManager.getClipEnd(clip);
        points.push({ time: clip.timelineStart, type: 'clip-start', trackIndex: tIndex, clipId: clip.id });
        points.push({ time: clipEnd, type: 'clip-end', trackIndex: tIndex, clipId: clip.id });
      });
    });
    
    return points;
  },
  
  /**
   * 检测吸附（不修改位置，只返回结果）
   */
  checkSnap(mouseTime, clipDuration, excludeClipId) {
    const state = this.state;
    const snapPoints = this.getSnapPoints(excludeClipId);
    const threshold = state.snapThreshold;
    
    let result = { snapped: false, snappedStart: mouseTime, targetClipId: null };
    let minDiff = threshold;
    
    // 假设片段左边缘在鼠标位置
    const clipStart = mouseTime;
    const clipEnd = mouseTime + clipDuration;
    
    // 检查片段起点吸附到其他片段终点
    for (const point of snapPoints) {
      if (point.type !== 'clip-end') continue;
      const diff = Math.abs(clipStart - point.time);
      if (diff < minDiff) {
        minDiff = diff;
        result = { snapped: true, snappedStart: point.time, targetClipId: point.clipId };
      }
    }
    
    // 检查片段终点吸附到其他片段起点
    for (const point of snapPoints) {
      if (point.type !== 'clip-start') continue;
      const diff = Math.abs(clipEnd - point.time);
      if (diff < minDiff) {
        minDiff = diff;
        result = { snapped: true, snappedStart: point.time - clipDuration, targetClipId: point.clipId };
      }
    }
    
    return result;
  },
  
  /**
   * 高亮指定的吸附线
   */
  highlightSnapLine(targetClipId, highlight) {
    // 先移除所有高亮
    document.querySelectorAll('.bm-snap-line.active').forEach(el => {
      el.classList.remove('active');
    });
    
    if (!highlight || !targetClipId) return;
    
    // 找到对应片段的吸附线并高亮
    const clipEl = document.getElementById(targetClipId);
    if (!clipEl) return;
    
    const clipRect = clipEl.getBoundingClientRect();
    const tracksRect = document.querySelector('.bm-timeline-tracks')?.getBoundingClientRect();
    if (!tracksRect) return;
    
    const targetLeft = clipRect.right - tracksRect.left;
    
    // 找到最近的吸附线
    document.querySelectorAll('.bm-snap-line').forEach(line => {
      const lineLeft = parseFloat(line.style.left);
      if (Math.abs(lineLeft - targetLeft) < 2) {
        line.classList.add('active');
      }
    });
  },
  
  /**
   * 高亮正在吸附的片段
   */
  highlightSnappedClip(clipId, highlight) {
    // 移除之前的高亮
    document.querySelectorAll('.bm-timeline-clip.snapping').forEach(el => {
      el.classList.remove('snapping');
    });
    
    // 添加新高亮
    if (highlight && clipId) {
      const clipEl = document.getElementById(clipId);
      if (clipEl) {
        clipEl.classList.add('snapping');
      }
    }
  },
  
  /**
   * 显示吸附指示器 - 在目标片段边缘显示
   */
  showSnapIndicator(snapTime, targetClipId, isClipEnd) {
    let indicator = document.getElementById('bm-snap-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'bm-snap-indicator';
      indicator.className = 'bm-snap-indicator';
      document.querySelector('.bm-timeline-tracks')?.appendChild(indicator);
    }
    
    // 如果有目标片段，直接用它的位置
    if (targetClipId) {
      const clipEl = document.getElementById(targetClipId);
      if (clipEl) {
        const clipRect = clipEl.getBoundingClientRect();
        const tracksRect = document.querySelector('.bm-timeline-tracks')?.getBoundingClientRect();
        if (tracksRect) {
          // 吸附到片段的左边缘或右边缘
          const leftPx = isClipEnd 
            ? (clipRect.right - tracksRect.left) 
            : (clipRect.left - tracksRect.left);
          indicator.style.left = leftPx + 'px';
          indicator.style.display = 'block';
          indicator.classList.add('active');
          return;
        }
      }
    }
    
    // 没有目标片段时隐藏
    indicator.style.display = 'none';
  },
  
  /**
   * 隐藏吸附指示器
   */
  hideSnapIndicator() {
    // 隐藏所有吸附线
    document.querySelectorAll('.bm-snap-line').forEach(el => el.remove());
    
    const indicator = document.getElementById('bm-snap-indicator');
    if (indicator) {
      indicator.classList.remove('active');
      indicator.style.display = 'none';
    }
  },
  
  /**
   * 显示当前轨道所有片段结尾处的吸附线
   */
  showAllSnapLines(trackIndex, excludeClipId) {
    // 先清除旧的吸附线
    document.querySelectorAll('.bm-snap-line').forEach(el => el.remove());
    
    const track = this.state.tracks.video[trackIndex];
    if (!track) return;
    
    // 找到当前轨道的内容区域
    const trackContent = document.querySelector(`.bm-track-content[data-track-index="${trackIndex}"]`);
    if (!trackContent) return;
    
    const trackRect = trackContent.getBoundingClientRect();
    
    // 遍历轨道上所有片段（除了正在拖拽的）
    track.forEach(clip => {
      if (clip.id === excludeClipId) return;
      
      const clipEl = document.getElementById(clip.id);
      if (!clipEl) return;
      
      const clipRect = clipEl.getBoundingClientRect();
      
      // 在片段结尾处创建吸附线（只在当前轨道内）
      const line = document.createElement('div');
      line.className = 'bm-snap-line';
      line.style.left = (clipRect.right - trackRect.left) + 'px';
      trackContent.appendChild(line);
    });
  }
};

// 导出
window.TimelineDrag = TimelineDrag;

console.log('[Editor] TimelineDrag 已加载');
