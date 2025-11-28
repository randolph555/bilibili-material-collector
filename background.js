// Background Service Worker
// 处理跨域请求代理和下载任务

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_API') {
    handleFetchApi(request.url, request.options)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // 保持消息通道开放
  }

  if (request.type === 'DOWNLOAD_VIDEO') {
    handleDownload(request.url, request.filename, request.referer)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (request.type === 'GET_VIDEO_URL') {
    getVideoPlayUrl(request.bvid, request.cid)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // 代理获取视频/音频流，返回 base64
  if (request.type === 'FETCH_MEDIA_STREAM') {
    fetchMediaStream(request.url, request.mediaType, sender.tab?.id, request.backupUrl, request.bvid)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

// 代理 API 请求
async function handleFetchApi(url, options = {}) {
  // 获取 bilibili.com 的 cookies
  let cookieHeader = '';
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.bilibili.com' });
    cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch (e) {
    console.warn('获取 cookies 失败:', e);
  }

  try {
    const headers = {
      'Referer': 'https://www.bilibili.com/',
      'User-Agent': navigator.userAgent,
      ...options.headers
    };
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 获取视频播放地址
async function getVideoPlayUrl(bvid, cid) {
  const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=16&fourk=1`;

  console.log('获取播放地址:', url);

  // 获取 bilibili.com 的 cookies
  let cookieHeader = '';
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.bilibili.com' });
    cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log(`[playurl] 获取到 ${cookies.length} 个 cookies`);
  } catch (e) {
    console.warn('获取 cookies 失败:', e);
  }

  try {
    const headers = {
      'Referer': `https://www.bilibili.com/video/${bvid}`,
      'User-Agent': navigator.userAgent
    };
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    const response = await fetch(url, { headers });
    const data = await response.json();
    console.log('播放地址API响应 code:', data.code);
    console.log('播放地址API响应 dash:', JSON.stringify(data.data?.dash, null, 2)?.substring(0, 2000));
    if (data.data?.dash?.video?.[0]) {
      console.log('第一个视频流 baseUrl:', data.data.dash.video[0].baseUrl || data.data.dash.video[0].base_url);
    }

    if (data.code === 0 && data.data) {
      const dash = data.data.dash;
      if (dash) {
        // DASH 格式，返回视频和音频地址
        const video = dash.video?.[0];
        const audio = dash.audio?.[0];

        // 获取所有备用URL
        const videoBackups = video?.backupUrl || video?.backup_url || [];
        const audioBackups = audio?.backupUrl || audio?.backup_url || [];

        // 选择最佳URL：优先使用 mcdn（从扩展发起的请求，mcdn 验证宽松不会 403）
        const selectBestUrl = (mainUrl, backups) => {
          const allUrls = [mainUrl, ...(Array.isArray(backups) ? backups : [])].filter(Boolean);
          // 优先选择 mcdn 的URL（验证宽松，从扩展可以正常访问）
          const mcdnUrl = allUrls.find(u => u.includes('mcdn.'));
          if (mcdnUrl) return mcdnUrl;
          // 其次选择其他 bilivideo.cn 的URL
          const cnUrl = allUrls.find(u => u.includes('bilivideo.cn') && !u.includes('upos-sz'));
          if (cnUrl) return cnUrl;
          // 最后返回主URL（可能是 upos-sz，会 403 但作为兜底）
          return mainUrl;
        };

        // 收集所有视频URL（主URL + 备用URL）
        const videoMainUrl = video?.baseUrl || video?.base_url;
        const allVideoUrls = [videoMainUrl, ...(Array.isArray(videoBackups) ? videoBackups : [])].filter(Boolean);

        // 收集所有音频URL
        const audioMainUrl = audio?.baseUrl || audio?.base_url;
        const allAudioUrls = [audioMainUrl, ...(Array.isArray(audioBackups) ? audioBackups : [])].filter(Boolean);

        // 选择最佳URL作为主URL，但保留所有URL作为备用
        const videoUrl = video ? selectBestUrl(videoMainUrl, videoBackups) : null;
        const audioUrl = audio ? selectBestUrl(audioMainUrl, audioBackups) : null;

        console.log('选择的视频URL:', videoUrl?.substring(0, 80));
        console.log('选择的音频URL:', audioUrl?.substring(0, 80));
        console.log('所有视频URL数量:', allVideoUrls.length);
        console.log('所有音频URL数量:', allAudioUrls.length);

        return {
          success: true,
          data: {
            type: 'dash',
            video: video ? {
              url: videoUrl,
              backup: allVideoUrls, // 传递所有URL，包括主URL
              codecs: video.codecs,
              width: video.width,
              height: video.height
            } : null,
            audio: audio ? {
              url: audioUrl,
              backup: allAudioUrls // 传递所有URL
            } : null
          }
        };
      } else if (data.data.durl) {
        // FLV 格式
        return {
          success: true,
          data: {
            type: 'flv',
            url: data.data.durl[0].url
          }
        };
      }
    }
    return { success: false, error: 'Failed to get video URL' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 处理视频下载
async function handleDownload(url, filename, referer) {
  try {
    // 使用 Chrome 下载 API
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: filename,
      headers: [
        { name: 'Referer', value: referer || 'https://www.bilibili.com/' },
        { name: 'User-Agent', value: navigator.userAgent }
      ]
    });
    return { success: true, downloadId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 点击插件图标时打开/关闭面板
chrome.action.onClicked.addListener((tab) => {
  if (tab.url?.includes('bilibili.com')) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
  }
});

// 代理获取视频/音频流
async function fetchMediaStream(url, mediaType, tabId, backupUrl, bvid) {
  const referer = bvid ? `https://www.bilibili.com/video/${bvid}` : 'https://www.bilibili.com/';

  console.log('========== fetchMediaStream 调试信息 ==========');
  console.log('mediaType:', mediaType);
  console.log('bvid:', bvid);
  console.log('referer:', referer);
  console.log('url:', url);
  console.log('backupUrl:', backupUrl);

  // 获取 bilibili.com 的 cookies
  let cookieHeader = '';
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.bilibili.com' });
    cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log(`[${mediaType}] 获取到 ${cookies.length} 个 cookies`);
    // 打印关键 cookie 名称（不打印值，保护隐私）
    console.log('Cookie 名称列表:', cookies.map(c => c.name).join(', '));
  } catch (e) {
    console.warn('获取 cookies 失败:', e);
  }

  // 收集所有可用的URL，优先使用非mcdn的URL
  const allUrls = [url];
  if (backupUrl) {
    const backups = Array.isArray(backupUrl) ? backupUrl : [backupUrl];
    allUrls.push(...backups);
  }

  // 对URL进行排序：优先 mcdn（验证宽松）> 其他
  // 注意：upos-sz 的 CDN 会检查 Origin 头，从扩展发起的请求会被拒绝(403)
  // 而 mcdn 的 CDN 验证较宽松，可以正常访问
  const sortedUrls = [...new Set(allUrls.filter(Boolean))].sort((a, b) => {
    const scoreUrl = (u) => {
      if (u.includes('mcdn.')) return 4;  // mcdn 优先
      if (u.includes('bilivideo.cn')) return 3;  // 其他 bilivideo.cn
      return 1;  // upos-sz 等放最后
    };
    return scoreUrl(b) - scoreUrl(a);
  });

  console.log(`[${mediaType}] bvid:`, bvid);
  console.log(`[${mediaType}] referer:`, referer);
  console.log(`[${mediaType}] 排序后的URL列表(${sortedUrls.length}个):`, sortedUrls.map(u => u.substring(0, 80)));

  const tryFetch = async (targetUrl) => {
    // 构建请求头
    const headers = {
      'Referer': referer,
      'User-Agent': navigator.userAgent,
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    };

    // 如果有 cookie，添加到请求头
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    let response = await fetch(targetUrl, {
      credentials: 'include',
      headers: headers
    });

    return response;
  };

  try {
    let response = null;
    let successUrl = null;

    // 依次尝试所有URL
    for (const targetUrl of sortedUrls) {
      console.log(`[${mediaType}] 尝试URL:`, targetUrl.substring(0, 80));
      try {
        response = await tryFetch(targetUrl);
        console.log(`[${mediaType}] 响应状态:`, response.status);

        if (response.ok || response.status === 206) {
          successUrl = targetUrl;
          break;
        }
      } catch (e) {
        console.log(`[${mediaType}] URL请求失败:`, e.message);
      }
    }

    if (!response || (!response.ok && response.status !== 206)) {
      console.error(`[${mediaType}] 所有URL都失败了`);
      throw new Error(`HTTP ${response?.status || 'unknown'}`);
    }

    console.log(`[${mediaType}] 成功使用URL:`, successUrl?.substring(0, 80));

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    // 读取流数据
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.length;

      // 发送进度到 content script
      if (tabId && total > 0) {
        chrome.tabs.sendMessage(tabId, {
          type: 'MEDIA_LOAD_PROGRESS',
          mediaType,
          loaded,
          total,
          percent: Math.round((loaded / total) * 100)
        }).catch(() => {}); // 忽略发送失败
      }
    }

    // 合并所有 chunks
    const blob = new Blob(chunks, {
      type: mediaType === 'video' ? 'video/mp4' : 'audio/mp4'
    });

    // 转换为 base64
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    return {
      success: true,
      data: {
        base64,
        mimeType: mediaType === 'video' ? 'video/mp4' : 'audio/mp4',
        size: loaded
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ArrayBuffer 转 Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

console.log('B站素材助手 Background Service Worker 已启动');
