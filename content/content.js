// Content Script 主入口
(async function() {
  'use strict';

  // 注入脚本到页面主世界（这样请求的 Origin 就是 bilibili.com）
  function injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/injected.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }
  injectScript();

  // 等待 DOM 加载完成
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
  }

  // 初始化存储
  await MaterialStorage.init();

  // 初始化 UI
  MaterialUI.init();

  // 开发调试快捷键：Cmd+E (Mac) / Ctrl+E (Win) 直接打开编辑器
  // 在任意B站页面都可用，如果不在视频页则加载测试视频
  const TEST_BVID = 'BV1pCyABdE1c'; // 调试用测试视频
  
  document.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      
      // 优先使用当前页面的视频
      let bvid = BiliAPI.extractBvid(location.href);
      let info = null;
      
      if (bvid) {
        info = BiliAPI.getVideoInfoFromPage();
        if (!info.bvid) {
          info = await BiliAPI.getVideoInfo(bvid);
        }
        console.log('[快捷键] 使用当前视频:', bvid);
      } else {
        // 不在视频页，加载测试视频
        console.log('[快捷键] 加载测试视频:', TEST_BVID);
        info = await BiliAPI.getVideoInfo(TEST_BVID);
      }
      
      VideoEditor.openEditor(info);
      console.log('[快捷键] 编辑器已打开');
    }
  });

  console.log('B站素材助手已加载 (Cmd+E / Ctrl+E 快速打开编辑器，任意页面可用)');
})();
