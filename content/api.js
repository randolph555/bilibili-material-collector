// B站 API 封装
const BiliAPI = {
  _requestId: 0,
  _pendingRequests: new Map(),

  // 初始化：监听来自注入脚本的响应
  _initResponseListener() {
    if (this._listenerInitialized) return;
    this._listenerInitialized = true;

    window.addEventListener('BM_FETCH_RESPONSE', (event) => {
      const { requestId, success, data, error } = event.detail;
      const pending = this._pendingRequests.get(requestId);
      if (pending) {
        this._pendingRequests.delete(requestId);
        if (success) {
          pending.resolve(data);
        } else {
          pending.reject(new Error(error));
        }
      }
    });

    window.addEventListener('BM_FETCH_PROGRESS', (event) => {
      const { mediaType, loaded, total, percent } = event.detail;
      // 派发进度事件给 UI
      window.dispatchEvent(new CustomEvent('bm-media-progress', {
        detail: { mediaType, loaded, total, percent }
      }));
    });
  },

  // 通过注入脚本发起请求（在页面主世界执行，Origin 是 bilibili.com）
  async fetch(url, options = {}) {
    this._initResponseListener();

    const requestId = ++this._requestId;
    
    return new Promise((resolve, reject) => {
      this._pendingRequests.set(requestId, { resolve, reject });

      window.dispatchEvent(new CustomEvent('BM_FETCH_REQUEST', {
        detail: { requestId, url, options }
      }));

      // 超时处理
      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error('请求超时'));
        }
      }, 30000);
    }).then(data => ({ success: true, data }));
  },

  // 从当前页面 URL 提取 BV 号
  extractBvid(url) {
    const match = url.match(/\/video\/(BV[\w]+)/);
    return match ? match[1] : null;
  },

  // 从页面提取视频信息（利用页面已有数据）
  getVideoInfoFromPage() {
    // B站页面会把视频信息存在 window.__INITIAL_STATE__
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      if (text.includes('window.__INITIAL_STATE__')) {
        try {
          const match = text.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
          if (match) {
            const state = JSON.parse(match[1]);
            return this.parseInitialState(state);
          }
        } catch (e) {
          console.error('解析页面数据失败:', e);
        }
      }
    }

    // 备用方案：从 meta 标签获取
    return this.getVideoInfoFromMeta();
  },

  // 解析 __INITIAL_STATE__ 数据
  parseInitialState(state) {
    const videoData = state.videoData || {};
    return {
      bvid: videoData.bvid,
      aid: videoData.aid,
      cid: videoData.cid,
      title: videoData.title,
      desc: videoData.desc,
      duration: videoData.duration,
      cover: videoData.pic,
      owner: {
        mid: videoData.owner?.mid,
        name: videoData.owner?.name,
        face: videoData.owner?.face
      },
      stat: {
        view: videoData.stat?.view,
        danmaku: videoData.stat?.danmaku,
        like: videoData.stat?.like,
        coin: videoData.stat?.coin,
        favorite: videoData.stat?.favorite,
        share: videoData.stat?.share,
        reply: videoData.stat?.reply
      },
      pubdate: videoData.pubdate,
      tags: state.tags?.map(t => t.tag_name) || [],
      pages: videoData.pages || []
    };
  },

  // 从 meta 标签获取基本信息
  getVideoInfoFromMeta() {
    const getMeta = (name) => {
      const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return el?.content || '';
    };

    return {
      bvid: this.extractBvid(location.href),
      title: getMeta('og:title') || document.title.replace('_哔哩哔哩_bilibili', ''),
      desc: getMeta('og:description') || getMeta('description'),
      cover: getMeta('og:image'),
      owner: {
        name: getMeta('author')
      }
    };
  },

  // 通过 API 获取视频详细信息
  async getVideoInfo(bvid) {
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    const result = await this.fetch(url);

    if (result.success && result.data?.code === 0) {
      const d = result.data.data;
      return {
        bvid: d.bvid,
        aid: d.aid,
        cid: d.cid,
        title: d.title,
        desc: d.desc,
        duration: d.duration,
        cover: d.pic,
        owner: {
          mid: d.owner?.mid,
          name: d.owner?.name,
          face: d.owner?.face
        },
        stat: {
          view: d.stat?.view,
          danmaku: d.stat?.danmaku,
          like: d.stat?.like,
          coin: d.stat?.coin,
          favorite: d.stat?.favorite,
          share: d.stat?.share,
          reply: d.stat?.reply
        },
        pubdate: d.pubdate,
        pages: d.pages || []
      };
    }
    throw new Error('获取视频信息失败');
  },

  // 搜索视频
  async searchVideos(keyword, page = 1, pageSize = 20) {
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&page=${page}&page_size=${pageSize}`;
    const result = await this.fetch(url);

    if (result.success && result.data?.code === 0) {
      const data = result.data.data;
      return {
        total: data.numResults,
        page: data.page,
        pageSize: data.pagesize,
        list: (data.result || []).map(item => ({
          bvid: item.bvid,
          aid: item.aid,
          title: item.title.replace(/<[^>]+>/g, ''), // 去除高亮标签
          desc: item.description,
          duration: item.duration,
          cover: item.pic?.startsWith('//') ? 'https:' + item.pic : item.pic,
          owner: {
            mid: item.mid,
            name: item.author
          },
          stat: {
            view: item.play,
            danmaku: item.danmaku,
            favorite: item.favorites
          },
          pubdate: item.pubdate
        }))
      };
    }
    throw new Error('搜索失败');
  },

  // 获取视频播放地址（通过注入脚本请求）
  async getPlayUrl(bvid, cid) {
    const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=16&fourk=1`;
    
    try {
      const result = await this.fetch(url);
      if (result.success && result.data?.code === 0) {
        const dash = result.data.data?.dash;
        if (dash) {
          const video = dash.video?.[0];
          const audio = dash.audio?.[0];
          
          return {
            success: true,
            data: {
              type: 'dash',
              video: video ? {
                url: video.baseUrl || video.base_url,
                backup: video.backupUrl || video.backup_url || [],
                codecs: video.codecs,
                width: video.width,
                height: video.height
              } : null,
              audio: audio ? {
                url: audio.baseUrl || audio.base_url,
                backup: audio.backupUrl || audio.backup_url || []
              } : null
            }
          };
        } else if (result.data.data?.durl) {
          return {
            success: true,
            data: {
              type: 'flv',
              url: result.data.data.durl[0].url
            }
          };
        }
      }
      return { success: false, error: '获取播放地址失败' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // 获取视频字幕
  async getSubtitle(bvid, cid) {
    const url = `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`;
    const result = await this.fetch(url);

    if (result.success && result.data?.code === 0) {
      const subtitles = result.data.data?.subtitle?.subtitles || [];
      if (subtitles.length === 0) {
        return { success: true, data: null }; // 没有字幕
      }

      // 获取第一个字幕（通常是中文）
      const subtitle = subtitles[0];
      const subtitleUrl = subtitle.subtitle_url.startsWith('//')
        ? 'https:' + subtitle.subtitle_url
        : subtitle.subtitle_url;

      // 获取字幕内容
      const subtitleResult = await this.fetch(subtitleUrl);
      if (subtitleResult.success && subtitleResult.data?.body) {
        return {
          success: true,
          data: {
            lang: subtitle.lan_doc,
            body: subtitleResult.data.body // [{from, to, content}, ...]
          }
        };
      }
    }
    return { success: false, error: '获取字幕失败' };
  },

  // 获取热门视频
  async getPopularVideos(page = 1, pageSize = 20) {
    const url = `https://api.bilibili.com/x/web-interface/popular?ps=${pageSize}&pn=${page}`;
    const result = await this.fetch(url);

    if (result.success && result.data?.code === 0) {
      return {
        list: (result.data.data.list || []).map(item => ({
          bvid: item.bvid,
          aid: item.aid,
          cid: item.cid,
          title: item.title,
          desc: item.desc,
          duration: item.duration,
          cover: item.pic,
          owner: {
            mid: item.owner?.mid,
            name: item.owner?.name,
            face: item.owner?.face
          },
          stat: {
            view: item.stat?.view,
            danmaku: item.stat?.danmaku,
            like: item.stat?.like
          },
          pubdate: item.pubdate
        }))
      };
    }
    throw new Error('获取热门视频失败');
  },

  // 格式化数字
  formatNumber(num) {
    if (!num) return '0';
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
  },

  // 格式化时长
  formatDuration(seconds) {
    if (!seconds) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  // 获取媒体流并转为 Blob URL（通过注入脚本在页面主世界请求）
  async fetchMediaAsBlob(url, mediaType, backupUrl, bvid) {
    this._initResponseListener();

    // 收集所有可用的 URL
    const allUrls = [url];
    if (backupUrl) {
      const backups = Array.isArray(backupUrl) ? backupUrl : [backupUrl];
      allUrls.push(...backups);
    }
    const uniqueUrls = [...new Set(allUrls.filter(Boolean))];

    // 依次尝试所有 URL
    let lastError = null;
    for (const targetUrl of uniqueUrls) {
      try {
        const requestId = ++this._requestId;
        
        const result = await new Promise((resolve, reject) => {
          this._pendingRequests.set(requestId, { resolve, reject });

          window.dispatchEvent(new CustomEvent('BM_FETCH_MEDIA_REQUEST', {
            detail: { requestId, url: targetUrl, mediaType, bvid }
          }));

          // 媒体请求超时时间更长
          setTimeout(() => {
            if (this._pendingRequests.has(requestId)) {
              this._pendingRequests.delete(requestId);
              reject(new Error('请求超时'));
            }
          }, 120000);
        });

        // 成功获取，转换为 Blob
        const { base64, mimeType, size } = result;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        
        console.log(`[${mediaType}] 成功加载，大小: ${size} bytes`);
        return { blobUrl, blob, size };

      } catch (e) {
        console.log(`[${mediaType}] URL请求失败:`, e.message, targetUrl.substring(0, 60));
        lastError = e;
      }
    }

    throw lastError || new Error('获取媒体流失败');
  },

  // 下载 Blob 为文件
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

// 导出到全局
window.BiliAPI = BiliAPI;
