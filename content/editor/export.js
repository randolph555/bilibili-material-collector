// 导出功能模块
const ExportManager = {
  // 获取状态引用
  get state() {
    return EditorState;
  },

  // 导出剪辑脚本
  exportScript() {
    const state = this.state;
    
    if (state.timeline.length === 0) {
      MaterialUI.showToast('时间轴为空，无法导出', 'error');
      return;
    }

    const video = state.currentVideo;
    const safeTitle = video.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 30);

    const ffmpegScript = this.generateFFmpegScript(safeTitle);
    const edlContent = this.generateEDL();
    const jsonContent = this.generateJSON();

    this.showExportModal(ffmpegScript, edlContent, jsonContent);
  },

  // 生成 FFmpeg 脚本
  generateFFmpegScript(safeTitle) {
    const state = this.state;
    const video = state.currentVideo;
    const sortedClips = TimelineManager.getSortedClips();

    let script = `# FFmpeg 剪辑脚本\n`;
    script += `# 视频: ${video.title}\n`;
    script += `# BV号: ${video.bvid}\n`;
    script += `# 生成时间: ${new Date().toLocaleString()}\n\n`;

    script += `# 步骤1: 裁剪各片段\n`;
    sortedClips.forEach((clip, index) => {
      const start = this.formatFFmpegTime(clip.sourceStart);
      const duration = this.formatFFmpegTime(clip.sourceEnd - clip.sourceStart);
      script += `ffmpeg -i "${safeTitle}_video.mp4" -i "${safeTitle}_audio.m4a" -ss ${start} -t ${duration} -c copy "clip_${index + 1}.mp4"\n`;
    });

    script += `\n# 步骤2: 创建合并列表\n`;
    script += `echo "# 片段列表" > filelist.txt\n`;
    sortedClips.forEach((clip, index) => {
      script += `echo "file 'clip_${index + 1}.mp4'" >> filelist.txt\n`;
    });

    script += `\n# 步骤3: 合并所有片段\n`;
    script += `ffmpeg -f concat -safe 0 -i filelist.txt -c copy "${safeTitle}_final.mp4"\n`;

    script += `\n# 步骤4: 清理临时文件（可选）\n`;
    sortedClips.forEach((clip, index) => {
      script += `rm clip_${index + 1}.mp4\n`;
    });
    script += `rm filelist.txt\n`;

    return script;
  },

  // 生成 EDL 格式
  generateEDL() {
    const state = this.state;
    const video = state.currentVideo;
    const sortedClips = TimelineManager.getSortedClips();

    let edl = `TITLE: ${video.title}\n`;
    edl += `FCM: NON-DROP FRAME\n\n`;
    
    sortedClips.forEach((clip, index) => {
      const inTime = this.formatEDLTime(clip.sourceStart);
      const outTime = this.formatEDLTime(clip.sourceEnd);
      edl += `${String(index + 1).padStart(3, '0')}  001      V     C        ${inTime} ${outTime} ${inTime} ${outTime}\n`;
    });

    return edl;
  },

  // 生成 JSON 格式
  generateJSON() {
    const state = this.state;
    const video = state.currentVideo;
    const sortedClips = TimelineManager.getSortedClips();

    const data = {
      title: video.title,
      bvid: video.bvid,
      duration: video.duration,
      exportTime: new Date().toISOString(),
      clips: sortedClips.map(clip => ({
        id: clip.id,
        videoBvid: clip.video.bvid,
        videoTitle: clip.video.title,
        sourceStart: clip.sourceStart,
        sourceEnd: clip.sourceEnd,
        timelineStart: clip.timelineStart,
        duration: clip.sourceEnd - clip.sourceStart
      }))
    };

    return JSON.stringify(data, null, 2);
  },

  // 格式化 FFmpeg 时间
  formatFFmpegTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = (seconds % 60).toFixed(3);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.padStart(6, '0')}`;
  },

  // 格式化 EDL 时间
  formatEDLTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  },

  // 显示导出弹窗
  showExportModal(ffmpegScript, edlContent, jsonContent) {
    let modal = document.getElementById('bm-export-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bm-export-modal';
      modal.className = 'bm-modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="bm-modal bm-export-modal">
        <div class="bm-modal-header">
          <span>导出剪辑脚本</span>
          <button class="bm-modal-close" id="bm-close-export-modal">×</button>
        </div>
        <div class="bm-modal-body">
          <div class="bm-export-tabs">
            <button class="bm-export-tab active" data-format="ffmpeg">FFmpeg 脚本</button>
            <button class="bm-export-tab" data-format="edl">EDL 格式</button>
            <button class="bm-export-tab" data-format="json">JSON 数据</button>
          </div>
          <div class="bm-export-content">
            <textarea id="bm-export-text" readonly>${ffmpegScript}</textarea>
          </div>
          <div class="bm-export-actions">
            <button class="bm-btn" id="bm-copy-export">复制到剪贴板</button>
            <button class="bm-btn bm-btn-primary" id="bm-download-export">下载文件</button>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    const contents = { ffmpeg: ffmpegScript, edl: edlContent, json: jsonContent };
    const extensions = { ffmpeg: 'sh', edl: 'edl', json: 'json' };
    let currentFormat = 'ffmpeg';

    // Tab 切换
    modal.querySelectorAll('.bm-export-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.bm-export-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFormat = tab.dataset.format;
        document.getElementById('bm-export-text').value = contents[currentFormat];
      });
    });

    // 关闭
    document.getElementById('bm-close-export-modal')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // 复制
    document.getElementById('bm-copy-export')?.addEventListener('click', () => {
      navigator.clipboard.writeText(contents[currentFormat]);
      MaterialUI.showToast('已复制到剪贴板');
    });

    // 下载
    document.getElementById('bm-download-export')?.addEventListener('click', () => {
      const blob = new Blob([contents[currentFormat]], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.state.currentVideo.bvid}_edit.${extensions[currentFormat]}`;
      a.click();
      URL.revokeObjectURL(url);
      MaterialUI.showToast('文件已下载');
    });

    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }
};

// 导出
window.ExportManager = ExportManager;
