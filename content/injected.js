// 注入到页面主世界的脚本
// 这里的代码在 bilibili.com 的真实上下文中执行
// 所有请求的 Origin 都是 https://www.bilibili.com

(function() {
  'use strict';

  // 监听来自 content script 的请求
  window.addEventListener('BM_FETCH_REQUEST', async (event) => {
    const { requestId, url, options } = event.detail;
    
    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include'  // 自动携带 cookies
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status}`);
      }

      // 根据请求类型处理响应
      const contentType = response.headers.get('content-type') || '';
      let data;
      
      if (options.responseType === 'blob') {
        // 媒体流请求，读取为 blob 并转换为 base64
        const blob = await response.blob();
        const reader = new FileReader();
        
        data = await new Promise((resolve, reject) => {
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve({
              type: 'blob',
              base64: base64,
              mimeType: blob.type,
              size: blob.size
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // 发送成功响应
      window.dispatchEvent(new CustomEvent('BM_FETCH_RESPONSE', {
        detail: { requestId, success: true, data }
      }));

    } catch (error) {
      // 发送错误响应
      window.dispatchEvent(new CustomEvent('BM_FETCH_RESPONSE', {
        detail: { requestId, success: false, error: error.message }
      }));
    }
  });

  // 处理带进度的媒体流请求
  window.addEventListener('BM_FETCH_MEDIA_REQUEST', async (event) => {
    const { requestId, url, mediaType, bvid } = event.detail;

    try {
      // CDN URL 已经包含签名参数，不需要 credentials
      // 使用 no-cors 模式会导致无法读取响应，所以用 cors + omit credentials
      const response = await fetch(url, {
        credentials: 'omit',  // CDN 不需要 cookies，URL 中已有签名
        mode: 'cors'
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        // 发送进度更新
        if (total > 0) {
          window.dispatchEvent(new CustomEvent('BM_FETCH_PROGRESS', {
            detail: {
              requestId,
              mediaType,
              loaded,
              total,
              percent: Math.round((loaded / total) * 100)
            }
          }));
        }
      }

      // 合并数据并转为 base64
      const blob = new Blob(chunks, { 
        type: mediaType === 'video' ? 'video/mp4' : 'audio/mp4' 
      });
      
      const reader2 = new FileReader();
      const base64Data = await new Promise((resolve, reject) => {
        reader2.onload = () => resolve(reader2.result.split(',')[1]);
        reader2.onerror = reject;
        reader2.readAsDataURL(blob);
      });

      window.dispatchEvent(new CustomEvent('BM_FETCH_RESPONSE', {
        detail: {
          requestId,
          success: true,
          data: {
            base64: base64Data,
            mimeType: blob.type,
            size: loaded
          }
        }
      }));

    } catch (error) {
      window.dispatchEvent(new CustomEvent('BM_FETCH_RESPONSE', {
        detail: { requestId, success: false, error: error.message }
      }));
    }
  });

  console.log('[B站素材助手] 页面注入脚本已加载');
})();
