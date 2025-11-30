// 画中画交互模块 - 简单直接的拖拽和缩放
const PipInteraction = {
  isDragging: false,
  isResizing: false,
  currentPip: null,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0,
  startWidth: 0,
  startHeight: 0,

  get state() {
    return EditorState;
  },

  init() {
    // 直接在 document 上监听，避免事件冲突
    document.addEventListener('mousedown', this.handleMouseDown.bind(this), true);
    document.addEventListener('mousemove', this.handleMouseMove.bind(this), true);
    document.addEventListener('mouseup', this.handleMouseUp.bind(this), true);
    
    this.addStyles();
  },

  addStyles() {
    if (document.getElementById('pip-styles')) return;
    const style = document.createElement('style');
    style.id = 'pip-styles';
    style.textContent = `
      .bm-pip-container {
        user-select: none;
        -webkit-user-select: none;
      }
      .bm-pip-container:hover {
        outline: 2px solid rgba(255,255,255,0.6);
        outline-offset: -2px;
      }
      .bm-pip-container.dragging {
        outline: 2px solid #3498db;
        outline-offset: -2px;
        opacity: 0.85;
      }
      .pip-resize-handle {
        position: absolute;
        background: #fff;
        border: 2px solid #333;
        border-radius: 3px;
        width: 14px;
        height: 14px;
        opacity: 0;
        transition: opacity 0.15s;
        z-index: 10;
      }
      .pip-resize-handle:hover {
        background: #3498db;
        border-color: #fff;
        transform: scale(1.2);
      }
      .bm-pip-container:hover .pip-resize-handle {
        opacity: 1;
      }
      .pip-resize-handle.top-left { top: -7px; left: -7px; cursor: nw-resize; }
      .pip-resize-handle.top-right { top: -7px; right: -7px; cursor: ne-resize; }
      .pip-resize-handle.bottom-left { bottom: -7px; left: -7px; cursor: sw-resize; }
      .pip-resize-handle.bottom-right { bottom: -7px; right: -7px; cursor: se-resize; }
    `;
    document.head.appendChild(style);
  },

  handleMouseDown(e) {
    // 检查是否点击了缩放手柄
    const handle = e.target.closest('.pip-resize-handle');
    if (handle) {
      e.preventDefault();
      e.stopPropagation();
      this.startResize(e, handle);
      return;
    }

    // 检查是否点击了画中画容器
    const pip = e.target.closest('.bm-pip-container');
    if (pip) {
      e.preventDefault();
      e.stopPropagation();
      this.startDrag(e, pip);
      return;
    }
  },

  startDrag(e, pip) {
    this.isDragging = true;
    this.currentPip = pip;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startLeft = pip.offsetLeft;
    this.startTop = pip.offsetTop;
    
    pip.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
    
    // 暂停视频播放以提高性能
    const video = pip.querySelector('video');
    if (video && !video.paused) {
      video.pause();
      this._wasPlaying = true;
    }
  },

  startResize(e, handle) {
    const pip = handle.closest('.bm-pip-container');
    if (!pip) return;

    this.isResizing = true;
    this.currentPip = pip;
    this.resizeCorner = handle.className.includes('top-left') ? 'tl' :
                        handle.className.includes('top-right') ? 'tr' :
                        handle.className.includes('bottom-left') ? 'bl' : 'br';
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startLeft = pip.offsetLeft;
    this.startTop = pip.offsetTop;
    this.startWidth = pip.offsetWidth;
    this.startHeight = pip.offsetHeight;
    
    pip.classList.add('dragging');
    document.body.style.cursor = handle.style.cursor;
  },

  handleMouseMove(e) {
    if (!this.currentPip) return;

    if (this.isDragging) {
      this.doDrag(e);
    } else if (this.isResizing) {
      this.doResize(e);
    }
  },

  doDrag(e) {
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    
    const wrapper = this.currentPip.parentElement;
    const maxX = wrapper.offsetWidth - this.currentPip.offsetWidth;
    const maxY = wrapper.offsetHeight - this.currentPip.offsetHeight;
    
    let newLeft = this.startLeft + dx;
    let newTop = this.startTop + dy;
    
    // 边界限制
    newLeft = Math.max(0, Math.min(maxX, newLeft));
    newTop = Math.max(0, Math.min(maxY, newTop));
    
    this.currentPip.style.left = newLeft + 'px';
    this.currentPip.style.top = newTop + 'px';
    this.currentPip.style.right = 'auto';
    this.currentPip.style.bottom = 'auto';
    this.currentPip.style.transform = 'none';
  },

  doResize(e) {
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    const ratio = this.startWidth / this.startHeight;
    const wrapper = this.currentPip.parentElement;
    
    let newWidth, newHeight, newLeft, newTop;
    
    // 根据角落决定如何计算新尺寸
    // 右下角：dx 正 = 变大，dy 正 = 变大
    // 左下角：dx 负 = 变大，dy 正 = 变大
    // 右上角：dx 正 = 变大，dy 负 = 变大
    // 左上角：dx 负 = 变大，dy 负 = 变大
    
    switch (this.resizeCorner) {
      case 'br': // 右下角 - 最常用
        newWidth = this.startWidth + dx;
        newHeight = this.startHeight + dy;
        newLeft = this.startLeft;
        newTop = this.startTop;
        break;
      case 'bl': // 左下角
        newWidth = this.startWidth - dx;
        newHeight = this.startHeight + dy;
        newLeft = this.startLeft + dx;
        newTop = this.startTop;
        break;
      case 'tr': // 右上角
        newWidth = this.startWidth + dx;
        newHeight = this.startHeight - dy;
        newLeft = this.startLeft;
        newTop = this.startTop + dy;
        break;
      case 'tl': // 左上角
        newWidth = this.startWidth - dx;
        newHeight = this.startHeight - dy;
        newLeft = this.startLeft + dx;
        newTop = this.startTop + dy;
        break;
    }
    
    // 限制最小尺寸
    const minW = 80;
    const minH = 45;
    if (newWidth < minW) {
      if (this.resizeCorner === 'bl' || this.resizeCorner === 'tl') {
        newLeft = this.startLeft + this.startWidth - minW;
      }
      newWidth = minW;
    }
    if (newHeight < minH) {
      if (this.resizeCorner === 'tr' || this.resizeCorner === 'tl') {
        newTop = this.startTop + this.startHeight - minH;
      }
      newHeight = minH;
    }
    
    // 限制最大尺寸
    const maxW = wrapper.offsetWidth - 20;
    const maxH = wrapper.offsetHeight - 20;
    if (newWidth > maxW) newWidth = maxW;
    if (newHeight > maxH) newHeight = maxH;
    
    // 边界检查
    if (newLeft < 0) {
      newWidth += newLeft;
      newLeft = 0;
    }
    if (newTop < 0) {
      newHeight += newTop;
      newTop = 0;
    }
    if (newLeft + newWidth > wrapper.offsetWidth) {
      newWidth = wrapper.offsetWidth - newLeft;
    }
    if (newTop + newHeight > wrapper.offsetHeight) {
      newHeight = wrapper.offsetHeight - newTop;
    }
    
    // 应用新尺寸
    this.currentPip.style.width = Math.round(newWidth) + 'px';
    this.currentPip.style.height = Math.round(newHeight) + 'px';
    this.currentPip.style.left = Math.round(newLeft) + 'px';
    this.currentPip.style.top = Math.round(newTop) + 'px';
    this.currentPip.style.right = 'auto';
    this.currentPip.style.bottom = 'auto';
    this.currentPip.style.transform = 'none';
  },

  handleMouseUp(e) {
    if (!this.currentPip) return;

    this.currentPip.classList.remove('dragging');
    
    // 保存位置到片段数据
    this.saveToClip();
    
    // 恢复视频播放
    if (this._wasPlaying) {
      const video = this.currentPip.querySelector('video');
      if (video) video.play().catch(() => {});
      this._wasPlaying = false;
    }
    
    this.isDragging = false;
    this.isResizing = false;
    this.currentPip = null;
    document.body.style.cursor = '';
  },

  saveToClip() {
    if (!this.currentPip) return;
    
    const trackIndex = parseInt(this.currentPip.dataset.trackIndex);
    if (isNaN(trackIndex)) return;
    
    const clip = CompositorPlayer.getClipAtTime(trackIndex, this.state.playheadTime);
    if (!clip) return;
    
    const wrapper = this.currentPip.parentElement;
    const left = this.currentPip.offsetLeft;
    const top = this.currentPip.offsetTop;
    const width = this.currentPip.offsetWidth;
    const height = this.currentPip.offsetHeight;
    
    // 转换为百分比
    const x = left / wrapper.offsetWidth * 100;
    const y = top / wrapper.offsetHeight * 100;
    const scale = width / wrapper.offsetWidth;
    
    clip.transform = {
      x: x,
      y: y,
      scale: scale,
      opacity: 1,
      centered: false
    };
    
    // 标记已被用户定位，播放时不再重置
    if (typeof CompositorPlayer !== 'undefined') {
      CompositorPlayer.markUserPositioned(trackIndex);
    }
    
    // 更新属性面板
    if (typeof EditorUI !== 'undefined') {
      EditorUI.updatePropertiesPanel(clip.id);
    }
  },

  cleanup() {
    this.isDragging = false;
    this.isResizing = false;
    this.currentPip = null;
  }
};

window.PipInteraction = PipInteraction;
