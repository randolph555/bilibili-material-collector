// IndexedDB 存储封装
const MaterialStorage = {
  dbName: 'BiliMaterialDB',
  dbVersion: 1,
  db: null,

  // 初始化数据库
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 素材表
        if (!db.objectStoreNames.contains('materials')) {
          const store = db.createObjectStore('materials', { keyPath: 'bvid' });
          store.createIndex('addTime', 'addTime', { unique: false });
          store.createIndex('owner', 'owner.mid', { unique: false });
          store.createIndex('category', 'category', { unique: false });
        }

        // 收藏夹表
        if (!db.objectStoreNames.contains('collections')) {
          const store = db.createObjectStore('collections', { keyPath: 'id', autoIncrement: true });
          store.createIndex('name', 'name', { unique: true });
        }

        // 标签表
        if (!db.objectStoreNames.contains('tags')) {
          const store = db.createObjectStore('tags', { keyPath: 'name' });
        }
      };
    });
  },

  // 添加素材
  async addMaterial(videoInfo, options = {}) {
    await this.init();

    const material = {
      ...videoInfo,
      addTime: Date.now(),
      category: options.category || 'default',
      tags: options.tags || [],
      notes: options.notes || '',
      collectionId: options.collectionId || null
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('materials', 'readwrite');
      const store = tx.objectStore('materials');
      const request = store.put(material);

      request.onsuccess = () => resolve(material);
      request.onerror = () => reject(request.error);
    });
  },

  // 获取素材
  async getMaterial(bvid) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('materials', 'readonly');
      const store = tx.objectStore('materials');
      const request = store.get(bvid);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // 删除素材
  async removeMaterial(bvid) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('materials', 'readwrite');
      const store = tx.objectStore('materials');
      const request = store.delete(bvid);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  // 获取所有素材
  async getAllMaterials(options = {}) {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('materials', 'readonly');
      const store = tx.objectStore('materials');

      let request;
      if (options.sortBy === 'addTime') {
        const index = store.index('addTime');
        request = index.openCursor(null, options.order === 'asc' ? 'next' : 'prev');
      } else {
        request = store.openCursor();
      }

      const results = [];
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          // 过滤
          let include = true;
          if (options.category && cursor.value.category !== options.category) {
            include = false;
          }
          if (options.tag && !cursor.value.tags?.includes(options.tag)) {
            include = false;
          }
          if (options.search) {
            const searchLower = options.search.toLowerCase();
            const titleMatch = cursor.value.title?.toLowerCase().includes(searchLower);
            const ownerMatch = cursor.value.owner?.name?.toLowerCase().includes(searchLower);
            if (!titleMatch && !ownerMatch) {
              include = false;
            }
          }

          if (include) {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  // 检查素材是否已收藏
  async isMaterialSaved(bvid) {
    const material = await this.getMaterial(bvid);
    return !!material;
  },

  // 获取素材数量
  async getMaterialCount() {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('materials', 'readonly');
      const store = tx.objectStore('materials');
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // 创建收藏夹
  async createCollection(name, description = '') {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('collections', 'readwrite');
      const store = tx.objectStore('collections');
      const request = store.add({
        name,
        description,
        createTime: Date.now()
      });

      request.onsuccess = () => resolve({ id: request.result, name, description });
      request.onerror = () => reject(request.error);
    });
  },

  // 获取所有收藏夹
  async getAllCollections() {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('collections', 'readonly');
      const store = tx.objectStore('collections');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // 添加标签
  async addTag(name, color = '#1890ff') {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tags', 'readwrite');
      const store = tx.objectStore('tags');
      const request = store.put({ name, color, createTime: Date.now() });

      request.onsuccess = () => resolve({ name, color });
      request.onerror = () => reject(request.error);
    });
  },

  // 获取所有标签
  async getAllTags() {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tags', 'readonly');
      const store = tx.objectStore('tags');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // 更新素材标签
  async updateMaterialTags(bvid, tags) {
    const material = await this.getMaterial(bvid);
    if (material) {
      material.tags = tags;
      return this.addMaterial(material);
    }
    throw new Error('素材不存在');
  },

  // 导出素材数据
  async exportData() {
    const materials = await this.getAllMaterials();
    const collections = await this.getAllCollections();
    const tags = await this.getAllTags();

    return {
      version: 1,
      exportTime: Date.now(),
      materials,
      collections,
      tags
    };
  },

  // 导入素材数据
  async importData(data) {
    if (!data.materials) {
      throw new Error('无效的导入数据');
    }

    await this.init();

    // 导入素材
    for (const material of data.materials) {
      await this.addMaterial(material);
    }

    // 导入收藏夹
    if (data.collections) {
      for (const collection of data.collections) {
        try {
          await this.createCollection(collection.name, collection.description);
        } catch (e) {
          // 忽略重复的收藏夹
        }
      }
    }

    // 导入标签
    if (data.tags) {
      for (const tag of data.tags) {
        await this.addTag(tag.name, tag.color);
      }
    }

    return true;
  }
};

// 导出到全局
window.MaterialStorage = MaterialStorage;
