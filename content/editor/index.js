// 视频编辑器主入口
// 整合所有模块，提供统一的 API

const VideoEditor = {
  // 打开编辑器
  async openEditor(videoInfo) {
    const state = EditorState;
    state.init();
    state.currentVideo = videoInfo;

    // 获取视频播放地址
    const playUrl = await MediaLoader.getPlayableUrl(videoInfo);
    if (!playUrl) {
      MaterialUI.showToast('无法获取视频地址', 'error');
      return;
    }

    state.currentVideo.playUrl = playUrl;

    // 显示编辑器 UI
    EditorUI.show();

    // 绑定事件
    EditorEvents.bindAll();

    // 初始化播放器
    await PlayerController.init();
    
    // 初始化合成播放器
    if (typeof CompositorPlayer !== 'undefined') {
      CompositorPlayer.init();
    }
    
    // 初始化画中画交互
    if (typeof PipInteraction !== 'undefined') {
      PipInteraction.init();
    }
  },

  // 关闭编辑器
  close() {
    // 清理画中画交互
    if (typeof PipInteraction !== 'undefined') {
      PipInteraction.cleanup();
    }
    
    // 清理合成播放器
    if (typeof CompositorPlayer !== 'undefined') {
      CompositorPlayer.cleanup();
    }
    
    // 清理播放器
    PlayerController.cleanup();

    // 清理事件监听
    EditorEvents.cleanup();

    // 释放媒体资源
    MediaLoader.releaseAll();

    // 隐藏 UI
    EditorUI.hide();

    // 重置状态
    EditorState.reset();

    // 移除播放头
    const playhead = document.getElementById('bm-playhead');
    if (playhead) playhead.remove();
  },

  // 暴露子模块（方便外部访问）
  get state() { return EditorState; },
  get timeline() { return TimelineManager; },
  get player() { return PlayerController; },
  get media() { return MediaLoader; },
  get subtitle() { return SubtitleManager; },
  get export() { return ExportManager; },
  get draft() { return DraftManager; },
  get events() { return EditorEvents; },
  get ui() { return EditorUI; }
};

// 导出到全局
window.VideoEditor = VideoEditor;

console.log('B站素材助手 - 编辑器模块已加载');
