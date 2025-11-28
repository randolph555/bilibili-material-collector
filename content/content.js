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

  console.log('B站素材助手已加载');
})();
